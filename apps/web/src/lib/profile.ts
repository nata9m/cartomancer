import type { UserProfile } from '@cartomancer/shared';

/**
 * What to call a player: their name, or — when they have none — the part of
 * their email before the @, so no screen ever shows a blank where a name goes
 * (#61). The same fallback is what clearing the name field returns to.
 */
export function displayNameFor(profile: Pick<UserProfile, 'name' | 'email'>): string {
  return profile.name?.trim() || profile.email.split('@')[0] || profile.email;
}

/** The letter shown in the avatar circle when there is no picture. */
export function initialFor(label: string): string {
  const first = Array.from(label.trim())[0];
  return first ? first.toLocaleUpperCase() : '?';
}

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', apple: 'Apple' };

/** "Google" / "Apple", or null for `pending` and anything not recognised. */
export function providerLabel(authProvider: string): string | null {
  return PROVIDER_LABELS[authProvider] ?? null;
}

/**
 * "4 October 2026". In UTC, always: the page is rendered on the server, whose
 * zone is not the player's, and a membership date that changes by a day with the
 * server's clock would be wrong in a way nobody could reproduce.
 */
export function formatMemberSince(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** State of the name form between submissions (see `updateDisplayName`). */
export type NameFormState =
  | { status: 'idle' }
  | { status: 'saved'; name: string | null }
  | { status: 'error'; message: string };
