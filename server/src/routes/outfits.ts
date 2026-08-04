import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {db} from '../db.js';
import {mediaUrl} from '../storage.js';
import {CodedError, humanize} from '../youcam/errors.js';
import {outfitTotal, planChain, runChain} from '../youcam/chain.js';
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

outfitRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  db.prepare('DELETE FROM outfit_item WHERE outfit_id = ?').run(id);
  db.prepare('DELETE FROM outfit WHERE id = ?').run(id);
  // The result image stays in storage: it may be a cached chain step another
  // outfit still points at.
  return c.body(null, 204);
});
