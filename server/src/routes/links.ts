import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {z} from 'zod';
import {cleanText, cleanTextOrNull} from '@hanger/shared/text';
import {db} from '../db.js';
import {validateImage} from '../images.js';
import {extForContentType, save} from '../storage.js';
import {CodedError} from '../youcam/errors.js';
import {currentUser} from '../auth.js';
import {fetchPublicImage, readProductPage} from '../productPage.js';
import {garmentJson, getGarmentRow} from './garments.js';

/**
 * A link becomes a garment.
 *
 * The third way in, and the one the phone had no answer for: you are in
 * Instagram or WhatsApp, somebody has sent you a shop link, and the laptop with
 * the extension on it is in another room. Share it into Hanger, or paste it,
 * and the server reads the page the extension would have read.
 *
 * Two steps rather than one, and the split is §9.4's rule rather than
 * squeamishness: the category decides which half of somebody a try-on gets
 * fitted to, and it is inferred from words in a title. So the read comes back
 * for a person to look at, and only what they confirm is hung.
 */
export const linkRoutes = new Hono();

const CATEGORIES = [
  'upper_body',
  'lower_body',
  'full_body',
  'shoes',
  'bag',
  'hat',
  'scarf',
] as const;

const readSchema = z.object({url: z.string().url().max(2000)});

linkRoutes.post('/read', async (c) => {
  // Signed in only. Reading a page is the server making a request on somebody's
  // behalf, and that is not something an unknown caller gets to point anywhere.
  currentUser(c);

  const body = readSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw new CodedError('link_not_public');

  return c.json(await readProductPage(body.data.url));
});

/**
 * What comes back from `/read`, after somebody has had a look at it. The client
 * may have corrected the title and the category — those are the two fields the
 * screen makes editable — and the rest is passed through unchanged.
 *
 * Not re-read from the page: that would be a second fetch of a page that has
 * already answered, and the shop would be entitled to answer differently the
 * second time.
 */
const hangSchema = z.object({
  productUrl: z.string().url(),
  imageUrl: z.string().url(),
  title: z.string().min(1).max(300),
  brand: z.string().max(200).nullable().optional(),
  retailer: z.string().min(1).max(200),
  price: z
    .object({amount: z.number().finite(), currency: z.string().min(1).max(8)})
    .nullable()
    .optional(),
  category: z.enum(CATEGORIES),
});

linkRoutes.post('/hang', async (c) => {
  const user = currentUser(c);

  const parsed = hangSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    console.warn('[hanger] link hang rejected:', parsed.error?.issues);
    throw new CodedError('invalid_request');
  }
  const meta = parsed.data;

  const {bytes, contentType} = await fetchPublicImage(meta.imageUrl);

  try {
    validateImage(bytes, 'garment');
  } catch (error) {
    // §5.4's own sentences are written for a photo somebody chose. This one was
    // chosen by a shop, so the way out is different: photograph the thing.
    console.warn(`[hanger] link image rejected from ${meta.retailer}:`, error);
    throw new CodedError('link_image_unusable');
  }

  const id = randomUUID();
  const path = save(bytes, extForContentType(contentType));
  const title = cleanText(meta.title);

  db.prepare(
    `INSERT INTO garment
       (id, user_id, title, brand, retailer, product_url, price_amount,
        price_currency, category, image_path, source_image_url, hung, source,
        saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'shop', ?)`,
  ).run(
    id,
    user.id,
    title,
    cleanTextOrNull(meta.brand),
    cleanText(meta.retailer),
    meta.productUrl,
    meta.price?.amount ?? null,
    meta.price?.currency ?? null,
    meta.category,
    path,
    // Kept for the same reason the extension keeps it: §5.5 hands this URL to
    // Lens when somebody asks what else sells this.
    meta.imageUrl,
    Date.now(),
  );

  console.log(
    `[hanger] hung from a link: ${title} (${meta.category}) from ${meta.retailer}`,
  );

  return c.json(garmentJson(getGarmentRow(user.id, id)));
});
