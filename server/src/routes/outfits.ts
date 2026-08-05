import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {db} from '../db.js';
import {
  contentTypeForExt,
  exists as storedFileExists,
  mediaUrl,
  read,
} from '../storage.js';
import {getVideo, logCacheHit, putVideo, videoCacheKey} from '../cache.js';
import {CodedError, ERROR_CODES, humanize} from '../youcam/errors.js';
import {outfitTotal, planChain, runChain} from '../youcam/chain.js';
import {runVideo} from '../youcam/engine.js';
import {VIDEO_DURATION_SECONDS, VIDEO_UNIT_COST} from '../youcam/client.js';
import {garmentJson, getGarmentRow} from './garments.js';
import {getPerson, requirePerson} from './person.js';
import type {GarmentRow, OutfitSlot, PersonRow} from '../types.js';

export const outfitRoutes = new Hono();

const createSchema = z.object({
  name: z.string().max(120).optional(),
  items: z
    .array(
      z.object({
        garmentId: z.string().min(1),
        slot: z.enum(['top', 'outer', 'bottom', 'shoes']),
        changeShoes: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(4),
});

interface OutfitRow {
  id: string;
  name: string | null;
  person_id: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result_path: string | null;
  error_code: string | null;
  progress_step: number;
  progress_of: number;
  progress_label: string | null;
  partial_note: string | null;
  video_status: 'running' | 'success' | 'error' | null;
  video_path: string | null;
  video_error_code: string | null;
  created_at: number;
}

interface OutfitItemRow {
  outfit_id: string;
  garment_id: string;
  slot: OutfitSlot;
  position: number;
  skipped: number;
}

function getOutfitRow(id: string): OutfitRow {
  const row = db.prepare('SELECT * FROM outfit WHERE id = ?').get(id) as
    | OutfitRow
    | undefined;
  if (!row) throw new CodedError('not_found');
  return row;
}

function outfitJson(row: OutfitRow) {
  const itemRows = db
    .prepare('SELECT * FROM outfit_item WHERE outfit_id = ? ORDER BY position')
    .all(row.id) as OutfitItemRow[];

  const items = itemRows
    .map((item) => {
      const garment = db
        .prepare('SELECT * FROM garment WHERE id = ?')
        .get(item.garment_id) as GarmentRow | undefined;
      if (!garment) return null;
      return {
        garment: garmentJson(garment),
        raw: garment,
        slot: item.slot,
        position: item.position,
        skipped: Boolean(item.skipped),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const person = getPerson();
  const human = row.status === 'error' ? humanize(row.error_code ?? undefined) : null;
  const videoHuman =
    row.video_status === 'error' ? humanize(row.video_error_code ?? undefined) : null;

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    resultUrl: row.result_path ? mediaUrl(row.result_path) : undefined,
    baseUrl: person ? mediaUrl(person.photo_path) : undefined,
    progress: {
      step: row.progress_step ?? 0,
      of: row.progress_of ?? items.length,
      label: row.progress_label ?? '',
    },
    items: items.map(({garment, slot, position, skipped}) => ({
      garment,
      slot,
      position,
      skipped,
    })),
    total: outfitTotal(items.filter((i) => !i.skipped).map((i) => ({garment: i.raw}))),
    partialNote: row.partial_note ?? undefined,
    video: {
      status: row.video_status ?? 'idle',
      url: row.video_path ? mediaUrl(row.video_path) : undefined,
      // The code rides along so the panel can tell "we know what went wrong"
      // (say, out of credits) from "the service said something we don't
      // recognise" — those deserve different copy, and §13 forbids showing the
      // raw code either way.
      code: videoHuman ? (row.video_error_code ?? 'unknown') : undefined,
      message: videoHuman?.message,
      hint: videoHuman?.hint,
    },
    errorCode: human ? (row.error_code ?? 'unknown') : undefined,
    message: human?.message,
    hint: human?.hint,
    createdAt: row.created_at,
  };
}

outfitRoutes.get('/', (c) => {
  const rows = db
    .prepare('SELECT * FROM outfit ORDER BY created_at DESC')
    .all() as OutfitRow[];
  return c.json(rows.map(outfitJson));
});

outfitRoutes.post('/', async (c) => {
  const body = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw new CodedError('invalid_request');

  const person = requirePerson();

  const entries = body.data.items.map((item) => ({
    garment: getGarmentRow(item.garmentId),
    slot: item.slot,
    changeShoes: item.changeShoes,
  }));

  const {items, ignored} = planChain(entries);

  // The same pieces in the same slots are the same outfit. Building it twice
  // produced a second row pointing at one cached image (§8.3) — free, but it
  // filled the Outfits list with entries nobody can tell apart.
  const existing = findIdenticalOutfit(person.id, items);
  if (existing) {
    // Reuse loses a name the person just typed, so carry it over if the
    // original never had one.
    if (body.data.name && !existing.name) {
      db.prepare('UPDATE outfit SET name = ? WHERE id = ?').run(
        body.data.name,
        existing.id,
      );
    }
    console.log(
      `[hanger] outfit ${existing.id.slice(0, 8)}: same pieces as an existing one, reusing it`,
    );
    const row = getOutfitRow(existing.id);
    return c.json({
      outfitId: row.id,
      id: row.id,
      status: row.status,
      ignoredSlots: ignored,
      reused: true,
    });
  }

  const id = randomUUID();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO outfit
         (id, name, person_id, status, progress_step, progress_of, progress_label, created_at)
       VALUES (?, ?, ?, 'running', 0, ?, ?, ?)`,
    ).run(
      id,
      body.data.name ?? null,
      person.id,
      items.length,
      'Getting started…',
      Date.now(),
    );
    for (const [index, item] of items.entries()) {
      db.prepare(
        `INSERT INTO outfit_item (outfit_id, garment_id, slot, position, skipped)
         VALUES (?, ?, ?, ?, 0)`,
      ).run(id, item.garment.id, item.slot, index);
    }
  })();

  console.log(
    `[hanger] outfit ${id.slice(0, 8)}: ${items
      .map((i) => `${i.slot}=${i.garment.title}`)
      .join(', ')}`,
  );

  // Runs in the background; the panel polls GET /outfits/:id.
  void execute(id, person, items, ignored);

  return c.json({outfitId: id, id, status: 'running', ignoredSlots: ignored});
});

/**
 * An outfit's identity is the ordered list of (slot, garment) the chain will
 * actually run — taken from `planChain`, not the raw request, so two requests
 * that plan down to the same steps match even if they were phrased differently.
 *
 * Only finished and in-flight outfits count. A failed one must not be handed
 * back as though it worked, and matching a running one is what stops an
 * impatient double-tap from paying twice.
 *
 * Note `changeShoes` is not part of this: `outfit_item` has never stored it, so
 * there is nothing to compare against. The panel doesn't send it, so today this
 * is theoretical — it would need a column before it could be honoured.
 */
function findIdenticalOutfit(
  personId: string,
  items: ReturnType<typeof planChain>['items'],
): {id: string; name: string | null} | null {
  const wanted = items.map((i) => `${i.slot}:${i.garment.id}`).join('|');

  const candidates = db
    .prepare(
      `SELECT id, name FROM outfit
        WHERE person_id = ? AND status IN ('success', 'running')
        ORDER BY created_at DESC`,
    )
    .all(personId) as {id: string; name: string | null}[];

  for (const candidate of candidates) {
    const rows = db
      .prepare(
        'SELECT slot, garment_id FROM outfit_item WHERE outfit_id = ? ORDER BY position',
      )
      .all(candidate.id) as {slot: OutfitSlot; garment_id: string}[];
    const signature = rows.map((r) => `${r.slot}:${r.garment_id}`).join('|');
    if (signature === wanted) return candidate;
  }

  return null;
}

async function execute(
  id: string,
  person: PersonRow,
  items: ReturnType<typeof planChain>['items'],
  ignored: OutfitSlot[],
): Promise<void> {
  try {
    const outcome = await runChain(person, items, (progress) => {
      db.prepare(
        'UPDATE outfit SET progress_step = ?, progress_of = ?, progress_label = ? WHERE id = ?',
      ).run(progress.step, progress.of, progress.label, id);
    });

    for (const skip of outcome.skipped) {
      db.prepare(
        'UPDATE outfit_item SET skipped = 1 WHERE outfit_id = ? AND slot = ?',
      ).run(id, skip.slot);
    }

    if (!outcome.resultPath) {
      db.prepare(
        "UPDATE outfit SET status = 'error', error_code = ? WHERE id = ?",
      ).run(outcome.errorCode ?? 'upstream_error', id);
      return;
    }

    // §8.5 — a partial result is still a result, and the note says plainly
    // what's missing rather than pretending the outfit is complete.
    const notes: string[] = [];
    for (const skip of outcome.skipped) {
      notes.push(
        `We couldn't fit the ${slotWord(skip.slot)} — ${lowerFirst(
          humanize(skip.code).message,
        )}`,
      );
    }
    for (const slot of ignored) {
      notes.push(
        `The ${slotWord(slot)} was left out: a full-body piece covers it already.`,
      );
    }

    db.prepare(
      `UPDATE outfit
         SET status = 'success', result_path = ?, partial_note = ?,
             progress_step = progress_of
       WHERE id = ?`,
    ).run(outcome.resultPath, notes.length ? notes.join(' ') : null, id);

    console.log(`[hanger] outfit ${id.slice(0, 8)} done`);
  } catch (error) {
    const code = error instanceof CodedError ? error.code : 'upstream_error';
    db.prepare("UPDATE outfit SET status = 'error', error_code = ? WHERE id = ?").run(
      code,
      id,
    );
    console.error(`[hanger] outfit ${id.slice(0, 8)} failed (${code})`);
  }
}

function slotWord(slot: OutfitSlot): string {
  switch (slot) {
    case 'top':
      return 'top';
    case 'outer':
      return 'layer';
    case 'bottom':
      return 'bottom';
    case 'shoes':
      return 'shoes';
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

outfitRoutes.get('/:id', (c) => c.json(outfitJson(getOutfitRow(c.req.param('id')))));

/**
 * Turn a finished outfit into a short video worth sending someone. Starts the
 * task and returns immediately; the panel keeps polling GET /outfits/:id and
 * reads `video`, the same way it already watches the outfit itself.
 */
outfitRoutes.post('/:id/video', (c) => {
  const id = c.req.param('id');
  const row = getOutfitRow(id);

  // Only a finished outfit has an image to animate.
  if (row.status !== 'success' || !row.result_path) throw new CodedError('not_found');

  // Already done, or already on its way — hand back what we have rather than
  // paying for a second identical render.
  if (row.video_status === 'success' && row.video_path) {
    return c.json(outfitJson(row));
  }
  if (row.video_status === 'running') return c.json(outfitJson(row));

  // Someone else may have animated this exact image already — a duplicate
  // outfit, or this same one before an error. Resolved before any spend, and
  // synchronously, so a cache hit comes back as a finished video rather than
  // putting the panel through a spinner for nothing.
  const cached = findCachedVideo(row.result_path);
  if (cached) {
    db.prepare(
      "UPDATE outfit SET video_status = 'success', video_path = ?, video_error_code = NULL WHERE id = ?",
    ).run(cached, id);
    return c.json(outfitJson(getOutfitRow(id)));
  }

  db.prepare(
    "UPDATE outfit SET video_status = 'running', video_error_code = NULL WHERE id = ?",
  ).run(id);

  void makeVideo(id, row.result_path);

  return c.json(outfitJson(getOutfitRow(id)));
});

/**
 * The cache proper is keyed on the source image bytes (§12.2). The sibling
 * lookup behind it is a one-time rescue for videos made before that cache
 * existed: those rows are already paid for, and re-rendering them because we
 * have no index entry would be the exact waste this is here to stop. Anything
 * it finds gets written into the cache, so it only ever runs once per image.
 */
function findCachedVideo(resultPath: string): string | null {
  const bytes = read(resultPath);
  const key = videoCacheKey(bytes, VIDEO_DURATION_SECONDS);

  const hit = getVideo(key);
  if (hit && storedFileExists(hit)) {
    logCacheHit('video', key, VIDEO_UNIT_COST);
    return hit;
  }

  const sibling = db
    .prepare(
      `SELECT video_path FROM outfit
        WHERE result_path = ? AND video_status = 'success' AND video_path IS NOT NULL
        LIMIT 1`,
    )
    .get(resultPath) as {video_path: string} | undefined;

  if (sibling && storedFileExists(sibling.video_path)) {
    putVideo(key, sibling.video_path);
    logCacheHit('video', key, VIDEO_UNIT_COST);
    return sibling.video_path;
  }

  return null;
}

async function makeVideo(id: string, resultPath: string): Promise<void> {
  try {
    const bytes = read(resultPath);
    const {resultPath: videoPath} = await runVideo(
      bytes,
      contentTypeForExt(resultPath),
    );
    // Index it before anything else asks for the same image.
    putVideo(videoCacheKey(bytes, VIDEO_DURATION_SECONDS), videoPath);
    db.prepare(
      "UPDATE outfit SET video_status = 'success', video_path = ? WHERE id = ?",
    ).run(videoPath, id);
    console.log(`[hanger] outfit ${id.slice(0, 8)} video done`);
  } catch (error) {
    const code = error instanceof CodedError ? error.code : 'upstream_error';
    db.prepare(
      "UPDATE outfit SET video_status = 'error', video_error_code = ? WHERE id = ?",
    ).run(code, id);
    console.error(`[hanger] outfit ${id.slice(0, 8)} video failed (${code})`);
    if (!ERROR_CODES.includes(code)) {
      // An unmapped code is the signature of the video payload being wrong
      // (§11 — this endpoint has never been confirmed against a live call).
      // The raw upstream body was already logged by readError, just above.
      console.error(
        `[hanger] "${code}" is not a code we map — the video request was probably rejected. ` +
          'The youcam line logged above has the raw response.',
      );
    }
  }
}

outfitRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  db.prepare('DELETE FROM outfit_item WHERE outfit_id = ?').run(id);
  db.prepare('DELETE FROM outfit WHERE id = ?').run(id);
  // The result image stays in storage: it may be a cached chain step another
  // outfit still points at.
  return c.body(null, 204);
});
