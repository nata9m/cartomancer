import { randomUUID } from 'node:crypto';
import {
  ALL_FILTER,
  type AnswerResult,
  type MissedQuestion,
  type QuizSession as QuizSessionPayload,
  type QuizQuestion,
  type SessionResults,
  quizTypeByKey,
} from '@cartomancer/shared';
import type { Country, PrismaClient } from '@cartomancer/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { checkAnswer } from '../lib/matching.js';
import { loadSummary, newlyLearnedInSession, recordProgress } from '../lib/progress.js';
import {
  answerDomainFor,
  buildQuestions,
  clampQuestionCount,
  expectedAnswerFor,
  loadFacts,
  parseDifficulty,
  parseRegion,
  resolveQuizType,
  selectCountryIds,
  summarize,
} from '../lib/quiz.js';

const startSessionSchema = z.object({
  quizTypeKey: z.string().min(1),
  region: z.string().optional(),
  difficulty: z.string().optional(),
  questionCount: z.union([z.number(), z.string()]).optional(),
});

const answerSchema = z.object({
  sequence: z.coerce.number().int().positive(),
  answer: z.string().max(200),
  timeTakenMs: z.coerce.number().int().nonnegative().max(3_600_000).optional(),
});

const checkSchema = z.object({
  quizTypeKey: z.string().min(1),
  countryId: z.coerce.number().int().positive(),
  answer: z.string().max(200),
});

