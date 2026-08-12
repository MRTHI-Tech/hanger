import {useRef, useState, type ReactNode} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {VStack} from '@astryxdesign/core/VStack';

/** Let go of the grip past this many pixels and the sheet goes away. */
const DISMISS_AFTER = 72;

/** Below this, a press on the grip counts as a tap rather than a drag. */
const DRAG_SLOP = 4;

/**
 * A panel that rises from the foot of the screen and stops partway up.
 *
 * The phone's version of the panel's sheet, and the same idea: detail about one
 * thing you tapped comes up over everything, next to the thumb, and leaves when
 * you tap away, press Escape, or pull the grip down. What differs is that here
 * the grip is the primary way out — there's no Escape key on a phone — and the
 * sheet has to clear the home indicator, which styles.css handles.
 */
export function Sheet({
  title,
  isOpen,
  onClose,
  children,
}: {
  /** Names the sheet for screen readers. */
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const grabbedAt = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  function drop(y: number) {
    grabbedAt.current = null;
    setIsDragging(false);
    setDragY(0);
    if (y > DISMISS_AFTER) onClose();
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label={title}
      width="100%"
      maxHeight="85vh"
      position={{bottom: 0, left: 0, right: 0}}
      padding={4}
      className="hanger-sheet"
      style={{
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: isDragging ? 'none' : 'transform 160ms ease-out',
      }}>
      <VStack gap={3}>
        <button
          type="button"
          aria-label="Close"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            grabbedAt.current = e.clientY;
          }}
          onPointerMove={(e) => {
            if (grabbedAt.current == null) return;
            const y = Math.max(0, e.clientY - grabbedAt.current);
            if (y > DRAG_SLOP) setIsDragging(true);
            setDragY(y);
          }}
          onPointerUp={(e) => {
            drop(grabbedAt.current == null ? 0 : e.clientY - grabbedAt.current);
          }}
          onPointerCancel={() => drop(0)}
          // A tap on the grip closes; a drag that didn't go far enough has
          // already sprung back, and shouldn't close on the click that follows.
          onClick={() => {
            if (!isDragging) onClose();
          }}
          className="flex w-full items-center justify-center"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            paddingBottom: '0.5rem',
            cursor: 'grab',
            touchAction: 'none',
          }}>
          <span
            aria-hidden="true"
            style={{
              display: 'block',
              width: '2.25rem',
              height: '0.25rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-border-emphasized)',
            }}
          />
        </button>

        {children}
      </VStack>
    </Dialog>
  );
}
