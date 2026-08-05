/**
 * Captures one live SerpApi response and reports how the real parser copes.
 *
 * The alternatives parser (§10) was written against SerpApi's *published
 * example*, not a live call. This spends exactly one search, saves the raw body
 * so every later run is offline, and pushes it through the real
 * `filterMatches` so the verdict comes from shipping code rather than a copy.
 *
 *   npx tsx scripts/capture-lens.ts <garmentId>
 *   npx tsx scripts/capture-lens.ts --url=https://…/shirt.jpg --country=za
 *   npx tsx scripts/capture-lens.ts <garmentId> --engine=google_shopping
 *   npx tsx scripts/capture-lens.ts --replay=fixtures/live/lens-adidas.json
 *
 * `--replay` re-runs the report against a saved capture and spends nothing.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {db} from '../src/db.js';
import {env} from '../src/env.js';
import {
  filterMatches,
  marketFor,
  searchTermsFrom,
  type LensMatch,
} from '../src/alternatives.js';
import type {GarmentRow} from '../src/types.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const positional = args.find((a) => !a.startsWith('--'));

const engine = flag('engine') ?? 'google_lens';
const replay = flag('replay');

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/* ── the garment under test ─────────────────────────────────────────────── */

let garment: GarmentRow | undefined;
if (positional) {
  garment = db.prepare('SELECT * FROM garment WHERE id = ?').get(positional) as
    | GarmentRow
    | undefined;
  if (!garment) die(`No garment with id ${positional}.`);
}

const imageUrl = flag('url') ?? garment?.source_image_url ?? undefined;

/* ── fetch, or replay a previous capture ────────────────────────────────── */

interface Capture {
  _provenance?: Record<string, unknown>;
  [key: string]: unknown;
}

let body: Capture;
let outPath: string;

if (replay) {
  outPath = resolve(process.cwd(), replay);
  body = JSON.parse(readFileSync(outPath, 'utf8')) as Capture;
  console.log(`\nReplaying ${replay} — no search spent.`);
} else {
  if (!env.SERPAPI_KEY) die('SERPAPI_KEY is not set in server/.env.');

  // Same market the app would pick, so the capture reflects real behaviour.
  const market = garment ? marketFor(garment) : {country: 'gb', gl: 'uk', currency: 'GBP'};

  const params: Record<string, string> = {engine};
  if (engine === 'google_lens') {
    if (!imageUrl) die('Need a garment with a source_image_url, or --url=…');
    if (/example\.invalid/.test(imageUrl)) {
      die(`That garment's source_image_url is a fixture placeholder:\n  ${imageUrl}\n  Pick a garment scraped from a real shop, or pass --url=…`);
    }
    params.url = imageUrl;
    params.type = 'visual_matches';
    params.country = flag('country') ?? market.country;
  } else {
    params.q = flag('q') ?? (garment ? searchTermsFrom(garment) : '');
    if (!params.q) die('google_shopping needs a garment or --q=…');
    params.gl = flag('gl') ?? market.gl;
    params.hl = 'en';
  }

  console.log(`\nCalling SerpApi — this spends one search.`);
  for (const [k, v] of Object.entries(params)) console.log(`  ${k}: ${v}`);

  const url = new URL('https://serpapi.com/search.json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', env.SERPAPI_KEY);

  const response = await fetch(url, {signal: AbortSignal.timeout(30_000)});
  const text = await response.text();
  console.log(`  → HTTP ${response.status}\n`);

  try {
    body = JSON.parse(text) as Capture;
  } catch {
    die(`Response was not JSON:\n${text.slice(0, 500)}`);
  }

  // Never let the key reach a file we might commit.
  const scrub = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/api_key|apikey/i.test(k)) (node as Record<string, unknown>)[k] = '<redacted>';
      else if (typeof v === 'string' && env.SERPAPI_KEY && v.includes(env.SERPAPI_KEY)) {
        (node as Record<string, unknown>)[k] = v.replaceAll(env.SERPAPI_KEY, '<redacted>');
      } else scrub(v);
    }
  };
  scrub(body);

  body._provenance = {
    note: 'LIVE SerpApi response, captured verbatim. API key redacted.',
    observedAt: new Date().toISOString(),
    engine,
    params: {...params, api_key: undefined},
    garment: garment && {
      id: garment.id,
      title: garment.title,
      retailer: garment.retailer,
      price: `${garment.price_amount ?? '?'} ${garment.price_currency ?? ''}`.trim(),
    },
  };

  const slug = flag('out') ?? `${engine}-${Date.now()}`;
  outPath = resolve(process.cwd(), `fixtures/live/${slug}.json`);
  mkdirSync(dirname(outPath), {recursive: true});
  writeFileSync(outPath, JSON.stringify(body, null, 2));
  console.log(`Saved raw response → ${outPath}`);
}

/* ── report ─────────────────────────────────────────────────────────────── */

const line = (label = '') =>
  console.log(`\n${label}\n${'─'.repeat(Math.max(label.length, 44))}`);

if (body.error) die(`SerpApi returned an error: ${String(body.error)}`);

line('Top-level keys');
console.log(Object.keys(body).join(', '));

const matchKey = body.visual_matches
  ? 'visual_matches'
  : body.shopping_results
    ? 'shopping_results'
    : null;

if (!matchKey) {
  line('No matches array');
  console.log(
    'Neither visual_matches nor shopping_results is present. The parser reads\n' +
      'body.visual_matches (alternatives.ts:318) and would return an empty list.',
  );
  process.exit(1);
}

