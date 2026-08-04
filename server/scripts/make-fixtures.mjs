/**
 * Writes the MOCK_MODE fixtures into server/fixtures/.
 *
 *   node scripts/make-fixtures.mjs
 *
 * Everything here is drawn, not photographed: a fresh clone needs sample data
 * that ships in the repo, and drawings carry no licence questions and can't be
 * mistaken for a real try-on result.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../fixtures');
mkdirSync(out, {recursive: true});

/** A flat product shot, the kind a retailer shows on a white background. */
function packshot({name, colour, kind}) {
  const shapes = {
    top: `<path d="M256 120 l-92 34 q-38 16 -48 56 l-20 84 52 16 8 -52 v238 q0 16 16 16 h168 q16 0 16 -16 v-238 l8 52 52 -16 -20 -84 q-10 -40 -48 -56 z" fill="${colour}"/>
          <path d="M256 120 l-34 50 34 38 34 -38 z" fill="rgba(0,0,0,0.14)"/>`,
    bottom: `<path d="M164 120 h184 l16 120 -24 268 h-58 l-24 -226 -24 226 h-58 l-24 -268 z" fill="${colour}"/>
             <path d="M164 120 h184 v26 h-184 z" fill="rgba(0,0,0,0.14)"/>`,
    shoes: `<path d="M120 300 h96 l14 40 88 16 q22 6 22 26 v22 q0 12 -14 12 h-206 z" fill="${colour}"/>
            <path d="M120 386 h206 v18 q0 12 -14 12 h-192 q-12 0 -12 -12 z" fill="rgba(0,0,0,0.2)"/>`,
    outer: `<path d="M256 118 l-96 36 q-40 16 -50 58 l-22 88 54 16 8 -54 v244 q0 16 16 16 h68 v-404 z" fill="${colour}"/>
            <path d="M256 118 l96 36 q40 16 50 58 l22 88 -54 16 -8 -54 v244 q0 16 -16 16 h-68 v-404 z" fill="${colour}"/>
            <path d="M244 118 h24 v404 h-24 z" fill="rgba(0,0,0,0.16)"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640" viewBox="0 0 512 640" data-hanger-colour="${colour}">
  <rect width="512" height="640" fill="#ffffff"/>
  ${shapes[kind]}
  <text x="256" y="600" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" fill="#868b99">${name}</text>
</svg>
`;
}

/** An on-model shot — what §2.3 says lower-body garments actually need. */
function onModel({name, colour, kind}) {
  const isBottom = kind === 'bottom';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768" data-hanger-colour="${colour}">
  <rect width="512" height="768" fill="#f4f1e6"/>
  <ellipse cx="256" cy="726" rx="96" ry="16" fill="#1d1c11" opacity="0.08"/>
  <ellipse cx="256" cy="104" rx="42" ry="50" fill="#d9bda4"/>
  <path d="M214 100 q0 -52 42 -52 q42 0 42 52 q-9 -25 -42 -25 q-33 0 -42 25 z" fill="#3a2c22"/>
  <path d="M234 148 h44 v30 h-44 z" fill="#c9a98e"/>
  <path d="M172 200 q-20 8 -26 30 l-12 46 28 8 4 -28 v130 q0 10 10 10 h92 q10 0 10 -10 v-186 z" fill="${
    isBottom ? '#e8e4d4' : colour
  }"/>
  <path d="M340 200 q20 8 26 30 l12 46 -28 8 -4 -28 v130 q0 10 -10 10 h-92 q-10 0 -10 -10 v-186 z" fill="${
    isBottom ? '#e8e4d4' : colour
  }"/>
  <path d="M186 390 h140 l12 74 -16 236 h-44 l-22 -196 -22 196 h-44 l-16 -236 z" fill="${
    isBottom ? colour : '#cfcab6'
  }"/>
  <path d="M188 700 h54 v26 h-62 q-8 0 -6 -10 z" fill="#8d8778"/>
  <path d="M270 700 h54 l14 16 q2 10 -6 10 h-62 z" fill="#8d8778"/>
  <text x="256" y="748" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" fill="#605f52">${name} — on model</text>
</svg>
`;
}

const files = {
  'garment-shirt-packshot.svg': packshot({
    name: 'Oxford shirt',
    colour: '#5681FF',
    kind: 'top',
  }),
  'garment-jacket-packshot.svg': packshot({
    name: 'Boxy jacket',
    colour: '#8c5a3c',
    kind: 'outer',
  }),
  'garment-trousers-packshot.svg': packshot({
    name: 'Wide trousers',
    colour: '#3d4b5c',
    kind: 'bottom',
  }),
  'garment-trousers-onmodel.svg': onModel({
    name: 'Wide trousers',
    colour: '#3d4b5c',
    kind: 'bottom',
  }),
  'garment-trainers-packshot.svg': packshot({
    name: 'Court trainers',
    colour: '#FF7553',
    kind: 'shoes',
  }),
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(resolve(out, name), body);
  console.log(`wrote fixtures/${name}`);
}
