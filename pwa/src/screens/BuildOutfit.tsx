import {useCallback, useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Spinner} from '@astryxdesign/core/Spinner';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {api, HangerError, mediaUrl} from '@hanger/shared/api';
import {
  SLOT_CATEGORIES,
  SLOT_LABELS,
  SLOT_ORDER,
  type Garment,
  type Outfit,
  type OutfitSlot,
} from '@hanger/shared/types';
import {GarmentCard} from '../components/GarmentCard';
import {ErrorNote} from '../components/ErrorNote';
import {Sheet} from '../components/Sheet';
import {usePollWhileVisible} from '../poll';

type Filled = Partial<Record<OutfitSlot, Garment>>;

/**
 * A top from one shop, trousers from another, shoes from a third — in one
 * picture, on you.
 *
 * Slot-first, like the panel's builder: you tap the place in the outfit and
 * then choose something that can go there, rather than choosing clothes and
 * hoping we work out where they belong. `SLOT_CATEGORIES` does the filtering,
 * so the picker for Shoes only ever contains shoes and the question of what a
 * second upper-body piece means — a top or a layer over it — is answered by
 * which row you tapped instead of being guessed at afterwards.
 *
 * The chain takes a few minutes because it is several try-ons in a row, each
 * one wearing the last one's output. `outfit.progress` is the server counting
 * them off, so the wait says which piece it is on rather than spinning.
 */
