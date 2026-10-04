import {
  ALL_FILTER,
  DEFAULT_QUESTION_COUNT,
  type Difficulty,
  type DifficultyFilter,
  type QuizQuestion,
  type QuizOption,
  type QuizTypeDefinition,
  type QuizTypeSummary,
  type Region,
  type RegionFilter,
  hashAnswer,
  quizTypeByKey,
} from '@cartomancer/shared';
import type { Country, PrismaClient, QuizType } from '@cartomancer/db';
import type { Db } from './db.js';
import { badRequest, notFound } from '../errors.js';
import type { AnswerDomain } from './matching.js';

export const OPTIONS_PER_QUESTION = 4;

export interface ResolvedQuizType {
  row: QuizType;
  definition: QuizTypeDefinition;
}

export function summarize(definition: QuizTypeDefinition): QuizTypeSummary {
  return {
    key: definition.key,
    category: definition.category,
    format: definition.format,
    direction: definition.direction,
    displayName: definition.displayName,
    directionLabel: definition.directionLabel,
    description: definition.description,
  };
}

/**
 * Quiz types live in the database; their rendering metadata lives in the shared
 * taxonomy. A row without a taxonomy entry is a configuration error rather than
 * a request error, but it is reported as a 400 because the key came from the
 * request.
 */
export async function resolveQuizType(
  prisma: PrismaClient,
  key: string,
): Promise<ResolvedQuizType> {
  const row = await prisma.quizType.findUnique({ where: { key } });
  if (!row || !row.isActive) {
    throw notFound(`Unknown or inactive quiz type "${key}"`);
  }
  const definition = quizTypeByKey(key);
  if (!definition) {
    throw badRequest(`Quiz type "${key}" has no taxonomy entry in @cartomancer/shared`);
  }
  return { row, definition };
}

/** Which column a typed answer is judged against for this quiz type. */
export function answerDomainFor(definition: QuizTypeDefinition): AnswerDomain {
  return definition.category === 'capitals' && definition.direction === 'country_to_attribute'
    ? 'capital'
    : 'country';
}

/** The canonical expected answer, used for the reveal row and the missed list. */
export function expectedAnswerFor(definition: QuizTypeDefinition, country: Country): string {
  return answerDomainFor(definition) === 'capital' ? country.capital : country.name;
}

/**
 * Every spelling an exact match would accept for this question: the canonical
 * answer plus the hand-seeded aliases *for that domain* (#35) — a capital
 * question reads `capitalAliases`, a country question `nameAliases`.
 *
 * `searchAliases` are deliberately absent. The matcher never accepts them
 * ("Cape Town" is not the name of a country), so hashing one would have the
 * browser auto-accept an answer the server then marks wrong — a worse bug than
 * the missing convenience, and the kind that is only ever found by a player.
 * This is the one list to extend if the accepted set ever grows: it has to say
 * exactly what `rankCandidates` says, or "exactly right" means two things.
 */
export function acceptedAnswerForms(
  definition: QuizTypeDefinition,
  country: Country,
): string[] {
  return answerDomainFor(definition) === 'capital'
    ? [country.capital, ...country.capitalAliases]
    : [country.name, ...country.nameAliases];
}

/**
 * The salted hashes a type-in question carries so the browser can recognise a
 * correct answer without holding it (#69). Deduplicated, because two spellings
 * that normalise alike ("Kyiv"/"kyiv") are one hash and listing it twice would
 * only overstate how many answers are accepted.
 */
async function answerHashesFor(
  definition: QuizTypeDefinition,
  country: Country,
  salt: string,
): Promise<string[]> {
  const hashes = await Promise.all(
    acceptedAnswerForms(definition, country).map((form) => hashAnswer(salt, form)),
  );
  return [...new Set(hashes.filter((hash): hash is string => hash !== null))];
}

export interface SelectionFilters {
  region: RegionFilter;
  difficulty: DifficultyFilter;
}

