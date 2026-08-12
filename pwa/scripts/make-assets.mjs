/**
 * Generates the phone app's static assets before every dev run and build.
 *
 *   node scripts/make-assets.mjs
 *
 * Two jobs, both of them copies of something that already exists elsewhere in
 * the repo, so that neither is a second source of truth:
 *
 *   icons  rasterised from the shared hanger glyph, at the sizes a home screen
 *          asks for. Android masks its icons to whatever shape the launcher
 *          fancies, so those are drawn smaller (see drawIcon's scale).
 *   fonts  the same two woff2 files the side panel bundles. The phone must not
 *          call a font CDN either — an installed app is offline the moment the
 *          Wi-Fi drops.
 */
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {drawIcon, png} from '@hanger/shared/scripts/icon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public');

const ICONS = [
  {name: 'favicon-32.png', size: 32, scale: 1},
  // iOS rounds the corners itself and never masks further than that.
  {name: 'apple-touch-icon.png', size: 180, scale: 0.86},
  {name: 'icon-192.png', size: 192, scale: 1},
  {name: 'icon-512.png', size: 512, scale: 1},
  {name: 'icon-192-maskable.png', size: 192, scale: 0.66},
  {name: 'icon-512-maskable.png', size: 512, scale: 0.66},
];

const iconDir = resolve(publicDir, 'icons');
mkdirSync(iconDir, {recursive: true});
for (const {name, size, scale} of ICONS) {
  writeFileSync(resolve(iconDir, name), png(size, drawIcon(size, scale)));
}
console.log(`wrote ${ICONS.length} icons`);

const fontDir = resolve(publicDir, 'fonts');
const fontSource = resolve(here, '../../extension/public/fonts');
mkdirSync(fontDir, {recursive: true});
for (const file of ['outfit.woff2', 'sarina.woff2']) {
  copyFileSync(resolve(fontSource, file), resolve(fontDir, file));
}
console.log('copied 2 fonts');
