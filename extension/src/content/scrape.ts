import type {
  GarmentCategory,
  Price,
  ScoredImage,
  ScrapedProduct,
} from '@hanger/shared/types';

/**
 * Product page detection and extraction (§9).
 *
 * Deliberately retailer-agnostic: structured data first, DOM second, and no
 * per-site special cases. Everything here has to work on a shop nobody has
 * ever tested against.
 */

// ---------------------------------------------------------------------------
// §9.1 Detection
// ---------------------------------------------------------------------------

const PDP_URL_PATTERNS = [
  '/product/',
  '/products/',
  '/p/',
  '/productpage.',
  '/dp/',
  '/item/',
  '/itm/',
  '/shop/',
];

export interface DetectionSignals {
  jsonLdProduct: boolean;
  openGraphProduct: boolean;
  microdataProduct: boolean;
  urlPattern: boolean;
  buyControl: boolean;
}

/**
 * Does the page have a real "add to bag" control? Every shop has one and none
 * of them agree on markup, so this looks at what the button says. It's the
 * signal that catches shops whose PDP is otherwise indistinguishable from a
 * listing page.
 */
function hasBuyControl(): boolean {
  const controls = document.querySelectorAll(
    'button, [role="button"], input[type="submit"], a[href*="cart" i]',
  );
  const wanted =
    /\b(add to (bag|cart|basket)|add to my bag|buy now|añadir|in den warenkorb)\b/i;
  for (const control of controls) {
    const text = `${control.textContent ?? ''} ${
      control.getAttribute('aria-label') ?? ''
    } ${(control as HTMLInputElement).value ?? ''}`;
    if (wanted.test(text)) return true;
  }
  return false;
}

export function detectSignals(): DetectionSignals {
  const url = location.pathname.toLowerCase();
  return {
    jsonLdProduct: readJsonLdProducts().length > 0,
    openGraphProduct:
      meta('og:type')?.toLowerCase() === 'product' ||
      Boolean(meta('product:price:amount')),
    microdataProduct:
      Boolean(document.querySelector('[itemtype*="schema.org/Product"]')) ||
      Boolean(document.querySelector('meta[itemprop="price"]')),
    urlPattern: PDP_URL_PATTERNS.some((p) => url.includes(p)),
    buyControl: hasBuyControl(),
  };
}

/**
 * Two or more signals means a product page (§9.1) — with one addition the spec
 * didn't anticipate: schema.org Product JSON-LD *with an offer* is decisive on
 * its own. Nike publishes exactly that and nothing else we'd recognise, and a
 * page that declares itself a product with a price is not a listing page.
 */
export function isProductPage(signals = detectSignals()): boolean {
  if (signals.jsonLdProduct && jsonLdHasOffer()) return true;
  return Object.values(signals).filter(Boolean).length >= 2;
}

function jsonLdHasOffer(): boolean {
  return readJsonLdProducts().some((product) => {
    const offers = product.offers;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (!offer || typeof offer !== 'object') return false;
    const o = offer as JsonLdNode;
    return o.price != null || o.lowPrice != null || o.priceSpecification != null;
  });
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

type JsonLdNode = Record<string, unknown>;

function readJsonLdProducts(): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    walkJsonLd(parsed, out);
  }
  return out;
}

function walkJsonLd(node: unknown, out: JsonLdNode[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  const obj = node as JsonLdNode;
  const type = obj['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product')) {
    out.push(obj);
  }
  // @graph and nested entities are common; keep walking.
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') walkJsonLd(value, out, depth + 1);
  }
}

