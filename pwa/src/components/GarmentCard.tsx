import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {mediaUrl} from '@hanger/shared/api';
import {formatPrice} from '@hanger/shared/format';
import type {Garment} from '@hanger/shared/types';

/**
 * One garment in Your Hanger, phone-sized.
 *
 * The panel's card is draggable, because the outfit canvas next to it accepts
 * drops. There's no canvas beside anything on a phone, so this one is a plain
 * target: the whole tile is the button, and it's big enough to hit.
 */
export function GarmentCard({
  garment,
  onClick,
}: {
  garment: Garment;
  onClick: () => void;
}) {
  return (
    <VStack gap={1} width="100%" as="div">
      <button
        type="button"
        onClick={onClick}
        aria-label={`Open ${garment.title}`}
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: '3 / 4',
          padding: 0,
          backgroundColor: 'var(--color-background-muted)',
          border: '1px solid var(--color-border)',
          cursor: 'pointer',
        }}>
        <img
          src={mediaUrl(garment.imageUrl)}
          alt=""
          loading="lazy"
          className="h-full w-full"
          style={{objectFit: 'cover'}}
        />
      </button>

      <VStack gap={0.5}>
        <Text type="supporting" maxLines={2} color="primary">
          {garment.title}
        </Text>
        <HStack gap={1} vAlign="center" justify="between">
          {/* Where it came from. For a piece you own that's your own wardrobe,
              and saying so is what makes the mix legible at a glance. */}
          <Text type="supporting" maxLines={1}>
            {garment.retailer ?? 'Yours'}
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
