import {useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {TextInput} from '@astryxdesign/core/TextInput';
import {api, mediaUrl, type Allowance, type Device} from '@hanger/shared/api';
import type {Health, Person} from '@hanger/shared/types';
import {ErrorNote} from '../components/ErrorNote';
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
}: {
  person: Person | null;
  health: Health | null;
  /** Null when the app is being viewed on the laptop itself, which needs no pairing. */
  device: Device | null;
  allowance: Allowance | null;
  onUnpaired: () => void;
}) {
  return (
    <VStack padding={4} gap={4}>
      <Heading level={2}>You</Heading>

      <Card padding={3}>
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
            <Text type="label">
              {person ? 'Your photo' : 'No photo yet'}
            </Text>
            <Text type="supporting">
              {person
                ? 'Everything is tried on with this one.'
                : 'Add one on the laptop and everything gets tried on with it.'}
            </Text>
          </VStack>
        </HStack>
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

  // No device and still here means this is the laptop looking at its own app.
  // It never paired and there is nothing to forget.
  if (!device) {
    return (
      <Card padding={3}>
        <VStack gap={1}>
          <Text type="label">This computer</Text>
          <Text type="supporting">
            You're looking at the phone app on the machine running Hanger, so
            there's nothing to pair. On an actual phone this is where the
            pairing lives.
          </Text>
        </VStack>
      </Card>
    );
  }

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
