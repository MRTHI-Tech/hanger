import {decodeEntities} from './text';
import type {GarmentCategory, Price} from './types';

/**
 * What a shop page says about a garment, minus the page.
 *
 * The extension reads product pages in a browser, with a DOM and a rendered
 * gallery to look at (§9). The server now reads them too — a link pasted or
 * shared into the phone arrives as a URL and nothing else, and there is no
 * browser on that path. The two do genuinely different work, but they must
 * agree about what a price looks like and what makes something a pair of
 * trousers, or the same link would hang differently depending on which app it
 * went through.
 *
 * So the retailer-agnostic knowledge lives here, and the DOM-shaped work stays
 * where a DOM exists.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  '£': 'GBP',
  $: 'USD',
  '€': 'EUR',
  '¥': 'JPY',
  '₹': 'INR',
  R: 'ZAR',
};

/**
 * A number out of whatever the shop wrote. Handles both 1.234,56 and 1,234.56,
 * which is not a nicety: reading the first as 1.23 turns a four-figure price
 * into pocket change.
 */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  let s = value.replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** A price out of a run of text — "£12.99", "R1 299,00", "Now $45". */
export function parsePriceText(text: string): Price | null {
  const trimmed = decodeEntities(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  // A long string that happens to contain a number is prose, not a price tag.
  if (!trimmed || trimmed.length > 40) return null;

  const match = trimmed.match(
    /([£$€¥₹]|R)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/,
  );
  if (!match) return null;

  const amount = parseNumber(match[2]);
  if (amount == null) return null;
  return {amount, currency: CURRENCY_SYMBOLS[match[1]] ?? 'GBP'};
}

/**
 * Words that mean a picture is the site, not the product — nav tiles, promo
 * banners, payment badges, and above all the logo.
 *
 * The extension uses these to push page furniture down its ranking (§9.3). The
 * server needs them harder than that: with only `og:image` to go on, a shop
 * that publishes its logo there — and several do, including on pages that
 * quietly 404 into a category — would hand back a picture of a wordmark, and
 * "hang it" would put a logo in somebody's wardrobe.
 */
export const NON_PRODUCT_IMAGE_WORDS = [
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
  'default-share',
  'og-default',
  'social-share',
];

export function looksLikePageFurniture(text: string): boolean {
  const haystack = text.toLowerCase();
  return NON_PRODUCT_IMAGE_WORDS.some((word) => haystack.includes(word));
}

/**
 * Shops put their own name on the end of every title: "Oxford Slim Shirt |
 * UNIQLO US". Harmless on a shop page, silly on a hanger where the retailer is
 * already a field of its own — and it is the first thing anybody would delete.
 *
 * Only ever trims after a separator, and only when what follows is recognisably
 * the shop. A garment genuinely called "Shirt - Navy" keeps its name.
 */
export function trimShopSuffix(title: string, ...names: (string | null)[]): string {
  let out = title.trim();

  for (const name of names) {
    const shop = name?.trim().toLowerCase().replace(/\.(com|co\.\w+|net|shop)$/,'');
    if (!shop || shop.length < 2) continue;

    const match = /^(.*?)\s*[|–—•·-]\s*([^|–—•·]{1,40})$/.exec(out);
    if (!match) continue;

    const tail = match[2].trim().toLowerCase();
    // "UNIQLO US" for uniqlo.com, "H&M" for hm.com — the tail is the shop when
    // it starts with the shop's name, not only when it equals it.
    if (tail === shop || tail.startsWith(shop) || shop.startsWith(tail)) {
      if (match[1].trim().length >= 3) out = match[1].trim();
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// JSON-LD — the half of §9.2 that never needed a page
// ---------------------------------------------------------------------------

export type JsonLdNode = Record<string, unknown>;

/**
 * Every `schema.org/Product` in a parsed blob, however deeply it is buried.
 *
 * Shops publish these inside `@graph`, inside arrays, inside `isVariantOf`, and
 * occasionally three of those at once — so this walks rather than looks.
 */
export function collectJsonLdProducts(
  node: unknown,
  out: JsonLdNode[] = [],
  depth = 0,
): JsonLdNode[] {
  if (!node || depth > 6) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdProducts(item, out, depth + 1);
    return out;
  }
  if (typeof node !== 'object') return out;

  const obj = node as JsonLdNode;
  const type = obj['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product')) {
    out.push(obj);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectJsonLdProducts(value, out, depth + 1);
  }
  return out;
}

export function jsonLdOffer(product: JsonLdNode | undefined): JsonLdNode | null {
  const offers = product?.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  return offer && typeof offer === 'object' ? (offer as JsonLdNode) : null;
}

/** A product that names a price is a product page, whatever else is missing. */
export function jsonLdHasOffer(products: JsonLdNode[]): boolean {
  return products.some((product) => {
    const offer = jsonLdOffer(product);
    if (!offer) return false;
    return (
      offer.price != null ||
      offer.lowPrice != null ||
      offer.priceSpecification != null
    );
  });
}

export function jsonLdName(product: JsonLdNode | undefined): string | null {
  return typeof product?.name === 'string' ? product.name : null;
}

export function jsonLdBrand(product: JsonLdNode | undefined): string | null {
  const brand = product?.brand;
  if (typeof brand === 'string') return brand;
  if (brand && typeof brand === 'object') {
    const name = (brand as JsonLdNode).name;
    if (typeof name === 'string') return name;
  }
  return null;
}

/**
 * The currency is asked for rather than assumed: a page that states an amount
 * and no currency is common, and the right guess differs by caller — a browser
 * can read the symbols on the page, and the server only has the markup.
 */
export function jsonLdPrice(
  product: JsonLdNode | undefined,
  fallbackCurrency: () => string,
): Price | null {
  const offer = jsonLdOffer(product);
  if (!offer) return null;
  const amount = parseNumber(offer.price ?? offer.lowPrice);
  if (amount == null) return null;
  const currency =
    typeof offer.priceCurrency === 'string' ? offer.priceCurrency : null;
  return {amount, currency: currency ?? fallbackCurrency()};
}

/** `image` is a string, an array, or objects with `url`/`contentUrl`. All three. */
export function jsonLdImages(product: JsonLdNode | undefined): string[] {
  const image = product?.image;
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') {
      const url = (value as JsonLdNode).url ?? (value as JsonLdNode).contentUrl;
      if (typeof url === 'string') out.push(url);
    }
  };
  if (Array.isArray(image)) for (const entry of image) add(entry);
  else add(image);
  return out;
}

// §9.4 — keyword match over title, breadcrumbs and URL, in this precedence.
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

/**
 * A guess, and always shown as an editable one (§9.4). Wrong here means a
 * try-on fitted to the wrong half of somebody, so it is never applied silently.
 */
export function inferCategory(text: string): GarmentCategory {
  const haystack = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((word) => haystack.includes(word))) return rule.category;
  }
  return 'upper_body';
}