export function BuildOutfit({
  onBuilt,
  onCancel,
}: {
  onBuilt: (outfit: Outfit) => void;
  onCancel: () => void;
}) {
  const [wardrobe, setWardrobe] = useState<Garment[] | null>(null);
  const [filled, setFilled] = useState<Filled>({});
  const [picking, setPicking] = useState<OutfitSlot | null>(null);
  const [outfitId, setOutfitId] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.listGarments().then(setWardrobe).catch(setError);
  }, []);

  const chosen = SLOT_ORDER.filter((slot) => filled[slot]);

  async function build() {
    setError(null);
    setRunning(true);
    try {
      const created = await api.createOutfit(
        chosen.map((slot) => ({garmentId: filled[slot]!.id, slot})),
      );
      setOutfitId(created.outfitId);
    } catch (e) {
      setError(e);
      setRunning(false);
    }
  }

  usePollWhileVisible(
    useCallback(async () => {
      if (!outfitId) return;
      try {
        const next = await api.getOutfit(outfitId);
        setOutfit(next);
        if (next.status === 'success') {
          setRunning(false);
          onBuilt(next);
          return;
        }
        if (next.status === 'error') {
          setRunning(false);
          setError(
            new HangerError(
              next.errorCode ?? 'unknown',
              next.message ?? "That outfit didn't come together.",
              next.hint,
            ),
          );
        }
      } catch (e) {
        setRunning(false);
        setError(e);
      }
    }, [outfitId, onBuilt]),
    running,
  );

  if (running) {
    const progress = outfit?.progress;
    return (
      <VStack padding={4} gap={4}>
        <VStack gap={1}>
          <Heading level={2}>Putting it together</Heading>
          <Text type="supporting">
            {chosen.length} {chosen.length === 1 ? 'piece' : 'pieces'}, one at a
            time, each worn over the last.
          </Text>
        </VStack>

        <div
          className="w-full overflow-hidden rounded-xl"
          style={{
            backgroundColor: 'var(--color-background-muted)',
            border: '1px solid var(--color-border)',
            aspectRatio: '3 / 4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Spinner label={progress?.label ?? 'Starting'} />
        </div>

        {progress && progress.of > 0 && (
          // Counts the pieces; the spinner above says which one. Passing the
          // server's label to both printed the same sentence twice.
          <ProgressBar
            label={`Piece ${progress.step} of ${progress.of}`}
            value={progress.step}
            max={progress.of}
          />
        )}

        <Card variant="muted">
          <Text type="supporting">
            This one takes a few minutes — it's several try-ons in a row. Lock
            your phone if you like; it carries on without you and the finished
            look will be in Outfits.
          </Text>
        </Card>

        <Button label="Leave it running" variant="ghost" onClick={onCancel} />
      </VStack>
    );
  }

  if (wardrobe && wardrobe.length === 0) {
    return (
      <VStack padding={4} height="100%" gap={4} vAlign="center">
        <EmptyState
          title="Nothing to combine yet"
          description="Hang a few pieces first, then put them together here. Things you already own count."
          actions={<Button label="Back" variant="secondary" onClick={onCancel} />}
        />
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Build an outfit</Heading>
        <Text type="supporting">
          Fill what you want in the look. Anything you leave empty is simply not
          in it.
        </Text>
      </VStack>

      {error != null && (
        <ErrorNote
          error={error}
          title="That didn't work"
          onAction={build}
          actionLabel="Try again"
          onDismiss={() => setError(null)}
        />
      )}

      <VStack gap={2}>
        {SLOT_ORDER.map((slot) => (
          <SlotRow
            key={slot}
            label={SLOT_LABELS[slot]}
            garment={filled[slot]}
            onPick={() => setPicking(slot)}
            onClear={() =>
              setFilled((f) => {
                const next = {...f};
                delete next[slot];
                return next;
              })
            }
          />
        ))}
      </VStack>

      <VStack gap={2}>
        <Button
          label="Put it together"
          variant="primary"
          isDisabled={chosen.length === 0 || !wardrobe}
          onClick={build}
        />
        <Button label="Not now" variant="ghost" onClick={onCancel} />
      </VStack>

      <Sheet
        title={picking ? `Choose a ${SLOT_LABELS[picking].toLowerCase()}` : 'Choose'}
        isOpen={picking != null}
        onClose={() => setPicking(null)}>
        {picking && wardrobe && (
          <SlotPicker
            slot={picking}
            wardrobe={wardrobe}
            onChoose={(garment) => {
              setFilled((f) => ({...f, [picking]: garment}));
              setPicking(null);
            }}
          />
        )}
      </Sheet>
    </VStack>
  );
}

/** One place in the outfit: empty and tappable, or filled and clearable. */
function SlotRow({
  label,
  garment,
  onPick,
  onClear,
}: {
  label: string;
  garment: Garment | undefined;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <HStack gap={2} vAlign="center">
      <button
        type="button"
        onClick={onPick}
        className="w-full"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.625rem',
          borderRadius: 'var(--radius-container)',
          border: `1px solid ${
            garment ? 'var(--color-border-emphasized)' : 'var(--color-border)'
          }`,
          backgroundColor: garment
            ? 'var(--color-background-body)'
            : 'var(--color-background-muted)',
          font: 'inherit',
          color: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          minHeight: '3.75rem',
        }}>
        {garment ? (
          <img
            src={mediaUrl(garment.imageUrl)}
            alt=""
            className="shrink-0 overflow-hidden rounded-md"
            style={{
              width: '2.5rem',
              height: '3rem',
              objectFit: 'cover',
              border: '1px solid var(--color-border)',
            }}
          />
        ) : (
          <div
            aria-hidden
            className="shrink-0 rounded-md"
            style={{
              width: '2.5rem',
              height: '3rem',
              border: '1px dashed var(--color-border-emphasized)',
            }}
          />
        )}
        <VStack gap={0.5}>
          <Text type="supporting">{label}</Text>
          <Text type="label" maxLines={1}>
            {garment ? garment.title : 'Add something'}
          </Text>
        </VStack>
      </button>
      {garment && (
        <Button
          label="Clear"
          variant="ghost"
          size="sm"
          onClick={onClear}
        />
      )}
    </HStack>
  );
}

/**
 * What can go in this slot, and nothing else. An empty list is a real answer —
 * a wardrobe with no shoes in it can't fill the shoes slot, and saying so beats
 * an empty grid.
 */
function SlotPicker({
  slot,
  wardrobe,
  onChoose,
}: {
  slot: OutfitSlot;
  wardrobe: Garment[];
  onChoose: (garment: Garment) => void;
}) {
  const eligible = wardrobe.filter((g) =>
    SLOT_CATEGORIES[slot].includes(g.category),
  );

  if (eligible.length === 0) {
    return (
      <VStack gap={2}>
        <Heading level={3}>Nothing fits here yet</Heading>
        <Text type="supporting">
          Nothing on your hanger can go in {SLOT_LABELS[slot].toLowerCase()}.
          Photograph something, or hang a piece from a shop on your laptop.
        </Text>
      </VStack>
    );
  }

  return (
    <VStack gap={3}>
      <Heading level={3}>Choose a {SLOT_LABELS[slot].toLowerCase()}</Heading>
      <div className="grid grid-cols-2 gap-3">
        {eligible.map((garment) => (
          <GarmentCard
            key={garment.id}
            garment={garment}
            onClick={() => onChoose(garment)}
          />
        ))}
      </div>
    </VStack>
  );
}
