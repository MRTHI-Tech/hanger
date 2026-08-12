import {useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Spinner} from '@astryxdesign/core/Spinner';
import {TextInput} from '@astryxdesign/core/TextInput';
import {api} from '@hanger/shared/api';
import {ErrorNote} from '../components/ErrorNote';
import {deviceName, rememberToken, takeCodeFromUrl} from '../device';
import {serverUrl} from '../server';

/** Codes are six characters; no point letting anyone type a seventh. */
const CODE_LENGTH = 6;

/**
 * Letting this phone in.
 *
 * Two ways, and which one you get depends on how you arrived. Scanning the QR
 * on the laptop lands here with the code already in the URL, so there is
 * nothing to do but watch it happen. Opening the app cold gives you six
 * characters to type — which is the case that matters once the app is on your
 * home screen and you're not scanning anything.
 *
 * Nothing here is an account. There is no password, no email, and nothing to
 * recover: the code proves you can see the laptop's screen, and seeing the
 * laptop's screen is the whole claim being made.
 */
export function Pair({onPaired}: {onPaired: () => void}) {
  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Survives StrictMode's double-mount, so a code from the URL is spent once.
  const claimed = useRef(false);

  async function claim(raw: string) {
    if (claimed.current) return;
    claimed.current = true;
    setPairing(true);
    setError(null);
    try {
      const {token} = await api.claimPairingCode(raw, deviceName());
      rememberToken(token);
      onPaired();
    } catch (e) {
      setError(e);
      setPairing(false);
      // A wrong code should be retryable without reloading the app.
      claimed.current = false;
    }
  }

  // A code that arrived in the URL from the QR code. Nobody typed it, so
  // nobody should have to press anything either.
  useEffect(() => {
    const fromUrl = takeCodeFromUrl();
    if (fromUrl) {
      setCode(fromUrl.toUpperCase().slice(0, CODE_LENGTH));
      void claim(fromUrl);
    }
    // Runs once: the URL is read and cleared on the first pass.
  }, []);

  if (pairing) {
    return (
      <VStack padding={4} gap={4} vAlign="center" height="70%">
        <Card>
          <HStack gap={3} vAlign="center">
            <Spinner />
            <Text>Pairing this phone</Text>
          </HStack>
        </Card>
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Pair this phone</Heading>
        <Text type="supporting">
          Your hanger lives on your laptop. This phone needs letting in once,
          and then it stays in.
        </Text>
      </VStack>

      <Card padding={3}>
        <VStack gap={3}>
          <VStack gap={1}>
            <Text type="label">On your laptop</Text>
            <Text type="supporting">
              Open Hanger and tap the phone icon at the top. It shows six
              characters. Type them here.
            </Text>
          </VStack>

          <TextInput
            label="Pairing code"
            isLabelHidden
            value={code}
            onChange={(next) =>
              setCode(
                next
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, CODE_LENGTH),
              )
            }
            placeholder="ABC123"
          />

          <Button
            label="Pair"
            variant="primary"
            isDisabled={code.length < CODE_LENGTH}
            onClick={() => void claim(code)}
          />
        </VStack>
      </Card>

      {error != null && (
        <ErrorNote
          error={error}
          title="That didn't pair"
          onDismiss={() => setError(null)}
        />
      )}

      <Card variant="muted">
        <VStack gap={1}>
          <Text type="label">Nothing on the laptop?</Text>
          <Text type="supporting">
            The laptop has to be running Hanger, and this phone has to be on the
            same Wi-Fi. We're looking for it at {serverUrl()}.
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}