const matches = (body[matchKey] ?? []) as LensMatch[];
console.log(`\n${matchKey}: ${matches.length} matches`);

line('Field coverage (how many of the ' + matches.length + ' carry each key)');
const counts = new Map<string, number>();
for (const m of matches) {
  for (const k of Object.keys(m)) counts.set(k, (counts.get(k) ?? 0) + 1);
}
const parserReads = new Set([
  'position', 'title', 'link', 'source', 'thumbnail',
  'image', 'image_width', 'image_height', 'in_stock', 'price',
]);
for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  const pct = Math.round((n / matches.length) * 100);
  const used = parserReads.has(k) ? 'parser reads' : '';
  console.log(`  ${k.padEnd(20)} ${String(n).padStart(3)}/${matches.length}  ${String(pct).padStart(3)}%  ${used}`);
}
const missing = [...parserReads].filter((k) => !counts.has(k));
if (missing.length) {
  console.log(`\n  ⚠ parser reads these, and NO match has them: ${missing.join(', ')}`);
}

line('Price shapes');
const shapes = new Map<string, number>();
const samples: string[] = [];
for (const m of matches) {
  const p = m.price;
  const shape =
    p == null ? 'absent'
    : typeof p === 'string' ? 'string'
    : typeof p === 'number' ? 'number'
    : `object{${Object.keys(p).join(',')}}`;
  shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  if (p != null && samples.length < 6) samples.push(JSON.stringify(p));
}
for (const [shape, n] of [...shapes].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${shape}`);
}
if (samples.length) console.log(`\n  samples: ${samples.join('  ')}`);

const currencies = new Set<string>();
for (const m of matches) {
  const p = m.price;
  const text = typeof p === 'string' ? p : typeof p === 'object' && p ? `${p.currency ?? ''}${p.value ?? ''}` : '';
  for (const sym of text.matchAll(/[£€$R]|[A-Z]{3}/g)) currencies.add(sym[0]);
}
if (currencies.size) console.log(`  currency markers seen: ${[...currencies].join(' ')}`);

/* The authoritative number: the real shipping filter. */
line('Through the real filterMatches()');
const retailer = garment?.retailer ?? flag('retailer') ?? '';
const homeCurrency = garment ? marketFor(garment).currency : 'GBP';
const survivors = filterMatches(matches, retailer, homeCurrency);
console.log(
  `  ${matches.length} in → ${survivors.length} out   (retailer "${retailer || '(none)'}", home currency ${homeCurrency})`,
);

// Indicative attribution only — filterMatches above is the source of truth.
const reasons = new Map<string, number>();
const bump = (r: string) => reasons.set(r, (reasons.get(r) ?? 0) + 1);
const seen = new Set<string>();
for (const m of matches) {
  const link = typeof m.link === 'string' ? m.link : null;
  const title = typeof m.title === 'string' ? m.title.trim() : '';
  if (!link || !title) { bump('no link or title'); continue; }
  let host: string | null = null;
  try { host = new URL(link).hostname.replace(/^www\d?\./, ''); } catch { /* ignore */ }
  if (!host) { bump('unparseable link'); continue; }
  if (['pinterest.','instagram.','facebook.','x.com','twitter.','tiktok.','youtube.','reddit.','lookastic.','polyvore.']
      .some((b) => host!.includes(b))) { bump('not a shop'); continue; }
  if (retailer && (host === retailer || retailer.includes(host))) { bump('same retailer'); continue; }
  if (m.price == null) { bump('no price at all'); continue; }
  const key = `${(m.source ?? host).toLowerCase()}|${title.toLowerCase().slice(0,60)}`;
  if (seen.has(key)) { bump('duplicate'); continue; }
  seen.add(key);
  bump('kept (or price unparseable)');
}
console.log('\n  why matches dropped (indicative):');
for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(3)}  ${r}`);
}

if (survivors.length) {
  line('Survivors, cheapest first — this ordering is the feature');
  for (const s of survivors.slice(0, 12)) {
    const dims = s.imageWidth && s.imageHeight ? `${s.imageWidth}×${s.imageHeight}` : 'no dims';
    const tryable = s.imageWidth && s.imageHeight && s.imageWidth >= 500 && s.imageHeight >= 500 ? 'try-on ok' : 'TOO SMALL';
    const home = s.price.currency === homeCurrency ? '' : '  (not comparable)';
    console.log(
      `  ${String(s.price.amount).padStart(9)} ${s.price.currency}  ${s.source.padEnd(22).slice(0,22)}  ${dims.padEnd(11)} ${tryable}${home}`,
    );
    console.log(`             ${s.title.slice(0, 68)}`);
  }
  const noImage = survivors.filter((s) => !s.imageUrl).length;
  if (noImage) console.log(`\n  ⚠ ${noImage} survivor(s) have no full-size image — "try this on" cannot work on those.`);
  const offCurrency = survivors.filter((s) => s.price.currency !== homeCurrency).length;
  if (offCurrency) {
    console.log(
      `  ⚠ ${offCurrency}/${survivors.length} priced in another currency — those show no savings badge.\n` +
        `    If that's most of them, the market is wrong: check SEARCH_COUNTRY and the garment's price_currency.`,
    );
  }
} else {
  line('No survivors');
  console.log('Nothing made it through the filter. The histogram above says why.');
}

console.log('');
