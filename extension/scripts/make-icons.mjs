/**
 * Generates the extension's PNG icons from the shared hanger mark.
 *
 *   node scripts/make-icons.mjs
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {drawIcon, png} from '@hanger/shared/scripts/icon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');
mkdirSync(outDir, {recursive: true});

for (const size of [16, 48, 128]) {
  const buf = png(size, drawIcon(size));
  writeFileSync(resolve(outDir, `icon${size}.png`), buf);
  console.log(`wrote icon${size}.png (${buf.length} bytes)`);
}
