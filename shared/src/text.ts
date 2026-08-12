/**
 * Text that came out of someone else's HTML.
 *
 * Entities survive the structured-data path: an HTML parser doesn't decode
 * anything inside a `<script>`, so JSON-LD hands back `Men&apos;s Tapered Pant`
 * verbatim and it is stored, listed, and rendered that way everywhere
 * downstream. Titles reach the database from three directions — the content
 * script, SerpApi's own strings (lifted straight out of a shop's markup), and
 * an older extension build posting to the API — so the decoder is here, in the
 * one package both sides already depend on, rather than copied into each.
 *
 * Deliberately *not* done by assigning to innerHTML and reading back the text.
 * That's the usual one-liner, but it hands a retailer's markup to the parser on
 * a page we don't control, and a product title is not a place to open that
 * door. A map plus numeric references covers what shops actually emit —
 * encoders fall back to numeric form for anything exotic.
 */

/**
 * The named entities a shop's copywriting actually produces. Anything outside
 * this list that isn't numeric is left alone rather than guessed at.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  bull: '•',
  middot: '·',
  trade: '™',
  reg: '®',
  copy: '©',
  deg: '°',
  times: '×',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  aring: 'å',
  ccedil: 'ç',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  icirc: 'î',
  ntilde: 'ñ',
  oacute: 'ó',
  ocirc: 'ô',
  ouml: 'ö',
  oslash: 'ø',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  szlig: 'ß',
};

const ENTITY_PATTERN =
  /&(#\d{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z][a-zA-Z\d]{1,31});/g;

/**
 * Decodes until nothing changes, up to three passes. Feeds that double-encode
 * (`&amp;#39;`) are common enough to be worth the second look, and a product
 * name that genuinely wants to spell out `&amp;` is not a thing shops sell.
 */
export function decodeEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3 && out.includes('&'); pass += 1) {
    const next = out.replace(ENTITY_PATTERN, (whole, body: string) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        // Out-of-range values would throw; leave them as written.
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
        // Surrogate halves aren't characters on their own.
        if (code >= 0xd800 && code <= 0xdfff) return whole;
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Decode, then collapse the whitespace a decoded `&nbsp;` leaves behind —
 * in that order, so the new space folds into the run around it.
 */
export function cleanText(text: string): string {
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

/** As `cleanText`, for the columns that are allowed to be absent. */
export function cleanTextOrNull(
  text: string | null | undefined,
): string | null {
  if (text == null) return null;
  return cleanText(text) || null;
}
