import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {cleanText, cleanTextOrNull, decodeEntities} from '@hanger/shared/text';
import {
  collectJsonLdProducts,
  inferCategory,
  jsonLdBrand,
  jsonLdHasOffer,
  jsonLdImages,
  jsonLdName,
  jsonLdPrice,
  looksLikePageFurniture,
  parseNumber,
  parsePriceText,
  trimShopSuffix,
  type JsonLdNode,
} from '@hanger/shared/product';
import type {LinkPreview, Price} from '@hanger/shared/types';
import {CodedError} from './youcam/errors.js';

/**
 * Reading a product page the server was only given a link to.
 *
 * The extension has always done this with a browser around it: a rendered DOM,
 * a gallery it can measure, corner pixels it can sample (§9). A link pasted
 * into the phone — or shared into it from another app — arrives as a URL and
 * nothing else, and there is no page open anywhere. So this is the same job
 * done from the markup alone.
 *
 * What that costs is the on-model ranking (§9.3): with no way to measure or
 * look at the candidates, picking "the best photo" out of forty would be
 * guessing with extra steps. It takes the picture the shop nominated for
 * sharing instead — `og:image` is chosen by the retailer to represent the
 * product, which is very often the on-model shot and is never a navigation
 * tile. What it keeps is everything structured: JSON-LD, OpenGraph, microdata,
 * all of it read through the same `@hanger/shared/product` helpers the
 * extension reads them through, so one link means one garment either way.
 */

/** Long enough for a slow shop, short enough that nobody wonders if it hung. */
const TIMEOUT_MS = 10_000;

/** Shops chain www → locale → currency redirects. Four is generous. */
const MAX_REDIRECTS = 4;

/** A product page's markup is tens of kilobytes. Anything past this is not it. */
const MAX_BYTES = 2 * 1024 * 1024;

/** §5.4 refuses anything over 10MB anyway; this stops us holding more than that. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * We ask for pages as a browser would.
 *
 * Not a disguise — this is fetching a public page on behalf of the person who
 * just handed us its address, which is the same request their phone would have
 * made. But a great many shops sit behind bot protection that refuses anything
 * without a browser's headers, and being refused by half the internet would
 * make the feature a coin toss.
 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

/**
 * Is this address one the wider internet could reach?
 *
 * The server is about to fetch a URL a stranger chose, which is the classic way
 * to turn a public API into a probe of the private network behind it — the
 * cloud metadata endpoint, a database admin page, the router. Every hop is
 * resolved and checked, not just the first: a public hostname that redirects to
 * 169.254.169.254 is the whole attack.
 */
async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CodedError('link_not_public');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];

  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, {all: true})).map((a) => a.address);
    } catch {
      throw new CodedError('link_unreadable');
    }
  }

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new CodedError('link_not_public');
  }
}

function isPrivateAddress(raw: string): boolean {
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 — the same address wearing a hat.
  const ip = raw.toLowerCase().startsWith('::ffff:') ? raw.slice(7) : raw;

  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || // this network
      a === 10 || // private
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, and the cloud metadata address
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      a >= 224 // multicast and reserved
    );
  }

  if (isIP(ip) === 6) {
    const low = ip.toLowerCase();
    return (
      low === '::' ||
      low === '::1' ||
      low.startsWith('fc') || // unique local
      low.startsWith('fd') ||
      low.startsWith('fe80') || // link-local
      low.startsWith('ff') // multicast
    );
  }

  // Something we can't classify is something we don't fetch.
  return true;
}

/**
 * Redirects are followed by hand rather than by `fetch`, because every hop has
 * to pass `assertPublic` and `redirect: 'follow'` would take them privately.
 */
async function followPublic(
  start: string,
  headers: Record<string, string>,
): Promise<{response: Response; finalUrl: URL}> {
  let url: URL;
  try {
    url = new URL(start);
  } catch {
    throw new CodedError('link_not_public');
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new CodedError('link_unreadable');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new CodedError('link_unreadable');
      try {
        url = new URL(location, url);
      } catch {
        throw new CodedError('link_unreadable');
      }
      continue;
    }

    if (!response.ok) {
      console.warn(`[hanger] link read: ${url.hostname} answered ${response.status}`);
      throw new CodedError('link_unreadable');
    }

    return {response, finalUrl: url};
  }

  throw new CodedError('link_unreadable');
}

