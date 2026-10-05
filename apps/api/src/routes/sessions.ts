import { randomUUID } from 'node:crypto';
import {
  ALL_FILTER,
  type AnswerResult,
  type MissedQuestion,
  type QuizSession as QuizSessionPayload,
  type QuizQuestion,
  type QuizTypeDefinition,
  type SessionResults,
  createAnswerSalt,
  qualityFromTime,
  quizTypeByKey,
} from '@cartomancer/shared';
import type { Country, PrismaClient } from '@cartomancer/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../errors.js';
import { type Db, isUniqueViolation, lockParticipant } from '../lib/db.js';
import { loadAllCountries } from '../lib/countries.js';
import { requestTimeZone } from '../timezone.js';
import { loadSummary, newlyLearnedInSession, recordProgress } from '../lib/progress.js';
import {
  buildQuestions,
  clampQuestionCount,
  expectedAnswerFor,
  judgeAnswer,
  loadFacts,
  loadFactsByIds,
  shuffle,
  parseDifficulty,
  parseRegion,
  promptFor,
  ensureFactProgress,
  recordFactProgress,
  resolveQuizType,
  selectCountryIds,
  selectFacts,
  summarize,
} from '../lib/quiz.js';

const startSessionSchema = z.object({
  quizTypeKey: z.string().min(1),
  region: z.string().optional(),
  difficulty: z.string().optional(),
  questionCount: z.union([z.number(), z.string()]).optional(),
  /**
   * An explicit set of countries to ask about, in place of the usual selection
   * (#51): the ones just missed, or the ones that need review. Region and
   * difficulty are then ignored — they describe how to choose, and nothing is
   * being chosen. Capped at the number of countries there are.
   */
  countryIds: z.array(z.coerce.number().int().positive()).min(1).max(195).optional(),
  /**
   * Guest rotation (#70): clue id → epoch ms it was last answered, one list per
   * browser. Ignored for signed-in play, where fact_progress is the memory. The
   * cap is generous next to a library of a few hundred clues and exists only so
   * a request cannot be made arbitrarily large.
   */
  seenFacts: z
    .record(z.string().regex(/^\d+$/), z.number().int().nonnegative())
    .refine((seen) => Object.keys(seen).length <= 2000, 'seenFacts is too large')
    .optional(),
  /**
   * Guest rotation for the country quizzes (#96): country id → epoch ms it was
   * last asked, one list per quiz type. Ignored for signed-in play, where
   * progress.last_answered_at is the memory.
   */
  seenCountries: z
    .record(z.string().regex(/^\d+$/), z.number().int().nonnegative())
    .refine((seen) => Object.keys(seen).length <= 400, 'seenCountries is too large')
    .optional(),
});

const answerSchema = z.object({
  sequence: z.coerce.number().int().positive(),
  answer: z.string().max(200),
  timeTakenMs: z.coerce.number().int().nonnegative().max(3_600_000).optional(),
  /** The player took the type-in hint: a correct answer then leaves the streak alone (#53). */
  hintUsed: z.boolean().optional(),
});

const checkSchema = z.object({
  quizTypeKey: z.string().min(1),
  countryId: z.coerce.number().int().positive(),
  answer: z.string().max(200),
  hintUsed: z.boolean().optional(),
});

/**
 * For a wrong answer that exactly names another country, that country's name
 * (#53). A fuzzy near-miss is not reported: it is not an answer to anything, and
 * naming a country the player did not clearly type would be a guess presented as
 * fact.
 */
async function namedCountry(
  prisma: PrismaClient,
  outcome: { isMatch: boolean; matchedCountryId: number | null },
): Promise<{ matchedCountryName?: string }> {
  if (outcome.isMatch || outcome.matchedCountryId === null) {
    return {};
  }
  const named = await prisma.country.findUnique({
    where: { id: outcome.matchedCountryId },
    select: { name: true },
  });
  return named ? { matchedCountryName: named.name } : {};
}

/** Guest session ids are client-side only; this marks them as such. */
const GUEST_SESSION_PREFIX = 'guest-';

