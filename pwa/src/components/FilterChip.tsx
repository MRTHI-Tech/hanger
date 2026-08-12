/**
 * A category filter. Astryx has no chip, and the panel hand-rolls the same
 * shape from tokens — this is that, with a taller tap target.
 */
export function FilterChip({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="shrink-0 rounded-full px-4"
      style={{
        minHeight: '2.25rem',
        border: `1px solid ${
          isActive ? 'var(--color-accent)' : 'var(--color-border)'
        }`,
        backgroundColor: isActive ? 'var(--color-accent-muted)' : 'transparent',
        color: 'var(--color-text-primary)',
        font: 'inherit',
        fontSize: 'var(--font-size-sm)',
        cursor: 'pointer',
      }}>
      {label}
    </button>
  );
}
