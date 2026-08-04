/**
 * The sample figure used by MOCK_MODE.
 *
 * Mock results are drawn, not photographed: an SVG figure whose garment layers
 * are filled in one at a time. That means mock mode genuinely demonstrates the
 * chain — after three steps you can see a top, a bottom and shoes on one image,
 * each in its own garment's colour — without a single API call or a licensing
 * question about stock photography.
 *
 * The layer state travels inside the SVG itself (see LAYER_MARKER), so a mock
 * chain step can read what the previous step produced straight from the bytes
 * handed to it as `src`, exactly as the live chain passes a real image forward.
 */

import {createHash} from 'node:crypto';

export interface FigureLayers {
  upper_body?: LayerPaint;
  outer?: LayerPaint;
  lower_body?: LayerPaint;
  shoes?: LayerPaint;
  full_body?: LayerPaint;
}

export interface LayerPaint {
  colour: string;
  label: string;
}

const LAYER_MARKER = 'hanger-layers:';

/** Skin and hair kept deliberately neutral — this is a mannequin, not a person. */
const SKIN = '#d9bda4';
const SKIN_SHADE = '#c9a98e';
const HAIR = '#3a2c22';
const BASE_GARMENT = '#e8e4d4';
const BASE_GARMENT_SHADE = '#d6d1bd';
const BACKDROP = '#fdfbe4';
const FLOOR = '#f0edd4';

export const FIGURE_WIDTH = 768;
export const FIGURE_HEIGHT = 1024;

export function renderFigure(layers: FigureLayers, caption?: string): string {
  const top = layers.full_body ?? layers.upper_body;
  const bottom = layers.full_body ?? layers.lower_body;

  const topColour = top?.colour ?? BASE_GARMENT;
  const bottomColour = bottom?.colour ?? BASE_GARMENT_SHADE;
  const shoeColour = layers.shoes?.colour ?? '#8d8778';
  const outer = layers.outer;

  const marker = `<!--${LAYER_MARKER}${JSON.stringify(layers)}-->`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FIGURE_WIDTH}" height="${FIGURE_HEIGHT}" viewBox="0 0 768 1024" role="img" aria-label="Sample try-on result">
${marker}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BACKDROP}"/>
      <stop offset="1" stop-color="${FLOOR}"/>
    </linearGradient>
    <linearGradient id="fabricTop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${topColour}"/>
      <stop offset="1" stop-color="${shade(topColour, -18)}"/>
    </linearGradient>
    <linearGradient id="fabricBottom" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bottomColour}"/>
      <stop offset="1" stop-color="${shade(bottomColour, -18)}"/>
    </linearGradient>
    ${
      outer
        ? `<linearGradient id="fabricOuter" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${outer.colour}"/>
      <stop offset="1" stop-color="${shade(outer.colour, -22)}"/>
    </linearGradient>`
        : ''
    }
  </defs>

  <rect width="768" height="1024" fill="url(#bg)"/>
  <ellipse cx="384" cy="952" rx="150" ry="26" fill="#1d1c11" opacity="0.07"/>

  <!-- legs -->
  <path d="M330 560 h48 v300 q0 18 -18 18 h-16 q-16 0 -16 -18 z" fill="${SKIN}"/>
  <path d="M390 560 h48 v300 q0 18 -18 18 h-16 q-16 0 -16 -18 z" fill="${SKIN_SHADE}"/>

  <!-- bottom garment -->
  <path d="M320 540 h128 l14 96 -18 200 h-42 l-18 -170 -18 170 h-42 l-18 -200 z" fill="url(#fabricBottom)"/>
  ${
    bottom
      ? `<path d="M384 636 v200" stroke="${shade(bottomColour, -30)}" stroke-width="2" opacity="0.5"/>`
      : ''
  }

  <!-- shoes -->
  <path d="M312 862 h50 v34 q0 12 -14 12 h-50 q-10 0 -8 -12 z" fill="${shoeColour}"/>
  <path d="M406 862 h50 l22 34 q2 12 -8 12 h-50 q-14 0 -14 -12 z" fill="${shade(shoeColour, -12)}"/>

  <!-- arms -->
  <path d="M268 322 q-16 90 -8 190 l30 6 q6 -100 16 -178 z" fill="${SKIN}"/>
  <path d="M500 322 q16 90 8 190 l-30 6 q-6 -100 -16 -178 z" fill="${SKIN_SHADE}"/>

  <!-- neck -->
  <path d="M362 236 h44 v46 h-44 z" fill="${SKIN_SHADE}"/>

  <!-- torso garment -->
  <path d="M384 268 l-72 26 q-30 12 -38 44 l-16 66 40 12 6 -40 v186 q0 12 12 12 h136 q12 0 12 -12 v-186 l6 40 40 -12 -16 -66 q-8 -32 -38 -44 z" fill="url(#fabricTop)"/>
  ${
    top
      ? `<path d="M384 268 l-26 40 26 30 26 -30 z" fill="${shade(topColour, -25)}" opacity="0.75"/>`
      : ''
  }

  ${
    outer
      ? `<!-- outer layer, worn over the top -->
  <path d="M312 294 q-30 12 -38 44 l-16 66 40 12 6 -40 v186 q0 12 12 12 h34 v-280 z" fill="url(#fabricOuter)"/>
  <path d="M456 294 q30 12 38 44 l16 66 -40 12 -6 -40 v186 q0 12 -12 12 h-34 v-280 z" fill="url(#fabricOuter)"/>`
      : ''
  }

  <!-- head -->
  <ellipse cx="384" cy="176" rx="66" ry="80" fill="${SKIN}"/>
  <path d="M318 168 q0 -84 66 -84 q66 0 66 84 q-14 -40 -66 -40 q-52 0 -66 40 z" fill="${HAIR}"/>
  <ellipse cx="360" cy="182" rx="5" ry="6" fill="#3a2c22"/>
  <ellipse cx="408" cy="182" rx="5" ry="6" fill="#3a2c22"/>
  <path d="M370 212 q14 10 28 0" stroke="#3a2c22" stroke-width="3" fill="none" stroke-linecap="round"/>

  ${captionBlock(caption)}