/**
 * The salt this payload's type-in answer hashes are built with (#69), or
 * undefined for the formats that carry no hashes.
 *
 * Minted per response, not per stored session: the salt only has to agree with
 * the hashes alongside it, so a refresh mid-round gets a fresh pair and there
 * is nothing to persist, rotate, or keep in step with a rolling restart.
 */
function answerSaltFor(definition: QuizTypeDefinition): string | undefined {
  return definition.format === 'type_in' ? createAnswerSalt() : undefined;
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Starts a quiz.
   *
   * Signed in: rows in quiz_sessions / session_participants / session_questions,
   * so the session survives a refresh and results can be recomputed later.
   *
   * Guest: the very same question set is returned with a `guest-…` id and
   * `isGuest: true`, and NOTHING is written. The web app keeps that payload in
   * sessionStorage and checks answers through /api/answers/check. This is why
   * guests never need a synthetic row in `users`.
   */
  app.post('/api/sessions', async (request, reply) => {
    const body = startSessionSchema.parse(request.body ?? {});
    const { userId } = request.actor;
    const { row: quizTypeRow, definition } = await resolveQuizType(app.prisma, body.quizTypeKey);

    if (definition.format === 'recall') {
      throw badRequest('Use POST /api/recall for active-recall sessions');
    }

    const filters = {
      region: parseRegion(body.region),
      difficulty: parseDifficulty(body.difficulty),
    };
    const requestedCount = clampQuestionCount(body.questionCount);

    let countryIds: number[];
    let factsByCountryId: Map<number, string>;
    let factIdsByCountryId: Map<number, number> | undefined;

    if (body.countryIds) {
      const requested = [...new Set(body.countryIds)];
      const known = await app.prisma.country.findMany({
        where: { id: { in: requested } },
        select: { id: true },
      });
      if (known.length !== requested.length) {
        throw badRequest('countryIds names a country that does not exist');
      }
      countryIds = requested;
      factsByCountryId = new Map();
      if (definition.category === 'trivia') {
        // Only countries with a clue can be asked about; a missed trivia
        // question had one, so this drops nothing it came from.
        const loaded = await loadFacts(app.prisma, requested);
        factsByCountryId = loaded.factsByCountryId;
        factIdsByCountryId = loaded.factIdsByCountryId;
        countryIds = requested.filter((id) => factsByCountryId.has(id));
        if (countryIds.length === 0) {
          throw badRequest('None of those countries has a trivia clue');
        }
      }
      // The order they were asked for is the order they were missed in, which
      // is the order they were asked in the first place: a drill that repeats
      // the sequence invites answering from position rather than from memory.
      countryIds = shuffle(countryIds);
    } else if (definition.category === 'trivia') {
      const selectedFacts = await selectFacts(app.prisma, {
        userId,
        filters,
        limit: requestedCount,
        seenFacts: body.seenFacts,
      });

      if (selectedFacts.length === 0) {
        throw badRequest(
          'No trivia clues match those filters. Try a different region or difficulty.',
        );
      }

      countryIds = selectedFacts.map((f) => f.countryId);
      factsByCountryId = new Map(selectedFacts.map((f) => [f.countryId, f.fact]));
      factIdsByCountryId = new Map(selectedFacts.map((f) => [f.countryId, f.factId]));
    } else {
      countryIds = await selectCountryIds(app.prisma, {
        userId,
        quizTypeId: quizTypeRow.id,
        filters,
        limit: requestedCount,
        requireFacts: false,
        seenCountries: body.seenCountries,
      });

      if (countryIds.length === 0) {
        throw badRequest('No countries match those filters');
      }

      factsByCountryId = new Map();
    }

    const countries = await loadCountriesInOrder(app.prisma, countryIds);
    const distractorPool = await loadAllCountries(app.prisma);
    const answerSalt = answerSaltFor(definition);
    const questions = await buildQuestions({
      definition,
      countries,
      distractorPool,
      factsByCountryId,
      factIdsByCountryId,
      answerSalt,
    });

    if (userId === null) {
      const payload: QuizSessionPayload = {
        id: `${GUEST_SESSION_PREFIX}${randomUUID()}`,
        quizType: summarize(definition),
        regionFilter: filters.region,
        difficultyFilter: filters.difficulty,
        questionCount: questions.length,
        questions,
        isGuest: true,
        answerSalt,
      };
      return reply.code(201).send(payload);
    }

    const session = await app.prisma.quizSession.create({
      data: {
        quizTypeId: quizTypeRow.id,
        regionFilter: filters.region === ALL_FILTER ? null : filters.region,
        difficultyFilter: filters.difficulty === ALL_FILTER ? null : filters.difficulty,
        questionCount: questions.length,
        mode: 'solo',
        status: 'active',
        createdBy: userId,
        participants: { create: [{ userId }] },
        questions: {
          create: questions.map((question) => ({
            sequence: question.sequence,
            countryId: question.countryId,
            factId: question.factId ?? null,
          })),
        },
      },
    });

    const payload: QuizSessionPayload = {
      id: session.id,
      quizType: summarize(definition),
      regionFilter: filters.region,
      difficultyFilter: filters.difficulty,
      questionCount: questions.length,
      questions,
      isGuest: false,
      answerSalt,
    };
    return reply.code(201).send(payload);
  });

  /**
   * Rehydrates a persisted session (a refresh mid-quiz, or a direct link).
   * For trivia, the stored fact_id ensures the same clue is shown, rather than
   * picking a random one.
   */
  app.get('/api/sessions/:id', async (request) => {
    const { userId } = request.actor;
    const { id } = request.params as { id: string };
    const session = await loadOwnedSession(app.prisma, id, userId);
    const definition = requireDefinition(session.quizType.key);

    const countries = await loadCountriesInOrder(
      app.prisma,
      session.questions.map((q) => q.countryId),
    );
    const distractorPool = await loadAllCountries(app.prisma);

    let factsByCountryId: Map<number, string>;
    let factIdsByCountryId: Map<number, number> | undefined;

    if (definition.category === 'trivia') {
      const storedFactIds = session.questions
        .map((q) => q.factId)
        .filter((id): id is number => id != null);

      if (storedFactIds.length > 0) {
        const loaded = await loadFactsByIds(app.prisma, storedFactIds);
        factsByCountryId = loaded.factsByCountryId;
        factIdsByCountryId = loaded.factIdsByCountryId;
      } else {
        const loaded = await loadFacts(
          app.prisma,
          session.questions.map((q) => q.countryId),
        );
        factsByCountryId = loaded.factsByCountryId;
        factIdsByCountryId = loaded.factIdsByCountryId;
      }
    } else {
      factsByCountryId = new Map();
    }

    const answerSalt = answerSaltFor(definition);
    const questions: QuizQuestion[] = await buildQuestions({
      definition,
      countries,
      distractorPool,
      factsByCountryId,
      factIdsByCountryId,
      answerSalt,
    });

    const answered = await app.prisma.sessionAnswer.findMany({
      where: { sessionId: session.id, userId: userId as string },
      select: { countryId: true, wasCorrect: true },
    });

    const payload: QuizSessionPayload & { answered: { countryId: number; wasCorrect: boolean }[] } =
      {
        id: session.id,
        quizType: summarize(definition),
        regionFilter: (session.regionFilter ?? ALL_FILTER) as QuizSessionPayload['regionFilter'],
        difficultyFilter: (session.difficultyFilter ??
          ALL_FILTER) as QuizSessionPayload['difficultyFilter'],
        questionCount: session.questionCount,
        questions,
        isGuest: false,
        answerSalt,
        answered,
      };
    return payload;
  });

  /**
   * Submits an answer for a persisted session: checks it, records it, and
   * updates the streak/learned state. For trivia, also updates fact_progress
   * so the clue rotates.
   */
  app.post('/api/sessions/:id/answers', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest sessions are not persisted — use POST /api/answers/check');
    }
    const { id } = request.params as { id: string };
    const body = answerSchema.parse(request.body ?? {});
    const session = await loadOwnedSession(app.prisma, id, userId);
    const definition = requireDefinition(session.quizType.key);

    const question = session.questions.find((q) => q.sequence === body.sequence);
    if (!question) {
      throw notFound(`Session has no question ${body.sequence}`);
    }
    const country = await app.prisma.country.findUniqueOrThrow({
      where: { id: question.countryId },
    });

    // Answering twice is a retry, not a conflict (#58). A request can commit
    // here and still never reach the browser — a dropped connection, a TLS
    // failure on the way back — and the only thing the player can do is send it
    // again. So a repeat returns what was recorded, writes nothing, and scores
    // nothing twice: the row, the streak and the day's activity all stay as the
    // first call left them.
    const findRecorded = () =>
      app.prisma.sessionAnswer.findUnique({
        where: {
          sessionId_userId_countryId: { sessionId: session.id, userId, countryId: country.id },
        },
      });
    const replay = async (recorded: NonNullable<Awaited<ReturnType<typeof findRecorded>>>) =>
      replayAnswer(app.prisma, {
        recorded,
        userId,
        quizTypeId: session.quizTypeId,
        definition,
        country,
        factId: question.factId,
      });

    const already = await findRecorded();
    if (already) {
      return replay(already);
    }

    const outcome = await judgeAnswer(app.prisma, definition, country, body.answer);
    const answeredAt = new Date();

    // The four writes are one unit (#54). They used to be four statements, so a
    // failure part-way left an answer with no streak behind it, or a streak with
    // no answer, or a score that disagreed with `session_answers` — and nothing
    // ever reconciled them. Now either all of it happened or none of it did,
    // and a retry starts from a clean slate.
    //
    // The participant lock comes first (see `lockParticipant`): it is what makes
    // a second submit of this question wait for the first rather than race it,
    // and what keeps the recounted score right when different questions of the
    // session are answered together.
    let progress;
    try {
      progress = await app.prisma.$transaction(async (tx) => {
        await lockParticipant(tx, session.id, userId);
        await tx.sessionAnswer.create({
          data: {
            sessionId: session.id,
            userId,
            countryId: country.id,
            wasCorrect: outcome.isMatch,
            timeTakenMs: body.timeTakenMs ?? null,
            answeredAt,
          },
        });
        const update = await recordProgress(tx, {
          userId,
          quizTypeId: session.quizTypeId,
          quizTypeKey: session.quizType.key,
          countryId: country.id,
          wasCorrect: outcome.isMatch,
          hintUsed: body.hintUsed,
          quality: qualityFromTime(definition.format, body.timeTakenMs),
          answeredAt,
        });
        if (definition.category === 'trivia' && question.factId) {
          await recordFactProgress(tx, userId, question.factId, answeredAt);
        }
        await syncParticipantScore(tx, session.id, userId);
        return update;
      });
    } catch (error) {
      // Lost the race to another submit of this same question: a double tap, or
      // a client retry (#58) arriving while the original is still in flight. Both
      // got past the check above; the primary key let one of them through. That
      // is the same situation as a repeat that arrives later, so it gets the same
      // answer — what the winner recorded — rather than a 500, or a 409 that
      // would tell the player their answer failed when it was counted.
      if (isUniqueViolation(error)) {
        const recorded = await findRecorded();
        if (recorded) {
          return replay(recorded);
        }
      }
      throw error;
    }

    const result: AnswerResult = {
      wasCorrect: outcome.isMatch,
      correctAnswer: expectedAnswerFor(definition, country),
      correctCountryId: country.id,
      correctCountryName: country.name,
      correctIsoCode: country.isoCode,
      matchedBy: outcome.matchedBy,
      ...(await namedCountry(app.prisma, outcome)),
      currentStreak: progress.currentStreak,
      isLearned: progress.isLearned,
      newlyLearned: progress.newlyLearned,
    };
    return result;
  });

  /**
   * Stateless answer check for guest play: identical matching, zero writes.
   */
  app.post('/api/answers/check', async (request) => {
    const body = checkSchema.parse(request.body ?? {});
    const definition = requireDefinition(body.quizTypeKey);
    const country = await app.prisma.country.findUnique({ where: { id: body.countryId } });
    if (!country) {
      throw notFound(`Unknown country ${body.countryId}`);
    }
    const outcome = await judgeAnswer(app.prisma, definition, country, body.answer);
    const result: AnswerResult = {
      wasCorrect: outcome.isMatch,
      correctAnswer: expectedAnswerFor(definition, country),
      correctCountryId: country.id,
      correctCountryName: country.name,
      correctIsoCode: country.isoCode,
      matchedBy: outcome.matchedBy,
      ...(await namedCountry(app.prisma, outcome)),
      currentStreak: null,
      isLearned: null,
      newlyLearned: false,
    };
    return result;
  });

  app.post('/api/sessions/:id/finish', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest sessions are not persisted — results are computed client-side');
    }
    const { id } = request.params as { id: string };
    const session = await loadOwnedSession(app.prisma, id, userId);

    await app.prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      data: { finishedAt: new Date() },
    });
    const everyoneDone = await app.prisma.sessionParticipant.count({
      where: { sessionId: session.id, finishedAt: null },
    });
    if (everyoneDone === 0) {
      await app.prisma.quizSession.update({
        where: { id: session.id },
        data: { status: 'finished' },
      });
    }
    await syncParticipantScore(app.prisma, session.id, userId);
    return buildResults(app.prisma, session.id, userId, requestTimeZone(request));
  });

  app.get('/api/sessions/:id/results', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest sessions are not persisted — results are computed client-side');
    }
    const { id } = request.params as { id: string };
    const session = await loadOwnedSession(app.prisma, id, userId);
    return buildResults(app.prisma, session.id, userId, requestTimeZone(request));
  });
}