/**
 * Stops reading at the cap rather than trusting the shop's content-length. For
 * a page, the head carries everything structured and a truncated tail costs
 * nothing; for an image, the cap is the point.
 */
async function readCapped(response: Response, max: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());

  const chunks: Buffer[] = [];
  let total = 0;
  while (total < max) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks);
}

async function fetchPage(start: string): Promise<{html: string; finalUrl: URL}> {
  const {response, finalUrl} = await followPublic(start, BROWSER_HEADERS);

  const type = response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml/i.test(type)) {
    throw new CodedError('link_not_a_page');
  }

  const bytes = await readCapped(response, MAX_BYTES);
  return {html: bytes.toString('utf8'), finalUrl};
}

/**
 * The shop's picture of the garment, fetched with the same care as the page it
 * was named on — an image URL is a URL somebody handed us too, and a redirect
 * chain ending on the metadata endpoint doesn't care that it was called an
 * image.
 */
export async function fetchPublicImage(
  link: string,
): Promise<{bytes: Buffer; contentType: string}> {
  const {response} = await followPublic(link, {
    ...BROWSER_HEADERS,
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  });

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  if (!/^image\//i.test(contentType)) throw new CodedError('link_no_image');

  const bytes = await readCapped(response, MAX_IMAGE_BYTES);
  if (bytes.byteLength === 0) throw new CodedError('link_no_image');
  return {bytes, contentType};
}

// ---------------------------------------------------------------------------
// Reading the markup
// ---------------------------------------------------------------------------

/**
 * Attributes off a single tag. Deliberately not a parser: this only ever looks
 * at `<meta>` and `<img>`, where the whole tag is one match and the attributes
 * are simple. A page that defeats this is a page whose markup we weren't going
 * to understand anyway.
 */
function attributesOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    out[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return out;
}

/**
 * `og:title`, `product:price:amount`, `itemprop="price"` — all three naming
 * conventions collapse into one lookup, first occurrence winning, which is the
 * same precedence a browser's `querySelector` would have given.
 */
function readMeta(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    const key = attrs.property ?? attrs.name ?? attrs.itemprop;
    const content = attrs.content;
    if (!key || !content) continue;
    const lower = key.toLowerCase();
    if (!out.has(lower)) out.set(lower, content);
  }
  return out;
}

function readJsonLd(html: string): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const blocks = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      collectJsonLdProducts(JSON.parse(block[1].trim()), out);
    } catch {
      // Shops ship invalid JSON-LD more often than you would believe. The
      // OpenGraph fallback below is what carries those pages.
    }
  }
  return out;
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '));
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match ? cleanText(stripTags(match[1])) || null : null;
}

