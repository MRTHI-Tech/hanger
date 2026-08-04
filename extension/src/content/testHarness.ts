/**
 * Bundled separately as `scrape-test.js` so the scraper can be exercised
 * against real shops without loading the extension. Same code path the content
 * script uses — this only exposes it on `window`.
 *
 *   npm run build:test-harness
 *   (then evaluate the bundle in a product page and call __hangerScrape())
 */
import {detectSignals, isProductPage, scrapeProduct} from './scrape';

declare global {
  interface Window {
    __hangerScrape?: typeof scrapeProduct;
    __hangerDetect?: () => {signals: ReturnType<typeof detectSignals>; isPdp: boolean};
  }
}

window.__hangerScrape = scrapeProduct;
window.__hangerDetect = () => ({
  signals: detectSignals(),
  isPdp: isProductPage(),
});

export {};
