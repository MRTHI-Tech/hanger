import type {ComponentType} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {
  CroppedTooShort,
  FacingCamera,
  FullBody,
  TurnedAway,
  type IllustrationProps,
} from '@hanger/shared/illustrations';

/**
 * The good/bad photo examples. §5.4 has real requirements — head to toe, one
 * person, facing forward — and a sentence of instructions is much easier to
 * skip than four little drawings.
 *
 * The drawings are the commissioned ones in shared/assets/illustrations/pose,
 * drawn in currentColor so the ✓/✕ framing below can tint them rather than
 * needing a second copy of each.
 */

export function PoseGuide() {
  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <Example art={FullBody} good caption="Head to toe" />
        <Example art={FacingCamera} good caption="Facing the camera" />
        <Example art={CroppedTooShort} caption="Cropped short" />
        <Example art={TurnedAway} caption="Turned away" />
      </HStack>
      <Text type="supporting">
        One person, standing, in clothes that show your shape. Plain background
        helps.
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
          // 4:5 rather than the 3:4 the stick figures used, and `slice` rather
          // than the default fit, so the drawings fill the box instead of
          // letterboxing into something small. That crops the 1024 canvas to
          // x 102–922, and the widest of the four spans 146–877, so there is
          // room on both sides of everything — worth re-checking against the
          // bounding boxes if the art is ever redrawn wider.
          aspectRatio: '4 / 5',
          // All four are drawn in currentColor, so this tints them: the two
          // to copy read as ink, the two to avoid recede with their caption.
          color: good
            ? 'var(--color-text-secondary)'
            : 'var(--color-text-disabled)',
        }}>
        <Art preserveAspectRatio="xMidYMid slice" />
      </div>
      {/* Top-aligned, not centred: at four columns on a phone the captions wrap
          to two lines, and a centred tick then floats halfway down its own row
          while its neighbours' sit at the first line. */}
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
        <Text type="supporting">
          {caption}
        </Text>
      </HStack>
    </VStack>
  );
}
