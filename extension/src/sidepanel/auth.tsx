import {useEffect, useState, type ReactNode} from 'react';
import {ClerkProvider, useAuth, useClerk} from '@clerk/chrome-extension';
import {LogOut} from 'lucide-react';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Button} from '@astryxdesign/core/Button';
import {setAuthTokenProvider} from '@hanger/shared/api';

/**
 * Signing in, from the side panel.
 *
 * The panel does not sign anybody in, and shouldn't try. MV3 forbids the remote
 * code that Clerk's sign-up CAPTCHA needs, so a form rendered in here can only
 * offer the part of sign-in that survives the content security policy — which
 * is not the part with Google in it. The previous version of this file hid the
 * provider buttons and sent sign-up out to a hosted tab, which is most of the
 * way to admitting the panel is the wrong place for this.
 *
 * So the phone app owns all of it. It is an ordinary web origin, where OAuth
 * and CAPTCHA are ordinary things, and the panel borrows the session it made:
 * `syncHost` points Clerk at that origin and it reads the session across.
 * Signing in becomes "open a tab" — the one flow that works everywhere and
 * needs no workarounds.
 *
 * Two things outside this file have to be right, and neither is checkable from
 * here at runtime:
 *
 *   - `key` in the manifest, so the extension keeps one id across reloads and
 *     that id can sit in Clerk's allowed origins. Without it Chrome mints a new
 *     id whenever the unpacked extension is reloaded and every sync is refused.
 *   - the phone app's origin in `host_permissions`, so the session is readable
 *     across at all.
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

/** Where the phone app answers. Signing in happens there and only there. */
const SYNC_HOST = import.meta.env.VITE_PWA_ORIGIN as string | undefined;

const inExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);

/**
 * No key at all is not a misconfiguration — it is the credential-free local
 * mode a fresh clone runs in, matching the server's own behaviour with no
 * `CLERK_SECRET_KEY`. A key *without* a sync host is a different thing: it
 * would appear to work on this machine, where the panel reaches the server on
 * loopback and is waved through, and refuse everybody the moment the server is
 * somewhere else. That one gets said out loud rather than guessed at.
 */
const authAvailable = Boolean(PUBLISHABLE_KEY && inExtension);
const misconfigured = authAvailable && !SYNC_HOST;

function panelUrl(): string {
  return chrome.runtime.getURL('sidepanel.html');
}

/**
 * Give every API request a fresh Clerk session token. Children do not mount
 * until the bridge is installed, so their first request cannot accidentally
 * fall through to the server's local-development identity.
 */
function TokenBridge({children}: {children: ReactNode}) {
  const {getToken, isLoaded} = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    setAuthTokenProvider(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    setReady(true);

    return () => {
      setReady(false);
      setAuthTokenProvider(null);
    };
  }, [getToken, isLoaded]);

  if (!isLoaded || !ready) return <AuthLoading />;
  return <>{children}</>;
}

export function AuthProvider({children}: {children: ReactNode}) {
  if (!authAvailable || !PUBLISHABLE_KEY) return <>{children}</>;
  if (!SYNC_HOST) return <>{children}</>;

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      syncHost={SYNC_HOST}
      // Without this the panel only reads the session when it mounts, so
      // signing in on the tab we just opened would leave this screen stale
      // until it was closed and reopened. Experimental, hence the manual way
      // back in SignInScreen — if it stops working the panel is a click
      // slower, not broken.
      __experimental_syncHostListener
      afterSignOutUrl={panelUrl()}>
      <TokenBridge>{children}</TokenBridge>
    </ClerkProvider>
  );
}

/** Protect the wardrobe screens while leaving credential-free local mode intact. */
export function RequireSignIn({children}: {children: ReactNode}) {
  if (misconfigured) return <MissingSyncHost />;
  if (!authAvailable) return <>{children}</>;
  return <SignedInGate>{children}</SignedInGate>;
}

function SignedInGate({children}: {children: ReactNode}) {
  const {isLoaded, isSignedIn} = useAuth();

  if (!isLoaded) return <AuthLoading />;
  if (isSignedIn) return <>{children}</>;
  return <SignInScreen />;
}

/**
 * The whole sign-in surface: a sentence and a button that leaves.
 *
 * The second button is the fallback for the sync listener above. Reloading the
 * panel re-reads the session from scratch, which is the thing the listener is
 * meant to do for us, so this works whether or not the experiment holds.
 */
