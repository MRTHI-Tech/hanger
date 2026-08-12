import {Camera, Image, Link2} from 'lucide-react';
import type {ReactNode} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Sheet} from '../components/Sheet';

/**
 * The three ways something will get onto the hanger from a phone.
 *
 * None of them work yet, and the sheet says so rather than showing three dead
 * buttons. It's here in this phase because the shape of the thing matters to
 * judge now: these three routes are what the phone is *for*, and if one of them
 * is wrong it's much cheaper to find out before it's built than after.
 */
export function AddSheet({isOpen, onClose}: {isOpen: boolean; onClose: () => void}) {
  return (
    <Sheet title="Add to your hanger" isOpen={isOpen} onClose={onClose}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={3}>Add to your hanger</Heading>
          <Text type="supporting">
            Three ways in. None of them are wired up yet — this is the shape of
            it, so you can tell us now if it's wrong.
          </Text>
        </VStack>

        <VStack gap={2}>
          <Route
            icon={<Camera size={22} aria-hidden />}
            title="Photograph it"
            description="You're in a shop with the thing in your hands. Snap it, say what it is, hang it."
            phase="Phase 5"
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

function Route({
  icon,
  title,
  description,
  phase,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <HStack
      gap={3}
      vAlign="start"
      style={{
        padding: '0.875rem',
        borderRadius: 'var(--radius-container)',
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-background-muted)',
      }}>
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
          backgroundColor: 'var(--color-background-body)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-accent)',
        }}>
        {icon}
      </div>
      <VStack gap={0.5}>
        <HStack gap={2} vAlign="center">
          <Text type="label">{title}</Text>
          <Text type="supporting">{phase}</Text>
        </HStack>
        <Text type="supporting">{description}</Text>
      </VStack>
    </HStack>
  );
}
