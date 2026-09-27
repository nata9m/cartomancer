import { COUNTRIES, COUNTRY_FACTS, type CountrySeed } from '@cartomancer/shared';

/**
 * The country everyone sees today.
 *
 * Deterministic and storage-free: the day number in UTC indexes a fixed
 * permutation of all 195. Nothing is written, nothing is cached, and two pods
 * serving the same request second agree — which is the whole reason the order
 * comes from a seeded PRNG rather than Math.random, whose shuffle would differ
 * per process and give each replica its own country of the day.
 *
 * UTC rather than a local timezone so the switch happens at one moment for
 * everyone, as the issue asks. It also means the card flips at midnight UTC
 * with no redeploy: the home page is force-dynamic, so this is recomputed per
 * request.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Frozen. Changing it reshuffles the entire cycle, so today's country would
 * jump mid-rotation — harmless, but it should be a decision rather than a
 * side effect of tidying.
 */
const SHUFFLE_SEED = 0x63617274;

/** mulberry32: small, fast, and identical everywhere it runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One shuffled pass over every country, built once at module load.
 *
 * Sorted by isoCode before shuffling so the result depends only on the seed,
 * never on the order COUNTRIES happens to be written in — adding a country to
 * the middle of the file would otherwise silently reshuffle the rotation.
 *
 * A permutation rather than `hash(day) % 195` because the issue asks for no
 * repeats within a cycle, and hashing gives collisions: over 195 days it would
 * show some countries three times and others never.
 */
const ROTATION: readonly CountrySeed[] = (() => {
  const order = [...COUNTRIES].sort((a, b) => a.isoCode.localeCompare(b.isoCode));
  const random = mulberry32(SHUFFLE_SEED);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const left = order[i];
    const right = order[j];
    if (left && right) {
      order[i] = right;
      order[j] = left;
    }
  }
  return order;
})();

export interface CountryOfTheDayPick {
  country: CountrySeed;
  /** One of that country's trivia clues, stable for the day. Absent if it has none. */
  fact?: string;
}

/**
 * Returns undefined only if COUNTRIES is empty, which cannot happen — the list
 * is compiled in. It is spelled as an absence rather than a throw so the worst
 * case is a home screen without the card, not a home screen that 500s.
 */
export function countryOfTheDay(now: Date = new Date()): CountryOfTheDayPick | undefined {
  if (ROTATION.length === 0) return undefined;

  // Days since the epoch in UTC. Double modulo so a clock set before 1970
  // wraps into range rather than indexing off the front.
  const dayIndex = Math.floor(now.getTime() / MS_PER_DAY);
  const country = ROTATION[((dayIndex % ROTATION.length) + ROTATION.length) % ROTATION.length];
  if (!country) return undefined;

  // Clues never name their country, so one reads as a caption here. Picked by
  // the same day index, so it does not change while the country stays put.
  const facts = COUNTRY_FACTS.filter((entry) => entry.countryName === country.name);
  if (facts.length === 0) return { country };

  const fact = facts[dayIndex % facts.length];
  return fact ? { country, fact: fact.fact } : { country };
}
