'use client';

/**
 * Guest rotation for the country quizzes (#96): `{ [quizTypeKey]: { [countryId]:
 * lastAskedMs } }`, one list per browser.
 *
 * The same idea as the guest clue list (`seen-facts.ts`, #70), and the same
 * rule on the other end: it is sent with the start request, and the api asks for
 * countries never seen first, then the least recently seen. So nothing repeats
 * before the whole pool has been through, and there is nothing to reset — once
 * every country is "seen", the oldest simply comes first.
 *
 * Per quiz type, because that is what a signed-in player's memory is per
 * (`progress` is keyed by quiz type), and shared across region and difficulty
 * filters, for the same reason: the rotation is over countries, not over filter
 * combinations. A country is recorded when it is answered, not when a round that
 * might be abandoned starts.
 */
const STORAGE_KEY = 'cartomancer.seenCountries.v1';

export type SeenCountries = Record<string, number>;
type Store = Record<string, SeenCountries>;

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function getSeenCountries(quizTypeKey: string): SeenCountries {
  if (typeof window === 'undefined') return {};
  const list = readStore()[quizTypeKey];
  return list && typeof list === 'object' && !Array.isArray(list) ? list : {};
}

/** Records a country as asked now. Called when it is answered. */
export function markCountrySeen(
  quizTypeKey: string,
  countryId: number,
  at: number = Date.now(),
): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readStore();
    store[quizTypeKey] = { ...getSeenCountries(quizTypeKey), [String(countryId)]: at };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Full or blocked localStorage is not worth breaking the quiz over.
  }
}