/** Guest session ids are client-side only; this marks them as such. */
const GUEST_SESSION_PREFIX = 'guest-';

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

    const countryIds = await selectCountryIds(app.prisma, {
      userId,
      quizTypeId: quizTypeRow.id,
      filters,
      limit: requestedCount,
      requireFacts: definition.category === 'trivia',
    });
    if (countryIds.length === 0) {
      throw badRequest(
        definition.category === 'trivia'
          ? 'No countries with trivia clues match those filters yet — see TODO(trivia)'
          : 'No countries match those filters',
      );
    }

    const countries = await loadCountriesInOrder(app.prisma, countryIds);
    const distractorPool = await app.prisma.country.findMany();
    const factsByCountryId =
      definition.category === 'trivia' ? await loadFacts(app.prisma, countryIds) : new Map();
    const questions = buildQuestions({ definition, countries, distractorPool, factsByCountryId });

    if (userId === null) {
      const payload: QuizSessionPayload = {
        id: `${GUEST_SESSION_PREFIX}${randomUUID()}`,
        quizType: summarize(definition),
        regionFilter: filters.region,
        difficultyFilter: filters.difficulty,
        questionCount: questions.length,
        questions,
        isGuest: true,
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
    };
    return reply.code(201).send(payload);
  });

  /**
   * Rehydrates a persisted session (a refresh mid-quiz, or a direct link).
   * Options are regenerated rather than stored: they are presentation, and
   * regenerating them keeps `session_questions` the single source of truth for
   * what was asked.
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
    const distractorPool = await app.prisma.country.findMany();
    const factsByCountryId =
      definition.category === 'trivia'
        ? await loadFacts(
            app.prisma,
            session.questions.map((q) => q.countryId),
          )
        : new Map();
    const questions: QuizQuestion[] = buildQuestions({
      definition,
      countries,
      distractorPool,
      factsByCountryId,
    });

    const answered = await app.prisma.sessionAnswer.findMany({
      where: { sessionId: session.id, userId: userId as string },
      select: { countryId: true, wasCorrect: true },
    });

    const payload: QuizSessionPayload & { answered: { countryId: number; wasCorrect: boolean }[] } = {
      id: session.id,
      quizType: summarize(definition),
      regionFilter: (session.regionFilter ?? ALL_FILTER) as QuizSessionPayload['regionFilter'],
      difficultyFilter: (session.difficultyFilter ??
        ALL_FILTER) as QuizSessionPayload['difficultyFilter'],
      questionCount: session.questionCount,
      questions,
      isGuest: false,
      answered,
    };
    return payload;
  });

  /**
   * Submits an answer for a persisted session: checks it, records it, and
   * updates the streak/learned state.
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

    const already = await app.prisma.sessionAnswer.findUnique({
      where: {
        sessionId_userId_countryId: { sessionId: session.id, userId, countryId: country.id },
      },
    });
    if (already) {
      // Re-answering would let a streak be farmed off one question.
      throw conflict(`Question ${body.sequence} has already been answered`);
    }

    const outcome = await checkAnswer(app.prisma, {
      answer: body.answer,
      domain: answerDomainFor(definition),
      expectedCountryId: country.id,
    });
    const answeredAt = new Date();

    await app.prisma.sessionAnswer.create({
      data: {
        sessionId: session.id,
        userId,
        countryId: country.id,
        wasCorrect: outcome.isMatch,
        timeTakenMs: body.timeTakenMs ?? null,
        answeredAt,
      },
    });
    const progress = await recordProgress(app.prisma, {
      userId,
      quizTypeId: session.quizTypeId,
      quizTypeKey: session.quizType.key,
      countryId: country.id,
      wasCorrect: outcome.isMatch,
      answeredAt,
    });
    await syncParticipantScore(app.prisma, session.id, userId);

    const result: AnswerResult = {
      wasCorrect: outcome.isMatch,
      correctAnswer: expectedAnswerFor(definition, country),
      correctCountryId: country.id,
      correctCountryName: country.name,
      correctIsoCode: country.isoCode,
      matchedBy: outcome.matchedBy,
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
    const outcome = await checkAnswer(app.prisma, {
      answer: body.answer,
      domain: answerDomainFor(definition),
      expectedCountryId: country.id,
    });
    const result: AnswerResult = {
      wasCorrect: outcome.isMatch,
      correctAnswer: expectedAnswerFor(definition, country),
      correctCountryId: country.id,
      correctCountryName: country.name,
      correctIsoCode: country.isoCode,
      matchedBy: outcome.matchedBy,
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
    return buildResults(app.prisma, session.id, userId);
  });

  app.get('/api/sessions/:id/results', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest sessions are not persisted — results are computed client-side');
    }
    const { id } = request.params as { id: string };
    const session = await loadOwnedSession(app.prisma, id, userId);
    return buildResults(app.prisma, session.id, userId);
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
  return countryIds
    .map((id) => byId.get(id))
    .filter((row): row is Country => row !== undefined);
}

/** Keeps `session_participants.score` as the count of this user's correct answers. */
async function syncParticipantScore(
  prisma: PrismaClient,
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
): Promise<SessionResults> {
  const session = await prisma.quizSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { quizType: true, questions: { orderBy: { sequence: 'asc' } } },
  });
  const definition = requireDefinition(session.quizType.key);

  const answers = await prisma.sessionAnswer.findMany({
    where: { sessionId, userId },
    include: { country: true },
    orderBy: { answeredAt: 'asc' },
  });
  const score = answers.filter((answer) => answer.wasCorrect).length;
  const total = session.questionCount;
  const missed: MissedQuestion[] = answers
    .filter((answer) => !answer.wasCorrect)
    .map((answer) => ({
      countryId: answer.countryId,
      countryName: answer.country.name,
      isoCode: answer.country.isoCode,
      correctAnswer: expectedAnswerFor(definition, answer.country),
    }));

  const newlyLearned = await newlyLearnedInSession(prisma, {
    userId,
    quizTypeId: session.quizTypeId,
    quizTypeKey: session.quizType.key,
    countryIds: session.questions.map((question) => question.countryId),
    since: session.createdAt,
  });
  const summary = await loadSummary(prisma, userId);

  return {
    sessionId,
    quizType: summarize(definition),
    regionFilter: (session.regionFilter ?? ALL_FILTER) as SessionResults['regionFilter'],
    difficultyFilter: (session.difficultyFilter ?? ALL_FILTER) as SessionResults['difficultyFilter'],
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
