import {randomUUID} from 'node:crypto';
import {config} from './loadEnv.js';
import {CodedError} from './youcam/errors.js';
import {
  colourForBytes,
  readLayers,
  renderFigure,
  type FigureLayers,
} from './mock/figure.js';
import type {TryOnCategory} from './types.js';
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
