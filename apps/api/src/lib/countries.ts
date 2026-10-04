import type { Country, PrismaClient } from '@cartomancer/db';

/**
 * Every country, for building multiple-choice distractors (#54).
 *
 * Starting a session and rehydrating one both used to read all 195 rows just to
 * pick three wrong answers per question. Reference data only changes when the
 * seed runs, and the rollout seeds before the api starts, so a process can hold
 * what it read. The TTL is not about correctness in production, where a new seed
 * means a new pod; it bounds how stale a long-lived dev server can get after a
 * re-seed.
 *
 * The promise is cached, not the rows, so concurrent first requests share one
 * query; a failed read is dropped, so one database blip does not stick.
 */
const TTL_MS = 10 * 60 * 1000;

let cached: { loadedAt: number; countries: Promise<Country[]> } | null = null;

export function loadAllCountries(
  prisma: PrismaClient,
  now: number = Date.now(),
): Promise<Country[]> {
  if (cached && now - cached.loadedAt < TTL_MS) {
    return cached.countries;
  }
  const entry = { loadedAt: now, countries: prisma.country.findMany() };
  cached = entry;
  entry.countries.catch(() => {
    if (cached === entry) {
      cached = null;
    }
  });
  return entry.countries;
}

/** For tests, and for anything that rewrites the table under a running api. */
export function clearCountryCache(): void {
  cached = null;
}
