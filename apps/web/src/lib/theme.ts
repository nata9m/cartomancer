/**
 * The theme choice (#57), shared by the layout that renders it and the control
 * that sets it, so neither can disagree about the cookie's name or values.
 *
 * Light or Dark, and Light is the default (#92). There is no "follow the OS"
 * choice: it looked like Light to most players and made the app change colour
 * for reasons the player did not choose. The choice lives in a cookie rather than
 * localStorage so the server can render the right theme on the first byte; with
 * storage the page would paint in the default and then flip.
 */
export const THEME_COOKIE = 'cartomancer-theme';

export const THEME_CHOICES = ['light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/**
 * Anything that is not a known choice is `light`: a missing cookie, a bad one, and
 * the retired `system` that earlier visits may have stored.
 */
export function parseTheme(value: string | undefined | null): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === value) ?? 'light';
}

/** The browser chrome colour per theme: the page background, so the bar blends in. */
export const THEME_COLORS = { light: '#f7f7f5', dark: '#17171a' } as const;

export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: 'Light',
  dark: 'Dark',
};

/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
