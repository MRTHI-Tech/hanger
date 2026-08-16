/**
 * Runs the server's link reader against the same nine real shop pages the
 * extension's scraper is tested against.
 *
 *   npm run test:links --workspace server
 *   npm run test:links --workspace server -- uniqlo
 *
 * The pages live in `extension/scripts/pages/` — HTML exactly as the shop
 * served it, gzipped, each carrying its own source URL in a comment. Sharing
 * them is the point: the extension reads those pages with a browser around it
 * and this reads them without one, and the difference between the two answers
 * is the honest measure of what a link can do that the extension can't be
 * bothered to open a tab for.
 *
 * Costs nothing and touches no network.
 */
import {readFileSync, readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseProductPage} from '../src/productPage.js';

const here = dirname(fileURLToPath(import.meta.url));
const pagesDir = resolve(here, '../../extension/scripts/pages');

const only = process.argv[2];
const pages = readdirSync(pagesDir)
  .filter((f) => f.endsWith('.html.gz'))
  .filter((f) => !only || f.includes(only));

if (pages.length === 0) {
  console.error(`No pages matched${only ? ` "${only}"` : ''} in ${pagesDir}`);
  process.exit(1);
}

let hangable = 0;

for (const file of pages) {
  const html = gunzipSync(readFileSync(resolve(pagesDir, file))).toString('utf8');
  const source = html.match(/<!--\s*hanger-source:\s*(\S+)\s*-->/)?.[1];
  if (!source) {
    console.error(`${file}: missing the hanger-source comment`);
    continue;
  }

  const preview = parseProductPage(html, new URL(source));

  // A garment needs a name and a picture. A price is a bonus — plenty of shops
  // only put one on the page once JavaScript has run, and a piece with no price
  // still hangs perfectly well.
  const ok = Boolean(preview.imageUrl) && preview.title.length >= 3;
  if (ok) hangable++;

  console.log(
    [
      `\n${ok ? 'ok  ' : 'thin'} ${basename(file, '.html.gz')}  (${preview.retailer})`,
      `  title      ${preview.title || '—'}`,
      `  brand      ${preview.brand ?? '—'}`,
      `  price      ${
        preview.price ? `${preview.price.amount} ${preview.price.currency}` : '—'
      }`,
      `  category   ${preview.category}`,
      `  picture    ${preview.imageUrl ?? '— goes to the camera instead'}`,
      `  product?   ${preview.looksLikeProduct ? 'yes' : 'no'}`,
    ].join('\n'),
  );
}

console.log(`\n${pages.length} page(s), ${hangable} hangable from the markup alone.\n`);
