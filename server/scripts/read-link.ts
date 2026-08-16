/**
 * Reads real product pages through the real parser and reports what came back.
 *
 * `productPage.ts` is retailer-agnostic by design (§9.2), which is another way
 * of saying it is only as good as the shops it has actually been pointed at. A
 * page that publishes no JSON-LD and no OpenGraph is not a bug to be fixed with
 * a special case — it is a page we hand back to the camera — but knowing which
 * shops those are is the difference between a feature and a coin toss.
 *
 *   npx tsx scripts/read-link.ts https://…/some-product
 *   npx tsx scripts/read-link.ts url1 url2 url3
 *
 * Costs nothing but a public GET each, and spends no API units.
 */
import {readProductPage} from '../src/productPage.js';

const urls = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (urls.length === 0) {
  console.error('\n  usage: npx tsx scripts/read-link.ts <url> [url…]\n');
  process.exit(1);
}

let usable = 0;

for (const url of urls) {
  console.log(`\n── ${url}`);
  try {
    const preview = await readProductPage(url);
    const ok = Boolean(preview.imageUrl);
    if (ok) usable++;

    console.log(`   title      ${preview.title}`);
    console.log(`   brand      ${preview.brand ?? '—'}`);
    console.log(`   retailer   ${preview.retailer}`);
    console.log(
      `   price      ${
        preview.price
          ? `${preview.price.currency} ${preview.price.amount}`
          : '— (nothing we could parse)'
      }`,
    );
    console.log(`   category   ${preview.category} (a guess, always editable)`);
    console.log(`   picture    ${preview.imageUrl ?? '— (this one goes to the camera)'}`);
    console.log(`   product?   ${preview.looksLikeProduct ? 'yes' : 'no — §9.1 unconvinced'}`);
  } catch (error) {
    const coded = error as {code?: string; message?: string};
    console.log(`   refused    ${coded.code ?? 'unknown'} — ${coded.message ?? error}`);
  }
}

console.log(`\n${usable}/${urls.length} hangable\n`);
