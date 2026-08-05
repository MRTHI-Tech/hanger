import {useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Spinner} from '@astryxdesign/core/Spinner';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {api, HangerError, mediaUrl} from '../api';
import {BeforeAfter} from '../components/BeforeAfter';
import {ErrorNote} from '../components/ErrorNote';
import {formatAmount, formatPrice} from '../format';
import type {
  Alternative,
  AlternativesResponse,
  Garment,
  Person,
} from '../../shared/types';

/**
 * The same garment, cheaper elsewhere — and every result is something you can
 * put on your own photo without leaving the panel (§10).
 */
export function Alternatives({
  garment,
  person,
  onBack,
  onHung,
}: {
  garment: Garment;
  person: Person;
  onBack: () => void;
  onHung: () => void;
}) {
  const [data, setData] = useState<AlternativesResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [trying, setTrying] = useState<string | null>(null);
  const [result, setResult] = useState<{
    alternative: Alternative;
    resultUrl: string;
    note?: string;
  } | null>(null);
  const pollTimer = useRef<number | null>(null);

  async function load(refresh = false) {
    setError(null);
    setData(null);
    try {
      setData(await api.alternatives(garment.id, refresh));
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, [garment.id]);

  async function tryOn(alternative: Alternative) {
    setError(null);
    setTrying(alternative.id);
    try {
      const saved = await api.saveAlternative(alternative.id);
      if (!saved.tryonId) {
        setTrying(null);
        onHung();
        return;
      }
      poll(saved.tryonId, alternative, saved.note);
    } catch (e) {
      setError(e);
      setTrying(null);
    }
  }

  function poll(tryonId: string, alternative: Alternative, note?: string) {
    pollTimer.current = window.setTimeout(async () => {
      try {
        const status = await api.getTryOn(tryonId);
        if (status.status === 'success' && status.resultUrl) {
          setResult({
            alternative,
            resultUrl: mediaUrl(status.resultUrl),
            note,
          });
          setTrying(null);
          return;
        }
        if (status.status === 'error') {
          setError(
            new HangerError(
              status.errorCode ?? 'unknown',
              status.message ?? 'That did not work.',
              status.hint,
            ),
          );
          setTrying(null);
          return;
        }
        poll(tryonId, alternative, note);
      } catch (e) {
        setError(e);
        setTrying(null);
      }
    }, 1400);
  }

  if (result) {
    return (
      <VStack padding={4} gap={4}>
        <VStack gap={1}>
          <Heading level={2} maxLines={2}>
            {result.alternative.title}
          </Heading>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="supporting">{result.alternative.source}</Text>
            {result.alternative.price && (
              <Badge variant="neutral" label={formatPrice(result.alternative.price)} />
            )}
            {result.alternative.savingsVsOriginal != null &&
              result.alternative.savingsVsOriginal > 0 && (
                <Badge
                  variant="success"
                  label={`${formatAmount(
                    result.alternative.savingsVsOriginal,
                    result.alternative.price?.currency ?? 'GBP',
                  )} cheaper`}
                />
              )}
            {result.alternative.price && !result.alternative.priceComparable && (
              <Text type="supporting" size="3xs">
                priced in {result.alternative.price.currency}
              </Text>
            )}
          </HStack>
        </VStack>

        <BeforeAfter
          beforeUrl={mediaUrl(person.photoUrl)}
          afterUrl={result.resultUrl}
          alt={`You in ${result.alternative.title}`}
        />

        {result.note && <Text type="supporting" size="3xs">{result.note}</Text>}

        <VStack gap={2}>
          <Button
            label="Open the shop's page"
            variant="primary"
            onClick={() => window.open(result.alternative.link, '_blank')}
          />
          <Button
            label="It's in Your Hanger"
            variant="secondary"
            onClick={onHung}
          />
          <Button label="Back to the list" variant="ghost" onClick={() => setResult(null)} />
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Cheaper elsewhere?</Heading>
        <Text type="supporting" maxLines={2}>
          Looking for {garment.title} beyond {garment.retailer}.
        </Text>
      </VStack>

      {error != null && (
        <ErrorNote
          error={error}
          title="That search didn't work"
          actionLabel="Try again"
          onAction={() => void load(true)}
        />
      )}

      {!data && error == null && (
        <VStack padding={6} vAlign="center" hAlign="center">
          <Spinner label="Searching other shops" />
        </VStack>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title="Nothing else turned up"
          description="We couldn't find this anywhere else right now. It might be exclusive to this shop."
          actions={<Button label="Search again" variant="secondary" onClick={() => void load(true)} />}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          {data.usedTextFallback && (
            <Banner
              status="info"
              title="Matched on the description"
              description="We couldn't match the photo, so these come from searching what it's called. Check they're the same thing."
            />
          )}

          <Text type="supporting" size="3xs">
            {data.items.length} found, cheapest first
            {data.fromCache ? ' · from earlier today' : ''}
          </Text>

          <VStack gap={3}>
            {data.items.map((item) => (
              <AlternativeCard
                key={item.id}
                item={item}
                isBusy={trying === item.id}
                isDisabled={trying !== null && trying !== item.id}
                onTryOn={() => tryOn(item)}
              />
            ))}
          </VStack>
        </>
      )}

      <Button label="Back" variant="ghost" onClick={onBack} />
    </VStack>
  );
}

/**
 * Search-result thumbnails are hosted by someone else and go missing often
 * enough to plan for. A quiet placeholder beats a broken-image icon.
 */
function Thumb({url}: {url: string | null}) {
  const [failed, setFailed] = useState(false);
  const show = url && !failed;

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
      style={{
        width: 68,
        height: 88,
        backgroundColor: 'var(--color-background-muted)',
        border: '1px solid var(--color-border)',
      }}>
      {show ? (
        <img
          src={url}
          alt=""
          className="h-full w-full"
          style={{objectFit: 'cover'}}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text type="supporting" size="3xs">
          No photo
        </Text>
      )}
    </div>
  );
}

function AlternativeCard({
  item,
  isBusy,
  isDisabled,
  onTryOn,
}: {
  item: Alternative;
  isBusy: boolean;
  isDisabled: boolean;
  onTryOn: () => void;
}) {
  const saves = item.savingsVsOriginal;

  return (
    <Card padding={3}>
      <HStack gap={3}>
        <Thumb url={item.thumbnailUrl} />

        <VStack gap={2} width="100%">
          <VStack gap={0.5}>
            <Text type="supporting" size="3xs" color="primary" maxLines={2}>
              {item.title}
            </Text>
            <Text type="supporting" size="3xs">
              {item.source}
              {item.inStock === false ? ' · out of stock' : ''}
            </Text>
          </VStack>

          <HStack gap={2} vAlign="center" wrap="wrap">
            {item.price && (
              <Text type="label">{formatPrice(item.price)}</Text>
            )}
            {saves != null && saves > 0 && (
              <Badge
                variant="success"
                label={`${formatAmount(saves, item.price?.currency ?? 'GBP')} cheaper`}
              />
            )}
            {saves != null && saves < 0 && (
              <Text type="supporting" size="3xs">
                {formatAmount(-saves, item.price?.currency ?? 'GBP')} more
              </Text>
            )}
            {item.price && !item.priceComparable && (
              <Text type="supporting" size="3xs">
                can't compare — priced in {item.price.currency}
              </Text>
            )}
          </HStack>

          <HStack gap={2}>
            <Button
              label={isBusy ? 'Fitting…' : 'Try this on'}
              variant="secondary"
              size="sm"
              isLoading={isBusy}
              isDisabled={isDisabled}
              onClick={onTryOn}
            />
            <Button
              label="View"
              variant="ghost"
              size="sm"
              onClick={() => window.open(item.link, '_blank')}
            />
          </HStack>
        </VStack>
      </HStack>
    </Card>
  );
}
