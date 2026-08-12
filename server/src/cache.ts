import {createHash} from 'node:crypto';
import {db} from './db.js';
import type {TryOnCategory, VideoPose} from './types.js';

/**
 * Content-hash cache (§12.2). Keys hash the image *bytes*, never ids or URLs,
 * so the same garment saved twice from two different pages hits one entry.
 */

export function tryOnCacheKey(
  baseBytes: Buffer,
  garmentBytes: Buffer,
  category: TryOnCategory,
  changeShoes: boolean,
): string {
  return createHash('sha256')
    .update(baseBytes)
    .update(garmentBytes)
    .update(category)
    .update(changeShoes ? '1' : '0')
    .digest('hex');
}

/**
 * A chain step is keyed on the whole prefix that produced it: base photo plus
 * every (garment, category) applied so far, in order. That means `[base+top]`
 * is the same entry whether or not trousers get added later, so swapping the
 * last slot costs one call instead of three (§8.3).
 */
export function chainCacheKey(
  baseBytes: Buffer,
  prefix: {garmentHash: string; category: TryOnCategory; changeShoes?: boolean}[],
): string {
  const h = createHash('sha256').update(baseBytes);
  for (const step of prefix) {
    h.update('|');
    h.update(step.garmentHash);
    h.update(step.category);
    h.update(step.changeShoes ? '1' : '0');
  }
  return h.digest('hex');
}

export interface ChainStepEntry {
  cacheKey: string;
  resultPath: string;
  youcamFileId: string | null;
  fileIdAt: number | null;
}

export function getChainStep(key: string): ChainStepEntry | null {
  const row = db
    .prepare('SELECT * FROM chain_step WHERE cache_key = ?')
    .get(key) as
    | {
        cache_key: string;
        result_path: string;
        youcam_file_id: string | null;
        file_id_at: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    cacheKey: row.cache_key,
    resultPath: row.result_path,
    youcamFileId: row.youcam_file_id,
    fileIdAt: row.file_id_at,
  };
}

export function putChainStep(key: string, resultPath: string): void {
  db.prepare(
    `INSERT INTO chain_step (cache_key, result_path, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET result_path = excluded.result_path`,
  ).run(key, resultPath, Date.now());
}

export function setChainStepFileId(key: string, fileId: string): void {
  db.prepare(
    'UPDATE chain_step SET youcam_file_id = ?, file_id_at = ? WHERE cache_key = ?',
  ).run(fileId, Date.now(), key);
}

/**
 * A video is keyed on the bytes of the still it animates, not the outfit id.
 * Two outfit rows built from the same pieces share one cached result image
 * (§8.3), and animating it twice is the most expensive mistake we can make —
 * video costs several units where a try-on costs one.
 *
 * The pose is part of the key because it changes the render: without it,
 * asking the same outfit to walk after it has already stood still would be
 * served the standing video from cache and look like the picker did nothing.
 */
export function videoCacheKey(
  sourceBytes: Buffer,
  durationSeconds: number,
  pose: VideoPose,
): string {
  return createHash('sha256')
    .update(sourceBytes)
    .update(`|video|${durationSeconds}|${pose}`)
    .digest('hex');
}

export function getVideo(key: string): string | null {
  const row = db
    .prepare('SELECT result_path FROM video_cache WHERE cache_key = ?')
    .get(key) as {result_path: string} | undefined;
  return row?.result_path ?? null;
}

export function putVideo(key: string, resultPath: string): void {
  db.prepare(
    `INSERT INTO video_cache (cache_key, result_path, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET result_path = excluded.result_path`,
  ).run(key, resultPath, Date.now());
}

/** Both judges and we benefit from seeing these in the log (§12.2). */
export function logCacheHit(
  kind: 'tryon' | 'chain' | 'video',
  key: string,
  units = 1,
): void {
  console.log(
    `CACHE HIT ${kind} ${key.slice(0, 12)} (saved ~${units} unit${units === 1 ? '' : 's'})`,
  );
}

/** YouCam file ids are worth reusing, but not past their useful life. */
const FILE_ID_TTL_MS = 20 * 60 * 60 * 1000;

export function fileIdIsFresh(at: number | null | undefined): boolean {
  return typeof at === 'number' && Date.now() - at < FILE_ID_TTL_MS;
}
