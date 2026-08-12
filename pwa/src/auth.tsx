import {useEffect, type ReactNode} from 'react';
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignIn,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/clerk-react';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {setAuthTokenProvider} from '@hanger/shared/api';

/**
 * Signing in, on the phone.
 *
 * Optional by construction. With no publishable key the app behaves exactly as
 * it did before accounts existed — it pairs with a laptop and shows that
 * laptop's hanger — which is what running the whole thing locally, with no
 * network and no keys, has always meant.
 *
 * With a key, signing in takes over: a session beats a pairing token, because
 * somebody who has signed in *is* the account holder and a paired phone was
 * only ever standing in for one.
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

export const signInAvailable = Boolean(PUBLISHABLE_KEY);

/**
 * Hands the API client a way to get a current session token.
 *
 * A provider rather than a value: Clerk's tokens last about a minute, so
 * anything cached would start failing shortly after the app opened. `getToken`
 * returns a live one and refreshes it when it has to.
 */
function TokenBridge({children}: {children: ReactNode}) {
  const {getToken, isLoaded} = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    setAuthTokenProvider(async () => {
      try {
        return await getToken();
      } catch {
        // Offline, or the session went away underneath us. Falling through to
        // the device token — if there is one — is better than failing here.
        return null;
      }
    });
    return () => setAuthTokenProvider(null);
  }, [getToken, isLoaded]);

  return <>{children}</>;
}

export function AuthProvider({children}: {children: ReactNode}) {
  if (!PUBLISHABLE_KEY) return <>{children}</>;

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <TokenBridge>{children}</TokenBridge>
    </ClerkProvider>
  );
}

/**
 * The app, once we know who they are.
 *
 * With sign-in switched off this is a pass-through, so every screen below can
 * be written as though somebody is always signed in — which, one way or
 * another, they are.
 */
export function RequireSignIn({children}: {children: ReactNode}) {
  if (!PUBLISHABLE_KEY) return <>{children}</>;

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <SignInScreen />
      </SignedOut>
    </>
  );
}

/**
 * Clerk draws the form itself. Deliberately: it is the part that has to be
 * right about password managers, one-time codes and every provider button, and
 * none of that is worth rebuilding to match a theme.
 */
function SignInScreen() {
  return (
    <VStack padding={4} gap={4} hAlign="center">
      <VStack gap={1}>
        <Heading level={2}>Your hanger</Heading>
        <Text type="supporting">
          Sign in and everything you keep follows you — this phone, your laptop,
          anywhere you open it.
        </Text>
      </VStack>
      <SignIn routing="virtual" />
    </VStack>
  );
}

/**
 * The way out, and who you are while you're in.
 *
 * Returns null when sign-in isn't configured — there is no account to leave,
 * and a sign-out button that did nothing would be worse than no button.
 */
export function SignOutCard() {
  if (!PUBLISHABLE_KEY) return null;
  return <SignedIn>{<SignOutCardInner />}</SignedIn>;
}

function SignOutCardInner() {
  const {signOut} = useClerk();
  const {user} = useUser();

  return (
    <Card padding={3}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label">
            Signed in{user?.primaryEmailAddress ? ' as' : ''}
          </Text>
          <Text type="supporting">
            {user?.primaryEmailAddress?.emailAddress ??
              'Your hanger follows this account wherever you open it.'}
          </Text>
        </VStack>
        <Button
          label="Sign out"
          variant="ghost"
          size="sm"
          onClick={() => void signOut()}
        />
      </VStack>
    </Card>
  );
}

export {useAuth};