/** The §9.1 signals, minus the two that need a rendered page. */
function looksLikeProductPage(
  html: string,
  meta: Map<string, string>,
  products: JsonLdNode[],
  url: URL,
): boolean {
  if (products.length > 0 && jsonLdHasOffer(products)) return true;

  const signals = [
    products.length > 0,
    meta.get('og:type')?.toLowerCase() === 'product' ||
      meta.has('product:price:amount'),
    /itemtype\s*=\s*["'][^"']*schema\.org\/Product/i.test(html) ||
      meta.has('price'),
    ['/product/', '/products/', '/p/', '/productpage.', '/dp/', '/item/', '/itm/'].some(
      (pattern) => url.pathname.toLowerCase().includes(pattern),
    ),
  ];
  return signals.filter(Boolean).length >= 2;
}

/**
 * The currency when the markup only gave us an amount. The shop's own domain is
 * a better guess than a hardcoded default — a .co.uk page quoting "49.99" is
 * not quoting dollars — and the symbols in the page text settle the rest.
 */
function currencyGuess(html: string, url: URL): string {
  const fromMeta = /["'](?:GBP|USD|EUR|ZAR|AUD|CAD|JPY|INR)["']/.exec(html);
  if (fromMeta) return fromMeta[0].replace(/["']/g, '');

  const tld = url.hostname.split('.').pop()?.toLowerCase();
  const byTld: Record<string, string> = {
    uk: 'GBP',
    za: 'ZAR',
    au: 'AUD',
    ca: 'CAD',
    in: 'INR',
    ie: 'EUR',
    de: 'EUR',
    fr: 'EUR',
    es: 'EUR',
    it: 'EUR',
  };
  if (tld && byTld[tld]) return byTld[tld];

  const text = html.slice(0, 200_000);
  if (text.includes('£')) return 'GBP';
  if (text.includes('€')) return 'EUR';
  if (text.includes('$')) return 'USD';
  return 'GBP';
}

function extractPrice(
  product: JsonLdNode | undefined,
  meta: Map<string, string>,
  html: string,
  url: URL,
): Price | null {
  const guess = () => currencyGuess(html, url);

  const fromLd = jsonLdPrice(product, guess);
  if (fromLd) return fromLd;

  const metaAmount = parseNumber(meta.get('product:price:amount') ?? meta.get('price'));
  if (metaAmount != null) {
    return {
      amount: metaAmount,
      currency:
        meta.get('product:price:currency') ?? meta.get('pricecurrency') ?? guess(),
    };
  }

  // Last resort, and a narrow one: the first thing on the page that reads like
  // a price tag. Without a DOM there are no price-shaped elements to look
  // inside, so this is markup-blind and deliberately conservative.
  const tagged = /<[^>]+class=["'][^"']*price[^"']*["'][^>]*>([\s\S]{0,120}?)</i.exec(html);
  if (tagged) {
    const parsed = parsePriceText(stripTags(tagged[1]));
    if (parsed) return parsed;
  }
  return null;
}

/**
 * The picture to hang. `og:image` first because the shop chose it to represent
 * the product; JSON-LD next because it is the product's own image list; and
 * nothing after that — an `<img>` sweep with no dimensions to sort by returns
 * the logo as often as the garment.
 */
function extractImage(
  meta: Map<string, string>,
  products: JsonLdNode[],
  url: URL,
): string | null {
  const candidates = [
    meta.get('og:image:secure_url'),
    meta.get('og:image'),
    meta.get('twitter:image'),
    ...products.flatMap((product) => jsonLdImages(product)),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const absolute = new URL(candidate, url);
      if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') continue;
      // An SVG is a logo or an icon, never a photograph of a garment.
      if (/\.svg(\?|$)/i.test(absolute.pathname)) continue;
      // A shop whose og:image is `logo-seo.jpg` is telling us about itself, not
      // about the garment. Better to send somebody to the camera than to hang a
      // wordmark and let them find out at the try-on.
      if (looksLikePageFurniture(absolute.pathname)) continue;
      return absolute.href;
    } catch {
      /* a relative URL we can't resolve; try the next one */
    }
  }
  return null;
}

export async function readProductPage(link: string): Promise<LinkPreview> {
  const {html, finalUrl} = await fetchPage(link);
  const preview = parseProductPage(html, finalUrl);

  console.log(
    `[hanger] read a link: "${preview.title.slice(0, 40)}" from ${preview.retailer} — ` +
      `${preview.price ? `${preview.price.currency} ${preview.price.amount}` : 'no price'}, ` +
      `${preview.imageUrl ? 'with a picture' : 'no picture'}`,
  );

  return preview;
}

/**
 * The reading, with the fetching taken out — so it can be run over pages saved
 * from real shops, offline and for free (`scripts/test-read-link.ts`). The
 * extension's scraper is checked the same way against the same nine pages, and
 * the two answers being comparable is the point of them sharing a parser.
 */
export function parseProductPage(html: string, finalUrl: URL): LinkPreview {
  const meta = readMeta(html);
  const products = readJsonLd(html);
  const product = products[0];

  const retailer = finalUrl.hostname.replace(/^www\d?\./, '');
  const brand = cleanTextOrNull(
    jsonLdBrand(product) ?? meta.get('og:site_name') ?? null,
  );

  const rawTitle =
    cleanText(
      jsonLdName(product) ??
        meta.get('og:title') ??
        firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ??
        firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i) ??
        '',
    ).slice(0, 180) || retailer;

  const title = trimShopSuffix(rawTitle, brand, retailer, meta.get('og:site_name') ?? null);
  const category = inferCategory(`${title} ${finalUrl.pathname}`);

  return {
    title,
    brand,
    retailer,
    productUrl: finalUrl.href.split('#')[0],
    price: extractPrice(product, meta, html, finalUrl),
    category,
    imageUrl: extractImage(meta, products, finalUrl),
    looksLikeProduct: looksLikeProductPage(html, meta, products, finalUrl),
  };
}
