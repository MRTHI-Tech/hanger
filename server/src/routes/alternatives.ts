import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {db} from '../db.js';
import {
  cachedAlternatives,
  getAlternativeRow,
  lookupAlternatives,
  storeAlternatives,
  type AlternativeRow,
} from '../alternatives.js';
import {mockMode} from '../env.js';
import {probeImage, MIN_HEIGHT, MIN_WIDTH} from '../images.js';
import {extForContentType, mediaUrl, save} from '../storage.js';
import {CodedError} from '../youcam/errors.js';
import {enhanceImage} from '../youcam/engine.js';
import {startTryOn} from '../youcam/tryon.js';
import {garmentJson, getGarmentRow} from './garments.js';
import {requirePerson} from './person.js';
import {isTryOnable, type GarmentRow, type Price} from '../types.js';

export const alternativeRoutes = new Hono();

function alternativeJson(row: AlternativeRow, original: Price | null) {
  const price: Price | null =
    row.price_amount != null && row.price_currency
      ? {amount: row.price_amount, currency: row.price_currency}
      : null;

  // Only meaningful when both prices are in the same currency. We don't
  // convert — a stale exchange rate quietly turning £40 into "R900 cheaper"
  // is a worse answer than saying we can't compare.
  const comparable = Boolean(
    price && original && price.currency === original.currency,
  );
  const savings =
    comparable && price && original
      ? Math.round((original.amount - price.amount) * 100) / 100
      : null;

  return {
    id: row.id,
    garmentId: row.garment_id,
    title: row.title ?? '',
    source: row.source ?? '',
    link: row.link ?? '',
    // The small one is what the list wants; the full-size image is only used
    // server-side when this gets turned into a real garment (§10.2).
    thumbnailUrl: row.thumbnail_url ?? row.image_url,
    price,
    savingsVsOriginal: savings,
    /** False when both prices exist but sit in different currencies. */
    priceComparable: comparable,
    inStock: row.in_stock == null ? null : Boolean(row.in_stock),
    fetchedAt: row.fetched_at,
  };
}

function originalPrice(garment: GarmentRow): Price | null {
  return garment.price_amount != null && garment.price_currency
    ? {amount: garment.price_amount, currency: garment.price_currency}
    : null;
}

alternativeRoutes.get('/', async (c) => {
  const garmentId = c.req.query('garmentId');
  if (!garmentId) throw new CodedError('invalid_request');

  const garment = getGarmentRow(garmentId);
  const price = originalPrice(garment);
  const refresh = c.req.query('refresh') === '1';

  if (!refresh) {
    const cached = cachedAlternatives(garmentId);
    if (cached.length > 0) {
      console.log(`CACHE HIT alternatives ${garmentId.slice(0, 8)} (saved 1 search)`);
      return c.json({
        items: cached.map((row) => alternativeJson(row, price)),
        original: {garmentId, price},
        fromCache: true,
        usedTextFallback: false,
      });
    }
  }

  const {matches, usedTextFallback} = await lookupAlternatives(garment);
  const stored = storeAlternatives(garmentId, matches);

  return c.json({
    items: stored.map((row) => alternativeJson(row, price)),
    original: {garmentId, price},
    fromCache: false,
    usedTextFallback,
    note:
      stored.length === 0
        ? "We couldn't find this anywhere else right now."
        : undefined,
  });
});

/**
 * §10.2 — the loop that makes this a shopping tool rather than a list of links:
 * take an alternative, make it a real garment, and fit it straight away.
 */
