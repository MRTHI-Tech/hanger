import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {mediaUrl} from '../api';
import {formatPrice} from '../format';
import {CATEGORY_LABELS, type Garment} from '../../shared/types';

/**
 * One garment in Your Hanger. Draggable, because the outfit canvas accepts
 * drops, and clickable, because dragging inside a 400px panel is nobody's
 * idea of a good time.
 */
export function GarmentCard({
  garment,
  onClick,
  onRemove,
  actionLabel,
  isDraggable = true,
  isSelected = false,
}: {
  garment: Garment;
  onClick?: () => void;
  onRemove?: () => void;
  actionLabel?: string;
  isDraggable?: boolean;
  isSelected?: boolean;
}) {
  return (
    <VStack
      gap={1}
      width="100%"
      as="div">
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? `${actionLabel ?? 'Choose'} ${garment.title}` : undefined}
        draggable={isDraggable}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/hanger-garment', garment.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={onClick}
        onKeyDown={(e) => {
          if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
          }
        }}
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: '3 / 4',
          backgroundColor: 'var(--color-background-muted)',
          border: isSelected
            ? '2px solid var(--color-accent)'
            : '1px solid var(--color-border)',
          cursor: onClick ? 'pointer' : isDraggable ? 'grab' : 'default',
        }}>
        <img
          src={mediaUrl(garment.imageUrl)}
          alt={garment.title}
          className="h-full w-full"
          style={{objectFit: 'cover'}}
        />
        {onRemove && (
          <button
            type="button"
            aria-label={`Take ${garment.title} off the hanger`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              backgroundColor: 'var(--color-overlay)',
              color: 'var(--color-on-dark)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
              lineHeight: 1,
            }}>
            ×
          </button>
        )}
      </div>

      <VStack gap={0.5}>
        <Text type="supporting" maxLines={2} color="primary">
          {garment.title}
        </Text>
        <HStack gap={1} vAlign="center" justify="between">
          <Text type="supporting" maxLines={1}>
            {garment.retailer}
          </Text>
          {garment.price && (
            <Text type="supporting" color="primary">
              {formatPrice(garment.price)}
            </Text>
          )}
        </HStack>
      </VStack>
    </VStack>
  );
}

export function CategoryBadge({garment}: {garment: Garment}) {
  return <Badge variant="neutral" label={CATEGORY_LABELS[garment.category]} />;
}
