import {mockMode} from '../env.js';
import {
  mockEnhance,
  mockRunCloth,
  mockRunVideo,
  mockUploadFile,
} from '../mock.js';
import {
  createClothTask,
  createVideoTask,
  downloadResult,
  pollTask,
  uploadFile,
  VIDEO_DURATION_SECONDS,
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
 * Turn a finished outfit image into a short video (§5.1 upload → task → poll →
 * download, same shape as the try-on). Takes the stored outfit image bytes
 * because the File API is the only way in — §2.2 applies to our own /media URLs
 * too, since a local server isn't reachable from Perfect Corp.
 */
export async function runVideo(
  imageBytes: Buffer,
  contentType: string,
  onTick?: (elapsedMs: number) => void,
): Promise<ClothOutcome> {
  if (mockMode) {
    const {bytes, contentType: ct} = await mockRunVideo(imageBytes, onTick);
    return {resultPath: save(bytes, extForContentType(ct))};
  }

  const fileId = await uploadFile(imageBytes, contentType, 'outfit.jpg');
  const taskId = await createVideoTask({
    fileId,
    durationSeconds: VIDEO_DURATION_SECONDS,
  });
  const url = await pollTask('image-to-video/youcam', taskId, onTick, 300_000);
  const {bytes, contentType: ct} = await downloadResult(url);
  return {resultPath: save(bytes, extForVideoContentType(ct))};
}

/** Video results are mp4 unless the response says otherwise. */
function extForVideoContentType(contentType: string): string {
  if (contentType.includes('webm')) return '.webm';
  if (contentType.includes('quicktime')) return '.mov';
  if (contentType.includes('svg')) return '.svg';
  return '.mp4';
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
