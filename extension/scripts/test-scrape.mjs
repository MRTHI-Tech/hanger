/**
 * Runs the real scraper against saved product pages from real shops.
 *
 *   npm run test:scrape                 # all pages in scripts/pages/
 *   npm run test:scrape -- uniqlo       # one of them
 *
 * The pages in scripts/pages/ are HTML as the shop served it. This is how the
 * "no per-retailer scrapers" claim in §9.2 gets checked: the same code has to
 * find the title, price and photos on every one of them.
 *
 * What it can't check: natural image dimensions and corner-pixel sampling need
 * a real browser, so the size and white-border parts of the §9.3 ranking score
 * zero here. Keyword and structured-data signals are fully exercised.
 */
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const pagesDir = resolve(here, 'pages');
const bundlePath = resolve(here, '../dist-harness/scrape-test.js');

if (!existsSync(bundlePath)) {
  console.error('Build the harness first: npm run build:harness');
  process.exit(1);
}
const bundle = readFileSync(bundlePath, 'utf8');

const only = process.argv[2];
const pages = readdirSync(pagesDir)
  .filter((f) => f.endsWith('.html.gz'))
  .filter((f) => !only || f.includes(only));

if (pages.length === 0) {
  console.error(`No pages matched${only ? ` "${only}"` : ''} in ${pagesDir}`);
  process.exit(1);
}

let failures = 0;

for (const file of pages) {
  // Stored gzipped: these are whole pages from real shops and they are large.
  const html = gunzipSync(readFileSync(resolve(pagesDir, file))).toString('utf8');
  const url = html.match(/<!--\s*hanger-source:\s*(\S+)\s*-->/)?.[1];
  if (!url) {
    console.error(`${file}: missing the hanger-source comment`);
    failures++;
    continue;
  }

  // outside-only: our harness bundle runs inside the window, the page's own
  // scripts stay inert. We're testing the scraper, not the shop.
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const {window} = dom;

  // Neither image measurement nor corner sampling can work outside a browser.
  // Fail them fast so the run doesn't sit on timeouts.
  window.Image = class {
    set src(_value) {
      setTimeout(() => this.onerror?.(), 0);
    }
  };
  window.fetch = () => Promise.reject(new Error('no network in this harness'));
  window.createImageBitmap = () => Promise.reject(new Error('not here'));

  window.eval(bundle);

  const detection = window.__hangerDetect();
  const product = await window.__hangerScrape();

  // A fixture can say what its saved HTML actually contains. Shops that build
  // the page in the browser ship a shell, so demanding a price from their
  // static HTML would be testing the shop, not the scraper.
  const expected = (
    html.match(/<!--\s*hanger-expect:\s*([^>]*?)\s*-->/)?.[1] ??
    'pdp title price images'
  ).split(/\s+/);
  const note = html.match(/<!--\s*hanger-note:\s*([^>]*?)\s*-->/)?.[1];

  const problems = [];
  if (expected.includes('pdp') && !detection.isPdp) {
    problems.push('not detected as a product page');
  }
  if (expected.includes('title') && (!product.title || product.title.length < 3)) {
    problems.push('no title');
  }
  if (expected.includes('price') && !product.price) problems.push('no price');
  if (expected.includes('images') && product.images.length === 0) {
    problems.push('no images');
  }
  if (expected.includes('category:lower_body') && product.category !== 'lower_body') {
    problems.push(`category came out ${product.category}, expected lower_body`);
  }
  if (expected.includes('category:shoes') && product.category !== 'shoes') {
    problems.push(`category came out ${product.category}, expected shoes`);
  }

  const status = problems.length === 0 ? 'ok  ' : 'WARN';
  if (problems.length > 0) failures++;

  console.log(
    [
      `\n${status} ${basename(file, '.html.gz')}  (${product.retailer})`,
      `  signals    ${Object.entries(detection.signals)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ') || 'none'}`,
      `  title      ${product.title.slice(0, 70)}`,
      `  brand      ${product.brand ?? '—'}`,
      `  price      ${
        product.price
          ? `${product.price.amount} ${product.price.currency}`
          : '—'
      }`,
      `  category   ${product.category}`,
      `  images     ${product.images.length} found, top score ${
        product.images[0]?.score ?? '—'
      }${product.lowerBodyWarning ? '  [needs an on-model shot]' : ''}`,
      product.images[0]
        ? `  chosen     ${product.images[0].url.slice(0, 90)}`
        : '',
      note ? `  note       ${note}` : '',
      problems.length ? `  problems   ${problems.join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  window.close();
}

console.log(
  `\n${pages.length} page(s), ${pages.length - failures} clean, ${failures} with problems.`,
);
process.exit(failures > 0 ? 1 : 0);
