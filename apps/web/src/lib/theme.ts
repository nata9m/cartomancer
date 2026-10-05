/**
 * The theme choice (#57), shared by the layout that renders it and the control
 * that sets it, so neither can disagree about the cookie's name or values.
 *
 * `system` is the absence of a preference: no `data-theme` attribute, and the
 * stylesheet follows the OS. `light` and `dark` pin it. The choice lives in a
 * cookie rather than localStorage so the server can render the right theme on
 * the first byte; with storage the page paints in the OS theme and then flips.
 */
export const THEME_COOKIE = 'cartomancer-theme';

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Anything that is not a known choice is `system`, so a bad cookie is harmless. */
export function parseTheme(value: string | undefined | null): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === value) ?? 'system';
}

/** The browser chrome colour per theme: the page background, so the bar blends in. */
export const THEME_COLORS = { light: '#f5f0e4', dark: '#12161f' } as const;

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
