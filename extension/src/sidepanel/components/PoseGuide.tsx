import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';

/**
 * The good/bad photo examples. §5.4 has real requirements — head to toe, one
 * person, facing forward — and a sentence of instructions is much easier to
 * skip than four little drawings.
 */

type Kind = 'full' | 'cropped' | 'facing' | 'turned';

export function PoseGuide() {
  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <Example kind="full" good caption="Head to toe" />
        <Example kind="facing" good caption="Facing the camera" />
        <Example kind="cropped" caption="Cropped short" />
        <Example kind="turned" caption="Turned away" />
      </HStack>
      <Text type="supporting">
        One person, standing, in clothes that show your shape. Plain background
        helps.
      </Text>
    </VStack>
  );
}

function Example({
  kind,
  good = false,
  caption,
}: {
  kind: Kind;
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
          aspectRatio: '3 / 4',
          opacity: good ? 1 : 0.62,
        }}>
        <Figure kind={kind} />
      </div>
      <HStack gap={1} vAlign="center">
        <span
          aria-hidden
          style={{
            color: good ? 'var(--color-success)' : 'var(--color-text-disabled)',
            fontSize: 12,
            lineHeight: 1,
          }}>
          {good ? '✓' : '✕'}
        </span>
        <Text type="supporting" size="3xs">
          {caption}
        </Text>
      </HStack>
    </VStack>
  );
}

const INK = 'var(--color-text-secondary)';

function Figure({kind}: {kind: Kind}) {
  const common = {
    fill: 'none',
    stroke: INK,
    strokeWidth: 4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (kind === 'cropped') {
    // Same figure, framed at the waist — the shot that gets error_invalid_src.
    return (
      <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
        <circle cx="30" cy="24" r="11" {...common} />
        <path d="M30 35 v34" {...common} />
        <path d="M14 46 h32" {...common} />
        <path
          d="M6 68 h48"
          stroke="var(--color-error)"
          strokeWidth={3}
          strokeDasharray="5 4"
          fill="none"
        />
      </svg>
    );
  }

  if (kind === 'turned') {
    return (
      <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
        <circle cx="34" cy="17" r="8" {...common} />
        <path d="M34 25 v22" {...common} />
        <path d="M34 30 l-10 10" {...common} />
        <path d="M34 47 l-6 20 M34 47 l4 20" {...common} />
      </svg>
    );
  }

  // 'full' and 'facing' share the standing figure; 'facing' zooms the face.
  if (kind === 'facing') {
    return (
      <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
        <circle cx="30" cy="30" r="16" {...common} />
        <circle cx="24" cy="27" r="1.8" fill={INK} stroke="none" />
        <circle cx="36" cy="27" r="1.8" fill={INK} stroke="none" />
        <path d="M25 36 q5 4 10 0" {...common} strokeWidth={3} />
        <path d="M30 46 v18 M18 54 h24" {...common} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
      <circle cx="30" cy="15" r="7" {...common} />
      <path d="M30 22 v24" {...common} />
      <path d="M19 30 h22" {...common} />
      <path d="M30 46 l-7 22 M30 46 l7 22" {...common} />
    </svg>
  );
}
