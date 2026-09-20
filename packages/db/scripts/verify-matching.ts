/**
 * Fuzzy-matching sanity check and tuning aid.
 *
 * 1. Asserts `cartomancer_normalize()` (migration 0002) and `normalizeAnswer()`
 *    (@cartomancer/shared) agree on every seeded name, capital and alias — the
 *    exact-match pass runs in SQL and the recall de-duplication runs in TS, so
 *    a divergence would show up as answers accepted in one place and not the
 *    other.
 * 2. Prints the ranked candidates for a set of probe guesses, which is how to
 *    re-tune FUZZY_MATCH_THRESHOLD: a probe is accepted only when the expected
 *    country is the single best match AND scores at or above the threshold.
 *
 * Run against a seeded database: pnpm --filter @cartomancer/db verify:matching
 */
import 'dotenv/config';
import { COUNTRIES, FUZZY_MATCH_THRESHOLD, normalizeAnswer } from '@cartomancer/shared';
import { createPrismaClient } from '../src/client.js';

const PROBES = [
  'Niger',
  'Nigeria',
  'Nigera',
  'Germeny',
  'Austrai',
  'USA',
  'Ivory Coast',
  'Kirgizstan',
  'Zimbabgwe',
  'Swizerland',
  'new zealend',
  'Netherland',
];

const prisma = createPrismaClient();

async function verifyNormalisation(): Promise<number> {
  const values = new Set<string>();
  for (const country of COUNTRIES) {
    values.add(country.name);
    values.add(country.capital);
    for (const alias of country.aliases) {
      values.add(alias);
    }
  }
  const rows = await prisma.$queryRaw<{ v: string; n: string }[]>`
    SELECT v, cartomancer_normalize(v) AS n FROM unnest(${[...values]}::text[]) AS v`;
  let mismatches = 0;
  for (const row of rows) {
    const inTypeScript = normalizeAnswer(row.v);
    if (inTypeScript !== row.n) {
      mismatches += 1;
      console.error(`  MISMATCH ${JSON.stringify(row.v)}: sql=${JSON.stringify(row.n)} ts=${JSON.stringify(inTypeScript)}`);
    }
  }
  console.log(`normalisation: ${rows.length} values checked, ${mismatches} mismatches`);
  return mismatches;
}

async function printRankings(): Promise<void> {
  console.log(`\nranked candidates (threshold ${FUZZY_MATCH_THRESHOLD}):`);
  for (const guess of PROBES) {
    const rows = await prisma.$queryRaw<{ name: string; score: number; exact: boolean }[]>`
      WITH input AS (SELECT cartomancer_normalize(${guess}) AS q)
      SELECT c.name,
             GREATEST(
               similarity(cartomancer_normalize(c.name), input.q),
               COALESCE((SELECT MAX(similarity(cartomancer_normalize(a), input.q))
                         FROM unnest(c.aliases) a), 0)
             ) AS score,
             (cartomancer_normalize(c.name) = input.q
              OR EXISTS (SELECT 1 FROM unnest(c.aliases) a
                         WHERE cartomancer_normalize(a) = input.q)) AS exact
      FROM countries c, input
      ORDER BY exact DESC, score DESC
      LIMIT 3`;
    const rendered = rows
      .map((r) => `${r.name} (${r.exact ? 'exact' : r.score.toFixed(2)})`)
      .join(', ');
    console.log(`  ${guess.padEnd(14)} ${rendered}`);
  }
}

async function main(): Promise<void> {
  const mismatches = await verifyNormalisation();
  await printRankings();
  await prisma.$disconnect();
  if (mismatches > 0) {
    process.exitCode = 1;
  }
}

void main();
