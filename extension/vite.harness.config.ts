import {defineConfig} from 'vite';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Standalone build of the scraper for testing against real shops. */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-harness',
    emptyOutDir: true,
    target: 'es2020',
    minify: false,
    lib: {
      entry: resolve(here, 'src/content/testHarness.ts'),
      name: 'HangerHarness',
      formats: ['iife'],
      fileName: () => 'scrape-test.js',
    },
  },
});