function SignInScreen() {
  return (
    <VStack height="100%" padding={4} gap={4} vAlign="center" hAlign="center">
      <VStack gap={1} width="100%">
        <Heading level={1} display="inline">
          <Text type="display-3" color="accent">
            Hanger
          </Text>
        </Heading>
        <Heading level={2}>Your hanger</Heading>
        <Text type="supporting">
          Sign in once on the Hanger site and everything you hang follows you —
          this panel, your phone, anywhere you open it.
        </Text>
      </VStack>
      <VStack width="100%" gap={2}>
        <Button
          label="Sign in"
          variant="primary"
          onClick={() => {
            if (SYNC_HOST) void chrome.tabs.create({url: SYNC_HOST});
          }}
        />
        <Button
          label="I've signed in"
          variant="ghost"
          size="sm"
          onClick={() => window.location.reload()}
        />
        <div style={{textAlign: 'center'}}>
          <Text type="supporting">
            Sign-in opens in a tab. Come back here when it's done.
          </Text>
        </div>
      </VStack>
    </VStack>
  );
}

/**
 * Built with a Clerk key but no phone app to borrow a session from. Nothing
 * below this can work, so it says which value is missing rather than showing a
 * sign-in button that would open `undefined`.
 */
function MissingSyncHost() {
  return (
    <VStack height="100%" padding={4} gap={3} vAlign="center" hAlign="center">
      <Heading level={2}>Sign-in isn't configured</Heading>
      <Text type="supporting">
        This build has a Clerk key but no PWA_ORIGIN, so the panel has nowhere
        to sign in. Set it in server/.env and rebuild the extension.
      </Text>
    </VStack>
  );
}

/**
 * How long Clerk gets to load before we assume it isn't going to.
 *
 * Everything below the provider waits on `isLoaded`, and `isLoaded` never
 * becomes true if the sync host can't be reached — which is a spinner that
 * spins until the panel is closed, with the real cause sitting in a devtools
 * console the person looking at it has no reason to open. Ten seconds is well
 * past a slow cold start and well short of giving up on it.
 */
const LOAD_TIMEOUT_MS = 10_000;

function AuthLoading() {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (stalled) return <AuthStalled />;

  return (
    <VStack height="100%" padding={4} gap={3} vAlign="center" hAlign="center">
      <Spinner label="Opening Your Hanger" />
    </VStack>
  );
}

/**
 * Names the host rather than describing the failure, because there is only
 * really one cause: sign-in lives on the phone app, and the phone app isn't
 * answering. In development that is almost always `npm run dev:phone` not
 * running yet.
 */
function AuthStalled() {
  return (
    <VStack height="100%" padding={4} gap={3} vAlign="center" hAlign="center">
      <Heading level={2}>Can't reach sign-in</Heading>
      <Text type="supporting">
        The panel signs in through the Hanger app at {SYNC_HOST ?? 'an unset address'},
        and it isn't answering. Start it and try again.
      </Text>
      <Button
        label="Try again"
        variant="secondary"
        onClick={() => window.location.reload()}
      />
    </VStack>
  );
}

/**
 * A deliberately explicit exit in the panel header. It signs out only this
 * session, rather than invalidating the same account on every other device.
 */
export function SignOutAction() {
  if (!authAvailable || misconfigured) return null;
  return <SignOutActionInner />;
}

function SignOutActionInner() {
  const {sessionId} = useAuth();
  const {signOut} = useClerk();
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function leave() {
    if (working) return;
    setWorking(true);
    setFailed(false);
    try {
      await signOut({sessionId: sessionId ?? undefined, redirectUrl: panelUrl()});
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void leave()}
      disabled={working}
      title={
        working ? 'Signing out' : failed ? "Couldn't sign out. Try again" : 'Sign out'
      }
      aria-label={
        working ? 'Signing out' : failed ? "Couldn't sign out. Try again" : 'Sign out'
      }
      className="flex h-8 w-8 items-center justify-center rounded-full"
      style={{
        border: '1px solid var(--color-border-emphasized)',
        backgroundColor: 'transparent',
        color: 'var(--color-text-primary)',
        cursor: working ? 'wait' : 'pointer',
        opacity: working ? 0.6 : 1,
        padding: 0,
      }}>
      <LogOut size={16} aria-hidden />
    </button>
  );
}
