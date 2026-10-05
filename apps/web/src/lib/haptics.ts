/**
 * A short buzz for the reveal, where the device can (#56).
 *
 * `navigator.vibrate` exists on Android browsers and nowhere on iOS, so this is an
 * enhancement that is silently absent on a large share of phones: it checks for
 * the API, never assumes it, and never throws. The patterns are milliseconds of
 * buzz and pause, kept short — this fires on every answer, and a long one would
 * turn a quiz into a chore.
 *
 * Off when the player asks for reduced motion. That setting is about visual
 * motion, strictly, but someone who has asked their device to be calmer has not
 * asked for a buzz on every tap, and respecting it costs nothing.
 */
export const HAPTIC_PATTERNS = {
  correct: [15],
  wrong: [40, 30, 40],
  learned: [20, 40, 20, 40, 60],
} as const;

export type HapticKind = keyof typeof HAPTIC_PATTERNS;

export function haptic(kind: HapticKind): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return false;
  }
  try {
    return navigator.vibrate([...HAPTIC_PATTERNS[kind]]);
  } catch {
    // Some embedded contexts refuse it outright; a missing buzz is not an error.
    return false;
  }
}

/** Which buzz an answer earns. Learning a country is the biggest moment. */
export function hapticFor(result: { wasCorrect: boolean; newlyLearned: boolean }): HapticKind {
  if (result.newlyLearned) return 'learned';
  return result.wasCorrect ? 'correct' : 'wrong';
}
