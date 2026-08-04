import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {db} from './db.js';
import {env, mockMode} from './env.js';
import {CodedError} from './youcam/errors.js';
import type {GarmentRow, Price} from './types.js';

/**
 * The alternatives engine (§10) — reverse image search over the garment you're
 * looking at, cheapest first, and every result is something you can then try on.
 *
 * On the response shape: the parser is built around SerpApi's own published
 * Google Lens example (saved in fixtures/serpapi-google-lens.json), because
 * this build has no SERPAPI_KEY to make a live call with. Every field is read
 * defensively and the first live response gets its shape logged, so a mismatch
 * announces itself instead of quietly producing an empty list.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface LensMatch {
  position?: number;
  title?: string;
  link?: string;
  source?: string;
  thumbnail?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  image?: string;
  image_width?: number;
  image_height?: number;
  in_stock?: boolean;
  price?:
    | {value?: string; extracted_value?: number; currency?: string}
    | string
    | number;
}

export interface AlternativeRow {
  id: string;
  garment_id: string;
  title: string | null;
  source: string | null;
  link: string | null;
  thumbnail_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  in_stock: number | null;
  position: number | null;
  fetched_at: number;
}

let loggedShape = false;

/** Says out loud what a live response actually looked like, once per boot. */
function logShapeOnce(body: Record<string, unknown>): void {
  if (loggedShape) return;
  loggedShape = true;
  const matches = (body.visual_matches ?? []) as LensMatch[];
  console.log(
    `[hanger] SerpApi response keys: ${Object.keys(body).join(', ')}`,
  );
  if (matches[0]) {
    console.log(
      `[hanger] first visual match keys: ${Object.keys(matches[0]).join(', ')}`,
    );
  } else {
    console.warn(
      '[hanger] SerpApi returned no visual_matches — check the response shape against §5.5.',
    );
  }
}

function fixture(): Record<string, unknown> {
  const path = resolve(process.cwd(), 'fixtures/serpapi-google-lens.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

async function callSerpApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  if (mockMode) return fixture();

  if (!env.SERPAPI_KEY) throw new CodedError('serpapi_key_missing');

  const url = new URL('https://serpapi.com/search.json');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('api_key', env.SERPAPI_KEY);

  let response: Response;
  try {
    response = await fetch(url, {signal: AbortSignal.timeout(20_000)});
  } catch (error) {
    console.error('[hanger] SerpApi request failed:', error);
    throw new CodedError('serpapi_unavailable');
  }

  if (!response.ok) {
    console.error(`[hanger] SerpApi ${response.status}: ${await response.text()}`);
    throw new CodedError('serpapi_unavailable');
  }

  const body = (await response.json()) as Record<string, unknown>;
  logShapeOnce(body);
  return body;
}

function parsePrice(price: LensMatch['price']): Price | null {
  if (price == null) return null;

  if (typeof price === 'number') {
    return Number.isFinite(price) ? {amount: price, currency: 'GBP'} : null;
  }

  if (typeof price === 'string') {
    const amount = Number.parseFloat(price.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(amount)) return null;
    return {amount, currency: currencyFromSymbol(price)};
  }

  const extracted = price.extracted_value;
  if (typeof extracted === 'number' && Number.isFinite(extracted)) {
    return {
      amount: extracted,
      currency: currencyFromSymbol(price.currency ?? price.value ?? ''),
    };
  }

  if (typeof price.value === 'string') {
    const amount = Number.parseFloat(price.value.replace(/[^\d.]/g, ''));
    if (Number.isFinite(amount)) {
      return {amount, currency: currencyFromSymbol(price.value)};
    }
  }

  return null;
}

function currencyFromSymbol(text: string): string {
  if (text.includes('£')) return 'GBP';
  if (text.includes('€')) return 'EUR';
  if (text.includes('$')) return 'USD';
  if (/^[A-Z]{3}$/.test(text.trim())) return text.trim();
  return 'GBP';
}

function hostOf(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\d?\./, '');
  } catch {
    return null;
  }
}

/** Titles differ by variant and size noise; compare what's left after that. */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(size|uk|us|eu)\s*\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Places that sell nothing — a link here is a dead end for a shopper. */
const NOT_SHOPS = [
  'pinterest.',
  'instagram.',
  'facebook.',
  'x.com',
  'twitter.',
  'tiktok.',
  'youtube.',
  'reddit.',
  'lookastic.',
  'polyvore.',
];

export interface FilteredMatch {
  title: string;
  source: string;
  link: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  inStock: boolean | null;
  position: number | null;
  price: Price;
}

