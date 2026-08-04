import {useCallback, useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Banner} from '@astryxdesign/core/Banner';
import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core/Divider';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {api, mediaUrl} from '../api';
import {GarmentCard} from '../components/GarmentCard';
import {OutfitSlotRow} from '../components/OutfitSlot';
import {BeforeAfter} from '../components/BeforeAfter';
import {ErrorNote} from '../components/ErrorNote';
import {formatAmount, formatPrice} from '../format';
import {
  SLOT_CATEGORIES,
  SLOT_LABELS,
  SLOT_ORDER,
  type Garment,
  type Outfit,
  type OutfitSlot,
  type Person,
} from '../../shared/types';

type Filled = Partial<Record<OutfitSlot, Garment>>;

export function OutfitBuilder({
  person,
  initial,
  onDone,
}: {
  person: Person;
  initial?: Filled;
  onDone: () => void;
}) {
  const [wardrobe, setWardrobe] = useState<Garment[] | null>(null);
  const [filled, setFilled] = useState<Filled>(initial ?? {});
  const [picking, setPicking] = useState<OutfitSlot | null>(null);
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    api.listGarments().then(setWardrobe).catch(setError);
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  const chosen = SLOT_ORDER.filter((slot) => filled[slot]);
  const hasFullBody = chosen.some(
    (slot) => filled[slot]?.category === 'full_body',
  );

  const put = useCallback(
    (slot: OutfitSlot, garment: Garment) => {
      setFilled((current) => ({...current, [slot]: garment}));
      setPicking(null);
      setOutfit(null);
    },
    [],
  );

  function putById(slot: OutfitSlot, garmentId: string) {
    const garment = wardrobe?.find((g) => g.id === garmentId);
    if (!garment) return;
    if (!SLOT_CATEGORIES[slot].includes(garment.category)) {
      setError(
        new Error(
          `A ${garment.category.replace('_', ' ')} piece doesn't go in the ${SLOT_LABELS[
            slot
          ].toLowerCase()} slot.`,
        ),
      );
      return;
    }
    setError(null);
    put(slot, garment);
  }

  /** Tapping a card drops it in the first slot that will take it. */
  function autoPlace(garment: Garment) {
    const slot = SLOT_ORDER.find(
      (s) => SLOT_CATEGORIES[s].includes(garment.category) && !filled[s],
    );
    if (slot) {
      put(slot, garment);
      return;
    }
    const fallback = SLOT_ORDER.find((s) =>
      SLOT_CATEGORIES[s].includes(garment.category),
    );
    if (fallback) put(fallback, garment);
  }

  async function build() {
    setError(null);
    setRunning(true);
    try {
      const items = chosen.map((slot) => ({
        garmentId: filled[slot]!.id,
        slot,
      }));
      const created = await api.createOutfit(items);
      poll(created.outfitId);
    } catch (e) {
      setError(e);
      setRunning(false);
    }
  }

  function poll(id: string) {
    pollTimer.current = window.setTimeout(async () => {
      try {
        const next = await api.getOutfit(id);
        setOutfit(next);
        if (next.status === 'running' || next.status === 'pending') {
          poll(id);
          return;
        }
        setRunning(false);
      } catch (e) {
        setError(e);
        setRunning(false);
      }
    }, 1200);
  }

  if (picking) {
    return (
      <Picker
        slot={picking}
        wardrobe={wardrobe ?? []}
        onPick={(garment) => put(picking, garment)}
        onCancel={() => setPicking(null)}
      />
    );
  }

  if (outfit && outfit.status === 'success' && outfit.resultUrl) {
    return (
      <Finished
        outfit={outfit}
        person={person}
        onEdit={() => setOutfit(null)}
        onDone={onDone}
      />
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Build an outfit</Heading>
        <Text type="supporting">
          Mix pieces from different shops. We fit them one at a time, in order.
        </Text>
      </VStack>

      <Card padding={2}>
        <VStack gap={0}>
          {SLOT_ORDER.map((slot, index) => (
            <div key={slot}>
              {index > 0 && <Divider />}
              <OutfitSlotRow
                slot={slot}
                garment={filled[slot] ?? null}
                isTarget
                onDrop={(id) => putById(slot, id)}
                onClear={() =>
                  setFilled((current) => {
                    const next = {...current};
                    delete next[slot];
                    return next;
                  })
                }
                onPick={() => setPicking(slot)}
              />
            </div>
          ))}
        </VStack>
      </Card>

      {hasFullBody && (filled.top || filled.bottom) && (
        <Banner
          status="info"
          title="A full-body piece takes the whole look"
          description="We'll fit the dress or jumpsuit and leave the top and bottom out."
        />
      )}

      {error != null && (
        <ErrorNote
          error={error}
          title="That didn't work"
          onDismiss={() => setError(null)}
          onAction={() => setError(null)}
          actionLabel="Got it"
        />
      )}

      {outfit && outfit.status === 'error' && (
        <ErrorNote
          error={new Error(outfit.message ?? 'We could not build that outfit.')}
          title="We couldn't build that"
          actionLabel="Try again"
          onAction={build}
        />
      )}

      {running ? (
        <Card variant="muted">
          <VStack gap={2}>
            <Text type="label">
              {outfit?.progress.label || 'Getting started…'}
            </Text>
            <ProgressBar
              label="Building the outfit"
              isLabelHidden
              value={outfit ? outfit.progress.step : 0}
              max={Math.max(1, outfit?.progress.of ?? chosen.length)}
            />
            <Text type="supporting" size="3xs">
              Step {outfit?.progress.step ?? 0} of{' '}
              {outfit?.progress.of ?? chosen.length}. Each piece is fitted onto
              the last result, so this takes a moment.
            </Text>
          </VStack>
        </Card>
      ) : (
        <Button
          label={
            chosen.length === 0
              ? 'Add a piece to start'
              : `Put it together (${chosen.length})`
          }
          variant="primary"
          isDisabled={chosen.length === 0}
          onClick={build}
        />
      )}

      <Divider label="Your Hanger" />

      {wardrobe && wardrobe.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {wardrobe.map((garment) => (
            <GarmentCard
              key={garment.id}
              garment={garment}
              onClick={() => autoPlace(garment)}
              isSelected={chosen.some((slot) => filled[slot]?.id === garment.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          isCompact
          title="Nothing to build with yet"
          description="Hang a few pieces first, then combine them here."
        />
      )}
    </VStack>
  );
}

function Picker({
  slot,
  wardrobe,
  onPick,
  onCancel,
}: {
  slot: OutfitSlot;
  wardrobe: Garment[];
  onPick: (garment: Garment) => void;
  onCancel: () => void;
}) {
  const eligible = wardrobe.filter((g) =>
    SLOT_CATEGORIES[slot].includes(g.category),
  );

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Choose a {SLOT_LABELS[slot].toLowerCase()}</Heading>
        <Text type="supporting">
          {eligible.length} {eligible.length === 1 ? 'piece' : 'pieces'} in Your
          Hanger fit this slot.
        </Text>
      </VStack>

      {eligible.length === 0 ? (
        <EmptyState
          title={`No ${SLOT_LABELS[slot].toLowerCase()} yet`}
          description="Try one on from a shop and tap Hang it, then come back."
          actions={<Button label="Back" variant="secondary" onClick={onCancel} />}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {eligible.map((garment) => (
              <GarmentCard
                key={garment.id}
                garment={garment}
                isDraggable={false}
                actionLabel="Use"
                onClick={() => onPick(garment)}
              />
            ))}
          </div>
          <Button label="Back" variant="ghost" onClick={onCancel} />
        </>
      )}
    </VStack>
  );
}

function Finished({
  outfit,
  person,
  onEdit,
  onDone,
}: {
  outfit: Outfit;
  person: Person;
  onEdit: () => void;
  onDone: () => void;
}) {
  const worn = outfit.items.filter((item) => !item.skipped);

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>{outfit.name ?? 'Your outfit'}</Heading>
        <Text type="supporting">
          {worn.length} pieces from{' '}
          {new Set(worn.map((i) => i.garment.retailer)).size} shops, on you.
        </Text>
      </VStack>

      <BeforeAfter
        beforeUrl={mediaUrl(person.photoUrl)}
        afterUrl={mediaUrl(outfit.resultUrl!)}
        alt="Your outfit"
      />

      {outfit.partialNote && (
        <Banner
          status="warning"
          title="Not everything made it"
          description={outfit.partialNote}
        />
      )}

      <Card padding={3}>
        <VStack gap={3}>
          <Text type="label">What you're wearing</Text>
          {worn.map((item) => (
            <HStack key={item.slot} gap={2} vAlign="center" justify="between">
              <VStack gap={0} width="100%">
                <Text type="supporting" size="3xs" color="primary" maxLines={1}>
                  {item.garment.title}
                </Text>
                <Text type="supporting" size="3xs">
                  {SLOT_LABELS[item.slot]} · {item.garment.retailer}
                </Text>
              </VStack>
              <HStack gap={2} vAlign="center">
                {item.garment.price && (
                  <Text type="supporting" size="3xs" color="primary">
                    {formatPrice(item.garment.price)}
                  </Text>
                )}
                <Button
                  label="View"
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(item.garment.productUrl, '_blank')}
                />
              </HStack>
            </HStack>
          ))}

          {outfit.items.some((i) => i.skipped) && (
            <Text type="supporting" size="3xs">
              Left out:{' '}
              {outfit.items
                .filter((i) => i.skipped)
                .map((i) => i.garment.title)
                .join(', ')}
            </Text>
          )}

          {outfit.total && (
            <>
              <Divider />
              <HStack justify="between" vAlign="center">
                <Text type="label">Total</Text>
                <Badge
                  variant="neutral"
                  label={formatAmount(outfit.total.amount, outfit.total.currency)}
                />
              </HStack>
            </>
          )}
        </VStack>
      </Card>

      <VStack gap={2}>
        <Button label="Change something" variant="secondary" onClick={onEdit} />
        <Button label="Done" variant="primary" onClick={onDone} />
      </VStack>
    </VStack>
  );
}
