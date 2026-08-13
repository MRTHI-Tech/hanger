import {useCallback, useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Badge} from '@astryxdesign/core/Badge';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Card} from '@astryxdesign/core/Card';
import {
  api,
  HangerError,
  mediaUrl,
  setUnauthorizedHandler,
  type Allowance,
  type Device,
} from '@hanger/shared/api';
import type {Garment, Health, Outfit, Person} from '@hanger/shared/types';
import {Hanger} from './screens/Hanger';
import {TryOn} from './screens/TryOn';
import {BuildOutfit} from './screens/BuildOutfit';
import {Outfits} from './screens/Outfits';
import {OutfitDetail} from './screens/OutfitDetail';
import {Me} from './screens/Me';
import {AddSheet} from './screens/AddSheet';
import {AddGarment} from './screens/AddGarment';
import {Pair} from './screens/Pair';
import {RequireSignIn} from './auth';
import {ErrorNote} from './components/ErrorNote';
import {TabBar, type Tab} from './components/TabBar';
import {serverUrl} from './server';
import {rememberToken} from './device';

/**
 * Hanger on the phone.
 *
 * The same hanger the side panel shows — there is one server and one database,
 * and this is a second window onto it rather than a second copy of anything.
 * It writes as well as reads now: a photograph taken here hangs in the panel,
 * because it was never the panel's hanger to begin with.
 *
 * The layout is fixed header, one scrolling region, fixed bar. Nothing else on
 * a phone should move when the content does.
 */
export function App() {
  // Sign-in wraps everything, including the loading and error states: there is
  // nothing worth showing somebody whose account we don't know yet.
  return (
    <RequireSignIn>
      <Wardrobe />
    </RequireSignIn>
  );
}