type LoadedSession = Awaited<ReturnType<typeof loadOwnedSession>>;

async function loadOwnedSession(prisma: PrismaClient, id: string, userId: string | null) {
  if (userId === null) {
    throw forbidden('Sign in to load a persisted session');
  }
  if (id.startsWith(GUEST_SESSION_PREFIX)) {
    throw notFound('Guest sessions are not stored server-side');
  }
  const session = await prisma.quizSession.findUnique({
    where: { id },
    include: {
      quizType: true,
      questions: { orderBy: { sequence: 'asc' } },
      participants: true,
    },
  });
  if (!session) {
    throw notFound(`Unknown session ${id}`);
  }
  if (!session.participants.some((participant) => participant.userId === userId)) {
    throw forbidden('That session belongs to someone else');
  }
  return session;
}

function requireDefinition(key: string) {
  const definition = quizTypeByKey(key);
  if (!definition) {
    throw badRequest(`Quiz type "${key}" has no taxonomy entry in @cartomancer/shared`);
  }
  return definition;
}

/** Preserves the rotation order the selection query produced. */
async function loadCountriesInOrder(
  prisma: PrismaClient,
  countryIds: number[],
): Promise<Country[]> {
  const rows = await prisma.country.findMany({ where: { id: { in: countryIds } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return countryIds.map((id) => byId.get(id)).filter((row): row is Country => row !== undefined);
}

/**
 * What a repeated answer reports: what was recorded the first time, written
 * nowhere and scored never. Shared by the plain repeat and by a concurrent
 * submit that lost the race, which are the same thing arriving at different
 * moments.
 */
async function replayAnswer(
  db: Db,
  input: {
    recorded: { wasCorrect: boolean; answeredAt: Date };
    userId: string;
    quizTypeId: number;
    definition: QuizTypeDefinition;
    country: Country;
    factId: number | null;
  },
): Promise<AnswerResult> {
  const { recorded, userId, quizTypeId, definition, country, factId } = input;
  // The first call may have died after writing the answer and before the clue's
  // rotation row. Without this a retry would replay "answered" and the clue
  // would stay unmet for good, to come straight back in the next round (#70).
  // `ensure` rather than record: an old session's replay must not drag a clue's
  // last-seen time backwards.
  if (definition.category === 'trivia' && factId) {
    await ensureFactProgress(db, userId, factId, recorded.answeredAt);
  }
  const progress = await db.progress.findUnique({
    where: {
      userId_countryId_quizTypeId: { userId, countryId: country.id, quizTypeId },
    },
  });
  return {
    wasCorrect: recorded.wasCorrect,
    correctAnswer: expectedAnswerFor(definition, country),
    correctCountryId: country.id,
    correctCountryName: country.name,
    correctIsoCode: country.isoCode,
    // Not re-matched: the stored row knows whether the answer was right, not
    // how it got there, and guessing between exact and alias would be telemetry
    // that says something the server never checked.
    matchedBy: 'replay',
    currentStreak: progress?.currentStreak ?? 0,
    isLearned: progress?.isLearned ?? false,
    // The crossing happened on the first call. This one reports state, not a
    // transition, so the "now learned" line is not shown a second time.
    newlyLearned: false,
  };
}

/** Keeps `session_participants.score` as the count of this user's correct answers. */
async function syncParticipantScore(
  prisma: Db,
  sessionId: string,
  userId: string,
): Promise<number> {
  const score = await prisma.sessionAnswer.count({
    where: { sessionId, userId, wasCorrect: true },
  });
  await prisma.sessionParticipant.update({
    where: { sessionId_userId: { sessionId, userId } },
    data: { score },
  });
  return score;
}

async function buildResults(
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
  timeZone: string,
): Promise<SessionResults> {
  const session = await prisma.quizSession.findUniqueOrThrow({
    where: { id: sessionId },
    // The clue is on the question, not the answer: session_answers records
    // which country was asked about, never which of its facts.
    include: {
      quizType: true,
      questions: { include: { fact: true }, orderBy: { sequence: 'asc' } },
    },
  });
  const definition = requireDefinition(session.quizType.key);

  const answers = await prisma.sessionAnswer.findMany({
    where: { sessionId, userId },
    include: { country: true },
    orderBy: { answeredAt: 'asc' },
  });
  const score = answers.filter((answer) => answer.wasCorrect).length;
  const total = session.questionCount;

  // Keyed by country because that is all an answer row carries; a country is
  // asked about at most once per session, which the session_answers primary
  // key (session, user, country) enforces.
  const questionByCountryId = new Map(
    session.questions.map((question) => [question.countryId, question]),
  );
  const factsByCountryId = new Map(
    session.questions
      .filter((question) => question.fact !== null)
      .map((question) => [question.countryId, question.fact!.fact]),
  );

  const missed: MissedQuestion[] = answers
    .filter((answer) => !answer.wasCorrect)
    .map((answer) => ({
      // The question it was: rebuilt with the same promptFor the round used,
      // rather than a second expression of the same rule.
      sequence: questionByCountryId.get(answer.countryId)?.sequence ?? 0,
      countryId: answer.countryId,
      countryName: answer.country.name,
      isoCode: answer.country.isoCode,
      promptText: promptFor(definition, answer.country, factsByCountryId).promptText,
      correctAnswer: expectedAnswerFor(definition, answer.country),
    }));

  const newlyLearned = await newlyLearnedInSession(prisma, {
    userId,
    quizTypeId: session.quizTypeId,
    countryIds: session.questions.map((question) => question.countryId),
    since: session.createdAt,
  });
  const summary = await loadSummary(prisma, userId, timeZone);

  return {
    sessionId,
    quizType: summarize(definition),
    regionFilter: (session.regionFilter ?? ALL_FILTER) as SessionResults['regionFilter'],
    difficultyFilter: (session.difficultyFilter ??
      ALL_FILTER) as SessionResults['difficultyFilter'],
    score,
    total,
    percentCorrect: total === 0 ? 0 : Math.round((score / total) * 100),
    newlyLearned,
    missed,
    dayStreak: summary.dayStreak,
    isGuest: false,
  };
}

export type { LoadedSession };
