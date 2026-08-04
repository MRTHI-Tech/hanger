import {mockMode} from '../env.js';
import {
  mockEnhance,
  mockRunCloth,
  mockUploadFile,
} from '../mock.js';
import {
  createClothTask,
  downloadResult,
  pollTask,
  uploadFile,
  type ClothTaskInput,
} from './client.js';
import {extForContentType, save} from '../storage.js';

/**
 * The one seam between mock and live. Every caller above this line — try-on,
 * the chain engine, the alternatives round-trip — is written once and runs
 * either way.
 */

export interface RunClothInput extends ClothTaskInput {
  /** Shown in mock output; ignored live. */
  refLabel?: string;
  /** An outer layer is an upper_body pass applied after the top (§8.1). */
  outerPass?: boolean;
}

export interface ClothOutcome {
  /** Filename in our own storage (§2.6 — never a signed URL). */
  resultPath: string;
}

export async function uploadImage(
  bytes: Buffer,
  contentType: string,
  fileName: string,
): Promise<string> {
  return mockMode
    ? mockUploadFile(bytes)
    : uploadFile(bytes, contentType, fileName);
}

export async function runCloth(
  input: RunClothInput,
  onTick?: (elapsedMs: number) => void,
): Promise<ClothOutcome> {
  if (mockMode) {
    const {bytes, contentType} = await mockRunCloth(input, onTick);
    return {resultPath: save(bytes, extForContentType(contentType))};
  }

  const taskId = await createClothTask(input);
  const url = await pollTask('cloth-v3', taskId, onTick);
  const {bytes, contentType} = await downloadResult(url);
  return {resultPath: save(bytes, extForContentType(contentType))};
}

/**
 * AI Photo Enhance, used to rescue undersized alternative thumbnails (§10.2).
 * The live endpoint path is not verified against a live call yet, so this
 * returns null rather than guessing — callers fall back to "open the product
 * page" instead of failing silently.
 */
export async function enhanceImage(bytes: Buffer): Promise<Buffer | null> {
  if (mockMode) return mockEnhance(bytes);
  return null;
}

export {extForContentType};
