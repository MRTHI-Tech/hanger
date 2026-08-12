import {useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Spinner} from '@astryxdesign/core/Spinner';
import {api, mediaUrl, type HandoffPurpose, type Handoff} from '@hanger/shared/api';
import {ErrorNote} from './ErrorNote';

/** How often the panel asks whether the phone has sent anything yet. */
const POLL_MS = 1500;

/**
 * Take the photo on your phone instead of hunting for one on the laptop.
 *
 * The laptop draws a QR code, the phone opens a page our own server is already
 * serving, and the bytes come back here. Nothing leaves the network: the phone
 * is talking to this computer directly, which is also the reason the whole
 * thing collapses if the two aren't on the same Wi-Fi — the failure this screen
 * spends most of its copy on.
 */
export function PhoneHandoff({
  purpose,
  title,
  hint,
  onPhoto,
  onCancel,
}: {
  purpose: HandoffPurpose;
  title: string;
  hint: string;
  onPhoto: (file: File) => void;
  onCancel: () => void;
}) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [collecting, setCollecting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [expired, setExpired] = useState(false);
  const timer = useRef<number | null>(null);
  // Survives re-renders so a photo that lands mid-poll is only taken once.
  const taken = useRef(false);

  async function open() {
    setError(null);
    setExpired(false);
    setSlow(false);
    taken.current = false;
    try {
      setHandoff(await api.createHandoff(purpose));
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void open();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // Opening a session is this component's whole reason to exist; it runs once.
  }, []);

  // Nothing has arrived after a while. On the same Wi-Fi this takes as long as
  // it takes to photograph something; a minute of silence usually means the
  // phone never reached us, so say the thing that's actually wrong.
  useEffect(() => {
    if (!handoff) return;
    const id = window.setTimeout(() => setSlow(true), 45_000);
    return () => window.clearTimeout(id);
  }, [handoff]);

  useEffect(() => {
    if (!handoff || expired) return;

    const {token} = handoff;
    let cancelled = false;

    async function poll() {
      if (cancelled || taken.current) return;
      try {
        const {status} = await api.handoffStatus(token);
        if (cancelled || taken.current) return;

        if (status === 'ready') {
          // Past this point the photo is being collected, and collecting spends
          // the token: the server hands the bytes over exactly once and forgets
          // them. So the delivery below is deliberately not gated on
          // `cancelled` — a torn-down effect must not swallow the only copy,
          // which is precisely what left the panel spinning on "Bringing the
          // photo over" while the token sat spent.
          taken.current = true;
          setCollecting(true);
          try {
            onPhoto(await api.takeHandoffPhoto(token));
          } catch (e) {
            setCollecting(false);
            setError(e);
          }
          return;
        }

        if (status === 'expired') {
          setExpired(true);
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e);
        return;
      }
      if (!cancelled) {
        timer.current = window.setTimeout(poll, POLL_MS);
      }
    }

    timer.current = window.setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // `collecting` is deliberately not a dependency: flipping it is what used
    // to re-run this effect and cancel the collection mid-flight. `taken`
    // stops the polling instead, and it's a ref, so it can't restart anything.
  }, [handoff, expired, onPhoto]);

  if (error != null) {
    return (
      <VStack padding={4} gap={4}>
        <ErrorNote
          error={error}
          title="We couldn't set that up"
          onAction={open}
          actionLabel="Try again"
        />
        <Button label="Back" variant="ghost" onClick={onCancel} />
      </VStack>
    );
  }

  if (expired) {
    return (
      <VStack padding={4} gap={4}>
        <VStack gap={1}>
          <Heading level={2}>That code expired</Heading>
          <Text type="supporting">
            Codes last five minutes, so one left on screen can't be used later.
          </Text>
        </VStack>
        <VStack gap={2}>
          <Button label="Show a new code" variant="primary" onClick={open} />
          <Button label="Back" variant="ghost" onClick={onCancel} />
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4} isScrollable>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        <Text type="supporting">{hint}</Text>
      </VStack>

      {handoff ? (
        <>
          <VStack gap={3} hAlign="center">
            <div
              className="overflow-hidden rounded-xl"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--color-border)',
                padding: 12,
                width: 220,
                height: 220,
              }}>
              <img
                src={mediaUrl(handoff.qrUrl)}
                alt={`QR code linking to ${handoff.url}`}
                className="block h-full w-full"
              />
            </div>

            <Text type="supporting">
              Point your phone's camera at this. Same Wi-Fi as this computer.
            </Text>
          </VStack>

          {collecting ? (
            <Card>
              <HStack gap={3} vAlign="center">
                <Spinner />
                <Text>Bringing the photo over</Text>
              </HStack>
            </Card>
          ) : (
            <Card variant="muted">
              <HStack gap={3} vAlign="center">
                <Spinner />
                <Text type="supporting">Waiting for your phone</Text>
              </HStack>
            </Card>
          )}

          {slow && !collecting && (
            <Card variant="muted">
              <VStack gap={2}>
                <Text type="label">Nothing yet?</Text>
                <Text type="supporting">
                  Your phone has to be on the same Wi-Fi as this computer —
                  mobile data won't reach it, and some guest networks stop
                  devices talking to each other. You can also type this in:
                </Text>
                <Text type="label">{handoff.url}</Text>
              </VStack>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <HStack gap={3} vAlign="center">
            <Spinner />
            <Text>Making a code</Text>
          </HStack>
        </Card>
      )}

      <Button label="Back" variant="ghost" onClick={onCancel} />
    </VStack>
  );
}
