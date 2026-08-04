import {useEffect, useMemo, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {api, HangerError, mediaUrl} from '../api';
import {dataUrlToBlob, fetchImageViaTab} from '../bridge';
import {ImageStrip} from '../components/ImageStrip';
import {BeforeAfter} from '../components/BeforeAfter';
import {ErrorNote} from '../components/ErrorNote';
import {
  CATEGORY_LABELS,
  isTryOnable,
  type Garment,
  type GarmentCategory,
  type Person,
  type ScrapedProduct,
} from '../../shared/types';
import {formatPrice} from '../format';

type Phase = 'idle' | 'fetching' | 'running' | 'done' | 'failed';

const CATEGORY_OPTIONS = (
  Object.keys(CATEGORY_LABELS) as GarmentCategory[]
).map((value) => ({value, label: CATEGORY_LABELS[value]}));

export function TryOn({
  product,
  tabId,
  person,
  onHung,
  onClearProduct,
  onOpenHanger,
  onFindAlternatives,
}: {
  product: ScrapedProduct | null;
  tabId: number | null;
  person: Person;
  onHung: (garment: Garment) => void;
  onClearProduct: () => void;
  onOpenHanger: () => void;
  onFindAlternatives: (garment: Garment) => void;
}) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [category, setCategory] = useState<GarmentCategory>(
    product?.category ?? 'upper_body',
  );
  const [changeShoes, setChangeShoes] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<unknown>(null);
  const [garment, setGarment] = useState<Garment | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [hung, setHung] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    setSelectedImage(product?.suggestedIndex ?? 0);
    setCategory(product?.category ?? 'upper_body');
    setPhase('idle');
    setError(null);
    setGarment(null);
    setResultUrl(null);
    setHung(false);
  }, [product]);

  useEffect(
    () => () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    },
    [],
  );

  const showShoesToggle = category === 'lower_body' || category === 'full_body';

  const warning = useMemo(() => {
    if (!product) return undefined;
    const current = product.images[selectedImage];
    const needsOnModel = category === 'lower_body' || category === 'full_body';
    if (!needsOnModel) return undefined;
    if (current?.onModel) return undefined;
    // §2.3: a flat-lay of trousers produces garbage, so say so plainly.
    return 'Trousers and dresses need a photo of someone wearing them — pick one showing the full leg.';
  }, [product, selectedImage, category]);

  async function run() {
    if (!product) return;
    const image = product.images[selectedImage];
    if (!image) return;

    setError(null);
    setPhase('fetching');
    setElapsed(0);

    try {
      if (tabId == null) {
        throw new HangerError(
          'no_tab',
          'Open the product page again so Hanger can read the photo from it.',
        );
      }

      // §2.2 — bytes come out of the page, never a URL handed to the API.
      const fetched = await fetchImageViaTab(tabId, image.url);
      const blob = dataUrlToBlob(fetched.dataUrl);

      const saved = await api.saveGarment(blob, {
        title: product.title,
        brand: product.brand,
        retailer: product.retailer,
        productUrl: product.productUrl,
        price: product.price,
        category,
        sourceImageUrl: image.url,
      });
      setGarment(saved);

      if (!isTryOnable(category)) {
        // Bags, hats and scarves can be kept but not fitted (§2.4, §11).
        setPhase('done');
        setResultUrl(null);
        return;
      }

      const started = await api.startTryOn(saved.id, changeShoes);
      setCached(Boolean(started.cached));

      if (started.status === 'success' && started.resultUrl) {
        setResultUrl(mediaUrl(started.resultUrl));
        setPhase('done');
        return;
      }

      setPhase('running');
      poll(started.id, Date.now());
    } catch (e) {
      setError(e);
      setPhase('failed');
    }
  }

  function poll(tryonId: string, startedAt: number) {
    pollTimer.current = window.setTimeout(async () => {
      try {
        const result = await api.getTryOn(tryonId);
        setElapsed(Date.now() - startedAt);

        if (result.status === 'success' && result.resultUrl) {
          setResultUrl(mediaUrl(result.resultUrl));
          setPhase('done');
          return;
        }
        if (result.status === 'error') {
          setError(
            new HangerError(
              result.errorCode ?? 'unknown',
              result.message ?? 'That did not work.',
              result.hint,
            ),
          );
          setPhase('failed');
          return;
        }
        poll(tryonId, startedAt);
      } catch (e) {
        setError(e);
        setPhase('failed');
      }
    }, 1500);
  }

  async function hangIt() {
    if (!garment) return;
    try {
      const updated = await api.hangGarment(garment.id);
      setGarment(updated);
      setHung(true);
      onHung(updated);
    } catch (e) {
      setError(e);
    }
  }

  if (!product) {
    return (
      <VStack padding={4} gap={4} height="100%" vAlign="center">
        <EmptyState
          title="Open something you like"
          description="On any shop's product page, tap the Try this on button at the bottom right. Hanger reads the page and fits it to your photo."
          actions={
            <Button label="See Your Hanger" variant="secondary" onClick={onOpenHanger} />
          }
        />
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2} maxLines={2}>
          {product.title}
        </Heading>
        <HStack gap={2} vAlign="center" wrap="wrap">
          {product.brand && <Text type="supporting">{product.brand}</Text>}
          <Text type="supporting">·</Text>
          <Text type="supporting">{product.retailer}</Text>
          {product.price && (
            <Badge variant="neutral" label={formatPrice(product.price)} />
          )}
        </HStack>
      </VStack>

      {phase === 'done' && resultUrl ? (
        <Result
          resultUrl={resultUrl}
          beforeUrl={mediaUrl(person.photoUrl)}
          cached={cached}
          hung={hung}
          title={product.title}
          onHang={hangIt}
          onAgain={() => {
            setPhase('idle');
            setResultUrl(null);
          }}
          onOpenHanger={onOpenHanger}
          onFindAlternatives={
            garment ? () => onFindAlternatives(garment) : undefined
          }
        />
      ) : phase === 'done' && !resultUrl ? (
        <Banner
          status="info"
          title="Kept, not fitted"
          description={`We can't fit a ${CATEGORY_LABELS[
            category
          ].toLowerCase()} onto a photo, but it's in Your Hanger with its price and link.`}
          endContent={
            <Button label="Hang it" variant="secondary" size="sm" onClick={hangIt} />
          }
        />
      ) : (
        <>
          <ImageStrip
            images={product.images}
            selected={selectedImage}
            onSelect={setSelectedImage}
            warning={warning}
          />

          <VStack gap={3}>
            <Selector
              label="What is it?"
              description="We guessed from the page. Change it if we got it wrong."
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(v) => setCategory(v as GarmentCategory)}
              width="100%"
            />

            {showShoesToggle && (
              <Switch
                label="Swap the shoes too"
                description="Only affects full-length looks."
                value={changeShoes}
                onChange={setChangeShoes}
              />
            )}
          </VStack>

          {error != null && (
            <ErrorNote
              error={error}
              title="We couldn't fit that"
              onAction={() => {
                setError(null);
                setPhase('idle');
              }}
              actionLabel={
                error instanceof HangerError && error.hint ? error.hint : 'Try again'
              }
            />
          )}

          {phase === 'fetching' || phase === 'running' ? (
            <Progress phase={phase} elapsed={elapsed} title={product.title} />
          ) : (
            <VStack gap={2}>
              <Button
                label={isTryOnable(category) ? 'Try this on' : 'Keep it in Your Hanger'}
                variant="primary"
                onClick={run}
              />
              <Button label="Not this one" variant="ghost" onClick={onClearProduct} />
            </VStack>
          )}
        </>
      )}
    </VStack>
  );
}