function Wardrobe() {
  const [health, setHealth] = useState<Health | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [paired, setPaired] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('hanger');
  const [openOutfit, setOpenOutfit] = useState<Outfit | null>(null);
  const [adding, setAdding] = useState(false);
  const [hanging, setHanging] = useState(false);
  const [tryingOn, setTryingOn] = useState<Garment | null>(null);
  const [building, setBuilding] = useState(false);
  const [outfitsVersion, setOutfitsVersion] = useState(0);
  // Bumped when something is hung, so the grid refetches rather than showing a
  // hanger that is one piece out of date.
  const [hangerVersion, setHangerVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First: are we allowed in? Everything below this needs the answer, and
      // a phone that isn't paired should see the pairing screen rather than
      // four screens' worth of the same refusal.
      const who = await api.whoAmI();
      setPaired(true);
      setDevice(who.device);
      setAllowance(who.allowance);

      const [h, p] = await Promise.all([
        api.health(),
        api.getPerson().catch(() => null),
      ]);
      setHealth(h);
      setPerson(p);
    } catch (e) {
      // Signed out is not the same as unpaired, and the answer differs: one
      // wants a sign-in form, the other a code off a laptop. RequireSignIn
      // above handles the first, so this only has to survive the second.
      if (e instanceof HangerError && e.code === 'not_paired') setPaired(false);
      else if (e instanceof HangerError && e.code === 'not_signed_in') setPaired(null);
      else setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A token revoked from the laptop while the phone was in a pocket. Whichever
  // screen finds out, the answer is the same: forget it and ask again.
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      // Signed out mid-session: Clerk's own state changes too, and the sign-in
      // screen takes over. Nothing to forget — the pairing, if there is one,
      // is still good.
      if (reason === 'not_signed_in') return;
      rememberToken(null);
      setPaired(false);
      setDevice(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  if (loading) {
    return (
      <Shell health={health}>
        <VStack padding={4} gap={3} vAlign="center" hAlign="center" height="60%">
          <Spinner label="Opening Your Hanger" />
        </VStack>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell health={health}>
        <VStack padding={4} gap={3}>
          <ErrorNote
            error={error}
            title="Can't reach your hanger"
            actionLabel="Try again"
            onAction={load}
          />
          <Card variant="muted">
            <VStack gap={2}>
              <Text type="label">Two things to check</Text>
              <Text type="supporting">
                Your laptop is running Hanger, and this phone is on the same
                Wi-Fi. We're looking for it at {serverUrl()}.
              </Text>
            </VStack>
          </Card>
        </VStack>
      </Shell>
    );
  }

  if (paired === false) {
    return (
      <Shell health={health}>
        <Pair
          onPaired={() => {
            setPaired(true);
            void load();
          }}
        />
      </Shell>
    );
  }

  // Photographing something takes the whole screen, tab bar included: it is one
  // task with its own way out, and a bar offering three other places to be is
  // an invitation to lose the photo you just took. Pair does the same.
  // Same treatment as photographing something, and for the same reason: it's
  // one task with its own way out, and it runs for about a minute.
  if (tryingOn) {
    return (
      <Shell health={health} person={person}>
        <TryOn
          garment={tryingOn}
          onClose={() => {
            setTryingOn(null);
            // The result now belongs to the garment, so the grid behind has to
            // re-read to know about it.
            setHangerVersion((v) => v + 1);
          }}
          onHung={() => setHangerVersion((v) => v + 1)}
        />
      </Shell>
    );
  }

  if (building) {
    return (
      <Shell health={health} person={person}>
        <BuildOutfit
          onBuilt={(outfit) => {
            setBuilding(false);
            setTab('outfits');
            setOutfitsVersion((v) => v + 1);
            setOpenOutfit(outfit);
          }}
          onCancel={() => {
            setBuilding(false);
            // It may still be running, and Outfits is where it lands.
            setOutfitsVersion((v) => v + 1);
          }}
        />
      </Shell>
    );
  }

  if (hanging) {
    return (
      <Shell health={health} person={person}>
        <AddGarment
          onHung={() => {
            setHanging(false);
            setTab('hanger');
            setHangerVersion((v) => v + 1);
          }}
          onCancel={() => setHanging(false)}
        />
      </Shell>
    );
  }

  return (
    <Shell
      health={health}
      person={person}
      nav={
        <TabBar
          tab={tab}
          onChange={(next) => {
            setOpenOutfit(null);
            setTab(next);
          }}
          onAdd={() => setAdding(true)}
        />
      }>
      {tab === 'hanger' && (
        <Hanger
          key={hangerVersion}
          onAdd={() => setAdding(true)}
          onTryOn={setTryingOn}
          hasPhoto={person != null}
          onNeedPhoto={() => setTab('me')}
        />
      )}

      {tab === 'outfits' &&
        (openOutfit ? (
          <OutfitDetail outfit={openOutfit} onBack={() => setOpenOutfit(null)} />
        ) : (
          <Outfits
            key={outfitsVersion}
            onOpen={setOpenOutfit}
            onBuild={() => setBuilding(true)}
            canBuild={person != null}
          />
        ))}

      {tab === 'me' && (
        <Me
          person={person}
          health={health}
          device={device}
          allowance={allowance}
          onUnpaired={() => {
            rememberToken(null);
            setPaired(false);
            setDevice(null);
          }}
          onPersonChanged={setPerson}
        />
      )}

      <AddSheet
        isOpen={adding}
        onClose={() => setAdding(false)}
        onPhotograph={() => {
          setAdding(false);
          setHanging(true);
        }}
      />
    </Shell>
  );
}

function Shell({
  children,
  health,
  person,
  nav,
}: {
  children: React.ReactNode;
  health: Health | null;
  person?: Person | null;
  nav?: React.ReactNode;
}) {
  return (
    <VStack height="100%" gap={0}>
      <HStack
        className="safe-top shrink-0"
        paddingInline={4}
        paddingBlock={3}
        vAlign="center"
        justify="between">
        <Heading level={1} display="inline">
          <Text type="display-3" color="accent">
            Hanger
          </Text>
        </Heading>
        <HStack gap={2} vAlign="center">
          {health?.mockMode && <Badge variant="neutral" label="Sample data" />}
          {person && (
            <img
              src={mediaUrl(person.photoUrl)}
              alt=""
              className="h-8 w-8 shrink-0 overflow-hidden rounded-full"
              style={{
                objectFit: 'cover',
                objectPosition: 'top',
                border: '1px solid var(--color-border-emphasized)',
                backgroundColor: 'var(--color-background-muted)',
              }}
            />
          )}
        </HStack>
      </HStack>

      <div className="scroll-region" style={{flex: 1, minHeight: 0}}>
        {children}
      </div>

      {nav}
    </VStack>
  );
}
