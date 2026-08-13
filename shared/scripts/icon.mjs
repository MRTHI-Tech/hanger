/**
 * The hanger mark, rasterised to PNG without an image dependency — zlib is in
 * Node, and filling a path is a scanline.
 *
 * ../assets/logo/hanger-mark.svg is the source of truth. A redraw lands there
 * and nowhere else: this reads the path out of it, so the extension's toolbar
 * icons and the phone's home-screen icons are the same mark at different
 * sizes. Two things change on the way through, the same two as the
 * illustrations: the drawing's black becomes the brand's ink, and its own
 * width and height are dropped in favour of "fill the square you're given".
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

const BG = [253, 251, 228, 255]; // --color-background-body, butter
const FG = [34, 91, 255, 255]; // --color-accent

/** How much of the square the mark's longest side spans at scale 1. */
const FILL = 0.8;

/** Sub-rows per pixel row. Horizontal coverage is exact, so 4 is plenty. */
const SUB = 4;

function crc32(buf) {
  let c;
  const table = (crc32.table ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++)
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
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

export function png(size, pixels) {
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

/**
 * Turns a path's `d` into closed polygons, in the drawing's own units.
 *
 * Enough of the grammar to read what a design tool exports: moves, lines,
 * cubics, quadratics and closes, absolute or relative. Arcs are not here
 * because nothing has drawn one yet — if a redraw brings one, this throws
 * rather than quietly rendering the wrong shape.
 */
function flatten(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) throw new Error('empty path');

  const polys = [];
  let poly = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = null;
  let i = 0;

  const num = () => Number(tokens[i++]);
  const at = (t, ax, ay, bx, by, cx, cy, dx, dy) => {
    const s = 1 - t;
    return [
      s * s * s * ax + 3 * s * s * t * bx + 3 * s * t * t * cx + t * t * t * dx,
      s * s * s * ay + 3 * s * s * t * by + 3 * s * t * t * cy + t * t * t * dy,
    ];
  };
  // Steps sized off the control polygon, in drawing units. The largest icon is
  // a third of a unit per pixel, so ~6 units a step is already sub-pixel.
  const steps = (...pts) => {
    let len = 0;
    for (let n = 2; n < pts.length; n += 2)
      len += Math.hypot(pts[n] - pts[n - 2], pts[n + 1] - pts[n - 1]);
    return Math.max(3, Math.min(48, Math.ceil(len / 6)));
  };
  const curve = (bx, by, cx, cy, dx, dy) => {
    const n = steps(x, y, bx, by, cx, cy, dx, dy);
    for (let s = 1; s <= n; s++) poly.push(at(s / n, x, y, bx, by, cx, cy, dx, dy));
    x = dx;
    y = dy;
  };

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    // A repeated argument list continues the last command; after a move it
    // continues as a line, which is what SVG says and what exporters emit.
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';

    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;

    switch (cmd.toUpperCase()) {
      case 'M': {
        if (poly && poly.length > 1) polys.push(poly);
        x = num() + ox;
        y = num() + oy;
        startX = x;
        startY = y;
        poly = [[x, y]];
        break;
      }
      case 'L': {
        x = num() + ox;
        y = num() + oy;
        poly.push([x, y]);
        break;
      }
      case 'H': {
        x = num() + ox;
        poly.push([x, y]);
        break;
      }
      case 'V': {
        y = num() + oy;
        poly.push([x, y]);
        break;
      }
      case 'C': {
        curve(num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy);
        break;
      }
      case 'Q': {
        // A quadratic is a cubic whose controls sit two-thirds of the way out.
        const qx = num() + ox;
        const qy = num() + oy;
        const ex = num() + ox;
        const ey = num() + oy;
        curve(
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          ex + (2 / 3) * (qx - ex),
          ey + (2 / 3) * (qy - ey),
          ex,
          ey,
        );
        break;
      }
      case 'Z': {
        if (poly && poly.length > 1) polys.push(poly);
        poly = null;
        x = startX;
        y = startY;
        cmd = 'M'; // anything after a close starts a new subpath
        break;
      }
      default:
        throw new Error(`unsupported path command "${cmd}"`);
    }
  }
  if (poly && poly.length > 1) polys.push(poly);
  return polys;
}

/** The mark, read and flattened once — every size fills the same polygons. */
const MARK = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = resolve(here, '../assets/logo/hanger-mark.svg');
  const svg = readFileSync(file, 'utf8');
  const path = /<path\b[^>]*\bd="([^"]+)"/.exec(svg);
  if (!path) throw new Error(`${file}: no <path d="..."> found`);

  const polys = flatten(path[1]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys)
    for (const [px, py] of poly) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  // The viewBox has room around the mark; its own bounds are what to centre.
  return {polys, x: minX, y: minY, w: maxX - minX, h: maxY - minY};
})();

/** Adds a span's coverage to one pixel row, exactly at both ends. */
function span(cov, row, x0, x1, size) {
  const from = Math.max(0, x0);
  const to = Math.min(size, x1);
  if (to <= from) return;
  for (let px = Math.floor(from); px < to; px++) {
    const c = Math.min(px + 1, to) - Math.max(px, from);
    if (c > 0) cov[row + px] += c / SUB;
  }
}

/**
 * @param size   pixels square
 * @param scale  how much of the square the mark fills. 1 is the toolbar icon.
 *   Android masks a home-screen icon to whatever shape the launcher likes and
 *   only guarantees the middle 80%, so a maskable icon draws smaller.
 */
export function drawIcon(size, scale = 1) {
  const box = size * FILL * scale;
  const k = Math.min(box / MARK.w, box / MARK.h);
  const ox = (size - MARK.w * k) / 2 - MARK.x * k;
  const oy = (size - MARK.h * k) / 2 - MARK.y * k;

  const edges = [];
  for (const poly of MARK.polys)
    for (let n = 0; n < poly.length; n++) {
      const a = poly[n];
      const b = poly[(n + 1) % poly.length];
      const ay = a[1] * k + oy;
      const by = b[1] * k + oy;
      if (ay !== by) edges.push([a[0] * k + ox, ay, b[0] * k + ox, by]);
    }

  // Even-odd, which is what the file asks for and what makes the bar's hollow
  // a hole rather than a second slab of ink.
  const cov = new Float32Array(size * size);
  const xs = [];
  for (let sy = 0; sy < size * SUB; sy++) {
    const y = (sy + 0.5) / SUB;
    xs.length = 0;
    for (const [ax, ay, bx, by] of edges)
      if (y >= Math.min(ay, by) && y < Math.max(ay, by))
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = (sy / SUB) | 0;
    for (let n = 0; n + 1 < xs.length; n += 2)
      span(cov, row * size, xs[n], xs[n + 1], size);
  }

  const px = [];
  for (let n = 0; n < size * size; n++) {
    const c = Math.max(0, Math.min(1, cov[n]));
    px.push([
      Math.round(BG[0] + (FG[0] - BG[0]) * c),
      Math.round(BG[1] + (FG[1] - BG[1]) * c),
      Math.round(BG[2] + (FG[2] - BG[2]) * c),
      255,
    ]);
  }
  return px;
}
