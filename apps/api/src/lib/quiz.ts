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
  quizTypeByKey,
} from '@cartomancer/shared';
import type { Country, PrismaClient, QuizType } from '@cartomancer/db';
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

/**
 * Selects trivia clues with per-clue rotation, filtering on the clue's own
 * difficulty (not the country's).
 *
 * Signed in: clues ordered by `fact_progress.last_answered_at ASC NULLS FIRST`
 * so never-seen clues come first. The cycle restarts only after every matching
 * clue has been answered.
 *
 * Guest: the caller passes `excludeFactIds` (from localStorage); excluded facts
 * are skipped. When the exclude list covers everything, the API returns whatever
 * is available (the client resets the list on short rounds).
 *
 * In both cases, at most one clue per country is selected in a round.
 */
export async function selectFacts(
  prisma: PrismaClient,
  options: {
    userId: string | null;
    filters: SelectionFilters;
    limit: number;
    excludeFactIds?: number[];
  },
): Promise<SelectedFact[]> {
  const { userId, filters, limit, excludeFactIds } = options;
  const region = filters.region === ALL_FILTER ? null : filters.region;
  const difficulty = filters.difficulty === ALL_FILTER ? null : filters.difficulty;

  const overFetch = Math.min(limit * 4, 600);

  let rows: { fact_id: number; country_id: number; fact: string }[];

  if (userId !== null) {
    rows = await prisma.$queryRawUnsafe<typeof rows>(
      `SELECT f.id AS fact_id, f.country_id, f.fact
         FROM country_facts f
         JOIN countries c ON c.id = f.country_id
         LEFT JOIN fact_progress fp ON fp.fact_id = f.id AND fp.user_id = $3::uuid
        WHERE ($1::text IS NULL OR c.region = $1)
          AND ($2::text IS NULL OR f.difficulty = $2)
        ORDER BY fp.last_answered_at ASC NULLS FIRST, random()
        LIMIT $4`,
      region,
      difficulty,
      userId,
      overFetch,
    );
  } else {
    const excludeIds = excludeFactIds?.length ? excludeFactIds : [0];
    rows = await prisma.$queryRawUnsafe<typeof rows>(
      `SELECT f.id AS fact_id, f.country_id, f.fact
         FROM country_facts f
         JOIN countries c ON c.id = f.country_id
        WHERE ($1::text IS NULL OR c.region = $1)
          AND ($2::text IS NULL OR f.difficulty = $2)
          AND f.id != ALL($4::int[])
        ORDER BY random()
        LIMIT $3`,
      region,
      difficulty,
      overFetch,
      excludeIds,
    );

    if (rows.length < limit && excludeFactIds?.length) {
      const fallback = await prisma.$queryRawUnsafe<typeof rows>(
        `SELECT f.id AS fact_id, f.country_id, f.fact
           FROM country_facts f
           JOIN countries c ON c.id = f.country_id
          WHERE ($1::text IS NULL OR c.region = $1)
            AND ($2::text IS NULL OR f.difficulty = $2)
          ORDER BY random()
          LIMIT $3`,
        region,
        difficulty,
        overFetch,
      );
      const existingIds = new Set(rows.map((r) => r.fact_id));
      for (const r of fallback) {
        if (!existingIds.has(r.fact_id)) {
          rows.push(r);
          existingIds.add(r.fact_id);
        }
      }
    }
  }

  const selected: SelectedFact[] = [];
  const seenCountries = new Set<number>();
  for (const row of rows) {
    if (seenCountries.has(row.country_id)) continue;
    seenCountries.add(row.country_id);
    selected.push({ factId: row.fact_id, countryId: row.country_id, fact: row.fact });
    if (selected.length >= limit) break;
  }
  return selected;
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
}

export function buildQuestions(input: QuestionBuildInput): QuizQuestion[] {
  const { definition, countries, distractorPool, factsByCountryId, factIdsByCountryId } = input;

  return countries.map((country, index) => {
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
    return question;
  });
}

function promptFor(
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
  prisma: PrismaClient,
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
