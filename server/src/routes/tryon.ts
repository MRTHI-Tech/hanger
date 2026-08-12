import {Hono} from 'hono';
import {z} from 'zod';
import {db} from '../db.js';
import {mediaUrl} from '../storage.js';
import {CodedError, humanize} from '../youcam/errors.js';
import {getTryOnRow, startTryOn, type TryOnRow} from '../youcam/tryon.js';
import {getGarmentRow} from './garments.js';
import {requirePerson} from './person.js';
import {currentUser} from '../auth.js';
import {isTryOnable} from '../types.js';

export const tryonRoutes = new Hono();

const startSchema = z.object({
  garmentId: z.string().min(1),
  changeShoes: z.boolean().optional(),
});

function tryOnJson(row: TryOnRow) {
  const base = {
    id: row.id,
    garmentId: row.garment_id,
    status: row.status,
    resultUrl: row.result_path ? mediaUrl(row.result_path) : undefined,
    createdAt: row.created_at,
  };
  if (row.status !== 'error') return base;

  // §13: the panel gets a sentence, never the code on its own.
  const human = humanize(row.error_code ?? undefined);
  return {
    ...base,
    errorCode: row.error_code ?? 'unknown',
    message: human.message,
    hint: human.hint,
  };
}

tryonRoutes.get('/', (c) => {
  const rows = db
    .prepare(
      'SELECT * FROM tryon WHERE user_id = ? ORDER BY created_at DESC LIMIT 60',
    )
    .all(currentUser(c).id) as TryOnRow[];
  return c.json(rows.map(tryOnJson));
});

tryonRoutes.post('/', async (c) => {
  const body = startSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw new CodedError('invalid_request');

  const user = currentUser(c);
  const person = requirePerson(user.id);
  const garment = getGarmentRow(user.id, body.data.garmentId);

  if (!isTryOnable(garment.category)) {
    // Bags, hats and scarves live in Your Hanger but don't go through
    // cloth-v3 (§2.4, §11).
    throw new CodedError('category_not_tryonable');
  }

  const result = await startTryOn(
    user.id,
    person,
    garment,
    garment.category,
    Boolean(body.data.changeShoes),
  );

  return c.json({
    tryonId: result.tryonId,
    id: result.tryonId,
    garmentId: garment.id,
    status: result.status,
    cached: result.cached,
    resultUrl: result.resultPath ? mediaUrl(result.resultPath) : undefined,
  });
});

tryonRoutes.get('/:id', (c) =>
  c.json(tryOnJson(getTryOnRow(currentUser(c).id, c.req.param('id')))),
);
