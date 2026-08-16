import type {ComponentType} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {
  InAHeap,
  LaidFlat,
  OnHanger,
  WornBySomeone,
  type IllustrationProps,
} from '@hanger/shared/illustrations';

/**
 * How to photograph something you own, in four drawings. The same reason
 * PoseGuide exists: a sentence of instructions is easy to skip, and the shot
 * decides whether the try-on works.
 *
 * §2.3 is the one that bites — a crumpled heap reads as nothing in particular,
 * and lower-body pieces are the most sensitive to it. Laid flat and filling the
 * frame is what we're asking for; on a hanger works just as well.
 *
 * The drawings are the commissioned ones in shared/assets/illustrations/garment,
 * drawn in currentColor so the ✓/✕ framing below can tint them rather than
 * needing a second copy of each.
 */

export function GarmentGuide() {
  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <Example art={LaidFlat} good caption="Laid flat" />
        <Example art={OnHanger} good caption="On a hanger" />
        <Example art={InAHeap} caption="In a heap" />
        <Example art={WornBySomeone} caption="Worn by someone" />
      </HStack>
      <Text type="supporting">
        One piece at a time, filling the frame, on a plain floor or wall. Smooth
        it out — creases read as folds.
      </Text>
    </VStack>
  );
}

function Example({
  art: Art,
  good = false,
  caption,
}: {
  art: ComponentType<IllustrationProps>;
  good?: boolean;
  caption: string;
}) {
  return (
    <VStack gap={1} hAlign="center" width="100%">
      <div
        className="w-full overflow-hidden rounded-md border"
        style={{
          borderColor: good
            ? 'var(--color-border-emphasized)'
            : 'var(--color-border)',
          backgroundColor: 'var(--color-background-muted)',
          // Square, where PoseGuide crops to 4:5. These drawings are wide — a
          // garment laid flat and a garment in a heap both span x 103–922 of
          // the 1024 canvas, and PoseGuide's crop keeps only 102–922. That
          // clips them by a hair. A square box against a square canvas fits
          // exactly: nothing cropped, nothing letterboxed.
          aspectRatio: '1 / 1',
          // All four are drawn in currentColor, so this tints them: the two
          // to copy read as ink, the two to avoid recede with their caption.
          color: good
            ? 'var(--color-text-secondary)'
            : 'var(--color-text-disabled)',
        }}>
        <Art />
      </div>
      {/* Top-aligned for the reason PoseGuide's is: four columns on a phone
          wraps the captions, and a centred tick drifts out of the row. */}
      <HStack gap={1} vAlign="start">
        <span
          aria-hidden
          style={{
            color: good ? 'var(--color-success)' : 'var(--color-text-disabled)',
            fontSize: 'var(--font-size-sm)',
            lineHeight: 'var(--line-height-sm, 1.5)',
          }}>
          {good ? '✓' : '✕'}
        </span>
        <Text type="supporting">{caption}</Text>
      </HStack>
    </VStack>
  );
}
