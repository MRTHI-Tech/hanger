import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cleanText} from '@hanger/shared/text';
import {db} from './db.js';
import {env, mockMode} from './env.js';
import {CodedError} from './youcam/errors.js';
import type {GarmentRow, Price} from './types.js';

/**
 * The alternatives engine (§10) — reverse image search over the garment you're
 * looking at, cheapest first, and every result is something you can then try on.
 *
 * On the response shape: the parser was built around SerpApi's own published
 * Google Lens example (saved in fixtures/serpapi-google-lens.json) rather than
 * a live call. Every field is read defensively and the first live response
 * gets its shape logged, so a mismatch announces itself instead of quietly
 * producing an empty list. `scripts/capture-lens.ts` saves a real response and
 * runs it through `filterMatches` to check that end to end.
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

/**
 * Per attempt, not per search.
 *
 * SerpApi answers in two or three seconds when it is well, so fifteen is
 * already several times the normal wait — and past that, waiting longer is a
 * worse bet than asking again. The one failure this has actually had in the
 * wild was a single request hanging past the ceiling while the identical query
 * came back in under three seconds moments later.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * How many alternatives a search is worth.
 *
 * A shopping search can hand back forty rows, and the fortieth is not a
 * fortieth as good — `filterMatches` has already sorted them cheapest-first in
 * the garment's own currency, so the answer to "is this cheaper somewhere
 * else" is at the top and everything after it is scrolling. Capped here rather
 * than at the route so the cache holds five too, and one search doesn't store
 * thirty-five rows nobody will read.
 */
export const MAX_ALTERNATIVES = 5;

/** Two attempts, so worst case is ~30s rather than the ~40s a 20s ceiling gave. */
const ATTEMPTS = 2;

const RETRY_DELAY_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callSerpApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  if (mockMode) return fixture();

  if (!env.SERPAPI_KEY) throw new CodedError('serpapi_key_missing');

  const url = new URL('https://serpapi.com/search.json');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('api_key', env.SERPAPI_KEY);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const last = attempt === ATTEMPTS;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A timeout or a dropped connection. Both are worth asking again about,
      // because neither says anything about whether the query is answerable.
      console.error(
        `[hanger] SerpApi request failed (attempt ${attempt}/${ATTEMPTS}):`,
        error,
      );
      if (last) throw new CodedError('serpapi_unavailable');
      await delay(RETRY_DELAY_MS);
      continue;
    }

    // Retried, because it is their end having a moment. A 4xx is not: a bad
    // key or a spent allowance answers the same way however many times it is
    // asked, and retrying it just doubles the wait before the same refusal.
    if (response.status >= 500 && !last) {
      console.error(
        `[hanger] SerpApi ${response.status} (attempt ${attempt}/${ATTEMPTS}), retrying`,
      );
      await delay(RETRY_DELAY_MS);
      continue;
    }

    if (!response.ok) {
      console.error(`[hanger] SerpApi ${response.status}: ${await response.text()}`);
      throw new CodedError('serpapi_unavailable');
    }

    const body = (await response.json()) as Record<string, unknown>;
    logShapeOnce(body);
    return body;
  }

  // Unreachable: the last attempt either returns or throws above.
  throw new CodedError('serpapi_unavailable');
}

/**
 * Prices come back written for wherever the shop is: "£12.99", "R1 299,00",
 * "1.299,00 €". Stripping everything but digits and a dot turns the second of
 * those into 129900, so work out which separator is the decimal one first.
 */
export function parseAmount(raw: string): number | null {
  const compact = raw.replace(/[^\d.,\s]/g, '').replace(/\s/g, '');
  if (!compact) return null;

  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');
  let decimalAt = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever comes last is the decimal point; the other groups thousands.
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const only = Math.max(lastDot, lastComma);
    // Exactly three digits after the only separator means it groups thousands
    // ("1,299", "1.234.567"). Anything else is a decimal ("12.99", "1299,00").
    decimalAt = compact.length - only - 1 === 3 ? -1 : only;
  }

  const digits = (s: string) => s.replace(/[.,]/g, '');
  const value =
    decimalAt === -1
      ? Number(digits(compact))
      : Number(
          `${digits(compact.slice(0, decimalAt))}.${digits(compact.slice(decimalAt + 1))}`,
        );

  return Number.isFinite(value) ? value : null;
}

function parsePrice(price: LensMatch['price'], fallbackCurrency: string): Price | null {
  if (price == null) return null;

  if (typeof price === 'number') {
    return Number.isFinite(price) ? {amount: price, currency: fallbackCurrency} : null;
  }

  if (typeof price === 'string') {
    const amount = parseAmount(price);
    if (amount == null) return null;
    return {amount, currency: currencyFromSymbol(price, fallbackCurrency)};
  }

  const currency = currencyFromSymbol(
    `${price.currency ?? ''} ${price.value ?? ''}`,
    fallbackCurrency,
  );

  const extracted = price.extracted_value;
  if (typeof extracted === 'number' && Number.isFinite(extracted)) {
    return {amount: extracted, currency};
  }

  if (typeof price.value === 'string') {
    const amount = parseAmount(price.value);
    if (amount != null) return {amount, currency};
  }

  return null;
}

