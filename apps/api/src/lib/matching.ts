import { FUZZY_MATCH_THRESHOLD, normalizeAnswer } from '@cartomancer/shared';
import type { PrismaClient } from '@cartomancer/db';

/** Which column the typed answer is compared against. */
export type AnswerDomain = 'country' | 'capital';

const DOMAIN_COLUMN: Record<AnswerDomain, 'name' | 'capital'> = {
  country: 'name',
  capital: 'capital',
};

export interface MatchCandidate {
  id: number;
  name: string;
  /** Exact (normalised) hit on the canonical value or one of the aliases. */
  exact: boolean;
  /** Exact hit on the canonical value specifically, as opposed to an alias. */
  canonical: boolean;
  score: number;
}

export interface MatchOutcome {
  isMatch: boolean;
  matchedBy: 'exact' | 'alias' | 'fuzzy' | 'none';
  /** The country the answer actually names, when it names one at all. */
  matchedCountryId: number | null;
}

interface RankRow {
  id: number;
  name: string;
  exact: boolean;
  canonical: boolean;
  score: number;
}

/**
 * Ranks every country against a typed answer: exact (normalised) hits first,
 * then by trigram similarity. Both the canonical column and the hand-seeded
 * aliases are considered.
 *
 * Restricting to a candidate pool (a region, or the countries in a recall
 * session) is deliberate for recall — a guess should be judged against the
 * region being recalled — but NOT for quizzes, where the whole table has to be
 * in play so a guess that exactly names some other country is recognised as
 * such rather than fuzzily accepted.
 */
export async function rankCandidates(
  prisma: PrismaClient,
  answer: string,
  domain: AnswerDomain,
  restrictToCountryIds?: number[],
): Promise<MatchCandidate[]> {
  const normalized = normalizeAnswer(answer);
  if (normalized.length === 0) {
    return [];
  }
  const column = DOMAIN_COLUMN[domain];
  const restrict = restrictToCountryIds && restrictToCountryIds.length > 0;

  // `column` comes from the whitelist above, never from request input; the
  // answer itself and the id list are bound parameters.
  const sql = `
    WITH input AS (SELECT cartomancer_normalize($1) AS q)
    SELECT c.id,
           c.name,
           (cartomancer_normalize(c."${column}") = input.q
            OR EXISTS (SELECT 1 FROM unnest(c.aliases) a
                       WHERE cartomancer_normalize(a) = input.q)) AS exact,
           (cartomancer_normalize(c."${column}") = input.q) AS canonical,
           GREATEST(
             similarity(cartomancer_normalize(c."${column}"), input.q),
             COALESCE((SELECT MAX(similarity(cartomancer_normalize(a), input.q))
                       FROM unnest(c.aliases) a), 0)
           )::float8 AS score
    FROM countries c, input
    ${restrict ? 'WHERE c.id = ANY($2::int[])' : ''}
    ORDER BY exact DESC, score DESC, c.name ASC
    LIMIT 5`;

  const rows = restrict
    ? await prisma.$queryRawUnsafe<RankRow[]>(sql, answer, restrictToCountryIds)
    : await prisma.$queryRawUnsafe<RankRow[]>(sql, answer);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    exact: row.exact,
    canonical: row.canonical,
    score: Number(row.score),
  }));
}

/**
 * Decides an answer from the ranked candidates.
 *
 * The rules, in order:
 *   1. an exact hit on the expected country wins (canonical value or alias)
 *   2. an exact hit on a *different* country makes the answer plainly wrong —
 *      it never falls through to the fuzzy pass, which is what stops "Niger"
 *      being accepted for Nigeria (their trigram similarity is 0.56, above any
 *      sane threshold)
 *   3. otherwise the expected country must be the single best trigram match and
 *      score at least FUZZY_MATCH_THRESHOLD
 */
export function decide(candidates: MatchCandidate[], expectedCountryId: number): MatchOutcome {
  const exactHits = candidates.filter((c) => c.exact);
  const expectedExact = exactHits.find((c) => c.id === expectedCountryId);
  if (expectedExact) {
    return {
      isMatch: true,
      matchedBy: expectedExact.canonical ? 'exact' : 'alias',
      matchedCountryId: expectedExact.id,
    };
  }
  if (exactHits.length > 0) {
    return { isMatch: false, matchedBy: 'none', matchedCountryId: exactHits[0]?.id ?? null };
  }
  const best = candidates[0];
  if (best && best.id === expectedCountryId && best.score >= FUZZY_MATCH_THRESHOLD) {
    return { isMatch: true, matchedBy: 'fuzzy', matchedCountryId: best.id };
  }
  return { isMatch: false, matchedBy: 'none', matchedCountryId: null };
}

/** Convenience wrapper: rank, then decide. */
export async function checkAnswer(
  prisma: PrismaClient,
  options: { answer: string; domain: AnswerDomain; expectedCountryId: number },
): Promise<MatchOutcome> {
  const candidates = await rankCandidates(prisma, options.answer, options.domain);
  return decide(candidates, options.expectedCountryId);
}

/**
 * Recall matching: which country in the pool does this guess name? Same
 * exact-then-fuzzy logic, but there is no single expected answer, so the best
 * candidate wins outright.
 */
export async function matchWithinPool(
  prisma: PrismaClient,
  answer: string,
  countryIds: number[],
): Promise<{ countryId: number; matchedBy: 'exact' | 'alias' | 'fuzzy' } | null> {
  const candidates = await rankCandidates(prisma, answer, 'country', countryIds);
  const best = candidates[0];
  if (!best) {
    return null;
  }
  if (best.exact) {
    return { countryId: best.id, matchedBy: best.canonical ? 'exact' : 'alias' };
  }
  const runnerUp = candidates[1];
  if (best.score >= FUZZY_MATCH_THRESHOLD && (!runnerUp || runnerUp.score < best.score)) {
    return { countryId: best.id, matchedBy: 'fuzzy' };
  }
  return null;
}