function meta(property: string): string | null {
  const el =
    document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`) ??
    document.querySelector<HTMLMetaElement>(`meta[name="${property}"]`);
  return el?.content?.trim() || null;
}

// ---------------------------------------------------------------------------
// §9.2 Field extraction
// ---------------------------------------------------------------------------

function extractTitle(product: JsonLdNode | undefined): string {
  const fromLd = typeof product?.name === 'string' ? product.name : null;
  const title =
    fromLd ||
    meta('og:title') ||
    document.querySelector('h1')?.textContent ||
    document.title;
  return clean(title).slice(0, 180);
}

function extractBrand(product: JsonLdNode | undefined): string | null {
  const brand = product?.brand;
  if (typeof brand === 'string') return clean(brand);
  if (brand && typeof brand === 'object') {
    const name = (brand as JsonLdNode).name;
    if (typeof name === 'string') return clean(name);
  }
  const og = meta('og:site_name');
  if (og) return clean(og);
  return null;
}

function extractPrice(product: JsonLdNode | undefined): Price | null {
  const offers = product?.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (offer && typeof offer === 'object') {
    const o = offer as JsonLdNode;
    const amount = toNumber(o.price ?? o.lowPrice);
    const currency =
      typeof o.priceCurrency === 'string' ? o.priceCurrency : undefined;
    if (amount != null) {
      return {amount, currency: currency ?? guessCurrency() ?? 'GBP'};
    }
  }

  const metaAmount = toNumber(meta('product:price:amount'));
  if (metaAmount != null) {
    return {
      amount: metaAmount,
      currency: meta('product:price:currency') ?? guessCurrency() ?? 'GBP',
    };
  }

  const itemprop = document.querySelector<HTMLMetaElement>(
    'meta[itemprop="price"]',
  );
  const itempropAmount = toNumber(itemprop?.content);
  if (itempropAmount != null) {
    return {
      amount: itempropAmount,
      currency:
        document.querySelector<HTMLMetaElement>('meta[itemprop="priceCurrency"]')
          ?.content ??
        guessCurrency() ??
        'GBP',
    };
  }

  // Last resort: the first element that looks like a price, parsed from text.
  for (const el of document.querySelectorAll('[class*="price" i]')) {
    const parsed = parsePriceText(el.textContent ?? '');
    if (parsed) return parsed;
  }
  return null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  '£': 'GBP',
  $: 'USD',
  '€': 'EUR',
  '¥': 'JPY',
  '₹': 'INR',
  R: 'ZAR',
};

export function parsePriceText(text: string): Price | null {
  const trimmed = clean(text);
  if (!trimmed || trimmed.length > 40) return null;
  const match = trimmed.match(
    /([£$€¥₹]|R)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/,
  );
  if (!match) return null;
  const amount = toNumber(match[2]);
  if (amount == null) return null;
  return {amount, currency: CURRENCY_SYMBOLS[match[1]] ?? 'GBP'};
}

function guessCurrency(): string | null {
  const text = document.body?.innerText?.slice(0, 4000) ?? '';
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (symbol !== 'R' && text.includes(symbol)) return code;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // Handle both 1.234,56 and 1,234.56.
  let s = value.replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

interface RawImage {
  url: string;
  alt: string;
  /** Natural size when the element already told us. */
  width: number;
  height: number;
  /** Found inside the page's gallery, rather than anywhere on the page. */
  inGallery: boolean;
}

/**
 * Site furniture that turns up in the DOM sweep — nav tiles, promo banners,
 * badges. These are never the product.
 */
const CHROME_WORDS = [
  'navigation',
  'nav_',
  'banner',
  'hero',
  'logo',
  'icon',
  'sprite',
  'placeholder',
  'thumbnail-nav',
  'payment',
  'badge',
  'promo',
  'footer',
  'header',
];

function collectImages(products: JsonLdNode[]): RawImage[] {
  const found = new Map<string, RawImage>();

  const add = (
    url: string | null | undefined,
    alt = '',
    el?: HTMLImageElement,
    inGallery = false,
  ) => {
    if (!url) return;
    const absolute = toAbsolute(url);
    if (!absolute || !looksLikeImage(absolute)) return;
    const key = normaliseKey(absolute);
    const existing = found.get(key);
    const width = el?.naturalWidth || 0;
    const height = el?.naturalHeight || 0;
    if (existing) {
      // Keep the biggest variant of the same underlying image.
      if (width * height > existing.width * existing.height) {
        found.set(key, {
          url: absolute,
          alt: alt || existing.alt,
          width,
          height,
          inGallery: existing.inGallery || inGallery,
        });
      } else {
        if (!existing.alt && alt) existing.alt = alt;
        if (inGallery) existing.inGallery = true;
      }
      return;
    }
    found.set(key, {url: absolute, alt, width, height, inGallery});
  };

  for (const product of products) {
    const image = product.image;
    if (typeof image === 'string') add(image);
    else if (Array.isArray(image)) {
      for (const entry of image) {
        if (typeof entry === 'string') add(entry);
        else if (entry && typeof entry === 'object') {
          const url = (entry as JsonLdNode).url ?? (entry as JsonLdNode).contentUrl;
          if (typeof url === 'string') add(url);
        }
      }
    }
  }

  add(meta('og:image'));
  for (const el of document.querySelectorAll<HTMLMetaElement>(
    'meta[property="og:image"]',
  )) {
    add(el.content);
  }

  // DOM fallback: everything in the gallery, then everything else that's big.
  const gallery = document.querySelector(
    '[class*="gallery" i], [class*="carousel" i], [data-testid*="gallery" i], [class*="product-image" i], [class*="media" i]',
  );
  const scopes: {node: ParentNode; inGallery: boolean}[] = gallery
    ? [
        {node: gallery, inGallery: true},
        {node: document, inGallery: false},
      ]
    : [{node: document, inGallery: false}];

  for (const scope of scopes) {
    for (const img of scope.node.querySelectorAll('img')) {
      const el = img as HTMLImageElement;
      const src = el.currentSrc || el.src || el.dataset.src || bestFromSrcset(el);
      if (!src) continue;
      // Skip obvious chrome: icons, logos, tracking pixels.
      if ((el.naturalWidth || 0) > 0 && (el.naturalWidth || 0) < 160) continue;
      if (el.closest('nav, header, footer')) continue;
      add(src, el.alt ?? '', el, scope.inGallery);
    }
  }

  return [...found.values()];
}

function bestFromSrcset(el: HTMLImageElement): string | null {
  const srcset = el.getAttribute('srcset') ?? el.dataset.srcset;
  if (!srcset) return null;
  const entries = srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .map(([url, size]) => ({url, size: Number.parseInt(size ?? '0', 10) || 0}));
  entries.sort((a, b) => b.size - a.size);
  return entries[0]?.url ?? null;
}

function toAbsolute(url: string): string | null {
  try {
    return new URL(url, location.href).href;
  } catch {
    return null;
  }
}

function looksLikeImage(url: string): boolean {
  if (url.startsWith('data:')) return false;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return false;
  return /^https?:/.test(url);
}

/**
 * Two URLs for the same picture at different sizes should collapse into one
 * entry, so the strip isn't six copies of the same shot (§9.2).
 */
function normaliseKey(url: string): string {
  try {
    const u = new URL(url);
    for (const param of [
      'w',
      'width',
      'h',
      'height',
      'size',
      'imwidth',
      'wid',
      'hei',
      'sw',
      'sh',
      'quality',
      'q',
      'fmt',
      'dpr',
      'scale',
    ]) {
      u.searchParams.delete(param);
    }
    // Strip common inline size segments, e.g. /w_800/ or _800x1000.
    const path = u.pathname
      .replace(/\/[whc]_\d+(,[a-z]_\d+)*\//gi, '/')
      .replace(/_\d{2,4}x\d{2,4}(?=\.[a-z]+$)/i, '')
      .replace(/-\d{2,4}x\d{2,4}(?=\.[a-z]+$)/i, '');
    return `${u.origin}${path}?${u.searchParams.toString()}`;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// §9.3 Image ranking — the on-model heuristic
// ---------------------------------------------------------------------------

const ON_MODEL_WORDS = ['model', 'worn', 'outfit', 'look', 'onmodel', 'on-model'];
const FLAT_WORDS = [
  'flat',
  'still',
  'packshot',
  'pack-shot',
  'detail',
  'swatch',
  'back',
  'closeup',
  'close-up',
  'fabric',
  'zoom',
];

export interface RankOptions {
  /** Corner samples, when we were able to read the pixels. */
  whiteBorder?: Map<string, boolean>;
}

export function rankImages(
  images: RawImage[],
  options: RankOptions = {},
): ScoredImage[] {
  const maxArea = Math.max(1, ...images.map((i) => i.width * i.height));

  const scored = images.map((image) => {
    const reasons: string[] = [];
    let score = 0;

    const ratio =
      image.height > 0 ? image.width / image.height : ratioFromUrl(image.url);
    if (ratio >= 0.6 && ratio <= 0.85) {
      score += 3;
      reasons.push('portrait crop');
    }

    const haystack = `${image.url} ${image.alt}`.toLowerCase();
    if (ON_MODEL_WORDS.some((w) => haystack.includes(w))) {
      score += 2;
      reasons.push('named as a model shot');
    }

    const area = image.width * image.height;
    if (area > 0) {
      const normalised = area / maxArea;
      score += 2 * normalised;
      if (normalised > 0.8) reasons.push('largest on the page');
    }

    if (FLAT_WORDS.some((w) => haystack.includes(w))) {
      score -= 3;
      reasons.push('named as a flat shot');
    }

    if (image.inGallery) {
      score += 2;
      reasons.push("in the product's own gallery");
    }

    if (CHROME_WORDS.some((w) => haystack.includes(w))) {
      // A navigation tile or promo banner is never the garment.
      score -= 6;
      reasons.push('page furniture, not the product');
    }

    if (ratio > 0.9 && ratio < 1.15 && options.whiteBorder?.get(image.url)) {
      score -= 2;
      reasons.push('square with a white border');
    }

    return {
      url: image.url,
      score: Math.round(score * 100) / 100,
      width: image.width,
      height: image.height,
      alt: image.alt,
      onModel: score >= 3,
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Shops that render their gallery client-side often still name the crop in the
 * URL — `..._3x4.jpg`, `..._800x1200.jpg`. When we have no natural dimensions
 * to measure, that's better than treating the shape as unknown.
 */
function ratioFromUrl(url: string): number {
  const match = url.match(/[_\-/](\d{1,4})x(\d{1,4})(?=[._\-/?]|$)/i);
  if (!match) return 0;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!w || !h) return 0;
  return w / h;
}

/** Below this, we don't believe we found a usable on-model shot (§9.3). */
export const ON_MODEL_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// §9.4 Category inference
// ---------------------------------------------------------------------------

const CATEGORY_RULES: {category: GarmentCategory; words: string[]}[] = [
  {
    category: 'full_body',
    words: [
      'dress',
      'jumpsuit',
      'gown',
      'romper',
      'playsuit',
      'overall',
      'dungaree',
      'co-ord',
      'coord',
      'suit',
    ],
  },
  {
    category: 'lower_body',
    words: [
      'trouser',
      'pant',
      'jean',
      'short',
      'skirt',
      'legging',
      'chino',
      'cargo',
      'jogger',
      'culotte',
      'slack',
    ],
  },
  {
    category: 'shoes',
    words: [
      'shoe',
      'sneaker',
      'trainer',
      'boot',
      'heel',
      'sandal',
      'loafer',
      'derby',
      'brogue',
      'mule',
      'clog',
      'pump',
      'slipper',
      'espadrille',
      'moccasin',
      'plimsoll',
      'flip flop',
      'flip-flop',
      'slider',
      'wellington',
    ],
  },
  {
    category: 'bag',
    words: ['bag', 'tote', 'backpack', 'clutch', 'purse', 'satchel', 'holdall'],
  },
  {category: 'hat', words: ['hat', 'cap', 'beanie', 'beret', 'bucket hat']},
  {category: 'scarf', words: ['scarf', 'shawl', 'wrap', 'snood']},
];

export function inferCategory(text: string): GarmentCategory {
  const haystack = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((word) => haystack.includes(word))) return rule.category;
  }
  return 'upper_body';
}

function breadcrumbText(): string {
  const nodes = document.querySelectorAll(
    'nav[aria-label*="readcrumb" i], [class*="breadcrumb" i], ol[itemtype*="BreadcrumbList"]',
  );
  return [...nodes]
    .map((n) => n.textContent ?? '')
    .join(' ')
    .slice(0, 400);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Fills in the dimensions of images we only know by URL — JSON-LD and og:image
 * arrive without an element, and size is worth two points of the ranking.
 * These are almost always already in the browser cache.
 */
async function measure(images: RawImage[]): Promise<void> {
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.width && image.height) {
            resolve();
            return;
          }
          const probe = new Image();
          const done = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(done, 2000);
          probe.onload = () => {
            image.width = probe.naturalWidth;
            image.height = probe.naturalHeight;
            done();
          };
          probe.onerror = done;
          probe.src = image.url;
        }),
    ),
  );
}

/**
 * Samples the corners of the leading candidates to spot a packshot floating on
 * a white square (§9.3). We read the bytes rather than the rendered element:
 * a cross-origin <img> taints the canvas, but a blob we fetched ourselves
 * doesn't.
 */
async function sampleWhiteBorders(
  images: ScoredImage[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const candidates = images.slice(0, 8);

  await Promise.all(
    candidates.map(async (image) => {
      try {
        const response = await fetch(image.url, {credentials: 'include'});
        if (!response.ok) return;
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(bitmap, 0, 0);
        const inset = Math.max(2, Math.round(Math.min(bitmap.width, bitmap.height) * 0.02));
        const corners = [
          [inset, inset],
          [bitmap.width - inset, inset],
          [inset, bitmap.height - inset],
          [bitmap.width - inset, bitmap.height - inset],
        ] as const;
        const whites = corners.filter(([x, y]) => {
          const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
          return r > 235 && g > 235 && b > 235;
        });
        bitmap.close();
        result.set(image.url, whites.length === 4);
      } catch {
        /* cross-origin without CORS, or a blocked fetch — just skip it */
      }
    }),
  );

  return result;
}

export async function scrapeProduct(): Promise<ScrapedProduct> {
  const products = readJsonLdProducts();
  const product = products[0];

  const title = extractTitle(product);
  const category = inferCategory(
    `${title} ${breadcrumbText()} ${location.pathname}`,
  );

  const raw = collectImages(products);
  await measure(raw);
  const firstPass = rankImages(raw);
  const whiteBorder = await sampleWhiteBorders(firstPass);
  const images = rankImages(raw, {whiteBorder});
  const best = images[0];
  const lowerBodyWarning =
    (category === 'lower_body' || category === 'full_body') &&
    (!best || best.score < ON_MODEL_THRESHOLD);

  return {
    title,
    brand: extractBrand(product),
    retailer: location.hostname.replace(/^www\d?\./, ''),
    productUrl: location.href.split('#')[0],
    price: extractPrice(product),
    category,
    images: images.slice(0, 12),
    suggestedIndex: 0,
    lowerBodyWarning,
  };
}