/**
 * Symbols are ambiguous — "R$" is Brazil, plain "R" is South Africa, and a
 * bare "$" could be several places. When nothing matches, the garment being
 * compared against is a far better guess than a hardcoded default.
 */
function currencyFromSymbol(text: string, fallback: string): string {
  const iso = text.match(/\b(GBP|USD|EUR|ZAR|AUD|CAD|JPY|INR|NZD|SEK|CHF)\b/);
  if (iso) return iso[1];
  if (text.includes('£')) return 'GBP';
  if (text.includes('€')) return 'EUR';
  if (text.includes('R$')) return 'BRL';
  if (text.includes('$')) return 'USD';
  if (/\bR\s?\d/.test(text)) return 'ZAR';
  return fallback;
}

/**
 * Where to search. A shopper in Johannesburg is not helped by a cheaper
 * jersey in Manchester, so the garment's own currency picks the market unless
 * SEARCH_COUNTRY overrides it.
 */
const MARKETS: Record<string, {country: string; gl: string}> = {
  ZAR: {country: 'za', gl: 'za'},
  GBP: {country: 'gb', gl: 'uk'},
  USD: {country: 'us', gl: 'us'},
  EUR: {country: 'ie', gl: 'ie'},
  AUD: {country: 'au', gl: 'au'},
  CAD: {country: 'ca', gl: 'ca'},
  INR: {country: 'in', gl: 'in'},
};

export function marketFor(garment: GarmentRow): {
  country: string;
  gl: string;
  currency: string;
} {
  const currency = (garment.price_currency ?? 'GBP').toUpperCase();
  const market = MARKETS[currency] ?? MARKETS.GBP;
  const override = env.SEARCH_COUNTRY?.toLowerCase();
  return {
    country: override ?? market.country,
    gl: override ?? market.gl,
    currency,
  };
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
  /** Null for a piece you already own — there's no shop to exclude. */
  originalRetailer: string | null,
  fallbackCurrency = 'GBP',
): FilteredMatch[] {
  const seen = new Set<string>();
  const out: FilteredMatch[] = [];

  for (const match of matches) {
    const link = typeof match.link === 'string' ? match.link : null;
    // Lens lifts its titles out of the shop's own markup, entities and all.
    const title = typeof match.title === 'string' ? cleanText(match.title) : '';
    if (!link || !title) continue;

    const host = hostOf(link);
    if (!host) continue;
    if (NOT_SHOPS.some((bad) => host.includes(bad))) continue;

    // Same shop as the original isn't an alternative, it's the same thing.
    if (originalRetailer && (host === originalRetailer || originalRetailer.includes(host))) {
      continue;
    }

    const price = parsePrice(match.price, fallbackCurrency);
    if (!price) continue;

    const source = cleanText(match.source ?? host);
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

  // §10.1 step 4 — cheapest first. That ordering is the whole feature, but
  // comparing 1299 ZAR against 45 USD by raw number would rank noise above
  // real savings, so anything priced in the garment's own currency sorts
  // first, cheapest within that, and the rest follow.
  out.sort((a, b) => {
    const aHome = a.price.currency === fallbackCurrency ? 0 : 1;
    const bHome = b.price.currency === fallbackCurrency ? 0 : 1;
    if (aHome !== bHome) return aHome - bHome;
    if (a.price.currency !== b.price.currency) {
      return a.price.currency.localeCompare(b.price.currency);
    }
    return a.price.amount - b.price.amount;
  });
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
  const market = marketFor(garment);
  console.log(
    `[hanger] alternatives for "${garment.title.slice(0, 40)}" — market ${market.country}, currency ${market.currency}`,
  );

  if (imageUrl) {
    const body = await callSerpApi({
      engine: 'google_lens',
      url: imageUrl,
      type: 'visual_matches',
      country: market.country,
    });
    const matches = filterMatches(
      (body.visual_matches ?? []) as LensMatch[],
      garment.retailer,
      market.currency,
    );
    if (matches.length > 0) {
      return {matches: matches.slice(0, MAX_ALTERNATIVES), usedTextFallback: false};
    }
    console.log('[hanger] Lens gave nothing usable; falling back to a text search');
  }

  const body = await callSerpApi({
    engine: 'google_shopping',
    q: searchTermsFrom(garment),
    gl: market.gl,
    hl: 'en',
  });

  // Shopping results carry the same fields under a different key.
  const shopping = (body.shopping_results ?? body.visual_matches ?? []) as LensMatch[];
  return {
    matches: filterMatches(shopping, garment.retailer, market.currency).slice(
      0,
      MAX_ALTERNATIVES,
    ),
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
