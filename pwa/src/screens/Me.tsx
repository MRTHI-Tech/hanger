import {useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {Spinner} from '@astryxdesign/core/Spinner';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  api,
  mediaUrl,
  type Allowance,
  type Device,
  type PairingCode,
} from '@hanger/shared/api';
import {checkPersonPhoto} from '@hanger/shared/imageChecks';
import {PoseGuide} from '@hanger/shared/guides';
import {AccentPicker} from '@hanger/shared/theme/AccentPicker';
import type {Health, Person} from '@hanger/shared/types';
import {ErrorNote} from '../components/ErrorNote';
import {PhotoPick} from '../components/PhotoPick';
import {Sheet} from '../components/Sheet';
import {SignOutCard} from '../auth';
import {
  guessServerUrl,
  rememberServerUrl,
  savedServerUrl,
  serverUrl,
} from '../server';

/**
 * You, and the connection.
 *
 * Two things live here for now. The photo, because it's the one piece of you
 * the whole product is built on and you should be able to see which one is in
 * play. And the server address, because the single most likely reason this app
 * shows nothing is that it's pointed at the wrong machine — and on a phone
 * there's no console to find that out from.
 */
export function Me({
  person,
  health,
  device,
  allowance,
  onUnpaired,
  onPersonChanged,
}: {
  person: Person | null;
  health: Health | null;
  /** Null when the app is being viewed on the laptop itself, which needs no pairing. */
  device: Device | null;
  allowance: Allowance | null;
  onUnpaired: () => void;
  onPersonChanged: (person: Person | null) => void;
}) {
  return (
    <VStack padding={4} gap={4}>
      <Heading level={2}>You</Heading>

      <PhotoCard person={person} onPersonChanged={onPersonChanged} />

      <Card padding={3}>
        <AccentPicker />
      </Card>

      <ServerCard />

      <AllowanceCard health={health} allowance={allowance} />

      <InstallCard />

      <SignOutCard />

      <PairingCard device={device} onUnpaired={onUnpaired} />
    </VStack>
  );
}

/**
 * Your photo — the one every try-on is built on.
 *
 * The phone used to say "Add one on the laptop", which was a hole rather than a
 * decision: the phone has the better camera, it's the one in your hand, and a
 * phone that can hang a garment but can't photograph you can't try that garment
 * on. So this is the same job the panel's onboarding does, laid out for a
 * thumb — the guidance drawings and the two ways in, in a sheet.
 *
 * Warnings are shown and do not block. §5.4 separates "we can't use this" from
 * "this will work but head-to-toe would work better", and only the first is a
 * refusal — the server sends its own along in the same shape.
 */
