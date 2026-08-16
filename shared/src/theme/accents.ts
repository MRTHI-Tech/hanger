/**
 * The accent, as something you can change.
 *
 * Butter's blue is the whole colour of the product — the wordmark, every
 * button, the selected tab, the badge on a shop's page. That is one decision
 * showing up in forty places, so it is defined once here and read everywhere
 * through `--brand-accent`, rather than being a hex code the theme repeats.
 *
 * Four values rather than one, because an accent is never used at one
 * strength: full for the thing you press, soft for the thing you haven't
 * selected, and two transparencies for the washes behind them. Computing them
 * with color-mix would be tidier and would put the whole toggle at the mercy
 * of one function's browser support, so they are written down.
 *
 * Applied as inline custom properties on <html>, which beats the :root block
 * the theme emits without either having to know about the other.
 */

export type AccentName = 'blue' | 'pink' | 'mono';

export interface Accent {
  /** What the toggle calls it. */
  label: string;
  /** The swatch, and what `--brand-accent` becomes. */
  swatch: string;
  vars: Record<string, string>;
}

/** Blue is the default, so its values are the ones butterTheme ships with. */
export const ACCENTS: Record<AccentName, Accent> = {
  blue: {
    label: 'Blue',
    swatch: '#225BFF',
    vars: {
      '--brand-accent': 'light-dark(#225BFF, #FDEE8C)',
      '--brand-accent-soft': 'light-dark(#6E92FF, #FDEE8CCC)',
      '--brand-accent-muted': 'light-dark(#225BFF33, #FDEE8C40)',
      '--brand-accent-wash': 'light-dark(#225BFF14, #FDEE8C14)',
    },
  },

  pink: {
    label: 'Pink',
    swatch: '#D6187C',
    // Deep enough to carry white label text — the pink in the source palette
    // (#F680E8) is a fill colour, and white on it is unreadable.
    vars: {
      '--brand-accent': 'light-dark(#D6187C, #FFB3DE)',
      '--brand-accent-soft': 'light-dark(#E86BAE, #FFB3DECC)',
      '--brand-accent-muted': 'light-dark(#D6187C33, #FFB3DE40)',
      '--brand-accent-wash': 'light-dark(#D6187C14, #FFB3DE14)',
    },
  },

  mono: {
    label: 'Mono',
    swatch: '#1d1c11',
    // The only one that touches more than the accent. Butter's background is a
    // yellow, and ink-on-yellow is not what anybody means by black and white,
    // so the surfaces go neutral with it. Everything else — type, spacing,
    // radii — is untouched.
    vars: {
      '--brand-accent': 'light-dark(#1d1c11, #f3f2e2)',
      '--brand-accent-soft': 'light-dark(#605f52, #adac9e)',
      '--brand-accent-muted': 'light-dark(#1d1c1133, #f3f2e240)',
      '--brand-accent-wash': 'light-dark(#1d1c1114, #f3f2e214)',
      '--color-background-body': 'light-dark(#f6f6f2, #17171a)',
      '--color-background-muted': 'light-dark(#e9e9e3, #26262a)',
      '--color-background-surface': 'light-dark(#ffffff, #26262a)',
      '--color-background-card': 'light-dark(#ffffff, #26262a)',
      '--color-background-popover': 'light-dark(#ffffff, #26262a)',
    },
  },
};

export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];

const STORAGE_KEY = 'hanger.accent';
const DEFAULT: AccentName = 'blue';

function isAccent(value: unknown): value is AccentName {
  return typeof value === 'string' && value in ACCENTS;
}

/** What the last visit chose, or the blue everything ships with. */
export function storedAccent(): AccentName {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isAccent(raw) ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/**
 * Put an accent on the page. Every variant clears the others' variables first,
 * so switching away from mono takes its background overrides with it rather
 * than leaving a neutral page wearing a blue accent.
 */
export function applyAccent(name: AccentName): void {
  const root = document.documentElement;
  for (const accent of Object.values(ACCENTS)) {
    for (const key of Object.keys(accent.vars)) root.style.removeProperty(key);
  }
  for (const [key, value] of Object.entries(ACCENTS[name].vars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.accent = name;
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* private mode; the accent still applies for this session */
  }
}

/**
 * Call before the first render. An accent applied after mount is a visible
 * flash of the wrong colour on every load.
 */
export function applyStoredAccent(): AccentName {
  const name = storedAccent();
  applyAccent(name);
  return name;
}

/** The next one round the loop, for a toggle that cycles. */
export function nextAccent(name: AccentName): AccentName {
  return ACCENT_NAMES[(ACCENT_NAMES.indexOf(name) + 1) % ACCENT_NAMES.length];
}
