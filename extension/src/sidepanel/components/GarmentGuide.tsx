import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';

/**
 * How to photograph something you own, in four drawings. The same reason
 * PoseGuide exists: a sentence of instructions is easy to skip, and the shot
 * decides whether the try-on works.
 *
 * §2.3 is the one that bites — a crumpled heap reads as nothing in particular,
 * and lower-body pieces are the most sensitive to it. Laid flat and filling the
 * frame is what we're asking for; on a hanger works just as well.
 */

type Kind = 'flat' | 'hung' | 'heap' | 'worn';

export function GarmentGuide() {
  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <Example kind="flat" good caption="Laid flat" />
        <Example kind="hung" good caption="On a hanger" />
        <Example kind="heap" caption="In a heap" />
        <Example kind="worn" caption="Worn by someone" />
      </HStack>
      <Text type="supporting">
        One piece at a time, filling the frame, on a plain floor or wall. Smooth
        it out — creases read as folds.
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
            fontSize: 'var(--font-size-sm)',
            lineHeight: 1,
          }}>
          {good ? '✓' : '✕'}
        </span>
        <Text type="supporting">{caption}</Text>
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

  if (kind === 'hung') {
    // Shirt on a hanger — the hook is what says "hanger" at 60px wide.
    return (
      <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
        <path d="M30 10 q5 0 5 5 t-5 5" {...common} strokeWidth={3} />
        <path d="M30 20 L14 30 h32 Z" {...common} strokeWidth={3} />
        <path d="M22 30 l-8 8 6 5 M38 30 l8 8 -6 5" {...common} />
        <path d="M20 43 v24 h20 v-24" {...common} />
      </svg>
    );
  }

  if (kind === 'heap') {
    return (
      <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
        <path
          d="M12 56 q6 -14 16 -8 t10 -6 q10 4 10 14 q0 8 -18 8 t-18 -8 Z"
          {...common}
          strokeWidth={3}
        />
        <path d="M22 50 q6 4 14 1" {...common} strokeWidth={2.5} />
      </svg>
    );
  }

  if (kind === 'worn') {
    // A person wearing it — that's a try-on, not a garment photo.
    return (
      <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
        <circle cx="30" cy="16" r="7" {...common} />
        <path d="M30 23 v6" {...common} />
        <path d="M20 29 h20 l4 16 h-28 Z" {...common} strokeWidth={3} />
        <path d="M24 45 v22 M36 45 v22" {...common} />
      </svg>
    );
  }

  // 'flat' — a t-shirt seen square on, filling the frame.
  return (
    <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden>
      <path
        d="M22 18 h16 l10 8 -6 7 -4 -3 v34 h-16 v-34 l-4 3 -6 -7 Z"
        {...common}
        strokeWidth={3}
      />
      <path d="M24 18 q6 6 12 0" {...common} strokeWidth={2.5} />
    </svg>
  );
}
