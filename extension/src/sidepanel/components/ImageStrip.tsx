import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Banner} from '@astryxdesign/core/Banner';
import type {ScoredImage} from '../../shared/types';

/**
 * "Which photo shows this best?" (§9.3)
 *
 * Two lines of UI that save the whole lower-body feature: the ranking picks a
 * default, and the strip lets the person overrule it when the ranking is wrong.
 */
export function ImageStrip({
  images,
  selected,
  onSelect,
  warning,
}: {
  images: ScoredImage[];
  selected: number;
  onSelect: (index: number) => void;
  warning?: string;
}) {
  if (images.length === 0) {
    return (
      <Banner
        status="warning"
        title="No product photos found"
        description="We couldn't find a usable photo on this page. Try opening the product's own page."
      />
    );
  }

  const current = images[selected];

  return (
    <VStack gap={2}>
      <div
        className="w-full overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--color-background-muted)',
          border: '1px solid var(--color-border)',
        }}>
        <img
          src={current?.url}
          alt={current?.alt || 'Product photo'}
          className="block w-full"
          style={{maxHeight: 320, objectFit: 'contain'}}
        />
      </div>

      {images.length > 1 && (
        <VStack gap={1}>
          <Text type="supporting" size="3xs">
            Which photo shows this best?
          </Text>
          <HStack gap={2} isScrollable>
            {images.map((image, index) => (
              <button
                key={image.url}
                type="button"
                onClick={() => onSelect(index)}
                aria-label={`Photo ${index + 1}${image.onModel ? ', on a model' : ''}`}
                aria-pressed={index === selected}
                className="shrink-0 overflow-hidden rounded-md"
                style={{
                  width: 56,
                  height: 74,
                  padding: 0,
                  cursor: 'pointer',
                  backgroundColor: 'var(--color-background-muted)',
                  border:
                    index === selected
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                }}>
                <img
                  src={image.url}
                  alt=""
                  className="h-full w-full"
                  style={{objectFit: 'cover'}}
                />
              </button>
            ))}
          </HStack>
        </VStack>
      )}

      {warning && (
        <Banner status="warning" title="Pick a photo of it being worn" description={warning} />
      )}
    </VStack>
  );
}