alternativeRoutes.post('/:id/save', async (c) => {
  const alternative = getAlternativeRow(c.req.param('id'));
  const original = getGarmentRow(alternative.garment_id);
  const person = requirePerson();

  const {bytes, contentType} = await fetchAlternativeImage(alternative);

  const probe = probeImage(bytes);
  let usable = bytes;
  let note: string | undefined;

  if (
    probe.format !== 'svg' &&
    (probe.width < MIN_WIDTH || probe.height < MIN_HEIGHT)
  ) {
    // Lens thumbnails are often a few hundred pixels. Try to rescue it before
    // giving up (§10.2).
    const enhanced = await enhanceImage(bytes);
    const enhancedProbe = enhanced ? probeImage(enhanced) : null;
    if (
      enhanced &&
      enhancedProbe &&
      enhancedProbe.width >= MIN_WIDTH &&
      enhancedProbe.height >= MIN_HEIGHT
    ) {
      usable = enhanced;
      note = 'That listing had a small photo, so we sharpened it first.';
    } else {
      // Never fail silently: send them to the product page instead.
      throw new CodedError('alternative_image_unusable');
    }
  }

  const id = randomUUID();
  const path = save(usable, extForContentType(contentType));
  const retailer = hostOf(alternative.link) ?? alternative.source ?? 'unknown';

  db.prepare(
    `INSERT INTO garment
       (id, title, brand, retailer, product_url, price_amount, price_currency,
        category, image_path, source_image_url, hung, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).run(
    id,
    alternative.title ?? original.title,
    alternative.source,
    retailer,
    alternative.link,
    alternative.price_amount,
    alternative.price_currency,
    original.category,
    path,
    alternative.image_url ?? alternative.thumbnail_url,
    Date.now(),
  );

  const garment = getGarmentRow(id);
  console.log(
    `[hanger] saved an alternative: ${garment.title} from ${garment.retailer}`,
  );

  let tryonId: string | null = null;
  if (isTryOnable(garment.category)) {
    const started = await startTryOn(person, garment, garment.category, false);
    tryonId = started.tryonId;
  }

  return c.json({garment: garmentJson(garment), tryonId, note});
});

async function fetchAlternativeImage(
  alternative: AlternativeRow,
): Promise<{bytes: Buffer; contentType: string}> {
  if (mockMode) {
    // Sample data has no real images behind it; stand in a product shot so the
    // round trip can be walked end to end.
    return {
      bytes: Buffer.from(samplePackshot(alternative), 'utf8'),
      contentType: 'image/svg+xml',
    };
  }

  // Prefer the retailer's full-size image over the Lens thumbnail — it's in
  // the same response and it's the one big enough to fit (§5.4).
  const candidates = [alternative.image_url, alternative.thumbnail_url].filter(
    (url): url is string => Boolean(url),
  );

  for (const url of candidates) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(20_000)});
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength === 0) continue;
      return {
        bytes,
        contentType: response.headers.get('content-type') ?? 'image/jpeg',
      };
    } catch {
      /* try the next one */
    }
  }

  throw new CodedError('alternative_image_unusable');
}

/**
 * A stand-in product shot for mock mode, coloured from the listing so each
 * alternative comes back visibly different when it's fitted.
 */
function samplePackshot(alternative: AlternativeRow): string {
  const palette = ['#5681FF', '#6CD9A8', '#FFA347', '#B780F6', '#FF7553', '#60CFD3'];
  const seed = (alternative.title ?? alternative.id).length + (alternative.position ?? 0);
  const colour = palette[seed % palette.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640" viewBox="0 0 512 640" data-hanger-colour="${colour}">
  <rect width="512" height="640" fill="#ffffff"/>
  <path d="M256 120 l-92 34 q-38 16 -48 56 l-20 84 52 16 8 -52 v238 q0 16 16 16 h168 q16 0 16 -16 v-238 l8 52 52 -16 -20 -84 q-10 -40 -48 -56 z" fill="${colour}"/>
  <text x="256" y="600" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" fill="#868b99">sample listing</text>
</svg>
`;
}

function hostOf(link: string | null): string | null {
  if (!link) return null;
  try {
    return new URL(link).hostname.replace(/^www\d?\./, '');
  } catch {
    return null;
  }
}
