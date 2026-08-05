import {useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Spinner} from '@astryxdesign/core/Spinner';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Badge} from '@astryxdesign/core/Badge';
import {api} from '../api';
import {GarmentCard} from '../components/GarmentCard';
import {ErrorNote} from '../components/ErrorNote';
import {
  CATEGORY_LABELS,
  isOwned,
  type Garment,
  type GarmentCategory,
} from '../../shared/types';

/**
 * Your Hanger: everything kept, from every shop. The cross-retailer mix is the
 * point, so the retailer name sits on every card.
 */
export function Hanger({
  onBuildOutfit,
  onAddOwned,
  onTryOn,
  onFindAlternatives,
  refreshKey,
}: {
  onBuildOutfit: () => void;
  onAddOwned: () => void;
  onTryOn: (garment: Garment) => void;
  onFindAlternatives: (garment: Garment) => void;
  refreshKey: number;
}) {
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
  }, [refreshKey]);

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
          description="Try something on from any shop and tap Hang it. Pieces from different shops sit side by side here — along with what's already in your wardrobe."
          actions={
            <Button
              label="Add something you own"
              variant="secondary"
              onClick={onAddOwned}
            />
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
            isSelected={selected?.id === garment.id}
            onClick={() =>
              setSelected(selected?.id === garment.id ? null : garment)
            }
            onRemove={async () => {
              await api.deleteGarment(garment.id);
              if (selected?.id === garment.id) setSelected(null);
              void load();
            }}
          />
        ))}
      </div>

      {selected && (
        <VStack gap={2}>
          <Text type="label" maxLines={1}>
            {selected.title}
          </Text>
          <HStack gap={2} wrap="wrap">
            <Badge variant="neutral" label={CATEGORY_LABELS[selected.category]} />
            <Badge
              variant="neutral"
              label={selected.retailer ?? 'Yours'}
            />
          </HStack>
          <Button
            label="Try this on again"
            variant="secondary"
            onClick={() => onTryOn(selected)}
          />
          {/* Both of these are about the shop it came from. A piece you own
              came from your own floor: there's nothing to open, and "find it
              cheaper" is the wrong question about something already yours. */}
          {!isOwned(selected) && (
            <>
              <Button
                label="Find it cheaper"
                variant="secondary"
                onClick={() => onFindAlternatives(selected)}
              />
              <Button
                label="Open the shop's page"
                variant="ghost"
                onClick={() => {
                  if (selected.productUrl) {
                    window.open(selected.productUrl, '_blank');
                  }
                }}
              />
            </>
          )}
        </VStack>
      )}

      <VStack gap={2}>
        <Button label="Build an outfit" variant="primary" onClick={onBuildOutfit} />
        <Button
          label="Add something you own"
          variant="secondary"
          onClick={onAddOwned}
        />
      </VStack>
    </VStack>
  );
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

function FilterChip({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="shrink-0 rounded-full px-3 py-1"
      style={{
        border: `1px solid ${
          isActive ? 'var(--color-accent)' : 'var(--color-border)'
        }`,
        backgroundColor: isActive
          ? 'var(--color-accent-muted)'
          : 'transparent',
        color: 'var(--color-text-primary)',
        font: 'inherit',
        fontSize: 'var(--font-size-sm)',
        cursor: 'pointer',
      }}>
      {label}
    </button>
  );
}
