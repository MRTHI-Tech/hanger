import {randomUUID} from 'node:crypto';
import {config} from './loadEnv.js';
import {CodedError} from './youcam/errors.js';
import {
  colourForBytes,
  readLayers,
  renderFigure,
  type FigureLayers,
} from './mock/figure.js';
import {videoPoseLabel} from '@hanger/shared/types';
import type {TryOnCategory, VideoPose} from './types.js';
import type {ClothTaskInput} from './youcam/client.js';

/**
 * MOCK_MODE (§12.1). Every YouCam call is answered from a fixture after a
 * realistic delay, so the whole product — including its error states — can be
 * built and demonstrated on a fresh clone with no credentials and no spend.
 *
 * The mock is not a stub that returns one canned image: it composes, the way
 * the real chain does. Each step reads the layers out of the image it was
 * handed and adds one more, so a three-piece outfit really does come back
 * showing all three garments.
 */

/** Overridable so the test suite and local iteration don't wait 8s a step. */
const DELAY_MS = Number(config.MOCK_DELAY_MS ?? 8000);

/** Uploaded bytes, keyed by the fake file id we hand back. */
const uploads = new Map<string, Buffer>();
const MAX_UPLOADS = 200;

/**
 * A one-shot forced failure. Set it and the next task fails with that code —
 * this is how every §13 error state gets exercised without live calls.
 */
let forcedError: string | null = (config.MOCK_FAIL_CODE as string) || null;
let forcedIsSticky = Boolean(config.MOCK_FAIL_CODE);

export function forceNextError(code: string, sticky = false): void {
  forcedError = code;
  forcedIsSticky = sticky;
}

export function clearForcedError(): void {
  forcedError = null;
  forcedIsSticky = false;
}

export function currentForcedError(): string | null {
  return forcedError;
}

