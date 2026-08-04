import {useCallback, useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Badge} from '@astryxdesign/core/Badge';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Card} from '@astryxdesign/core/Card';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {api, mediaUrl} from './api';
import type {
  Garment,
  Health,
  Outfit,
  Person,
  ScrapedProduct,
} from '../shared/types';
import {Onboarding} from './screens/Onboarding';
import {TryOn} from './screens/TryOn';
import {Hanger} from './screens/Hanger';
import {OutfitBuilder} from './screens/OutfitBuilder';
import {Outfits} from './screens/Outfits';
import {Alternatives} from './screens/Alternatives';
import {ErrorNote} from './components/ErrorNote';
import {onProductReady, takePendingProduct} from './bridge';

type Tab = 'tryon' | 'hanger' | 'outfits';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('tryon');
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [product, setProduct] = useState<ScrapedProduct | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [openOutfit, setOpenOutfit] = useState<Outfit | null>(null);
  const [alternativesFor, setAlternativesFor] = useState<Garment | null>(null);
  // Bumped whenever something is hung or an outfit finishes, so the list
  // screens reload without holding their own subscriptions.
  const [dataVersion, setDataVersion] = useState(0);

  const drainProduct = useCallback(async () => {
    const handoff = await takePendingProduct();
    if (handoff.product) {
      setProduct(handoff.product);
      setTabId(handoff.tabId);
      setTab('tryon');
    }
  }, []);

  useEffect(() => {
    void drainProduct();
    // The badge can be clicked again while the panel is already open.
    return onProductReady(() => void drainProduct());
  }, [drainProduct]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, p] = await Promise.all([
        api.health(),
        api.getPerson().catch(() => null),
      ]);
      setHealth(h);
      setPerson(p);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
            title="Hanger isn't running"
            actionLabel="Try again"
            onAction={load}
          />
          <Card variant="muted">
            <VStack gap={2}>
              <Text type="label">Start the server</Text>
              <Text type="supporting">
                In the project folder, run npm run dev. Hanger talks to it on
                localhost:8787.
              </Text>
            </VStack>
          </Card>
        </VStack>
      </Shell>
    );
  }

  if (!person || changingPhoto) {
    return (
      <Shell health={health}>
        <Onboarding
          existingPhotoUrl={
            changingPhoto && person ? mediaUrl(person.photoUrl) : undefined
          }
          onCancel={changingPhoto ? () => setChangingPhoto(false) : undefined}
          onReady={async () => {
            setChangingPhoto(false);
            await load();
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell
      health={health}
      person={person}
      onChangePhoto={() => setChangingPhoto(true)}
      nav={<Nav tab={tab} onChange={setTab} />}>
      {alternativesFor ? (
        <Alternatives
          garment={alternativesFor}
          person={person}
          onBack={() => setAlternativesFor(null)}
          onHung={() => {
            setAlternativesFor(null);
            setDataVersion((v) => v + 1);
            setTab('hanger');
          }}
        />
      ) : (
        <>
      {tab === 'tryon' && (
        <TryOn
          product={product}
          tabId={tabId}
          person={person}
          onHung={() => {
            setDataVersion((v) => v + 1);
            setTab('hanger');
          }}
          onClearProduct={() => setProduct(null)}
          onOpenHanger={() => setTab('hanger')}
          onFindAlternatives={setAlternativesFor}
        />
      )}

      {tab === 'hanger' && (
        <Hanger
          refreshKey={dataVersion}
          onBuildOutfit={() => {
            setBuilding(true);
            setTab('outfits');
          }}
          onTryOn={(garment: Garment) => {
            // Re-trying something already hung goes through the same screen,
            // with the garment's own photo as the only candidate.
            setProduct(garmentAsProduct(garment));
            setTab('tryon');
          }}
          onFindAlternatives={setAlternativesFor}
        />
      )}

      {tab === 'outfits' &&
        (building ? (
          <OutfitBuilder
            person={person}
            onDone={() => {
              setBuilding(false);
              setDataVersion((v) => v + 1);
            }}
          />
        ) : openOutfit ? (
          <OutfitBuilder
            person={person}
            // Opening a saved look drops its pieces back on the canvas, so
            // changing one slot is a two-tap job (and, thanks to the prefix
            // cache, one call rather than three).
            initial={Object.fromEntries(
              openOutfit.items
                .filter((item) => !item.skipped)
                .map((item) => [item.slot, item.garment]),
            )}
            onDone={() => {
              setOpenOutfit(null);
              setDataVersion((v) => v + 1);
            }}
          />
        ) : (
          <Outfits
            refreshKey={dataVersion}
            onBuild={() => setBuilding(true)}
            onOpen={(outfit) => setOpenOutfit(outfit)}
          />
        ))}
        </>
      )}
    </Shell>
  );
}

/**
 * A hung garment presented back to the try-on screen. Its stored image is our
 * own copy, so there is nothing to fetch from a page and one candidate photo.
 */
function garmentAsProduct(garment: Garment): ScrapedProduct {
  return {
    title: garment.title,
    brand: garment.brand,
    retailer: garment.retailer,
    productUrl: garment.productUrl,
    price: garment.price,
    category: garment.category,
    images: [
      {
        url: mediaUrl(garment.imageUrl),
        score: 10,
        width: 0,
        height: 0,
        alt: garment.title,
        onModel: true,
        reasons: ['already in Your Hanger'],
      },
    ],
    suggestedIndex: 0,
    lowerBodyWarning: false,
  };
}

function Shell({
  children,
  health,
  person,
  onChangePhoto,
  nav,
}: {
  children: React.ReactNode;
  health: Health | null;
  person?: Person | null;
  onChangePhoto?: () => void;
  nav?: React.ReactNode;
}) {
  return (
    <VStack height="100%" gap={0}>
      <HStack
        paddingInline={4}
        paddingBlock={3}
        vAlign="center"
        justify="between">
        <Heading level={1} display="inline">
          <Text type="display-3">Hanger</Text>
        </Heading>
        <HStack gap={2} vAlign="center">
          {health?.mockMode && <Badge variant="neutral" label="Sample data" />}
          {person && onChangePhoto && (
            <button
              type="button"
              onClick={onChangePhoto}
              title="Change your photo"
              aria-label="Change your photo"
              className="h-8 w-8 overflow-hidden rounded-full"
              style={{
                border: '1px solid var(--color-border-emphasized)',
                backgroundColor: 'var(--color-background-muted)',
                cursor: 'pointer',
                padding: 0,
              }}>
              <img
                src={mediaUrl(person.photoUrl)}
                alt=""
                className="h-full w-full"
                style={{objectFit: 'cover', objectPosition: 'top'}}
              />
            </button>
          )}
        </HStack>
      </HStack>

      <VStack height="100%" gap={0} isScrollable>
        {children}
      </VStack>

      {nav}
    </VStack>
  );
}

function Nav({tab, onChange}: {tab: Tab; onChange: (t: Tab) => void}) {
  return (
    <HStack
      paddingInline={3}
      paddingBlock={3}
      justify="center">
      <SegmentedControl
        label="Sections"
        value={tab}
        onChange={(v) => onChange(v as Tab)}
        layout="fill"
        size="md">
        <SegmentedControlItem value="tryon" label="Try on" />
        <SegmentedControlItem value="hanger" label="Your Hanger" />
        <SegmentedControlItem value="outfits" label="Outfits" />
      </SegmentedControl>
    </HStack>
  );
}
