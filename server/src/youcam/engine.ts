import {mockMode} from '../env.js';
import {onSamples} from '../budget.js';
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
  VIDEO_UNIT_COST,
  type ClothTaskInput,
} from './client.js';
import {extForContentType, save} from '../storage.js';
import type {VideoPose} from '../types.js';

/**
 * The one seam between mock and live. Every caller above this line — try-on,
 * the chain engine, the alternatives round-trip — is written once and runs
 * either way.
 *
 * Two things can put a call on the mock path, and the callers know about
 * neither: the server is in sample mode, or this particular person has used up
 * their allowance (§12.3). The second is why every function here takes a user.
 * It is the cheapest possible place to make that decision — one `if`, in the
 * one function that was already choosing.
 */

/** Sample results for this person, either because of the server or their spend. */
function samples(userId: string, units = 1): boolean {
  return mockMode || onSamples(userId, units);
}

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
  userId: string,
  bytes: Buffer,
  contentType: string,
  fileName: string,
): Promise<string> {
  // Uploading costs nothing on its own, but a file id from the live API is no
  // use to a mock run and vice versa — so it follows the same path the call
  // that consumes it will take.
  return samples(userId)
    ? mockUploadFile(bytes)
    : uploadFile(bytes, contentType, fileName);
}

export async function runCloth(
  userId: string,
  input: RunClothInput,
  onTick?: (elapsedMs: number) => void,
): Promise<ClothOutcome> {
  if (samples(userId)) {
    const {bytes, contentType} = await mockRunCloth(input, onTick);
    return {resultPath: save(bytes, extForContentType(contentType))};
  }

  const taskId = await createClothTask(userId, input);
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
  userId: string,
  imageBytes: Buffer,
  contentType: string,
  pose: VideoPose,
  onTick?: (elapsedMs: number) => void,
): Promise<ClothOutcome> {
  // A video is several units, not one, so the allowance is checked against
  // what it actually costs — otherwise somebody one unit from their limit
  // could still spend four.
  if (samples(userId, VIDEO_UNIT_COST)) {
    const {bytes, contentType: ct} = await mockRunVideo(imageBytes, pose, onTick);
    return {resultPath: save(bytes, extForContentType(ct))};
  }

  const fileId = await uploadFile(imageBytes, contentType, 'outfit.jpg');
  const taskId = await createVideoTask(userId, {
    fileId,
    durationSeconds: VIDEO_DURATION_SECONDS,
    pose,
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
export async function enhanceImage(
  userId: string,
  bytes: Buffer,
): Promise<Buffer | null> {
  if (samples(userId)) return mockEnhance(bytes);
  return null;
}

export {extForContentType};
