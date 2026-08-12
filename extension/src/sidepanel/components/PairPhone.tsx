import {useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Spinner} from '@astryxdesign/core/Spinner';
import {
  api,
  mediaUrl,
  type Device,
  type PairingCode,
} from '@hanger/shared/api';
import {ErrorNote} from './ErrorNote';

/** How often the panel asks whether a phone has taken the code yet. */
const POLL_MS = 1500;

/**
 * Letting a phone into your hanger.
 *
 * The panel needs no permission of its own — it runs on the same machine as the
 * server, and reaching localhost is the proof. A phone can't make that claim,
 * so it makes a different one: it repeats six characters that only somebody
 * looking at this screen could know.
 *
 * The code is the primary route and the QR is the shortcut, not the other way
 * round. Once the app is on a home screen, nobody opens a camera to scan
 * anything — they open the app, and it asks them to type.
 */
export function PairPhone({onClose}: {onClose: () => void}) {
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairedNow, setPairedNow] = useState<Device | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<number | null>(null);

  async function loadDevices() {
    try {
      setDevices(await api.listDevices());
    } catch {
      // The list is context, not the job. A pairing code that works is still
      // worth showing even if we couldn't say what's already paired.
    }
  }

  async function open() {
    setError(null);
    setExpired(false);
    setPairedNow(null);
    try {
      setPairing(await api.createPairingCode());
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void open();
    void loadDevices();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // Opening a code is this component's whole reason to exist; it runs once.
  }, []);

  useEffect(() => {
    if (!pairing || expired || pairedNow) return;

    const {code} = pairing;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const result = await api.pairingStatus(code);
        if (cancelled) return;

        if (result.status === 'paired') {
          setPairedNow(result.device);
          void loadDevices();
          return;
        }
        if (result.status === 'expired') {
          setExpired(true);
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e);
        return;
      }
      if (!cancelled) timer.current = window.setTimeout(poll, POLL_MS);
    }

    timer.current = window.setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [pairing, expired, pairedNow]);

  if (error != null) {
    return (
      <VStack gap={3}>
        <ErrorNote
          error={error}
          title="We couldn't set that up"
          onAction={open}
          actionLabel="Try again"
        />
        <Button label="Close" variant="ghost" onClick={onClose} />
      </VStack>
    );
  }

  if (pairedNow) {
    return (
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={3}>{pairedNow.name} is in</Heading>
          <Text type="supporting">
            It can see your hanger now, and it stays paired until you remove it.
          </Text>
        </VStack>
        <DeviceList devices={devices} onChanged={loadDevices} />
        <Button label="Done" variant="primary" onClick={onClose} />
      </VStack>
    );
  }

  if (expired) {
    return (
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={3}>That code expired</Heading>
          <Text type="supporting">
            Codes last five minutes, so one left on screen can't be used later.
          </Text>
        </VStack>
        <Button label="Show a new code" variant="primary" onClick={open} />
        <Button label="Close" variant="ghost" onClick={onClose} />
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={3}>Pair your phone</Heading>
        <Text type="supporting">
          Open Hanger on your phone and type this in. Same Wi-Fi as this
          computer.
        </Text>
      </VStack>

      {pairing ? (
        <>
          <VStack gap={2} hAlign="center">
            <Code value={pairing.code} />
            <HStack gap={2} vAlign="center">
              <Spinner />
              <Text type="supporting">Waiting for your phone</Text>
            </HStack>
          </VStack>

          {pairing.qrUrl && (
            <Card variant="muted">
              <VStack gap={2} hAlign="center">
                <Text type="supporting">
                  Or scan this, if the app isn't on your phone yet.
                </Text>
                <div
                  className="overflow-hidden rounded-xl"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--color-border)',
                    padding: 10,
                    width: 156,
                    height: 156,
                  }}>
                  <img
                    src={mediaUrl(pairing.qrUrl)}
                    alt={`QR code linking to ${pairing.url}`}
                    className="block h-full w-full"
                  />
                </div>
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

      <DeviceList devices={devices} onChanged={loadDevices} />

      <Button label="Close" variant="ghost" onClick={onClose} />
    </VStack>
  );
}

/**
 * The code itself, spaced and oversized. It is going to be read off a laptop at
 * arm's length and typed on a phone — every pixel of size here is a mistyped
 * character that doesn't happen.
 */
function Code({value}: {value: string}) {
  return (
    <div
      // Read as one word, not six letters, by anything speaking it aloud.
      aria-label={`Pairing code ${value.split('').join(' ')}`}
      style={{
        fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
        fontSize: '2rem',
        letterSpacing: '0.28em',
        // The tracking is on the right of the last character too; pull it back
        // so the code still looks centred.
        textIndent: '0.28em',
        fontWeight: 600,
        color: 'var(--color-text-primary)',
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-container)',
        border: '1px solid var(--color-border-emphasized)',
        backgroundColor: 'var(--color-background-muted)',
        userSelect: 'all',
      }}>
      {value}
    </div>
  );
}

/** What has already been let in, and the way back out. */
function DeviceList({
  devices,
  onChanged,
}: {
  devices: Device[];
  onChanged: () => void;
}) {
  if (devices.length === 0) return null;

  return (
    <VStack gap={2}>
      <Divider />
      <Text type="label">Phones that can see your hanger</Text>
      {devices.map((device) => (
        <HStack key={device.id} gap={2} vAlign="center" justify="between">
          <VStack gap={0.5}>
            <Text type="supporting" color="primary" maxLines={1}>
              {device.name}
            </Text>
            <Text type="supporting">{lastSeen(device)}</Text>
          </VStack>
          <div className="shrink-0">
            <Button
              label="Remove"
              aria-label={`Remove ${device.name}`}
              variant="ghost"
              size="sm"
              onClick={async () => {
                await api.removeDevice(device.id);
                onChanged();
              }}
            />
          </div>
        </HStack>
      ))}
    </VStack>
  );
}

/**
 * Which of these is the phone in your pocket and which is the one you sold.
 * Exact times are no help for that; "yesterday" is.
 */
function lastSeen(device: Device): string {
  if (device.lastSeenAt == null) return 'Not used yet';
  const days = Math.floor((Date.now() - device.lastSeenAt) / 86_400_000);
  if (days === 0) return 'Used today';
  if (days === 1) return 'Used yesterday';
  if (days < 30) return `Used ${days} days ago`;
  return `Last used ${new Date(device.lastSeenAt).toLocaleDateString()}`;
}