export function parseRegion(value: unknown): RegionFilter {
  if (value === undefined || value === null || value === '' || value === ALL_FILTER) {
    return ALL_FILTER;
  }
  const regions: readonly string[] = ['Africa', 'Asia', 'Europe', 'Americas', 'Oceania'];
  if (typeof value === 'string' && regions.includes(value)) {
    return value as Region;
  }
  throw badRequest(`Invalid region filter "${String(value)}"`);
}

export function parseDifficulty(value: unknown): DifficultyFilter {
  if (value === undefined || value === null || value === '' || value === ALL_FILTER) {
    return ALL_FILTER;
  }
  const difficulties: readonly string[] = ['Easy', 'Medium', 'Hard'];
  if (typeof value === 'string' && difficulties.includes(value)) {
    return value as Difficulty;
  }
  throw badRequest(`Invalid difficulty filter "${String(value)}"`);
}

/**
 * Builds a session's question set for non-trivia categories.
 *
 * Signed in: one shared "last seen" pool per (user, quiz type), ordered by
 * `progress.last_answered_at ASC NULLS FIRST` so never-seen countries come
 * first and the oldest-seen cycle back round after that.
 *
 * Guest: no rotation memory exists, so the pick is simply random.
 */
export async function selectCountryIds(
  prisma: PrismaClient,
  options: {
    userId: string | null;
    quizTypeId: number;
    filters: SelectionFilters;
    limit: number;
    /** Trivia can only ask about countries that have at least one clue. */
    requireFacts: boolean;
  },
): Promise<number[]> {
  const { userId, quizTypeId, filters, limit, requireFacts } = options;
  const region = filters.region === ALL_FILTER ? null : filters.region;
  const difficulty = filters.difficulty === ALL_FILTER ? null : filters.difficulty;

  const factClause = requireFacts
    ? 'AND EXISTS (SELECT 1 FROM country_facts f WHERE f.country_id = c.id)'
    : '';

  if (userId === null) {
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT c.id
         FROM countries c
        WHERE ($1::text IS NULL OR c.region = $1)
          AND ($2::text IS NULL OR c.difficulty = $2)
          ${factClause}
        ORDER BY random()
        LIMIT $3`,
      region,
      difficulty,
      limit,
    );
    return rows.map((r) => r.id);
  }

  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT c.id
       FROM countries c
       LEFT JOIN progress p
         ON p.country_id = c.id AND p.user_id = $4::uuid AND p.quiz_type_id = $5::int
      WHERE ($1::text IS NULL OR c.region = $1)
        AND ($2::text IS NULL OR c.difficulty = $2)
        ${factClause}
      ORDER BY p.last_answered_at ASC NULLS FIRST, random()
      LIMIT $3`,
    region,
    difficulty,
    limit,
    userId,
    quizTypeId,
  );
  return rows.map((r) => r.id);
}

// ─── Trivia-specific fact selection ──────────────────────────────────────────

export interface SelectedFact {
  factId: number;
  countryId: number;
  fact: string;
}

/** A clue that matches the round's filters, and when this player last met it. */
export interface ClueCandidate extends SelectedFact {
  /** Epoch ms of the last answer to this clue, or null if never met. */
  lastSeen: number | null;
}

/**
 * Picks a round's clues: strictly least-recently-seen first (#70).
 *
 * The order, which is the whole rule:
 *   1. clues never met, of countries none of whose clues have been met
 *   2. clues never met, of countries a different clue has been met for
 *   3. clues already met, oldest first
 *
 * So a clue that has been met is never served while an unmet one is available
 * to take its place, and when everything has been met the cycle simply restarts
 * with whatever was seen longest ago — exhaustion needs no reset, no "seen"
 * list to clear and no special case: everything is "seen", so the oldest comes
 * first. Rank 1 over 2 is the one softening, and it only reorders clues that
 * are *both* unmet: a player reads the same country with a new clue as a
 * repeat, so countries not yet met at all go first.
 *
 * At most one clue per country, because a country is asked about once a round
 * (session_answers is keyed by it). That is also why a round can be shorter than
 * asked — it is capped by the number of countries with a matching clue — and it
 * is returned short rather than padded with repeats. The tail of a cycle can
 * still pad with a met clue while an unmet one waits: when what is left unmet
 * belongs to countries already in the round, that is the same-country rule, not
 * a rotation failure.
 *
 * Ties are shuffled so each new cycle feels like a reshuffle. `random` is a
 * parameter so the ordering can be tested without the dice.
 */
