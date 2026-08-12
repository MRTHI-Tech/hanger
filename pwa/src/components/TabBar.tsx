import {Camera, Shirt, Sparkles, User} from 'lucide-react';
import type {ReactNode} from 'react';

export type Tab = 'hanger' | 'outfits' | 'me';

/**
 * The bottom bar.
 *
 * On a phone the thumb lives at the bottom of the screen, so that's where
 * getting around belongs — not in a segmented control at the top like the
 * panel's. Adding sits in the middle and is coloured differently because it is
 * the one thing here that isn't navigation: it's the reason to reach for your
 * phone instead of your laptop.
 */
export function TabBar({
  tab,
  onChange,
  onAdd,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  onAdd: () => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="safe-bottom shrink-0"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        alignItems: 'end',
        gap: '0.25rem',
        paddingInline: '0.5rem',
        paddingTop: '0.5rem',
        backgroundColor: 'var(--color-background-body)',
        borderTop: '1px solid var(--color-border)',
      }}>
      <TabButton
        label="Hanger"
        icon={<Shirt size={22} aria-hidden />}
        isActive={tab === 'hanger'}
        onClick={() => onChange('hanger')}
      />
      <TabButton
        label="Outfits"
        icon={<Sparkles size={22} aria-hidden />}
        isActive={tab === 'outfits'}
        onClick={() => onChange('outfits')}
      />
      <TabButton
        label="Add"
        icon={<Camera size={22} aria-hidden />}
        isActive={false}
        isAccent
        onClick={onAdd}
      />
      <TabButton
        label="You"
        icon={<User size={22} aria-hidden />}
        isActive={tab === 'me'}
        onClick={() => onChange('me')}
      />
    </nav>
  );
}

function TabButton({
  label,
  icon,
  isActive,
  isAccent = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  isActive: boolean;
  isAccent?: boolean;
  onClick: () => void;
}) {
  const color = isAccent
    ? 'var(--color-accent)'
    : isActive
      ? 'var(--color-text-primary)'
      : 'var(--color-text-secondary)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.125rem',
        // 44pt is the smallest thing a thumb hits reliably.
        minHeight: '3rem',
        paddingBlock: '0.375rem',
        background: 'none',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        color,
        font: 'inherit',
        fontSize: 'var(--font-size-sm)',
        fontWeight: isActive ? 600 : 400,
        cursor: 'pointer',
      }}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
