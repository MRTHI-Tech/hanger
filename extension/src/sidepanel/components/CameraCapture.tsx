import {useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {canvasToFile} from '../imageChecks';

/**
 * Take a photo with the machine's camera. Shared by onboarding (a person) and
 * by hanging something you own (a garment on the floor) — same mechanics, and
 * the only difference that matters is which camera to ask for.
 *
 * A camera that won't start is not an error state: both callers have a file
 * picker sitting next to the button, so `onUnavailable` sends the person back
 * there with a sentence rather than stranding them here.
 */
export function CameraCapture({
  title,
  hint,
  facing = 'user',
  captureLabel = 'Take the photo',
  filename = 'camera.jpg',
  onCapture,
  onCancel,
  onUnavailable,
}: {
  title: string;
  hint: string;
  /** 'environment' is the rear camera where there is one; laptops ignore it. */
  facing?: 'user' | 'environment';
  captureLabel?: string;
  filename?: string;
  onCapture: (file: File) => void;
  onCancel: () => void;
  onUnavailable: (reason: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          // `ideal`, not `exact`: a laptop has only a front camera and an exact
          // constraint would fail outright rather than using what's there.
          video: {
            width: {ideal: 1080},
            height: {ideal: 1440},
            facingMode: {ideal: facing},
          },
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
        }
        setReady(true);
      } catch {
        onUnavailable(
          "We couldn't reach your camera. Choose a photo from your computer instead.",
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, onUnavailable]);

  async function take() {
    const el = video.current;
    if (!el) return;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext('2d')?.drawImage(el, 0, 0);
    stream.current?.getTracks().forEach((t) => t.stop());
    onCapture(await canvasToFile(canvas, filename));
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        <Text type="supporting">{hint}</Text>
      </VStack>

      <div
        className="w-full overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--color-background-inverted)',
          aspectRatio: '3 / 4',
        }}>
        <video
          ref={video}
          playsInline
          muted
          className="block h-full w-full"
          style={{objectFit: 'cover'}}
        />
      </div>

      <VStack gap={2}>
        <Button
          label={captureLabel}
          variant="primary"
          isDisabled={!ready}
          onClick={take}
        />
        <Button label="Back" variant="ghost" onClick={onCancel} />
      </VStack>
    </VStack>
  );
}
