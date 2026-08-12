import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {db} from '../db.js';
import {validateImage} from '../images.js';
import {extForContentType, mediaUrl, remove, save} from '../storage.js';
import {CodedError} from '../youcam/errors.js';
import {currentUser} from '../auth.js';
import type {GarmentRow, Price} from '../types.js';

export const garmentRoutes = new Hono();

const metaSchema = z.object({
  title: z.string().min(1).max(300),
  brand: z.string().max(200).nullable().optional(),
  retailer: z.string().min(1).max(200),
  productUrl: z.string().url(),
  price: z
    .object({amount: z.number().finite(), currency: z.string().min(1).max(8)})
    .nullable()
    .optional(),
  category: z.enum([
    'upper_body',
    'lower_body',
    'full_body',
    'shoes',
    'bag',
    'hat',
    'scarf',
  ]),
  sourceImageUrl: z.string().url().nullable().optional(),
  /**
   * True when the garment is being kept deliberately rather than created as a
   * side effect of a try-on. Defaults false so the try-on path keeps its old
   * behaviour: the row exists because the API needs an id, but Your Hanger
   * stays empty until "Hang it" (§004_hung_flag).
   */
  hang: z.boolean().optional(),
});

export function garmentJson(row: GarmentRow) {
  const price: Price | null =
    row.price_amount != null && row.price_currency
      ? {amount: row.price_amount, currency: row.price_currency}
      : null;
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    retailer: row.retailer,
    productUrl: row.product_url,
    price,
    category: row.category,
    imageUrl: mediaUrl(row.image_path),
    sourceImageUrl: row.source_image_url,
    hung: Boolean(row.hung),
    source: row.source,
    savedAt: row.saved_at,
  };
}

/**
 * One garment, and only if it's theirs.
 *
 * The owner check is part of the lookup rather than a separate line the caller
 * has to remember, because the caller forgetting is exactly how one person ends
 * up looking at another's wardrobe. Somebody else's id is indistinguishable
 * from one that doesn't exist, which is also what we want to tell them.
 */
export function getGarmentRow(userId: string, id: string): GarmentRow {
  const row = db
    .prepare('SELECT * FROM garment WHERE id = ? AND user_id = ?')
    .get(id, userId) as GarmentRow | undefined;
  if (!row) throw new CodedError('not_found');
  return row;
}

garmentRoutes.get('/', (c) => {
  const user = currentUser(c);
  const category = c.req.query('category');
  // Your Hanger holds what was kept. `?all=1` also returns garments that only
  // exist because something was tried on and not hung.
  const onlyHung = c.req.query('all') !== '1';
  // user_id is first and unconditional: the other two clauses are optional and
  // this one never is.
  const where = ['user_id = ?', onlyHung ? 'hung = 1' : null, category ? 'category = ?' : null]
    .filter(Boolean)
    .join(' AND ');
  const params = category ? [user.id, category] : [user.id];
  const rows = db
    .prepare(`SELECT * FROM garment WHERE ${where} ORDER BY saved_at DESC`)
    .all(...params) as GarmentRow[];
  return c.json(rows.map(garmentJson));
});

garmentRoutes.post('/:id/hang', (c) => {
  const user = currentUser(c);
  const row = getGarmentRow(user.id, c.req.param('id'));
  db.prepare('UPDATE garment SET hung = 1, saved_at = ? WHERE id = ?').run(
    Date.now(),
    row.id,
  );
  console.log(`[hanger] hung it: ${row.title}`);
  return c.json(garmentJson(getGarmentRow(user.id, row.id)));
});

garmentRoutes.get('/:id', (c) =>
  c.json(garmentJson(getGarmentRow(currentUser(c).id, c.req.param('id')))),
);

