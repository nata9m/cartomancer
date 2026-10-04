'use client';

/**
 * A one-line note about a round, shown on its first question (#70) — today, that
 * the filters matched fewer countries than were asked for.
 *
 * Starting a quiz navigates straight to the round, so the picker that knows the
 * round came up short is gone by the time the round is on screen. The note rides
 * across in sessionStorage, keyed by session id: it is for this tab and this
 * round only, it survives a refresh, and it is correct for a persisted session
 * as well as a guest one, where the session payload alone could not carry it
 * (the requested count is not stored).
 */
const PREFIX = 'cartomancer.roundNote.';

export function setRoundNote(sessionId: string, note: string): void {
  try {
    window.sessionStorage.setItem(PREFIX + sessionId, note);
  } catch {
    // The note is a courtesy; the round is fine without it.
  }
}

export function getRoundNote(sessionId: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + sessionId);
  } catch {
    return null;
  }
}
