import {useCallback, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Banner} from '@astryxdesign/core/Banner';
import {Spinner} from '@astryxdesign/core/Spinner';
import {api, mediaUrl} from '@hanger/shared/api';
import {checkPersonPhoto} from '../imageChecks';
import {PoseGuide} from '../components/PoseGuide';
import {CameraCapture} from '../components/CameraCapture';
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

  // Stable: CameraCapture starts the stream in an effect keyed on this, so a
  // fresh arrow every render would tear the camera down and restart it.
  const cameraUnavailable = useCallback((reason: string) => {
    setProblem(reason);
    setStage('intro');
  }, []);

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
        title="Stand back a little"
        hint="Get your whole body in the frame, facing the camera."
        onCapture={accept}
        onCancel={() => setStage('intro')}
        onUnavailable={cameraUnavailable}
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

      <Text type="supporting">
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
