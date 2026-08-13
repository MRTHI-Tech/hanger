import {Camera, Image, Link2} from 'lucide-react';
import type {ReactNode} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Sheet} from '../components/Sheet';

/**
 * The three ways something gets onto the hanger from a phone.
 *
 * The first one works. The other two say which phase brings them rather than
 * pretending to be buttons — the shape of all three was worth judging before
 * any of it was built, and the two that are still coming keep earning their
 * place on the sheet by being the reason the first one isn't the only way in.
 */
export function AddSheet({
  isOpen,
  onClose,
  onPhotograph,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPhotograph: () => void;
}) {
  return (
    <Sheet title="Add to your hanger" isOpen={isOpen} onClose={onClose}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={3}>Add to your hanger</Heading>
          <Text type="supporting">
            Three ways in. One of them works today.
          </Text>
        </VStack>

        <VStack gap={2}>
          <Route
            icon={<Camera size={22} aria-hidden />}
            title="Photograph it"
            description="You're in a shop with the thing in your hands. Snap it, say what it is, hang it."
            onClick={onPhotograph}
          />
          <Route
            icon={<Image size={22} aria-hidden />}
            title="From your photos"
            description="A screenshot from Instagram, or a picture someone sent you. We'll work out what it is."
            phase="Phase 8"
          />
          <Route
            icon={<Link2 size={22} aria-hidden />}
            title="Paste a link"
            description="A product page you found on your phone, read the same way the laptop reads one."
            phase="Phase 8"
          />
        </VStack>
      </VStack>
    </Sheet>
  );
}

/**
 * One route in. With an `onClick` it's a button; with a `phase` it's a
 * description of one that's coming, and deliberately not tappable — a card that
 * looks pressable and does nothing is worse than one that says why.
 */
function Route({
  icon,
  title,
  description,
  phase,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  phase?: string;
  onClick?: () => void;
}) {
  const live = onClick != null;
  const body = (
    <HStack gap={3} vAlign="start" width="100%">
      <div
        aria-hidden
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '2.5rem',
          height: '2.5rem',
          flexShrink: 0,
          borderRadius: 'var(--radius-full)',
          backgroundColor: live
            ? 'var(--color-accent-muted)'
            : 'var(--color-background-body)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-accent)',
        }}>
        {icon}
      </div>
      <VStack gap={0.5}>
        <HStack gap={2} vAlign="center">
          <Text type="label">{title}</Text>
          {phase && <Text type="supporting">{phase}</Text>}
        </HStack>
        <Text type="supporting">{description}</Text>
      </VStack>
    </HStack>
  );

  const skin = {
    padding: '0.875rem',
    borderRadius: 'var(--radius-container)',
    border: `1px solid ${
      live ? 'var(--color-border-emphasized)' : 'var(--color-border)'
    }`,
    backgroundColor: live
      ? 'var(--color-background-body)'
      : 'var(--color-background-muted)',
  } as const;

  if (!live) return <div style={skin}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full"
      style={{
        ...skin,
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      }}>
      {body}
    </button>
  );
}
