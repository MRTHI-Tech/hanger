/**
 * Client-side validation of the photos we send to YouCam (§5.4).
 *
 * The point is to fail here, instantly and with a readable sentence, rather
 * than 20 seconds and one unit later. The server repeats every one of these
 * checks — this pass exists for the person's benefit, not the server's.
 *
 * Shared rather than panel-local because the phone needs the same limits, and
 * a second copy of "what YouCam accepts" is the kind of thing that drifts
 * silently until a try-on fails for a reason nobody can see.
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
 * A photo of a garment you own. Same §5.4 limits as the person photo, minus
 * everything about a body: no face to find, and a square crop of a folded
 * jumper is fine where a square crop of a person is not.
 */
export async function checkGarmentPhoto(file: File): Promise<CheckResult> {
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
  bitmap.close();

  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return {
      ok: false,
      problem: `That photo is ${width}×${height}. We need at least ${MIN_WIDTH}×${MIN_HEIGHT}.`,
      warnings,
      width,
      height,
    };
  }

  if (Math.max(width, height) > MAX_SIDE) {
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

/**
 * The long side we aim a phone photo at. Comfortably inside `MAX_SIDE`, and
 * more than cloth-v3 needs — the recommended person image is 1024×768.
 */
export const TARGET_LONG_SIDE = 2048;

/**
 * Bring a photo inside the limits above before anything checks it.
 *
 * The checks were written for a file picker on a laptop, where "that photo is
 * 8064 pixels wide, use a smaller one" is advice you can act on. On a phone it
 * is a dead end: a 48MP camera shoots exactly that, and there is no way to
 * resize it without leaving the app. So the phone shrinks first and asks
 * questions after.
 *
 * Two more things fall out of re-encoding, both of which used to be rejections:
 *
 * - **HEIC.** iOS usually hands a file input a JPEG, but not on every route.
 *   Safari can decode HEIC, so drawing it to a canvas produces something we
 *   accept — rather than telling an iPhone to "save this as a JPG", which is
 *   not a thing an iPhone can do.
 * - **Rotation.** A portrait phone photo is often landscape pixels plus an EXIF
 *   flag. Decoding `from-image` bakes the rotation in, so the garment doesn't
 *   reach YouCam on its side.
 *
 * A photo that is already small enough and already a JPEG or PNG is passed
 * through untouched — re-encoding a good file only loses detail.
 */
export async function normalisePhoto(
  file: File,
  longSide = TARGET_LONG_SIDE,
): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
  } catch {
    // Undecodable. Hand it back as-is and let the checks say so properly —
    // they own the wording for "we couldn't open that file".
    return file;
  }

  const {width, height} = bitmap;
  const scale = Math.min(1, longSide / Math.max(width, height));

  if (
    scale === 1 &&
    file.size <= MAX_BYTES &&
    ACCEPTED.includes(file.type.toLowerCase())
  ) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Keep the original name so the extension it implies still matches what the
  // server stores; the type is what actually decides that, and it's JPEG now.
  return canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '') + '.jpg');
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
