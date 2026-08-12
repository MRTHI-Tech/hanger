import {useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Spinner} from '@astryxdesign/core/Spinner';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {api, mediaUrl} from '@hanger/shared/api';
import {formatPrice} from '@hanger/shared/format';
import {
  CATEGORY_LABELS,
  isOwned,
  type Garment,
  type GarmentCategory,
} from '@hanger/shared/types';
import {GarmentCard} from '../components/GarmentCard';
import {ErrorNote} from '../components/ErrorNote';
import {Sheet} from '../components/Sheet';
import {Later} from '../components/Later';
import {FilterChip} from '../components/FilterChip';

/**
 * Your Hanger on the phone: everything kept, from every shop. Same content as
 * the panel's, same cross-retailer point — read-only until Phase 5 gives the
 * phone something to add.
 */
export function Hanger({onAdd}: {onAdd: () => void}) {
  const [garments, setGarments] = useState<Garment[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<GarmentCategory | 'all'>('all');
  const [selected, setSelected] = useState<Garment | null>(null);

  async function load() {
    setError(null);
    try {
      setGarments(await api.listGarments());
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error != null) {
    return (
      <VStack padding={4}>
        <ErrorNote error={error} title="Couldn't open Your Hanger" onAction={load} />
      </VStack>
    );
  }

  if (!garments) {
    return (
      <VStack padding={4} vAlign="center" hAlign="center" height="50%">
        <Spinner label="Opening Your Hanger" />
      </VStack>
    );
  }

  if (garments.length === 0) {
    return (
      <VStack padding={4} height="100%" gap={4} vAlign="center">
        <EmptyState
          title="Nothing on the hanger yet"
          description="Try something on from any shop on your laptop and tap Hang it. Whatever you keep there shows up here."
          actions={
            <Button label="Add from your phone" variant="secondary" onClick={onAdd} />
          }
        />
      </VStack>
    );
  }

  const retailers = new Set(
    garments.map((g) => g.retailer).filter((r): r is string => r != null),
  );
  const ownedCount = garments.filter(isOwned).length;
  const categories = [...new Set(garments.map((g) => g.category))];
  const shown =
    filter === 'all' ? garments : garments.filter((g) => g.category === filter);

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Your Hanger</Heading>
        <Text type="supporting">
          {summarise(garments.length, retailers.size, ownedCount)}
        </Text>
      </VStack>

      {categories.length > 1 && (
        <HStack gap={1.5} isScrollable>
          <FilterChip
            label="Everything"
            isActive={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          {categories.map((category) => (
            <FilterChip
              key={category}
              label={CATEGORY_LABELS[category]}
              isActive={filter === category}
              onClick={() => setFilter(category)}
            />
          ))}
        </HStack>
      )}

      <div className="grid grid-cols-2 gap-3">
        {shown.map((garment) => (
          <GarmentCard
            key={garment.id}
            garment={garment}
            onClick={() => setSelected(garment)}
          />
        ))}
      </div>

      <Sheet
        title={selected?.title ?? 'This piece'}
        isOpen={selected != null}
        onClose={() => setSelected(null)}>
        {selected && <GarmentDetail garment={selected} />}
      </Sheet>
    </VStack>
  );
}

/**
 * One piece, close up. Opening the shop's page is the only thing the phone can
 * honestly do with it today — everything else needs a try-on, and a try-on
 * spends credits, which is Phase 6.
 */
function GarmentDetail({garment}: {garment: Garment}) {
  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="start">
        <img
          src={mediaUrl(garment.imageUrl)}
          alt=""
          className="shrink-0 overflow-hidden rounded-xl"
          style={{
            width: '5.5rem',
            aspectRatio: '3 / 4',
            objectFit: 'cover',
            backgroundColor: 'var(--color-background-muted)',
            border: '1px solid var(--color-border)',
          }}
        />
        <VStack gap={0.5}>
          <Text type="label" maxLines={3}>
            {garment.title}
          </Text>
          <Text type="supporting" maxLines={2}>
            {describe(garment)}
          </Text>
        </VStack>
      </HStack>

      <VStack gap={2}>
        {!isOwned(garment) && garment.productUrl && (
          <Button
            label="Open the shop's page"
            variant="secondary"
            onClick={() => window.open(garment.productUrl!, '_blank')}
          />
        )}
        <Later phase="Phase 6">Try this on, and build it into an outfit</Later>
      </VStack>
    </VStack>
  );
}

/** Category, shop and price on one line, skipping whatever we don't know. */
function describe(garment: Garment): string {
  return [
    CATEGORY_LABELS[garment.category],
    garment.retailer ?? 'Yours',
    garment.price ? formatPrice(garment.price) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The line under the heading. The cross-retailer mix is the point, so it's what
 * gets counted — and once your own wardrobe is in here, that it spans both is
 * the more interesting fact.
 */
function summarise(total: number, shops: number, owned: number): string {
  const pieces = `${total} ${total === 1 ? 'piece' : 'pieces'}`;
  if (shops === 0) return `${pieces} from your own wardrobe`;
  const fromShops = `${shops} ${shops === 1 ? 'shop' : 'shops'}`;
  if (owned === 0) return `${pieces} from ${fromShops}`;
  return `${pieces} — ${fromShops} and ${owned} of your own`;
}