function PhotoCard({
  person,
  onPersonChanged,
}: {
  person: Person | null;
  onPersonChanged: (person: Person | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'checking' | 'uploading' | 'removing'>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function open() {
    setProblem(null);
    setError(null);
    setConfirmingRemove(false);
    setIsOpen(true);
  }

  async function upload(photo: File) {
    setBusy('uploading');
    setError(null);
    try {
      const result = await api.uploadPersonPhoto(photo, photo.name || 'photo.jpg');
      // Re-read rather than assembling a Person out of the upload result: the
      // row has a created_at we'd otherwise be inventing.
      onPersonChanged(await api.getPerson());
      // The server's warnings, not the client's as well. The local pass exists
      // to fail fast before the upload; once the server has answered, it has
      // repeated every one of those checks and its wording is the one to show.
      // Concatenating both said "this looks cropped" twice, in two voices.
      setWarnings(result.warnings);
      // Nothing to read means nothing to stay for.
      if (result.warnings.length === 0) setIsOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('removing');
    setError(null);
    try {
      await api.deletePerson();
      onPersonChanged(null);
      setWarnings([]);
      setIsOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
      setConfirmingRemove(false);
    }
  }

  return (
    <>
      <Card padding={3}>
        <VStack gap={3}>
          <HStack gap={3} vAlign="center">
            {person ? (
              <img
                src={mediaUrl(person.photoUrl)}
                alt="Your photo"
                className="shrink-0 overflow-hidden rounded-full"
                style={{
                  width: '4rem',
                  height: '4rem',
                  objectFit: 'cover',
                  objectPosition: 'top',
                  border: '1px solid var(--color-border-emphasized)',
                  backgroundColor: 'var(--color-background-muted)',
                }}
              />
            ) : (
              <div
                aria-hidden
                className="shrink-0 rounded-full"
                style={{
                  width: '4rem',
                  height: '4rem',
                  border: '1px dashed var(--color-border-emphasized)',
                  backgroundColor: 'var(--color-background-muted)',
                }}
              />
            )}
            <VStack gap={0.5}>
              <Text type="label">{person ? 'Your photo' : 'No photo yet'}</Text>
              <Text type="supporting">
                {person
                  ? 'Everything is tried on with this one.'
                  : 'Take one and everything gets tried on with it.'}
              </Text>
            </VStack>
          </HStack>

          <Button
            label={person ? 'Change your photo' : 'Take your photo'}
            variant={person ? 'secondary' : 'primary'}
            onClick={open}
          />
        </VStack>
      </Card>

      <Sheet
        title="Your photo"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={3}>Your photo</Heading>
            <Text type="supporting">
              One photo, and everything in your hanger gets tried on with it.
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

          {warnings.length > 0 && (
            <Banner
              status="warning"
              title="Worth knowing"
              description={warnings.join(' ')}
            />
          )}

          {error != null && (
            <ErrorNote
              error={error}
              title="We couldn't save that"
              onDismiss={() => setError(null)}
            />
          )}

          <Card variant="muted">
            <PoseGuide />
          </Card>

          {busy === 'checking' || busy === 'uploading' ? (
            <Card>
              <HStack gap={3} vAlign="center">
                <Spinner />
                <Text>
                  {busy === 'checking' ? 'Checking your photo' : 'Saving it'}
                </Text>
              </HStack>
            </Card>
          ) : (
            <PhotoPick
              facing="user"
              cameraLabel={person ? 'Take a new one' : 'Take your photo'}
              rollLabel="Choose from photos"
              check={checkPersonPhoto}
              isDisabled={busy != null}
              onStart={() => {
                setProblem(null);
                setWarnings([]);
                setError(null);
                setBusy('checking');
              }}
              onProblem={(p) => {
                setProblem(p);
                setBusy(null);
              }}
              onPhoto={(photo) => void upload(photo)}
            />
          )}

          {person && busy == null && (
            <Button
              label={confirmingRemove ? 'Yes, remove it' : 'Remove photo'}
              variant={confirmingRemove ? 'primary' : 'ghost'}
              onClick={() => {
                if (confirmingRemove) void remove();
                else setConfirmingRemove(true);
              }}
            />
          )}
        </VStack>
      </Sheet>
    </>
  );
}

/**
 * What this phone is, as far as the laptop is concerned.
 *
 * "Forget this phone" is here rather than buried because the honest thing about
 * a device token is that it's the only thing standing between the Wi-Fi and
 * your wardrobe — so getting rid of it has to be one tap, on the phone itself,
 * without needing the laptop you may have just lost.
 */
function PairingCard({
  device,
  onUnpaired,
}: {
  device: Device | null;
  onUnpaired: () => void;
}) {
  const [forgetting, setForgetting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // No device means this client is the account holder rather than something
  // that was let in — signed in, or the laptop looking at its own app. Either
  // way it is the thing that hands out codes rather than the thing that spends
  // them, so this is where connecting a browser lives.
  if (!device) return <ConnectCard />;

  async function forget() {
    setForgetting(true);
    setError(null);
    try {
      await api.removeDevice(device!.id);
      onUnpaired();
    } catch (e) {
      setError(e);
      setForgetting(false);
    }
  }

  return (
    <Card padding={3}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label">Paired as “{device.name}”</Text>
          <Text type="supporting">
            Since {formatDay(device.pairedAt)}. Your laptop can see this phone
            in its list and remove it from there too.
          </Text>
        </VStack>

        <Button
          label={forgetting ? 'Forgetting…' : 'Forget this phone'}
          variant="ghost"
          size="sm"
          isDisabled={forgetting}
          onClick={() => void forget()}
        />

        {error != null && <ErrorNote error={error} title="Couldn't unpair" />}
      </VStack>
    </Card>
  );
}

function formatDay(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
  });
}

/** How often we ask whether the browser has taken the code yet. */
const POLL_MS = 1500;

/**
 * Letting the Chrome side panel into this account.
 *
 * The panel can't sign in the way this app does — Chrome forbids the remote
 * code that OAuth needs inside an extension — so it proves itself the way a
 * phone does instead, by repeating six characters only somebody looking at this
 * screen could know. Same codes, same tokens, same five-minute life; the only
 * thing that changed is which screen shows them.
 *
 * Shown only to a client that isn't itself a paired device, because the server
 * refuses code-minting to anything holding a device token — otherwise a phone
 * that got in could quietly let in something else.
 */
function ConnectCard() {
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [connected, setConnected] = useState<Device | null>(null);
  const [expired, setExpired] = useState(false);
  const [working, setWorking] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<unknown>(null);

  async function loadDevices() {
    try {
      setDevices(await api.listDevices());
    } catch {
      // Context, not the job. A code that works is worth showing even if we
      // couldn't say what's already connected.
    }
  }

  useEffect(() => {
    void loadDevices();
  }, []);

  async function open() {
    setWorking(true);
    setError(null);
    setExpired(false);
    setConnected(null);
    try {
      setPairing(await api.createPairingCode());
    } catch (e) {
      setError(e);
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    if (!pairing || expired || connected) return;

    const {code} = pairing;
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      if (cancelled) return;
      try {
        const result = await api.pairingStatus(code);
        if (cancelled) return;
        if (result.status === 'paired') {
          setConnected(result.device);
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
      if (!cancelled) timer = window.setTimeout(poll, POLL_MS);
    }

    timer = window.setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pairing, expired, connected]);

  return (
    <Card padding={3}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label">Connect a browser</Text>
          <Text type="supporting">
            The Hanger side panel in Chrome asks for six characters the first
            time you open it. This is where they come from.
          </Text>
        </VStack>

        {connected ? (
          <VStack gap={1}>
            <Text type="label">{connected.name} is in</Text>
            <Text type="supporting">
              It can see your hanger now, and stays connected until you remove
              it below.
            </Text>
          </VStack>
        ) : expired ? (
          <VStack gap={2}>
            <Text type="supporting">
              That code expired. Codes last five minutes, so one left on screen
              can't be used later.
            </Text>
            <Button
              label="Show a new code"
              variant="primary"
              size="sm"
              onClick={() => void open()}
            />
          </VStack>
        ) : pairing ? (
          <VStack gap={2} hAlign="center">
            <Code value={pairing.code} />
            <Text type="supporting">Waiting for the browser…</Text>
          </VStack>
        ) : (
          <Button
            label={working ? 'Making a code…' : 'Show me a code'}
            variant="secondary"
            size="sm"
            isDisabled={working}
            onClick={() => void open()}
          />
        )}

        {error != null && (
          <ErrorNote
            error={error}
            title="Couldn't set that up"
            onDismiss={() => setError(null)}
          />
        )}

        <ConnectedList devices={devices} onChanged={loadDevices} />
      </VStack>
    </Card>
  );
}

/**
 * Read off a phone at arm's length and typed into a laptop, so it is sized for
 * the reading rather than the layout.
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
        // The tracking sits to the right of the last character too; pull it
        // back so the code still looks centred.
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

/** What has been let in, and the way back out. */
function ConnectedList({
  devices,
  onChanged,
}: {
  devices: Device[];
  onChanged: () => void;
}) {
  if (devices.length === 0) return null;

  return (
    <VStack gap={2}>
      <Text type="label">Connected</Text>
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
 * Which of these is the thing in front of you and which is the one you stopped
 * using. Exact times are no help for that; "yesterday" is.
 */
function lastSeen(device: Device): string {
  if (device.lastSeenAt == null) return 'Not used yet';
  const days = Math.floor((Date.now() - device.lastSeenAt) / 86_400_000);
  if (days === 0) return 'Used today';
  if (days === 1) return 'Used yesterday';
  if (days < 30) return `Used ${days} days ago`;
  return `Last used ${new Date(device.lastSeenAt).toLocaleDateString()}`;
}

/**
 * What's left of the real thing.
 *
 * Try-ons and videos cost the person running the server actual money, so
 * everybody gets an allowance. Running out isn't a wall — the results become
 * samples, watermarked, and everything else carries on working. Saying so here
 * is what stops that reading as a bug.
 */
function AllowanceCard({
  health,
  allowance,
}: {
  health: Health | null;
  allowance: Allowance | null;
}) {
  if (!health) return null;

  const serverOnSamples = health.mockMode;
  const spent = allowance?.onSamples ?? false;
  const showBadge = serverOnSamples || spent;

  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack justify="between" vAlign="center">
          <Text type="label">Try-ons and videos</Text>
          {showBadge && <Badge variant="neutral" label="Sample results" />}
        </HStack>
        <Text type="supporting">{describe(serverOnSamples, allowance)}</Text>
      </VStack>
    </Card>
  );
}

function describe(serverOnSamples: boolean, allowance: Allowance | null): string {
  if (serverOnSamples) {
    return 'This server is running on samples, so nothing you do here costs anything.';
  }
  if (!allowance || allowance.unitAllowance <= 0) {
    return 'Real results, with no limit set on this server.';
  }
  if (allowance.onSamples) {
    return "You've used your allowance of real try-ons, so new ones come back as samples. Everything else works exactly as before.";
  }
  const left = Math.max(0, allowance.unitAllowance - allowance.unitsSpent);
  return `${left} of ${allowance.unitAllowance} real try-ons left. After that they come back as samples.`;
}

/**
 * The address, and a way to change it.
 *
 * The default is a guess — the same machine that served this page, on the
 * server's port — and it's right whenever the laptop is running both. When it
 * isn't right, this is the only place you could possibly fix it from a phone.
 */
function ServerCard() {
  const [draft, setDraft] = useState(serverUrl());
  const [checking, setChecking] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);

  const isOverridden = savedServerUrl() != null;

  async function check() {
    setChecking(true);
    setError(null);
    setOk(null);
    rememberServerUrl(draft === guessServerUrl() ? null : draft);
    try {
      await api.health();
      setOk(true);
    } catch (e) {
      setOk(false);
      setError(e);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card padding={3}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label">Where the server is</Text>
          <Text type="supporting">
            By default, the same machine this app came from. Change it if your
            laptop answers somewhere else.
          </Text>
        </VStack>

        <TextInput
          label="Server address"
          isLabelHidden
          value={draft}
          onChange={setDraft}
          placeholder={guessServerUrl()}
        />

        <HStack gap={2}>
          <Button
            label={checking ? 'Checking…' : 'Check it'}
            variant="secondary"
            size="sm"
            isDisabled={checking}
            onClick={() => void check()}
          />
          {isOverridden && (
            <Button
              label="Use the default"
              variant="ghost"
              size="sm"
              onClick={() => {
                rememberServerUrl(null);
                setDraft(guessServerUrl());
                setOk(null);
                setError(null);
              }}
            />
          )}
        </HStack>

        {ok === true && (
          <Text type="supporting" color="primary">
            Connected. Pull the Hanger tab up again to reload it.
          </Text>
        )}
        {ok === false && error != null && (
          <ErrorNote error={error} title="No answer from there" />
        )}
      </VStack>
    </Card>
  );
}

/**
 * How to get this onto the home screen. Worth saying because the two platforms
 * differ and neither is obvious: Android offers to install it, iPhone makes you
 * find it in the Share menu yourself.
 */
function InstallCard() {
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        // iOS never adopted display-mode for home-screen apps.
        (navigator as {standalone?: boolean}).standalone === true,
    );
  }, []);

  if (installed) return null;

  const isApple = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="label">Keep it on your home screen</Text>
        <Text type="supporting">
          {isApple
            ? 'Tap Share at the bottom of Safari, then "Add to Home Screen". It opens without the browser bars after that.'
            : 'Open your browser\'s menu and choose "Install app" or "Add to Home screen".'}
        </Text>
      </VStack>
    </Card>
  );
}
