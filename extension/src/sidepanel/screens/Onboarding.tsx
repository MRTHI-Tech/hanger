import {useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Banner} from '@astryxdesign/core/Banner';
import {Spinner} from '@astryxdesign/core/Spinner';
import {api, mediaUrl} from '../api';
import {canvasToFile, checkPersonPhoto} from '../imageChecks';
import {PoseGuide} from '../components/PoseGuide';
import {ErrorNote} from '../components/ErrorNote';

type Stage = 'intro' | 'camera' | 'checking' | 'uploading' | 'done';

export function Onboarding({
  existingPhotoUrl,
  onReady,
  onCancel,
}: {
  existingPhotoUrl?: string;
  onReady: () => void;
  onCancel?: () => void;
}) {
  const [stage, setStage] = useState<Stage>('intro');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    existingPhotoUrl ?? null,
  );
  const fileInput = useRef<HTMLInputElement>(null);

  async function accept(file: File) {
    setProblem(null);
    setError(null);
    setStage('checking');

    const check = await checkPersonPhoto(file);
    if (!check.ok) {
      setProblem(check.problem ?? 'That photo will not work.');
      setStage('intro');
      return;
    }

    setStage('uploading');
    try {
      const result = await api.uploadPersonPhoto(file, file.name || 'photo.jpg');
      setPhotoUrl(mediaUrl(result.photoUrl));
      setWarnings([...check.warnings, ...result.warnings]);
      setStage('done');
    } catch (e) {
      setError(e);
      setStage('intro');
    }
  }

  if (stage === 'camera') {
    return (
      <CameraCapture
        onCapture={accept}
        onCancel={() => setStage('intro')}
        onUnavailable={(reason) => {
          setProblem(reason);
          setStage('intro');
        }}
      />
    );
  }

  if (stage === 'done' && photoUrl) {
    return (
      <VStack padding={4} gap={4} isScrollable>
        <VStack gap={1}>
          <Heading level={2}>You're ready</Heading>
          <Text type="supporting">
            Open any shop and Hanger will offer to try things on.
          </Text>
        </VStack>

        <PhotoPreview url={photoUrl} />

        {warnings.length > 0 && (
          <Banner
            status="warning"
            title="Worth knowing"
            description={warnings.join(' ')}
          />
        )}

        <VStack gap={2}>
          <Button label="Start trying things on" variant="primary" onClick={onReady} />
          <Button
            label="Use a different photo"
            variant="ghost"
            onClick={() => {
              setStage('intro');
              setWarnings([]);
            }}
          />
        </VStack>
      </VStack>
    );
  }

  const busy = stage === 'checking' || stage === 'uploading';

  return (
    <VStack padding={4} gap={4} isScrollable>
      <VStack gap={1}>
        <Heading level={2}>
          {existingPhotoUrl ? 'Change your photo' : 'Start with one photo'}
        </Heading>
        <Text type="supporting">
          Everything you try on is fitted to this photo. One good one and you're
          set for every shop.
        </Text>
      </VStack>

      {problem && (
        <Banner
          status="warning"
          title="That photo won't work"
          description={problem}
          isDismissable
          onDismiss={() => setProblem(null)}
        />
      )}

      {error != null && (
        <ErrorNote
          error={error}
          title="We couldn't save that"
          onAction={() => fileInput.current?.click()}
          actionLabel="Pick another photo"
          onDismiss={() => setError(null)}
        />
      )}

      <Card variant="muted">
        <PoseGuide />
      </Card>

      {busy ? (
        <Card>
          <HStack gap={3} vAlign="center">
            <Spinner />
            <Text>
              {stage === 'checking' ? 'Checking your photo' : 'Saving your photo'}
            </Text>
          </HStack>
        </Card>
      ) : (
        <VStack gap={2}>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void accept(file);
            }}
          />
          <Button
            label="Choose a photo"
            variant="primary"
            onClick={() => fileInput.current?.click()}
          />
          <Button
            label="Take one now"
            variant="secondary"
            onClick={() => setStage('camera')}
          />
          {onCancel && (
            <Button label="Not now" variant="ghost" onClick={onCancel} />
          )}
        </VStack>
      )}

      <Text type="supporting" size="3xs">
        Your photo stays on this computer. It's sent to the try-on service only
        when you ask for a fitting.
      </Text>
    </VStack>
  );
}

function PhotoPreview({url}: {url: string}) {
  return (
    <div
      className="w-full overflow-hidden rounded-xl"
      style={{
        backgroundColor: 'var(--color-background-muted)',
        border: '1px solid var(--color-border)',
      }}>
      <img
        src={url}
        alt="Your photo"
        className="block w-full"
        style={{maxHeight: 420, objectFit: 'contain'}}
      />
    </div>
  );
}

function CameraCapture({
  onCapture,
  onCancel,
  onUnavailable,
}: {
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
          video: {width: {ideal: 1080}, height: {ideal: 1440}, facingMode: 'user'},
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
  }, [onUnavailable]);

  async function take() {
    const el = video.current;
    if (!el) return;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext('2d')?.drawImage(el, 0, 0);
    stream.current?.getTracks().forEach((t) => t.stop());
    onCapture(await canvasToFile(canvas, 'camera.jpg'));
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Stand back a little</Heading>
        <Text type="supporting">
          Get your whole body in the frame, facing the camera.
        </Text>
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
          label="Take the photo"
          variant="primary"
          isDisabled={!ready}
          onClick={take}
        />
        <Button label="Back" variant="ghost" onClick={onCancel} />
      </VStack>
    </VStack>
  );
}
