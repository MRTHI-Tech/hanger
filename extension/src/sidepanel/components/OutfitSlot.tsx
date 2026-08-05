import {useState} from 'react';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {mediaUrl} from '../api';
import {formatPrice} from '../format';
import {SLOT_LABELS, type Garment, type OutfitSlot as Slot} from '../../shared/types';

/**
 * One row of the outfit canvas. Accepts a drop from the wardrobe grid, and
 * takes a tap too — dragging inside a narrow panel is fiddly and a tap should
 * always work.
 */
export function OutfitSlotRow({
  slot,
  garment,
  isTarget,
  onDrop,
  onClear,
  onPick,
}: {
  slot: Slot;
  garment: Garment | null;
  isTarget: boolean;
  onDrop: (garmentId: string) => void;
  onClear: () => void;
  onPick: () => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    // A plain element owns the drag handlers: the layout primitives take
    // layout props, not DOM events.
    <div
      onDragOver={(e) => {
        if (!isTarget) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const id = e.dataTransfer.getData('text/hanger-garment');
        if (id) onDrop(id);
      }}
      style={{
        borderRadius: 'var(--radius-container)',
        backgroundColor: isOver ? 'var(--color-overlay-hover)' : 'transparent',
      }}>
      <HStack gap={3} vAlign="center" padding={2}>
      <button
        type="button"
        onClick={garment ? onClear : onPick}
        aria-label={
          garment ? `Take the ${SLOT_LABELS[slot]} out` : `Choose a ${SLOT_LABELS[slot]}`
        }
        className="shrink-0 overflow-hidden rounded-lg"
        style={{
          width: 56,
          height: 74,
          padding: 0,
          cursor: 'pointer',
          backgroundColor: 'var(--color-background-muted)',
          border: isOver
            ? '2px dashed var(--color-accent)'
            : garment
              ? '1px solid var(--color-border)'
              : '1px dashed var(--color-border-emphasized)',
        }}>
        {garment ? (
          <img
            src={mediaUrl(garment.imageUrl)}
            alt=""
            className="h-full w-full"
            style={{objectFit: 'cover'}}
          />
        ) : (
          <span
            aria-hidden
            style={{
              color: 'var(--color-text-disabled)',
              fontSize: 'var(--font-size-lg)',
            }}>
            +
          </span>
        )}
      </button>

      <VStack gap={0.5} width="100%">
        <Text type="label">{SLOT_LABELS[slot]}</Text>
        {garment ? (
          <>
            <Text type="supporting" maxLines={1}>
              {garment.title}
            </Text>
            <Text type="supporting">
              {garment.retailer}
              {garment.price ? ` · ${formatPrice(garment.price)}` : ''}
            </Text>
          </>
        ) : (
          <Text type="supporting">
            {isTarget ? 'Drop one here, or tap to choose' : 'Nothing yet'}
          </Text>
        )}
      </VStack>
      </HStack>
    </div>
  );
}
