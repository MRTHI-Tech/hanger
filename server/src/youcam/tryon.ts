import {randomUUID} from 'node:crypto';
import {db} from '../db.js';
import {fileIdIsFresh, logCacheHit, tryOnCacheKey} from '../cache.js';
import {read} from '../storage.js';
import {runCloth, uploadImage} from './engine.js';
import {CodedError} from './errors.js';
import {contentTypeForExt} from '../storage.js';
import type {GarmentRow, PersonRow, TryOnCategory} from '../types.js';

/**
 * Single-garment try-on. Owns the cache lookup, the file-id reuse, and the
 * bookkeeping row the panel polls.
 */

export interface TryOnRow {
  id: string;
  person_id: string;
  garment_id: string;
  base_hash: string;
  cache_key: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result_path: string | null;
  error_code: string | null;
  units_est: number;
  created_at: number;
}

export function getTryOnRow(id: string): TryOnRow {
  const row = db.prepare('SELECT * FROM tryon WHERE id = ?').get(id) as
    | TryOnRow
    | undefined;
  if (!row) throw new CodedError('not_found');
  return row;
}

/**
 * A YouCam file id is worth reusing across calls, but not forever (§6 — the
 * schema keeps `file_id_at` for exactly this). Re-upload once it's stale.
 */
export async function personFileId(person: PersonRow): Promise<string> {
  if (person.youcam_file_id && fileIdIsFresh(person.file_id_at)) {
    return person.youcam_file_id;
  }
  const bytes = read(person.photo_path);
  const fileId = await uploadImage(
    bytes,
    contentTypeForExt(person.photo_path),
    'person.jpg',
  );
  db.prepare('UPDATE person SET youcam_file_id = ?, file_id_at = ? WHERE id = ?').run(
    fileId,
    Date.now(),
    person.id,
  );
  return fileId;
}

export async function garmentFileId(garment: GarmentRow): Promise<string> {
  if (garment.youcam_file_id && fileIdIsFresh(garment.file_id_at)) {
    return garment.youcam_file_id;
  }
  const bytes = read(garment.image_path);
  // §2.2: these are bytes we fetched from inside the page, uploaded through the
  // File API. A retailer URL never goes to the API as ref_file_url.
  const fileId = await uploadImage(
    bytes,
    contentTypeForExt(garment.image_path),
    'garment.jpg',
  );
  db.prepare(
    'UPDATE garment SET youcam_file_id = ?, file_id_at = ? WHERE id = ?',
  ).run(fileId, Date.now(), garment.id);
  return fileId;
}

export interface StartTryOnResult {
  tryonId: string;
  status: 'running' | 'success';
  cached: boolean;
  resultPath?: string;
}

/**
 * Kicks off a try-on and returns immediately; the panel polls GET /tryon/:id.
 * A cache hit returns the finished result without touching the API (§12.2).
 */
export async function startTryOn(
  person: PersonRow,
  garment: GarmentRow,
  category: TryOnCategory,
  changeShoes: boolean,
): Promise<StartTryOnResult> {
  const baseBytes = read(person.photo_path);
  const garmentBytes = read(garment.image_path);
  const cacheKey = tryOnCacheKey(baseBytes, garmentBytes, category, changeShoes);

  const cached = db
    .prepare(
      "SELECT * FROM tryon WHERE cache_key = ? AND status = 'success' LIMIT 1",
    )
    .get(cacheKey) as TryOnRow | undefined;

  if (cached?.result_path) {
    logCacheHit('tryon', cacheKey);
    return {
      tryonId: cached.id,
      status: 'success',
      cached: true,
      resultPath: cached.result_path,
    };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO tryon
       (id, person_id, garment_id, base_hash, cache_key, status, units_est, created_at)
     VALUES (?, ?, ?, ?, ?, 'running', 1, ?)`,
  ).run(id, person.id, garment.id, cacheKey, `${cacheKey}:${id}`, Date.now());

  // Run in the background; the row is the handle.
  void execute(id, person, garment, category, changeShoes, cacheKey);

  return {tryonId: id, status: 'running', cached: false};
}

async function execute(
  id: string,
  person: PersonRow,
  garment: GarmentRow,
  category: TryOnCategory,
  changeShoes: boolean,
  cacheKey: string,
): Promise<void> {
  try {
    const [srcFileId, refFileId] = await Promise.all([
      personFileId(person),
      garmentFileId(garment),
    ]);

    const {resultPath} = await runCloth({
      srcFileId,
      refFileId,
      category,
      changeShoes,
      refLabel: garment.title,
    });

    // The row was created with a per-run key so two in-flight try-ons of the
    // same thing can't collide on the unique index. Claim the real cache key
    // now, dropping any earlier winner for it.
    db.transaction(() => {
      db.prepare('DELETE FROM tryon WHERE cache_key = ? AND id != ?').run(
        cacheKey,
        id,
      );
      db.prepare(
        "UPDATE tryon SET status = 'success', result_path = ?, cache_key = ? WHERE id = ?",
      ).run(resultPath, cacheKey, id);
    })();
    console.log(`[hanger] try-on done: ${garment.title}`);
  } catch (error) {
    const code =
      error instanceof CodedError ? error.code : 'upstream_error';
    db.prepare("UPDATE tryon SET status = 'error', error_code = ? WHERE id = ?").run(
      code,
      id,
    );
    console.error(`[hanger] try-on failed (${code}): ${garment.title}`);
  }
}
