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
 * All three work now. The shape of the sheet is unchanged from when two of them
 * were promises, which was the point of drawing it that way: the routes were
 * worth judging as a set before any of them existed, and none of them turned
 * out to be wrong once built.
 *
 * On Android the second and third also arrive from outside the app entirely —
 * shared in from Instagram or WhatsApp, landing on the same two screens without
 * anybody opening this sheet. iOS has no way to offer that, which is exactly
 * why they are here as their own routes rather than only as share handlers.
 */
export function AddSheet({
  isOpen,
  onClose,
  onPhotograph,
  onFromPhotos,
  onPasteLink,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPhotograph: () => void;
  onFromPhotos: () => void;
  onPasteLink: () => void;
}) {
  return (
    <Sheet title="Add to your hanger" isOpen={isOpen} onClose={onClose}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={3}>Add to your hanger</Heading>
          <Text type="supporting">Three ways in.</Text>
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
            description="A screenshot from Instagram, or a picture someone sent you."
            onClick={onFromPhotos}
          />
          <Route
            icon={<Link2 size={22} aria-hidden />}
            title="Paste a link"
            description="A product page you found on your phone, read the same way the laptop reads one."
            onClick={onPasteLink}
          />
        </VStack>
      </VStack>
    </Sheet>
  );
}

/**
 * One route in. Two of these used to carry a phase label instead of a handler,
 * and deliberately weren't tappable — a card that looks pressable and does
 * nothing is worse than one that says why. Nothing needs saying now.
 */
function Route({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
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
          backgroundColor: 'var(--color-accent-muted)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-accent)',
        }}>
        {icon}
      </div>
      <VStack gap={0.5}>
        <Text type="label">{title}</Text>
        <Text type="supporting">{description}</Text>
      </VStack>
    </HStack>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full"
      style={{
        padding: '0.875rem',
        borderRadius: 'var(--radius-container)',
        border: '1px solid var(--color-border-emphasized)',
        backgroundColor: 'var(--color-background-body)',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      }}>
      {body}
    </button>
  );
}
