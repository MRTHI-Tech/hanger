import {useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Spinner} from '@astryxdesign/core/Spinner';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Badge} from '@astryxdesign/core/Badge';
import {api, mediaUrl} from '../api';
import {ErrorNote} from '../components/ErrorNote';
import {formatAmount} from '../format';
import type {Outfit} from '../../shared/types';

/** Looks you've already put together, newest first. */
export function Outfits({
  onBuild,
  onOpen,
  refreshKey,
}: {
  onBuild: () => void;
  onOpen: (outfit: Outfit) => void;
  refreshKey: number;
}) {
  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setError(null);
    try {
      setOutfits(await api.listOutfits());
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void load();
  }, [refreshKey]);

  if (error != null) {
    return (
      <VStack padding={4}>
        <ErrorNote error={error} title="Couldn't load your outfits" onAction={load} />
      </VStack>
    );
  }

  if (!outfits) {
    return (
      <VStack padding={4} vAlign="center" hAlign="center" height="50%">
        <Spinner label="Loading your outfits" />
      </VStack>
    );
  }

  if (outfits.length === 0) {
    return (
      <VStack padding={4} height="100%" vAlign="center">
        <EmptyState
          title="No outfits yet"
          description="Put a top from one shop together with trousers from another and see the whole thing on you."
          actions={<Button label="Build an outfit" variant="primary" onClick={onBuild} />}
        />
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Your outfits</Heading>
        <Text type="supporting">
          {outfits.length} {outfits.length === 1 ? 'look' : 'looks'}
        </Text>
      </VStack>

      <div className="grid grid-cols-2 gap-3">
        {outfits.map((outfit) => (
          <VStack key={outfit.id} gap={1}>
            <button
              type="button"
              onClick={() => onOpen(outfit)}
              aria-label={`Open ${outfit.name ?? 'this outfit'}`}
              className="w-full overflow-hidden rounded-xl"
              style={{
                aspectRatio: '3 / 4',
                padding: 0,
                cursor: 'pointer',
                backgroundColor: 'var(--color-background-muted)',
                border: '1px solid var(--color-border)',
              }}>
              {outfit.resultUrl ? (
                <img
                  src={mediaUrl(outfit.resultUrl)}
                  alt=""
                  className="h-full w-full"
                  style={{objectFit: 'cover'}}
                />
              ) : (
                <VStack vAlign="center" hAlign="center" height="100%">
                  <Text type="supporting">
                    {outfit.status === 'error' ? 'Did not finish' : 'Working…'}
                  </Text>
                </VStack>
              )}
            </button>
            <HStack justify="between" vAlign="center" gap={1}>
              <Text type="supporting" maxLines={1}>
                {outfit.items.length} pieces
              </Text>
              {outfit.total && (
                <Badge
                  variant="neutral"
                  label={formatAmount(outfit.total.amount, outfit.total.currency)}
                />
              )}
            </HStack>
          </VStack>
        ))}
      </div>

      <Button label="Build another" variant="primary" onClick={onBuild} />
    </VStack>
  );
}
