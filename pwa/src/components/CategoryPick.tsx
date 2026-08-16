import {CATEGORY_LABELS, type GarmentCategory} from '@hanger/shared/types';

/**
 * Where a piece goes in an outfit.
 *
 * A grid of thumb-sized buttons rather than a select, because a native picker
 * on a phone covers half the screen and hides the photo you are naming. Two
 * screens ask this — the thing you photographed, and the thing behind a link —
 * and they differ only in which categories they offer: a piece you photograph
 * has to be try-on-able to be worth hanging, while a shop link can perfectly
 * well be a bag.
 */
export function CategoryPick({
  categories,
  value,
  onChange,
  isDisabled = false,
}: {
  categories: readonly GarmentCategory[];
  value: GarmentCategory | null;
  onChange: (category: GarmentCategory) => void;
  isDisabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {categories.map((category) => {
        const isActive = value === category;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            disabled={isDisabled}
            aria-pressed={isActive}
            className="w-full rounded-xl px-3"
            style={{
              border: `1px solid ${
                isActive ? 'var(--color-accent)' : 'var(--color-border)'
              }`,
              backgroundColor: isActive ? 'var(--color-accent-muted)' : 'transparent',
              color: 'var(--color-text-primary)',
              font: 'inherit',
              fontSize: 'var(--font-size-sm)',
              // A thumb target, not a mouse one: 44px is the floor on both
              // platforms.
              minHeight: '2.75rem',
              cursor: isDisabled ? 'default' : 'pointer',
              opacity: isDisabled ? 0.6 : 1,
            }}>
            {CATEGORY_LABELS[category]}
          </button>
        );
      })}
    </div>
  );
}
