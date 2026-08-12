import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {Unplug} from 'lucide-react';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  api,
  setAuthToken,
  setUnauthorizedHandler,
  type Device,
} from '@hanger/shared/api';
import {ErrorNote} from './components/ErrorNote';

/**
 * How the panel proves whose hanger it is looking at.
 *
 * It does not sign anybody in, and the attempt to make it do so is what the
 * previous two versions of this file were: Chrome forbids the remote code that
 * OAuth and sign-up CAPTCHAs need, so an in-panel form can only ever offer the
 * half of sign-in that doesn't include Google. Delegating to the web app fixed
 * that and brought its own tail — a host that has to be running, cookies
 * crossing origins, an extension id registered in advance, and a paid plan at
 * the far end of it.
 *
 * So the panel does what a phone does. It repeats six characters that only
 * somebody looking at the signed-in Hanger app could know, and gets a token it
 * keeps. The server already understood this — `attachUser` resolves a device
 * token to its owner, and has since pairing existed — so nothing on the server
 * changed to make this work.
 *
 * Three ways this ends up, and the panel has to tell them apart before it can
 * show anything:
 *
 *   already in    a token in chrome.storage that the server still honours.
 *   local mode    a fresh clone with no accounts configured, where the panel
 *                 reaches the server on loopback and that is proof enough. No
 *                 pairing, no code, exactly as it has always worked.
 *   needs a code  everything else.
 *
 * Which is why this asks the server rather than guessing: `whoAmI` answers all
 * three, and answering it wrong means either a pairing screen nobody needed or
 * a hanger that belongs to somebody else.
 */

const TOKEN_KEY = 'hanger.deviceToken';

/** Where to go to get a code. Only ever shown as a hint. */
const PWA_ORIGIN = import.meta.env.VITE_PWA_ORIGIN as string | undefined;

/** Codes are six characters; no point letting anyone type a seventh. */
const CODE_LENGTH = 6;

