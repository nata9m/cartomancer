'use client';

/**
 * Guest clue rotation (#70): one list per browser, `{ [factId]: lastSeenMs }`.
 *
 * It is sent with the start request and the api orders the matching clues
 * unmet-first, then oldest-met — the same rule it applies to a signed-in
 * player's fact_progress. So there is nothing to reset when the pool runs out:
 * every clue is simply "met" and the oldest comes first.
 *
 * Three things the first version got wrong, which this one is built around:
 *  - It was keyed by region + difficulty, so a clue met under "All regions" was
 *    new under "Europe". The rotation is over clues, not filter combinations.
 *  - A clue was recorded when the round *started*, so an abandoned round used
 *    up its clues. It is recorded when the clue is answered (`markFactSeen`).
 *  - Its "reset when exhausted" never ran, because the api padded a short round
 *    with already-met clues and the length check could not see it.
 *
 * The two modes (#42) share the list: a clue met as multiple choice is met.
 */
const STORAGE_KEY = 'cartomancer.seenFacts.v2';
/** The per-filter-combination store this replaced. */
const LEGACY_KEY = 'cartomancer.seenFacts';

export type SeenFacts = Record<string, number>;

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(store: SeenFacts): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Full or blocked localStorage is not worth breaking the quiz over.
  }
}

/**
 * Folds the old per-filter lists into the new shape, once. Those entries carry
 * no times, so they go in as "met long ago": enough to keep them behind clues
 * that were never met, without claiming an order nobody recorded. (They were
 * recorded at round start, so some were never actually answered — the cost of
 * leaving them out, replaying everything a returning guest has seen, is worse
 * than treating a few unanswered ones as old.)
 */
function migrateLegacy(): SeenFacts {
  const legacy = read(LEGACY_KEY);
  const store: SeenFacts = {};
  if (legacy && typeof legacy === 'object') {
    for (const ids of Object.values(legacy as Record<string, unknown>)) {
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === 'number') store[String(id)] = 0;
      }
    }
  }
  write(store);
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Harmless: the new key now exists, so this never runs again.
  }
  return store;
}

export function getSeenFacts(): SeenFacts {
  if (typeof window === 'undefined') return {};
  const stored = read(STORAGE_KEY);
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    return stored as SeenFacts;
  }
  return migrateLegacy();
}

/** Records a clue as met now. Called when it is answered, not when it is shown. */
export function markFactSeen(factId: number, at: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  write({ ...getSeenFacts(), [String(factId)]: at });
}
