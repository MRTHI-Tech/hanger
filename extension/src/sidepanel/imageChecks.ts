/**
 * Client-side validation of the person photo (§5.4).
 *
 * The point is to fail here, instantly and with a readable sentence, rather
 * than 20 seconds and one unit later. The server repeats every one of these
 * checks — this pass exists for the person's benefit, not the server's.
 */

export const MAX_BYTES = 10 * 1024 * 1024;
export const MIN_WIDTH = 512;
export const MIN_HEIGHT = 384;
export const MAX_SIDE = 4096;

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png'];

export interface CheckResult {
  ok: boolean;
  /** Set when the photo can't be used at all. */
  problem?: string;
  /** Set when it can be used but something is worth mentioning. */
  warnings: string[];
  width: number;
  height: number;
}

export async function checkPersonPhoto(file: File): Promise<CheckResult> {
  const warnings: string[] = [];

  if (!ACCEPTED.includes(file.type.toLowerCase())) {
    return {
      ok: false,
      problem: 'We can use JPG and PNG photos. Try saving this one as a JPG.',
      warnings,
      width: 0,
      height: 0,
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      problem: 'That photo is over 10MB. A smaller copy will work.',
      warnings,
      width: 0,
      height: 0,
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      ok: false,
      problem: "We couldn't open that file. Try a different photo.",
      warnings,
      width: 0,
      height: 0,
    };
  }

  const {width, height} = bitmap;

  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    bitmap.close();
    return {
      ok: false,
      problem: `That photo is ${width}×${height}. We need at least ${MIN_WIDTH}×${MIN_HEIGHT}.`,
      warnings,
      width,
      height,
    };
  }

  if (Math.max(width, height) > MAX_SIDE) {
    bitmap.close();
    return {
      ok: false,
      problem: `That photo's longest side is ${Math.max(
        width,
        height,
      )} pixels. Keep it under ${MAX_SIDE}.`,
      warnings,
      width,
      height,
    };
  }

  if (width / height > 0.9) {
    warnings.push(
      'This looks cropped. Head to toe works best — trousers and shoes need to see your legs.',
    );
  }

  const faces = await countFaces(bitmap);
  bitmap.close();

  if (faces === 0) {
    return {
      ok: false,
      problem:
        "We couldn't find a face in that photo. We need to see your face to keep it looking like you.",
      warnings,
      width,
      height,
    };
  }
  if (faces !== null && faces > 1) {
    return {
      ok: false,
      problem: `We found ${faces} people in that photo. Use one with just you in it.`,
      warnings,
      width,
      height,
    };
  }

  return {ok: true, warnings, width, height};
}

/**
 * Returns the number of faces, or null when the browser can't tell us.
 * FaceDetector isn't available everywhere, and a missing detector must never
 * turn into a rejection — we just check less.
 */
async function countFaces(bitmap: ImageBitmap): Promise<number | null> {
  const Detector = (
    globalThis as unknown as {
      FaceDetector?: new (opts?: {fastMode?: boolean; maxDetectedFaces?: number}) => {
        detect(source: ImageBitmapSource): Promise<unknown[]>;
      };
    }
  ).FaceDetector;
  if (!Detector) return null;
  try {
    const detector = new Detector({fastMode: true, maxDetectedFaces: 5});
    const faces = await detector.detect(bitmap);
    return faces.length;
  } catch {
    return null;
  }
}

/** Re-encodes a canvas capture as a JPEG file for upload. */
export function canvasToFile(
  canvas: HTMLCanvasElement,
  name: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('capture failed'));
          return;
        }
        resolve(new File([blob], name, {type: 'image/jpeg'}));
      },
      'image/jpeg',
      0.92,
    );
  });
}