async function savedToken(): Promise<string | null> {
  try {
    const stored = await chrome.storage.local.get(TOKEN_KEY);
    return (stored[TOKEN_KEY] as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function rememberToken(token: string | null): Promise<void> {
  try {
    if (token === null) await chrome.storage.local.remove(TOKEN_KEY);
    else await chrome.storage.local.set({[TOKEN_KEY]: token});
  } catch {
    /* storage refused; the token still applies for this session */
  }
  setAuthToken(token);
}

/**
 * What this browser is called in the device list on the phone. The useful
 * question that list answers is "which of these is the thing in front of me",
 * and "Chrome on Mac" answers it without anybody typing a name.
 */
function browserName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Brave/.test(ua)
        ? 'Brave'
        : 'Chrome';
  const os = /Macintosh/i.test(ua)
    ? 'Mac'
    : /Windows/i.test(ua)
      ? 'Windows'
      : /Linux/i.test(ua)
        ? 'Linux'
        : null;
  return os ? `${browser} on ${os}` : browser;
}

type Phase =
  | {state: 'checking'}
  | {state: 'ready'; local: boolean; device: Device | null}
  | {state: 'needs-code'}
  | {state: 'unreachable'; error: unknown};

interface PanelSession {
  /**
   * True when this panel is the account holder's own machine rather than a
   * paired device — which is what a fresh clone with no accounts configured
   * looks like. It decides whether the panel may hand out pairing codes of its
   * own, because the server refuses that to anything holding a device token.
   */
  local: boolean;
  device: Device | null;
  disconnect: () => Promise<void>;
}

const SessionContext = createContext<PanelSession | null>(null);

/** Null in local mode is a real answer, so this never throws for a missing provider. */
export function usePanelSession(): PanelSession {
  return (
    useContext(SessionContext) ?? {local: true, device: null, disconnect: async () => {}}
  );
}

export function AuthProvider({children}: {children: ReactNode}) {
  const [phase, setPhase] = useState<Phase>({state: 'checking'});
  // StrictMode mounts twice; the probe is a network call and should run once.
  const probed = useRef(false);

  const probe = useCallback(async () => {
    setPhase({state: 'checking'});
    setAuthToken(await savedToken());
    try {
      const who = await api.whoAmI();
      setPhase({state: 'ready', local: who.local, device: who.device});
    } catch (e) {
      // The server naming either refusal means the same thing here: this panel
      // is nobody yet. Anything else is the server being unreachable, which is
      // not something a pairing code fixes and shouldn't be dressed up as one.
      const code = (e as {code?: string}).code;
      if (code === 'not_paired' || code === 'not_signed_in') {
        setPhase({state: 'needs-code'});
      } else {
        setPhase({state: 'unreachable', error: e});
      }
    }
  }, []);

  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    void probe();
  }, [probe]);

  // Revoked from the phone while the panel was open. Every screen would
  // otherwise have to handle that one code itself, and the answer is the same
  // everywhere: stop, and ask to be let in again.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void rememberToken(null);
      setPhase({state: 'needs-code'});
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const disconnect = useCallback(async () => {
    await rememberToken(null);
    setPhase({state: 'needs-code'});
  }, []);

  if (phase.state === 'checking') {
    return (
      <VStack height="100%" padding={4} gap={3} vAlign="center" hAlign="center">
        <Spinner label="Opening Your Hanger" />
      </VStack>
    );
  }

  if (phase.state === 'unreachable') {
    return (
      <VStack height="100%" padding={4} gap={3} vAlign="center">
        <ErrorNote
          error={phase.error}
          title="We can't reach your hanger"
          onAction={() => void probe()}
          actionLabel="Try again"
        />
      </VStack>
    );
  }

  if (phase.state === 'needs-code') {
    return <ConnectBrowser onConnected={() => void probe()} />;
  }

  return (
    <SessionContext.Provider
      value={{local: phase.local, device: phase.device, disconnect}}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Kept as a component rather than folded into AuthProvider so `main.tsx` reads
 * the same as it did: a provider, then the thing it protects.
 */
export function RequireSignIn({children}: {children: ReactNode}) {
  return <>{children}</>;
}

/**
 * Six characters, typed once.
 *
 * Deliberately says where to find them rather than making anyone guess, because
 * the code lives in a different app on a different screen and "open Hanger and
 * look" is the entire instruction.
 */
function ConnectBrowser({onConnected}: {onConnected: () => void}) {
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function claim() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const {token} = await api.claimPairingCode(code, browserName());
      await rememberToken(token);
      onConnected();
    } catch (e) {
      setError(e);
      setWorking(false);
    }
  }

  if (working) {
    return (
      <VStack height="100%" padding={4} gap={3} vAlign="center" hAlign="center">
        <Spinner label="Connecting this browser" />
      </VStack>
    );
  }

  return (
    <VStack height="100%" padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={1} display="inline">
          <Text type="display-3" color="accent">
            Hanger
          </Text>
        </Heading>
        <Heading level={2}>Connect this browser</Heading>
        <Text type="supporting">
          Your hanger lives in your account. This browser needs letting in once,
          and then it stays in.
        </Text>
      </VStack>

      <Card padding={3}>
        <VStack gap={3}>
          <VStack gap={1}>
            <Text type="label">In the Hanger app</Text>
            <Text type="supporting">
              Sign in, open You, and tap Connect a browser. It shows six
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
            label="Connect"
            variant="primary"
            isDisabled={code.length < CODE_LENGTH}
            onClick={() => void claim()}
          />
        </VStack>
      </Card>

      {error != null && (
        <ErrorNote
          error={error}
          title="That didn't connect"
          onDismiss={() => setError(null)}
        />
      )}

      {PWA_ORIGIN && (
        <Card variant="muted">
          <VStack gap={1}>
            <Text type="label">Where's the app?</Text>
            <Text type="supporting">{PWA_ORIGIN}</Text>
          </VStack>
        </Card>
      )}
    </VStack>
  );
}

/**
 * The way out, in the panel header. Only shown when there is something to
 * disconnect from — in local mode there is no token and nothing to forget.
 *
 * Deliberately local: it forgets this browser's token rather than revoking the
 * device on the server, so it can't be used to lock out a phone by accident.
 * Removing a device for good is a thing you do from the app, next to the list
 * of what's connected.
 */
export function SignOutAction() {
  const {device, disconnect} = usePanelSession();
  const [working, setWorking] = useState(false);

  if (!device) return null;

  const label = working ? 'Disconnecting' : 'Disconnect this browser';

  return (
    <button
      type="button"
      onClick={() => {
        setWorking(true);
        void disconnect();
      }}
      disabled={working}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full"
      style={{
        border: '1px solid var(--color-border-emphasized)',
        backgroundColor: 'transparent',
        color: 'var(--color-text-primary)',
        cursor: working ? 'wait' : 'pointer',
        opacity: working ? 0.6 : 1,
        padding: 0,
      }}>
      <Unplug size={16} aria-hidden />
    </button>
  );
}

/**
 * Wraps the header's "pair a phone" action, which the server refuses to
 * anything holding a device token. Showing it to a paired panel would be a
 * button whose only outcome is an error.
 */
export function CanPairPhones({children}: {children: ReactNode}) {
  const {local} = usePanelSession();
  if (!local) return null;
  return <>{children}</>;
}
