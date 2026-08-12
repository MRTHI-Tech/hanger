import {useEffect, useState, type ReactNode} from 'react';
import {
  ClerkProvider,
  SignIn,
  useAuth,
  useClerk,
} from '@clerk/chrome-extension';
import {LogOut} from 'lucide-react';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Button} from '@astryxdesign/core/Button';
import {setAuthTokenProvider} from '@hanger/shared/api';

/**
 * Account support for the side panel.
 *
 * The publishable key is public by design. The Vite config reads the same key
 * the backend already uses, so local development still has one .env file.
 * With no key, Hanger keeps its credential-free single-user development mode.
 */
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

const authAvailable = Boolean(
  PUBLISHABLE_KEY &&
    typeof chrome !== 'undefined' &&
    chrome.runtime?.id,
);

// Clerk persists its development-browser client in chrome.storage.local. The
// client is minted against the instance configuration that exists at the time.
// Reset the pre-origin/native-API client once so Clerk can issue a fresh client
// with CAPTCHA bypass enabled for this extension origin. This only removes
// Clerk's own cached client credential; Hanger preferences remain untouched.
const CLERK_STORAGE_MIGRATION = 'hanger.clerk-storage-migration';
const CLERK_STORAGE_VERSION = 1;

async function prepareClerkStorage(): Promise<void> {
  const stored = await chrome.storage.local.get(null);
  if (stored[CLERK_STORAGE_MIGRATION] === CLERK_STORAGE_VERSION) return;

  const clerkClientKeys = Object.keys(stored).filter((key) =>
    key.endsWith('|__clerk_client_jwt|v2'),
  );
  if (clerkClientKeys.length > 0) {
    await chrome.storage.local.remove(clerkClientKeys);
  }
  await chrome.storage.local.set({
    [CLERK_STORAGE_MIGRATION]: CLERK_STORAGE_VERSION,
  });
}

function panelUrl(): string {
  return chrome.runtime.getURL('sidepanel.html');
}

/**
 * The publishable key contains Clerk's public Frontend API hostname. Account
 * creation opens on Clerk's hosted page because MV3 extension pages cannot
 * load the remote CAPTCHA code that browser sign-up protection requires.
 */
function hostedSignUpUrl(): string | null {
  if (!PUBLISHABLE_KEY) return null;

  const encodedHost = PUBLISHABLE_KEY.replace(/^pk_(?:test|live)_/, '');
  try {
    const host = atob(encodedHost).replace(/\$$/, '');
    return new URL('/sign-up', `https://${host}`).toString();
  } catch {
    return null;
  }
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
  const [storageReady, setStorageReady] = useState(!authAvailable);

  useEffect(() => {
    if (!authAvailable) return;

    let active = true;
    void prepareClerkStorage().finally(() => {
      if (active) setStorageReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  if (!authAvailable || !PUBLISHABLE_KEY) return <>{children}</>;
  if (!storageReady) return <AuthLoading />;

  const returnUrl = panelUrl();
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl={returnUrl}
      signInFallbackRedirectUrl={returnUrl}
      signUpFallbackRedirectUrl={returnUrl}>
      <TokenBridge>{children}</TokenBridge>
    </ClerkProvider>
  );
}

/** Protect the wardrobe screens while leaving credential-free local mode intact. */
export function RequireSignIn({children}: {children: ReactNode}) {
  if (!authAvailable) return <>{children}</>;
  return <SignedInGate>{children}</SignedInGate>;
}

function SignedInGate({children}: {children: ReactNode}) {
  const {isLoaded, isSignedIn} = useAuth();
  const [signInRouteReady, setSignInRouteReady] = useState(false);
  const signUpUrl = hostedSignUpUrl();

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;

    // A failed inline sign-up from an older build can leave Clerk's hash route
    // pointing at the removed form. Start this build on a clean sign-in route.
    if (/sign-up|create/i.test(window.location.hash)) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.hash = '';
      window.history.replaceState(null, '', cleanUrl);
    }
    setSignInRouteReady(true);
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || (!isSignedIn && !signInRouteReady)) return <AuthLoading />;
  if (isSignedIn) return <>{children}</>;

  return (
    <VStack height="100%" padding={4} gap={4} hAlign="center">
      <VStack gap={1} width="100%">
        <Heading level={1} display="inline">
          <Text type="display-3" color="accent">
            Hanger
          </Text>
        </Heading>
        <Heading level={2}>Your hanger</Heading>
        <Text type="supporting">
          Sign in and everything you hang follows you across shops and devices.
        </Text>
      </VStack>
      <VStack width="100%" gap={2}>
        <div style={{width: '100%', minWidth: 0}}>
          <SignIn
            routing="hash"
            withSignUp={false}
            appearance={{
              elements: {
                socialButtonsBlockButton: {display: 'none'},
                dividerRow: {display: 'none'},
              },
            }}
          />
        </div>
        {signUpUrl && (
          <VStack width="100%" gap={1} hAlign="center">
            <Button
              label="Create an account"
              variant="secondary"
              onClick={() => window.open(signUpUrl, '_blank', 'noopener,noreferrer')}
            />
            <div style={{textAlign: 'center'}}>
              <Text type="supporting">
                Account creation opens in a secure tab. Return here when it is done.
              </Text>
            </div>
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}

function AuthLoading() {
  return (
    <VStack height="100%" padding={4} gap={3} vAlign="center" hAlign="center">
      <Spinner label="Opening Your Hanger" />
    </VStack>
  );
}

/**
 * A deliberately explicit exit in the panel header. It signs out only this
 * session, rather than invalidating the same account on every other device.
 */
export function SignOutAction() {
  if (!authAvailable) return null;
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