</svg>
`;
}

function captionBlock(caption?: string): string {
  if (!caption) return '';
  const text = escapeXml(caption);
  return `<g>
    <rect x="24" y="24" rx="12" ry="12" width="${Math.min(
      720,
      120 + text.length * 9,
    )}" height="44" fill="#1d1c11" opacity="0.82"/>
    <text x="44" y="52" font-family="Outfit, system-ui, sans-serif" font-size="20" fill="#fdfbe4">${text}</text>
  </g>`;
}

/** Reads the layer state a previous mock step wrote into its own SVG. */
export function readLayers(bytes: Buffer): FigureLayers {
  const text = bytes.subarray(0, 4096).toString('utf8');
  const at = text.indexOf(LAYER_MARKER);
  if (at === -1) return {};
  const start = at + LAYER_MARKER.length;
  const end = text.indexOf('-->', start);
  if (end === -1) return {};
  try {
    return JSON.parse(text.slice(start, end)) as FigureLayers;
  } catch {
    return {};
  }
}

export function looksLikeFigure(bytes: Buffer): boolean {
  return bytes.subarray(0, 4096).includes(LAYER_MARKER);
}

/**
 * A stable colour per garment. Hashing the bytes means the same product always
 * comes back the same colour, and two different products never collide visibly.
 */
const PALETTE = [
  '#225BFF',
  '#5DCE5F',
  '#FFA347',
  '#B780F6',
  '#60CFD3',
  '#F680E8',
  '#FF7553',
  '#6CD9A8',
  '#5681FF',
  '#c9a227',
  '#3d4b5c',
  '#8c5a3c',
];

export function colourForBytes(bytes: Buffer): string {
  // Our own fixtures are SVG, so we can read the garment's actual colour and
  // the sample composite comes back looking like the product. A real retailer
  // JPEG falls through to the hash — stable per product, just not its colour.
  const fromSvg = svgFillColour(bytes);
  if (fromSvg) return fromSvg;

  const digest = createHash('sha1').update(bytes).digest();
  return PALETTE[digest[0] % PALETTE.length];
}

function svgFillColour(bytes: Buffer): string | null {
  const head = bytes.subarray(0, 4096).toString('utf8');
  if (!head.includes('<svg')) return null;

  // Our fixtures declare their garment colour, which matters for an on-model
  // shot where the first fill in the file is skin, not fabric.
  const declared = head.match(/data-hanger-colour="(#[0-9a-fA-F]{6})"/);
  if (declared) return declared[1].toLowerCase();

  for (const match of head.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)) {
    const hex = match[1].toLowerCase();
    // Skip the backdrop and any near-white or near-black scaffolding.
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 220) continue;
    if (max < 40) continue;
    return hex;
  }
  return null;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
