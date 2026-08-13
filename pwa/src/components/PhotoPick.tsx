import {useRef} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {Button} from '@astryxdesign/core/Button';
import {normalisePhoto, type CheckResult} from '@hanger/shared/imageChecks';

/**
 * Get a photo off the phone, one way or the other.
 *
 * **This deliberately does not open a viewfinder.** The panel has
 * `CameraCapture`, which asks for `getUserMedia` and paints the frames itself,
 * and porting it here would have been the obvious move. It's the wrong one on a
 * phone:
 *
 * - `getUserMedia` needs a secure context, so it is dead over the LAN address
 *   the app is developed on — the one route in couldn't be exercised until the
 *   thing was deployed.
 * - A canvas grab of a video frame is a worse photograph than the camera app's
 *   own capture, which has the whole sensor, autofocus and HDR behind it. The
 *   photo is the input to a try-on; its quality is the feature.
 * - In a home-screen PWA on iOS, `getUserMedia` has a long history of simply
 *   not working, which is exactly where we expect people to be.
 *
 * A file input with `capture` opens the camera app instead. It costs no code,
 * survives all three, and the framing advice people actually read is the
 * drawings shown before they tap — not an overlay they see while aiming.
 *
 * Every photo goes through `normalisePhoto` before it is checked, because a
 * phone camera routinely shoots past the limits the checks enforce.
 */
export function PhotoPick({
  facing = 'environment',
  cameraLabel = 'Take a photo',
  rollLabel = 'Choose from photos',
  check,
  onStart,
  onPhoto,
  onProblem,
  isDisabled = false,
}: {
  /** 'user' is the selfie camera — for your photo rather than a garment. */
  facing?: 'user' | 'environment';
  cameraLabel?: string;
  rollLabel?: string;
  /** `checkPersonPhoto` or `checkGarmentPhoto`; the caller picks. */
  check: (file: File) => Promise<CheckResult>;
  /** Fired the moment a file arrives, before the work — for a spinner. */
  onStart: () => void;
  onPhoto: (file: File, warnings: string[]) => void;
  onProblem: (problem: string) => void;
  isDisabled?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const roll = useRef<HTMLInputElement>(null);

  async function accept(candidate: File) {
    onStart();
    const photo = await normalisePhoto(candidate);
    const result = await check(photo);
    if (!result.ok) {
      onProblem(result.problem ?? "That photo won't work.");
      return;
    }
    onPhoto(photo, result.warnings);
  }

  /** Clearing the value first: picking the same file twice must re-fire. */
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (chosen) void accept(chosen);
  }

  return (
    <VStack gap={2}>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture={facing}
        className="hidden"
        onChange={onChange}
      />
      <input
        ref={roll}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
      />
      <Button
        label={cameraLabel}
        variant="primary"
        isDisabled={isDisabled}
        onClick={() => camera.current?.click()}
      />
      <Button
        label={rollLabel}
        variant="secondary"
        isDisabled={isDisabled}
        onClick={() => roll.current?.click()}
      />
    </VStack>
  );
}