/** §10.1 step 3 — everything that isn't a real, priced, different-shop result goes. */
export function filterMatches(
  matches: LensMatch[],
  originalRetailer: string,
): FilteredMatch[] {
  const seen = new Set<string>();
  const out: FilteredMatch[] = [];

  for (const match of matches) {
    const link = typeof match.link === 'string' ? match.link : null;
    const title = typeof match.title === 'string' ? match.title.trim() : '';
    if (!link || !title) continue;

    const host = hostOf(link);
    if (!host) continue;
    if (NOT_SHOPS.some((bad) => host.includes(bad))) continue;

    // Same shop as the original isn't an alternative, it's the same thing.
    if (host === originalRetailer || originalRetailer.includes(host)) continue;

    const price = parsePrice(match.price);
    if (!price) continue;

    const source = (match.source ?? host).trim();
    const key = `${source.toLowerCase()}|${normaliseTitle(title)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      source,
      link,
      thumbnailUrl: match.thumbnail ?? null,
      imageUrl: match.image ?? null,
      imageWidth: match.image_width ?? null,
      imageHeight: match.image_height ?? null,
      inStock: typeof match.in_stock === 'boolean' ? match.in_stock : null,
      position: match.position ?? null,
      price,
    });
  }

  // §10.1 step 4 — cheapest first. That ordering is the whole feature.
  out.sort((a, b) => a.price.amount - b.price.amount);
  return out;
}

/**
 * §10.3 — when Lens finds nothing, a text search on what the title actually
 * describes beats an empty screen.
 */
export function searchTermsFrom(garment: GarmentRow): string {
  const title = garment.title.toLowerCase();

  const colours = [
    'black', 'white', 'blue', 'navy', 'green', 'red', 'pink', 'grey', 'gray',
    'brown', 'beige', 'cream', 'khaki', 'olive', 'burgundy', 'yellow', 'purple',
    'orange', 'tan', 'charcoal', 'ecru', 'stone', 'mocha', 'sand',
  ];
  const materials = [
    'cotton', 'linen', 'wool', 'denim', 'leather', 'silk', 'cashmere',
    'corduroy', 'fleece', 'nylon', 'polyester', 'suede', 'merino',
  ];
  const types = [
    'shirt', 'tee', 't-shirt', 'jumper', 'sweater', 'hoodie', 'jacket', 'coat',
    'trousers', 'jeans', 'chinos', 'shorts', 'skirt', 'dress', 'trainers',
    'sneakers', 'boots', 'blazer', 'cardigan', 'polo', 'gilet',
  ];

  const pick = (words: string[]) => words.find((w) => title.includes(w));

  const parts = [
    garment.brand ?? '',
    pick(colours) ?? '',
    pick(materials) ?? '',
    pick(types) ?? categoryWord(garment.category),
  ].filter(Boolean);

  // If we recognised nothing, the title itself is better than nothing.
  if (parts.length <= 1) return garment.title.slice(0, 80);
  return parts.join(' ');
}

function categoryWord(category: string): string {
  switch (category) {
    case 'lower_body':
      return 'trousers';
    case 'full_body':
      return 'dress';
    case 'shoes':
      return 'shoes';
    case 'bag':
      return 'bag';
    case 'hat':
      return 'hat';
    case 'scarf':
      return 'scarf';
    default:
      return 'top';
  }
}

export interface LookupResult {
  matches: FilteredMatch[];
  usedTextFallback: boolean;
}

export async function lookupAlternatives(
  garment: GarmentRow,
): Promise<LookupResult> {
  // §5.5: the retailer's own CDN URL goes to SerpApi. That's a plain public
  // GET and is a different problem from §2.2, where Perfect Corp's fetcher is
  // the one getting blocked.
  const imageUrl = garment.source_image_url;

  if (imageUrl) {
    const body = await callSerpApi({
      engine: 'google_lens',
      url: imageUrl,
      type: 'visual_matches',
      country: 'gb',
    });
    const matches = filterMatches(
      (body.visual_matches ?? []) as LensMatch[],
      garment.retailer,
    );
    if (matches.length > 0) return {matches, usedTextFallback: false};
    console.log('[hanger] Lens gave nothing usable; falling back to a text search');
  }

  const body = await callSerpApi({
    engine: 'google_shopping',
    q: searchTermsFrom(garment),
    gl: 'uk',
    hl: 'en',
  });

  // Shopping results carry the same fields under a different key.
  const shopping = (body.shopping_results ?? body.visual_matches ?? []) as LensMatch[];
  return {
    matches: filterMatches(shopping, garment.retailer),
    usedTextFallback: true,
  };
}

export function cachedAlternatives(garmentId: string): AlternativeRow[] {
  const rows = db
    .prepare(
      'SELECT * FROM alternative WHERE garment_id = ? ORDER BY price_amount ASC',
    )
    .all(garmentId) as AlternativeRow[];
  if (rows.length === 0) return [];
  const freshest = Math.max(...rows.map((r) => r.fetched_at));
  // §10.1 step 5 — 24h. The free tier is 100 searches in total and re-renders
  // must not eat them.
  if (Date.now() - freshest > CACHE_TTL_MS) return [];
  return rows;
}

export function storeAlternatives(
  garmentId: string,
  matches: FilteredMatch[],
): AlternativeRow[] {
  db.transaction(() => {
    db.prepare('DELETE FROM alternative WHERE garment_id = ?').run(garmentId);
    for (const match of matches) {
      db.prepare(
        `INSERT INTO alternative
           (id, garment_id, title, source, link, thumbnail_url, price_amount,
            price_currency, image_url, image_width, image_height, in_stock,
            position, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        garmentId,
        match.title,
        match.source,
        match.link,
        match.thumbnailUrl,
        match.price.amount,
        match.price.currency,
        match.imageUrl,
        match.imageWidth,
        match.imageHeight,
        match.inStock == null ? null : match.inStock ? 1 : 0,
        match.position,
        Date.now(),
      );
    }
  })();

  return cachedAlternatives(garmentId);
}

export function getAlternativeRow(id: string): AlternativeRow {
  const row = db.prepare('SELECT * FROM alternative WHERE id = ?').get(id) as
    | AlternativeRow
    | undefined;
  if (!row) throw new CodedError('not_found');
  return row;
}
