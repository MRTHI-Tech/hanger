/**
 * Generates the extension's PNG icons. No image dependency — we rasterise a
 * hanger glyph by hand and write a minimal PNG (zlib is in Node).
 *
 *   node scripts/make-icons.mjs
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');
mkdirSync(outDir, {recursive: true});

const BG = [253, 251, 228, 255]; // --color-background-body, butter
const FG = [34, 91, 255, 255]; // --color-accent

function crc32(buf) {
  let c;
  const table = crc32.table ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = pixels[y * size + x];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = p[0];
      raw[o + 1] = p[1];
      raw[o + 2] = p[2];
      raw[o + 3] = p[3];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance from point to segment, for anti-aliased strokes. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawIcon(size) {
  const px = [];
  const s = size;
  const stroke = Math.max(1.1, s * 0.075);
  // Hanger geometry in unit space, scaled to the icon.
  const u = (v) => v * s;
  const apex = [u(0.5), u(0.3)];
  const left = [u(0.16), u(0.66)];
  const right = [u(0.84), u(0.66)];
  const hookBottom = [u(0.5), u(0.3)];
  const hookTop = [u(0.5), u(0.19)];

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      let d = Math.min(
        distToSegment(cx, cy, apex[0], apex[1], left[0], left[1]),
        distToSegment(cx, cy, apex[0], apex[1], right[0], right[1]),
        distToSegment(cx, cy, left[0], left[1], right[0], right[1]),
        distToSegment(cx, cy, hookBottom[0], hookBottom[1], hookTop[0], hookTop[1]),
      );
      // The hook curl: an arc above the apex.
      const hookR = s * 0.12;
      const hookC = [u(0.62), u(0.19)];
      const dc = Math.abs(Math.hypot(cx - hookC[0], cy - hookC[1]) - hookR);
      if (cy < hookC[1] + hookR * 0.2 && cx > u(0.44)) d = Math.min(d, dc);

      const cover = Math.max(0, Math.min(1, (stroke / 2 + 0.5 - d) / 1));
      const out = [
        Math.round(BG[0] + (FG[0] - BG[0]) * cover),
        Math.round(BG[1] + (FG[1] - BG[1]) * cover),
        Math.round(BG[2] + (FG[2] - BG[2]) * cover),
        255,
      ];
      px.push(out);
    }
  }
  return px;
}

for (const size of [16, 48, 128]) {
  const buf = png(size, drawIcon(size));
  writeFileSync(resolve(outDir, `icon${size}.png`), buf);
  console.log(`wrote icon${size}.png (${buf.length} bytes)`);
}