function takeForcedError(): string | null {
  const code = forcedError;
  if (code && !forcedIsSticky) forcedError = null;
  return code;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function mockUploadFile(bytes: Buffer): Promise<string> {
  const id = `mock-file-${randomUUID()}`;
  if (uploads.size >= MAX_UPLOADS) {
    const oldest = uploads.keys().next().value;
    if (oldest) uploads.delete(oldest);
  }
  uploads.set(id, bytes);
  await sleep(Math.min(300, DELAY_MS / 10));
  return id;
}

const LAYER_KEY: Record<TryOnCategory, keyof FigureLayers> = {
  upper_body: 'upper_body',
  lower_body: 'lower_body',
  full_body: 'full_body',
  shoes: 'shoes',
};

/**
 * Stands in for create-task + poll + download. Returns SVG bytes: mock results
 * are drawings, and looking like a drawing is the point — nobody should mistake
 * a fixture for a real try-on.
 */
export async function mockRunCloth(
  input: ClothTaskInput & {refLabel?: string; outerPass?: boolean},
  onTick?: (elapsedMs: number) => void,
): Promise<{bytes: Buffer; contentType: string}> {
  const forced = takeForcedError();

  // Tick through the wait so progress UI has something real to show.
  const started = Date.now();
  const step = Math.max(200, Math.min(2000, DELAY_MS / 4));
  while (Date.now() - started < DELAY_MS) {
    await sleep(Math.min(step, DELAY_MS - (Date.now() - started)));
    onTick?.(Date.now() - started);
  }

  if (forced) throw new CodedError(forced);

  const srcBytes = uploads.get(input.srcFileId) ?? Buffer.alloc(0);
  const refBytes = uploads.get(input.refFileId) ?? Buffer.from(input.refFileId);

  const layers: FigureLayers = {...readLayers(srcBytes)};
  const paint = {
    colour: colourForBytes(refBytes),
    label: input.refLabel ?? 'Garment',
  };

  if (input.outerPass && input.category === 'upper_body') {
    layers.outer = paint;
  } else {
    const key = LAYER_KEY[input.category];
    layers[key] = paint;
    if (key === 'full_body') {
      delete layers.upper_body;
      delete layers.lower_body;
    }
  }
  if (input.changeShoes && !layers.shoes) {
    layers.shoes = {colour: '#3d4b5c', label: 'Shoes'};
  }

  const svg = renderFigure(layers, 'Sample result — no API credits used');
  return {bytes: Buffer.from(svg, 'utf8'), contentType: 'image/svg+xml'};
}

/**
 * Mock stand-in for AI Image to Video. Returns an animated SVG rather than a
 * real encoded video: mock output is a drawing on purpose (§12.1), and an SVG
 * keeps that true while still moving. The panel picks its player from the file
 * extension, so this plays in an <img> and a live .mp4 plays in a <video>.
 */
export async function mockRunVideo(
  sourceBytes: Buffer,
  pose: VideoPose,
  onTick?: (elapsedMs: number) => void,
): Promise<{bytes: Buffer; contentType: string}> {
  const forced = takeForcedError();

  const started = Date.now();
  const step = Math.max(200, Math.min(2000, DELAY_MS / 4));
  while (Date.now() - started < DELAY_MS) {
    await sleep(Math.min(step, DELAY_MS - (Date.now() - started)));
    onTick?.(Date.now() - started);
  }

  if (forced) throw new CodedError(forced);

  const figure = renderFigure(
    readLayers(sourceBytes),
    `Sample video — ${videoPoseLabel(pose).toLowerCase()}, no API credits used`,
  );

  const inner = figure
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024" role="img" aria-label="Sample outfit video">
${POSE_ANIMATIONS[pose] ?? POSE_ANIMATIONS.lookbook}
  <g class="stage">${inner}</g>
  <g class="sheen">
    <rect x="0" y="0" width="140" height="1024" fill="#ffffff" opacity="0.16" />
  </g>
</svg>`;

  return {bytes: Buffer.from(svg, 'utf8'), contentType: 'image/svg+xml'};
}

/**
 * One per pose, and visibly different from each other — a picker whose options
 * all produce the same sample teaches the demo nothing. Each is a sweep of
 * light plus a motion that reads as the thing the live prompt asks for: enough
 * to show what the real thing does, obviously not a real render.
 */
const POSE_ANIMATIONS: Record<VideoPose, string> = {
  lookbook: `
  <style>
    .stage { animation: hanger-push 5s ease-in-out infinite alternate; transform-origin: 50% 45%; }
    .sheen { animation: hanger-sheen 5s linear infinite; }
    @keyframes hanger-push { from { transform: scale(1); } to { transform: scale(1.06); } }
    @keyframes hanger-sheen { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
  </style>`,
  // Squashed horizontally and back: the flat-drawing version of turning on the
  // spot, since a mock figure has no back to show.
  turn: `
  <style>
    .stage { animation: hanger-turn 5s ease-in-out infinite; transform-origin: 50% 50%; }
    .sheen { animation: hanger-sheen 5s linear infinite; }
    @keyframes hanger-turn {
      0%, 100% { transform: scaleX(1); }
      25% { transform: scaleX(0.35); }
      50% { transform: scaleX(-1); }
      75% { transform: scaleX(0.35); }
    }
    @keyframes hanger-sheen { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
  </style>`,
  // Walking towards the camera: grows and drifts, with a slight step-sway.
  walk: `
  <style>
    .stage { animation: hanger-walk 5s ease-in-out infinite alternate; transform-origin: 50% 100%; }
    .sheen { animation: hanger-sheen 5s linear infinite; }
    @keyframes hanger-walk {
      from { transform: scale(0.92) translateX(-14px) rotate(-1deg); }
      to { transform: scale(1.14) translateX(14px) rotate(1deg); }
    }
    @keyframes hanger-sheen { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
  </style>`,
  // Weight onto one leg: a lean that settles rather than travels.
  pose: `
  <style>
    .stage { animation: hanger-pose 5s ease-in-out infinite alternate; transform-origin: 50% 95%; }
    .sheen { animation: hanger-sheen 5s linear infinite; }
    @keyframes hanger-pose {
      from { transform: rotate(-2.5deg) translateX(-10px); }
      to { transform: rotate(2.5deg) translateX(10px) scale(1.03); }
    }
    @keyframes hanger-sheen { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
  </style>`,
};

/** Mock stand-in for AI Photo Enhance (§10.2). */
export async function mockEnhance(bytes: Buffer): Promise<Buffer> {
  await sleep(Math.min(1500, DELAY_MS / 4));
  return bytes;
}

/** The sample person photo used when nobody has uploaded one yet. */
export function mockPersonPhoto(): {bytes: Buffer; contentType: string} {
  return {
    bytes: Buffer.from(renderFigure({}), 'utf8'),
    contentType: 'image/svg+xml',
  };
}
