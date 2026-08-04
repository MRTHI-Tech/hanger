import {defineConfig} from 'vite';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Content script build. MV3 content scripts are classic scripts, so this has
 * to be a single self-executing bundle with no import statements. Runs after
 * the main build and must not clear dist/.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2020',
    lib: {
      entry: resolve(here, 'src/content/index.ts'),
      name: 'HangerContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
        assetFileNames: 'content[extname]',
      },
    },
  },
});