garmentRoutes.post('/', async (c) => {
  const user = currentUser(c);
  const form = await c.req.formData();
  const image = form.get('image');
  const rawMeta = form.get('meta');

  if (!(image instanceof File)) {
    throw new CodedError('invalid_request', 'no image in the request');
  }
  if (typeof rawMeta !== 'string') {
    throw new CodedError('invalid_request', 'no meta in the request');
  }

  let parsedMeta: unknown;
  try {
    parsedMeta = JSON.parse(rawMeta);
  } catch {
    throw new CodedError('invalid_request', 'meta was not valid JSON');
  }

  const meta = metaSchema.safeParse(parsedMeta);
  if (!meta.success) {
    console.warn('[hanger] garment meta rejected:', meta.error.issues);
    throw new CodedError('invalid_request', 'meta did not match the expected shape');
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  // The same §5.4 limits apply to a garment photo as to a person photo.
  validateImage(bytes, 'garment');

  const id = randomUUID();
  const path = save(bytes, extForContentType(image.type || 'image/jpeg'));

  const hang = meta.data.hang === true;

  db.prepare(
    `INSERT INTO garment
       (id, user_id, title, brand, retailer, product_url, price_amount,
        price_currency, category, image_path, source_image_url, hung, source,
        saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'shop', ?)`,
  ).run(
    id,
    user.id,
    meta.data.title,
    meta.data.brand ?? null,
    meta.data.retailer,
    meta.data.productUrl,
    meta.data.price?.amount ?? null,
    meta.data.price?.currency ?? null,
    meta.data.category,
    path,
    meta.data.sourceImageUrl ?? null,
    hang ? 1 : 0,
    Date.now(),
  );

  console.log(
    `[hanger] ${hang ? 'hung' : 'scraped'}: ${meta.data.title} (${meta.data.category}) from ${meta.data.retailer}`,
  );

  return c.json(garmentJson(getGarmentRow(user.id, id)));
});

/**
 * A piece out of your own wardrobe: a photograph, a category, a name. No
 * retailer, no product page, no price — it's already yours. From here it's an
 * ordinary garment: try it on, or chain it with things you're still deciding
 * about.
 *
 * Only the try-on-able categories (§5.2) are offered. An owned hat would be a
 * row nothing can do anything with — no slot takes it and cloth-v3 won't wear
 * it — so the picker doesn't offer one.
 */
const ownedMetaSchema = z.object({
  title: z.string().min(1).max(300),
  category: z.enum(['upper_body', 'lower_body', 'full_body', 'shoes']),
});

garmentRoutes.post('/owned', async (c) => {
  const user = currentUser(c);
  const form = await c.req.formData();
  const image = form.get('image');
  const rawMeta = form.get('meta');

  if (!(image instanceof File)) {
    throw new CodedError('invalid_request', 'no image in the request');
  }
  if (typeof rawMeta !== 'string') {
    throw new CodedError('invalid_request', 'no meta in the request');
  }

  let parsedMeta: unknown;
  try {
    parsedMeta = JSON.parse(rawMeta);
  } catch {
    throw new CodedError('invalid_request', 'meta was not valid JSON');
  }

  const meta = ownedMetaSchema.safeParse(parsedMeta);
  if (!meta.success) {
    console.warn('[hanger] owned garment meta rejected:', meta.error.issues);
    throw new CodedError('invalid_request', 'meta did not match the expected shape');
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  validateImage(bytes, 'garment');

  const id = randomUUID();
  const path = save(bytes, extForContentType(image.type || 'image/jpeg'));

  // Owned pieces are hung on arrival. There's no try-on step to keep them
  // afterwards the way a shop garment has (§004_hung_flag) — photographing
  // something you own *is* the act of keeping it.
  db.prepare(
    `INSERT INTO garment
       (id, user_id, title, brand, retailer, product_url, price_amount,
        price_currency, category, image_path, source_image_url, hung, source,
        saved_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, 1, 'owned', ?)`,
  ).run(id, user.id, meta.data.title, meta.data.category, path, Date.now());

  console.log(`[hanger] hung your own: ${meta.data.title} (${meta.data.category})`);

  return c.json(garmentJson(getGarmentRow(user.id, id)));
});

garmentRoutes.delete('/:id', (c) => {
  // Resolved through the scoped lookup, which 404s on anything that isn't
  // theirs. This used to answer 204 regardless — harmless when there was one
  // wardrobe, and a lie once there are several: it told a stranger their
  // delete had worked while quietly doing nothing.
  const row = getGarmentRow(currentUser(c).id, c.req.param('id'));
  db.prepare('DELETE FROM garment WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM outfit_item WHERE garment_id = ?').run(row.id);
  db.prepare('DELETE FROM alternative WHERE garment_id = ?').run(row.id);
  remove(row.image_path);
  return c.body(null, 204);
});