function Progress({
  phase,
  elapsed,
  title,
}: {
  phase: Phase;
  elapsed: number;
  title: string;
}) {
  const seconds = Math.round(elapsed / 1000);
  const label =
    phase === 'fetching'
      ? 'Getting the photo from the shop'
      : seconds < 8
        ? `Fitting the ${shortTitle(title)}`
        : seconds < 20
          ? 'Getting the drape right'
          : 'Nearly there';

  return (
    <Card variant="muted">
      <VStack gap={2}>
        <Text type="label">{label}</Text>
        <ProgressBar label={label} isLabelHidden isIndeterminate />
        <Text type="supporting" size="3xs">
          This usually takes 15 to 40 seconds.
        </Text>
      </VStack>
    </Card>
  );
}

function shortTitle(title: string): string {
  const words = title.split(/\s+/).filter((w) => w.length > 2);
  return (words[words.length - 1] ?? 'garment').toLowerCase();
}

function Result({
  resultUrl,
  beforeUrl,
  cached,
  hung,
  title,
  onHang,
  onAgain,
  onOpenHanger,
  onFindAlternatives,
}: {
  resultUrl: string;
  beforeUrl: string;
  cached: boolean;
  hung: boolean;
  title: string;
  onHang: () => void;
  onAgain: () => void;
  onOpenHanger: () => void;
  onFindAlternatives?: () => void;
}) {
  return (
    <VStack gap={3}>
      <BeforeAfter beforeUrl={beforeUrl} afterUrl={resultUrl} alt={`You in ${title}`} />

      {cached && (
        <Text type="supporting" size="3xs">
          You'd already tried this one on, so we reused it.
        </Text>
      )}

      <VStack gap={2}>
        {hung ? (
          <Button label="See Your Hanger" variant="primary" onClick={onOpenHanger} />
        ) : (
          <Button label="Hang it" variant="primary" onClick={onHang} />
        )}
        {onFindAlternatives && (
          <Button
            label="Find it cheaper"
            variant="secondary"
            onClick={onFindAlternatives}
          />
        )}
        <Button label="Try a different photo" variant="ghost" onClick={onAgain} />
      </VStack>
    </VStack>
  );
}
