import {useCallback, useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Spinner} from '@astryxdesign/core/Spinner';
import {api, HangerError, mediaUrl} from '@hanger/shared/api';
import {type Garment, type TryOnResult} from '@hanger/shared/types';
import {ErrorNote} from '../components/ErrorNote';
import {ShareCard} from '../components/ShareCard';
import {usePollWhileVisible} from '../poll';

type Stage = 'starting' | 'running' | 'done' | 'failed';

/**
 * One garment, on you.
 *
 * Takes the whole screen for the same reason photographing something does: it
 * is one task that runs for about a minute, and the result is a picture of you
 * head to toe, which is not a thing to look at through a sheet.
 *
 * The minute is the interesting part on a phone. It is long enough that people
 * lock the screen or go and read something, and the screen says so — because
 * the job genuinely does survive that, and somebody who doesn't know it won't
 * risk finding out.
 */
export function TryOn({
  garment,
  onClose,
  onHung,
}: {
  garment: Garment;
  onClose: () => void;
  onHung: () => void;
}) {
  const [stage, setStage] = useState<Stage>('starting');
  const [tryonId, setTryonId] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [hung, setHung] = useState(Boolean(garment.hung));

  /** A finished row, whichever call produced it. */
  const settle = useCallback((result: TryOnResult) => {
    if (result.status === 'success' && result.resultUrl) {
      setResultUrl(mediaUrl(result.resultUrl));
      setStage('done');
      return true;
    }
    if (result.status === 'error') {
      setError(
        new HangerError(
          result.errorCode ?? 'unknown',
          result.message ?? "That didn't work.",
          result.hint,
        ),
      );
      setStage('failed');
      return true;
    }
    return false;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setResultUrl(null);
    setStage('starting');
    setStartedAt(Date.now());
    try {
      const started = await api.startTryOn(garment.id);
      setTryonId(started.id);
      // A cache hit comes back finished, and putting somebody through a
      // spinner for a picture we already have would be a lie about the work.
      if (!settle(started)) setStage('running');
    } catch (e) {
      setError(e);
      setStage('failed');
    }
  }, [garment.id, settle]);

  // Exactly once per mount, and the guard is not optional: StrictMode invokes
  // effects twice in development, which here means two `POST /tryon` calls,
  // two rows, and two units off a live account for one tap. React's production
  // build doesn't double-invoke, so this would have been a bug that only ever
  // charged you while you were developing against a real key.
  //
  // "Try again" calls start() from the button, which is a new decision by
  // somebody and rightly not guarded.
  const hasStarted = useRef(false);
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    void start();
  }, [start]);

  usePollWhileVisible(
    useCallback(async () => {
      if (!tryonId) return;
      try {
        settle(await api.getTryOn(tryonId));
      } catch (e) {
        setError(e);
        setStage('failed');
      }
    }, [tryonId, settle]),
    stage === 'running',
  );

  // Only while waiting, and only to drive the counter below.
  usePollWhileVisible(
    useCallback(() => setNow(Date.now()), []),
    stage === 'running' || stage === 'starting',
    1000,
  );

  async function hangIt() {
    try {
      await api.hangGarment(garment.id);
      setHung(true);
      onHung();
    } catch (e) {
      setError(e);
    }
  }

  if (stage === 'done' && resultUrl) {
    return (
      <VStack padding={4} gap={4}>
        <VStack gap={1}>
          <Heading level={2}>{garment.title}</Heading>
          <Text type="supporting">On you.</Text>
        </VStack>

        <div
          className="w-full overflow-hidden rounded-xl"
          style={{
            backgroundColor: 'var(--color-background-muted)',
            border: '1px solid var(--color-border)',
          }}>
          <img
            src={resultUrl}
            alt={`You wearing ${garment.title}`}
            className="block w-full"
            style={{maxHeight: '62vh', objectFit: 'contain'}}
          />
        </div>

        {error != null && (
          <ErrorNote
            error={error}
            title="That didn't work"
            onDismiss={() => setError(null)}
          />
        )}

        {/* Above the keep-or-not buttons, and quieter than them. Somebody who
            has just seen themselves in something often wants to send it before
            they have decided anything about it — but what the screen is asking
            is whether to keep it, and that stays the loud question. */}
        <ShareCard
          url={resultUrl}
          name={garment.title}
          kind="picture"
          variant="secondary"
        />

        <VStack gap={2}>
          {!hung && (
            <Button label="Keep it on the hanger" variant="primary" onClick={hangIt} />
          )}
          <Button
            label={hung ? 'Done' : 'Not this one'}
            variant={hung ? 'primary' : 'ghost'}
            onClick={onClose}
          />
        </VStack>
      </VStack>
    );
  }

  if (stage === 'failed') {
    return (
      <VStack padding={4} gap={4}>
        <Heading level={2}>{garment.title}</Heading>
        <ErrorNote
          error={error}
          title="That didn't work"
          onAction={() => void start()}
          actionLabel="Try again"
        />
        <Button label="Back to your hanger" variant="ghost" onClick={onClose} />
      </VStack>
    );
  }

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Trying it on</Heading>
        <Text type="supporting">{garment.title}</Text>
      </VStack>

      <div
        className="w-full overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--color-background-muted)',
          border: '1px solid var(--color-border)',
          aspectRatio: '3 / 4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Spinner label="Fitting it to your photo" />
      </div>

      <Card variant="muted">
        <VStack gap={1}>
          <Text type="label">
            {seconds < 60
              ? `${seconds} seconds so far`
              : `${Math.floor(seconds / 60)}m ${seconds % 60}s so far`}
          </Text>
          <Text type="supporting">
            This takes about a minute. You can lock your phone or go somewhere
            else — it finishes on the server either way, and it'll be here when
            you come back.
          </Text>
        </VStack>
      </Card>

      <Button label="Leave it running" variant="ghost" onClick={onClose} />
    </VStack>
  );
}
