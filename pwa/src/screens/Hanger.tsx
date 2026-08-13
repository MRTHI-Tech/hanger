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
  isTryOnable,
  type Garment,
  type GarmentCategory,
  type TryOnResult,
} from '@hanger/shared/types';
import {GarmentCard} from '../components/GarmentCard';
import {ErrorNote} from '../components/ErrorNote';
import {Sheet} from '../components/Sheet';
import {FilterChip} from '../components/FilterChip';

/**
 * Your Hanger on the phone: everything kept, from every shop, plus whatever you
 * photographed off a shop floor. Same content as the panel's, same
 * cross-retailer point.
 */
export function Hanger({
  onAdd,
  onTryOn,
  hasPhoto,
  onNeedPhoto,
}: {
  onAdd: () => void;
  onTryOn: (garment: Garment) => void;
  /** Nothing can be tried on until there's a photo to try it on to. */
  hasPhoto: boolean;
  onNeedPhoto: () => void;
}) {
  const [garments, setGarments] = useState<Garment[] | null>(null);
  const [tryOns, setTryOns] = useState<TryOnResult[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<GarmentCategory | 'all'>('all');
  const [selected, setSelected] = useState<Garment | null>(null);

  async function load() {
    setError(null);
    try {
      // Try-ons alongside the garments, so opening a piece can show you
      // wearing it. They come back newest first, which is what `wornIn` below
      // relies on — it takes the first match rather than comparing dates.
      const [pieces, results] = await Promise.all([
        api.listGarments(),
        api.listTryOns().catch(() => [] as TryOnResult[]),
      ]);
      setGarments(pieces);
      setTryOns(results);
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
          description="Photograph something you own and it hangs here. So does anything you keep from a shop on your laptop."
          actions={
            <Button label="Photograph something" variant="primary" onClick={onAdd} />
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
        {selected && (
          <GarmentDetail
            garment={selected}
            worn={wornIn(tryOns, selected.id)}
            hasPhoto={hasPhoto}
            onTryOn={() => {
              const piece = selected;
              setSelected(null);
              onTryOn(piece);
            }}
            onNeedPhoto={() => {
              setSelected(null);
              onNeedPhoto();
            }}
          />
        )}
      </Sheet>
    </VStack>
  );
}

/**
 * The most recent time this piece came back on you.
 *
 * `GET /tryon` answers newest first, so the first match is the newest one —
 * no dates compared, and no `createdAt` needed on the wire type.
 */
function wornIn(tryOns: TryOnResult[], garmentId: string): TryOnResult | null {
  return (
    tryOns.find(
      (t) => t.garmentId === garmentId && t.status === 'success' && t.resultUrl,
    ) ?? null
  );
}

/**
 * One piece, close up — and you wearing it, once you have.
 *
 * The result of a try-on lives here rather than in a list of its own. A
 * try-on isn't an event you'd go looking for later; it's a fact about the
 * garment, and the useful question a week afterwards is "what did that look
 * like on me", asked of the piece. It also quietly turns Your Hanger from a
 * grid of product shots into a wardrobe of you in things.
 *
 * Running it again is free when nothing has changed — the server caches on the
 * hash of the two images — so the button stays offered rather than hidden once
 * a result exists.
 */
function GarmentDetail({
  garment,
  worn,
  hasPhoto,
  onTryOn,
  onNeedPhoto,
}: {
  garment: Garment;
  worn: TryOnResult | null;
  hasPhoto: boolean;
  onTryOn: () => void;
  onNeedPhoto: () => void;
}) {
  const tryable = isTryOnable(garment.category);
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

      {worn?.resultUrl && (
        <VStack gap={1}>
          <Text type="supporting">On you</Text>
          <div
            className="w-full overflow-hidden rounded-xl"
            style={{
              backgroundColor: 'var(--color-background-muted)',
              border: '1px solid var(--color-border)',
            }}>
            <img
              src={mediaUrl(worn.resultUrl)}
              alt={`You wearing ${garment.title}`}
              className="block w-full"
              style={{maxHeight: '38vh', objectFit: 'contain'}}
            />
          </div>
        </VStack>
      )}

      <VStack gap={2}>
        {tryable &&
          (hasPhoto ? (
            <Button
              label={worn ? 'Try it on again' : 'Try this on'}
              variant="primary"
              onClick={onTryOn}
            />
          ) : (
            // Not a disabled button: there is something to do about this, and
            // the phone can now do it — so say what, and go there.
            <Button
              label="Add your photo first"
              variant="secondary"
              onClick={onNeedPhoto}
            />
          ))}
        {!isOwned(garment) && garment.productUrl && (
          <Button
            label="Open the shop's page"
            variant="secondary"
            onClick={() => window.open(garment.productUrl!, '_blank')}
          />
        )}
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