export function pickClues(
  candidates: readonly ClueCandidate[],
  limit: number,
  random: () => number = Math.random,
): SelectedFact[] {
  const countriesWithSeenClue = new Set(
    candidates.filter((c) => c.lastSeen !== null).map((c) => c.countryId),
  );
  const ranked = candidates
    .map((clue) => ({
      clue,
      tiebreak: random(),
      rank:
        clue.lastSeen !== null ? 2 : countriesWithSeenClue.has(clue.countryId) ? 1 : 0,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        // Only rank 2 has a last-seen time; the others are all "never".
        (a.clue.lastSeen ?? 0) - (b.clue.lastSeen ?? 0) ||
        a.tiebreak - b.tiebreak,
    );

  const selected: SelectedFact[] = [];
  const taken = new Set<number>();
  for (const { clue } of ranked) {
    if (taken.has(clue.countryId)) continue;
    taken.add(clue.countryId);
    selected.push({ factId: clue.factId, countryId: clue.countryId, fact: clue.fact });
    if (selected.length >= limit) break;
  }
  return selected;
}

/**
 * Selects trivia clues with per-clue rotation over the clues that match the
 * filters, filtering on the clue's own difficulty (not the country's).
 *
 * What counts as "met":
 *   - signed in: a row in `fact_progress`, written when the clue is *answered*
 *     — one shared rotation for both modes (#42) — so a round that is abandoned
 *     consumes nothing;
 *   - guest: the browser's own list, sent with the request as
 *     `seenFacts: { [factId]: epochMs }` and recorded on answer too. One list
 *     per browser, not per filter combination: a clue met under "All regions" is
 *     met under "Europe".
 *
 * Both reduce to a last-seen time per clue, and `pickClues` does the rest. The
 * pool is a few hundred rows, so it is fetched whole and ordered here rather
 * than in SQL: the rule has three tiers and a per-country condition, which is
 * far easier to state, and to test, as a function than as an ORDER BY.
 */
export async function selectFacts(
  prisma: PrismaClient,
  options: {
    userId: string | null;
    filters: SelectionFilters;
    limit: number;
    /** Guest only: clue id → epoch ms it was last answered. */
    seenFacts?: Record<string, number>;
  },
): Promise<SelectedFact[]> {
  const { userId, filters, limit, seenFacts } = options;
  const region = filters.region === ALL_FILTER ? null : filters.region;
  const difficulty = filters.difficulty === ALL_FILTER ? null : filters.difficulty;

  const rows =
    userId !== null
      ? await prisma.$queryRawUnsafe<
          { fact_id: number; country_id: number; fact: string; last_seen: Date | null }[]
        >(
          `SELECT f.id AS fact_id, f.country_id, f.fact, fp.last_answered_at AS last_seen
             FROM country_facts f
             JOIN countries c ON c.id = f.country_id
             LEFT JOIN fact_progress fp ON fp.fact_id = f.id AND fp.user_id = $3::uuid
            WHERE ($1::text IS NULL OR c.region = $1)
              AND ($2::text IS NULL OR f.difficulty = $2)`,
          region,
          difficulty,
          userId,
        )
      : (
          await prisma.$queryRawUnsafe<{ fact_id: number; country_id: number; fact: string }[]>(
            `SELECT f.id AS fact_id, f.country_id, f.fact
               FROM country_facts f
               JOIN countries c ON c.id = f.country_id
              WHERE ($1::text IS NULL OR c.region = $1)
                AND ($2::text IS NULL OR f.difficulty = $2)`,
            region,
            difficulty,
          )
        ).map((row) => ({ ...row, last_seen: null }));

  const candidates: ClueCandidate[] = rows.map((row) => {
    const guestSeen = userId === null ? seenFacts?.[String(row.fact_id)] : undefined;
    return {
      factId: row.fact_id,
      countryId: row.country_id,
      fact: row.fact,
      lastSeen: row.last_seen ? row.last_seen.getTime() : (guestSeen ?? null),
    };
  });
  return pickClues(candidates, limit);
}

export function clampQuestionCount(requested: unknown): number {
  if (requested === undefined || requested === null) {
    return DEFAULT_QUESTION_COUNT;
  }
  const value = Number(requested);
  if (!Number.isInteger(value) || value < 1 || value > 195) {
    throw badRequest('questionCount must be an integer between 1 and 195');
  }
  return value;
}

interface QuestionBuildInput {
  definition: QuizTypeDefinition;
  /** In the order they will be asked. */
  countries: Country[];
  /** Candidate pool for multiple-choice distractors. */
  distractorPool: Country[];
  /** country id → one clue text, for trivia. */
  factsByCountryId: Map<number, string>;
  /** country id → fact database id, for trivia rotation tracking. */
  factIdsByCountryId?: Map<number, number>;
  /**
   * The payload's answer salt, for type-in auto-accept (#69). Omitted for every
   * other format, and omitting it for a type-in round simply leaves the hashes
   * off — auto-accept is then unavailable and nothing else changes.
   */
  answerSalt?: string;
}

export async function buildQuestions(input: QuestionBuildInput): Promise<QuizQuestion[]> {
  const {
    definition,
    countries,
    distractorPool,
    factsByCountryId,
    factIdsByCountryId,
    answerSalt,
  } = input;

  return Promise.all(
    countries.map(async (country, index) => {
      const question: QuizQuestion = {
        sequence: index + 1,
        countryId: country.id,
        ...promptFor(definition, country, factsByCountryId),
      };
      if (factIdsByCountryId) {
        const fid = factIdsByCountryId.get(country.id);
        if (fid !== undefined) {
          question.factId = fid;
        }
      }
      if (definition.format === 'multiple_choice') {
        question.options = buildOptions(definition, country, distractorPool);
      }
      if (definition.format === 'type_in' && answerSalt) {
        question.answerHashes = await answerHashesFor(definition, country, answerSalt);
      }
      return question;
    }),
  );
}

/**
 * The question as the player saw it. Exported because the results screen's
 * missed list needs the same string: a missed row is the question and the
 * answer, and rebuilding the question a second way is how the two drift.
 */
export function promptFor(
  definition: QuizTypeDefinition,
  country: Country,
  factsByCountryId: Map<number, string>,
): Pick<QuizQuestion, 'promptLabel' | 'promptText' | 'promptIsoCode'> {
  switch (definition.category) {
    case 'capitals':
      return definition.direction === 'country_to_attribute'
        ? { promptLabel: 'Capital of', promptText: country.name }
        : { promptLabel: 'Country of the capital', promptText: country.capital };
    case 'flags':
      return definition.direction === 'attribute_to_country'
        ? {
            promptLabel: 'Which country does this flag belong to?',
            promptText: '',
            promptIsoCode: country.isoCode,
          }
        : { promptLabel: 'Which flag belongs to', promptText: country.name };
    case 'trivia':
      return {
        promptLabel: 'Fun fact',
        promptText: factsByCountryId.get(country.id) ?? '',
      };
    case 'countries':
    default:
      return { promptLabel: 'Name a country', promptText: '' };
  }
}

/**
 * Three distractors plus the answer, shuffled. Distractors are drawn from the
 * same region first so the choice is a real test rather than a continent quiz,
 * falling back to the wider pool for the small regions.
 */
function buildOptions(
  definition: QuizTypeDefinition,
  country: Country,
  pool: Country[],
): QuizOption[] {
  const asCapital = answerDomainFor(definition) === 'capital';
  const label = (c: Country): string => (asCapital ? c.capital : c.name);
  const correctLabel = label(country);

  const sameRegion = pool.filter((c) => c.id !== country.id && c.region === country.region);
  const elsewhere = pool.filter((c) => c.id !== country.id && c.region !== country.region);
  const candidates = [...shuffle(sameRegion), ...shuffle(elsewhere)];

  const chosen: Country[] = [];
  const usedLabels = new Set([correctLabel]);
  for (const candidate of candidates) {
    if (chosen.length >= OPTIONS_PER_QUESTION - 1) {
      break;
    }
    const candidateLabel = label(candidate);
    if (usedLabels.has(candidateLabel)) {
      continue;
    }
    usedLabels.add(candidateLabel);
    chosen.push(candidate);
  }

  const showFlags = definition.category === 'flags' && definition.direction === 'country_to_attribute';
  const options: QuizOption[] = shuffle([country, ...chosen]).map((c, index) => {
    const option: QuizOption = { id: `opt-${index + 1}`, label: label(c) };
    if (showFlags) {
      option.isoCode = c.isoCode;
    }
    return option;
  });
  return options;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i] as T;
    const b = copy[j] as T;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

/** Picks one clue per country, at random when a country has several. */
export async function loadFacts(
  prisma: PrismaClient,
  countryIds: number[],
): Promise<{ factsByCountryId: Map<number, string>; factIdsByCountryId: Map<number, number> }> {
  if (countryIds.length === 0) {
    return { factsByCountryId: new Map(), factIdsByCountryId: new Map() };
  }
  const rows = await prisma.countryFact.findMany({
    where: { countryId: { in: countryIds } },
    select: { id: true, countryId: true, fact: true },
  });
  const grouped = new Map<number, { id: number; fact: string }[]>();
  for (const row of rows) {
    const existing = grouped.get(row.countryId);
    if (existing) {
      existing.push({ id: row.id, fact: row.fact });
    } else {
      grouped.set(row.countryId, [{ id: row.id, fact: row.fact }]);
    }
  }
  const factsByCountryId = new Map<number, string>();
  const factIdsByCountryId = new Map<number, number>();
  for (const [countryId, facts] of grouped) {
    const choice = facts[Math.floor(Math.random() * facts.length)];
    if (choice !== undefined) {
      factsByCountryId.set(countryId, choice.fact);
      factIdsByCountryId.set(countryId, choice.id);
    }
  }
  return { factsByCountryId, factIdsByCountryId };
}

/** Loads specific facts by their IDs (for session rehydration). */
export async function loadFactsByIds(
  prisma: PrismaClient,
  factIds: number[],
): Promise<{ factsByCountryId: Map<number, string>; factIdsByCountryId: Map<number, number> }> {
  if (factIds.length === 0) {
    return { factsByCountryId: new Map(), factIdsByCountryId: new Map() };
  }
  const rows = await prisma.countryFact.findMany({
    where: { id: { in: factIds } },
    select: { id: true, countryId: true, fact: true },
  });
  const factsByCountryId = new Map<number, string>();
  const factIdsByCountryId = new Map<number, number>();
  for (const row of rows) {
    factsByCountryId.set(row.countryId, row.fact);
    factIdsByCountryId.set(row.countryId, row.id);
  }
  return { factsByCountryId, factIdsByCountryId };
}

/**
 * Records a fact as answered in the per-fact rotation table.
 * Only called for signed-in trivia sessions.
 */
export async function recordFactProgress(
  prisma: Db,
  userId: string,
  factId: number,
  answeredAt: Date,
): Promise<void> {
  await prisma.factProgress.upsert({
    where: { userId_factId: { userId, factId } },
    create: { userId, factId, lastAnsweredAt: answeredAt },
    update: { lastAnsweredAt: answeredAt },
  });
}

/**
 * Makes sure a clue has a rotation row, without moving one that exists: for the
 * replay of an answer that was already recorded, where the clue may have been
 * answered again since in a later round.
 */
export async function ensureFactProgress(
  prisma: Db,
  userId: string,
  factId: number,
  answeredAt: Date,
): Promise<void> {
  await prisma.factProgress.upsert({
    where: { userId_factId: { userId, factId } },
    create: { userId, factId, lastAnsweredAt: answeredAt },
    update: {},
  });
}
