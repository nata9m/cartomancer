import { randomUUID } from 'node:crypto';
import {
  ALL_FILTER,
  type RecallGuessResult,
  type RecallResults,
  type RecallSession,
  type RegionFilter,
} from '@cartomancer/shared';
import type { PrismaClient } from '@cartomancer/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound } from '../errors.js';
import { matchWithinPool } from '../lib/matching.js';
import { recordProgress } from '../lib/progress.js';
import { parseRegion, resolveQuizType } from '../lib/quiz.js';

const RECALL_QUIZ_TYPE_KEY = 'countries-recall';
const GUEST_SESSION_PREFIX = 'guest-';

const startSchema = z.object({ region: z.string().optional() });
const guessSchema = z.object({
  guess: z.string().max(200),
  alreadyRecalledCountryIds: z.array(z.coerce.number().int().positive()).max(195).optional(),
});
const guestCheckSchema = guessSchema.extend({ region: z.string().optional() });

export async function registerRecallRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Starts an active-recall round for a region.
   *
   * Recall reuses quiz_sessions: every country in the region is written to
   * session_questions up front, which is what lets the results screen list what
   * was missed without recomputing the region. There is no fixed question count,
   * so `question_count` is the size of the region.
   */
  app.post('/api/recall', async (request, reply) => {
    const body = startSchema.parse(request.body ?? {});
    const region = parseRegion(body.region);
    const { userId } = request.actor;
    const { row: quizTypeRow } = await resolveQuizType(app.prisma, RECALL_QUIZ_TYPE_KEY);

    const countries = await app.prisma.country.findMany({
      where: region === ALL_FILTER ? {} : { region },
      orderBy: { name: 'asc' },
      select: { id: true },
    });

    if (userId === null) {
      const payload: RecallSession = {
        id: `${GUEST_SESSION_PREFIX}${randomUUID()}`,
        region,
        totalInRegion: countries.length,
        isGuest: true,
      };
      return reply.code(201).send(payload);
    }

    const session = await app.prisma.quizSession.create({
      data: {
        quizTypeId: quizTypeRow.id,
        regionFilter: region === ALL_FILTER ? null : region,
        // Recall ignores the difficulty filter by design (region-only).
        difficultyFilter: null,
        questionCount: countries.length,
        mode: 'solo',
        status: 'active',
        createdBy: userId,
        participants: { create: [{ userId }] },
        questions: {
          create: countries.map((country, index) => ({
            sequence: index + 1,
            countryId: country.id,
          })),
        },
      },
    });

    const payload: RecallSession = {
      id: session.id,
      region,
      totalInRegion: countries.length,
      isGuest: false,
    };
    return reply.code(201).send(payload);
  });

  /** Rehydrates a recall round in progress (a refresh, or a direct link). */
  app.get('/api/recall/:id', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest recall rounds are not persisted');
    }
    const { id } = request.params as { id: string };
    const session = await loadOwnedRecallSession(app.prisma, id, userId);
    const answers = await app.prisma.sessionAnswer.findMany({
      where: { sessionId: session.id, userId, wasCorrect: true },
      include: { country: true },
      orderBy: { answeredAt: 'asc' },
    });
    const payload: RecallSession & { recalled: { id: number; name: string; isoCode: string }[] } = {
      id: session.id,
      region: (session.regionFilter ?? ALL_FILTER) as RegionFilter,
      totalInRegion: session.questionCount,
      isGuest: false,
      recalled: answers.map((answer) => ({
        id: answer.country.id,
        name: answer.country.name,
        isoCode: answer.country.isoCode,
      })),
    };
    return payload;
  });

  /**
   * One recall guess. A correct, novel guess is recorded and marks the country
   * learned outright — recall's threshold is a single successful recall, not
   * three in a row. A duplicate or unrecognised guess writes nothing: there is
   * no per-country "wrong answer" in recall, so nothing should be demoted.
   */
  app.post('/api/recall/:id/guesses', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest recall is not persisted — use POST /api/recall/check');
    }
    const { id } = request.params as { id: string };
    const body = guessSchema.parse(request.body ?? {});
    const session = await loadOwnedRecallSession(app.prisma, id, userId);

    const poolIds = session.questions.map((question) => question.countryId);
    const alreadyRecalled = await app.prisma.sessionAnswer.findMany({
      where: { sessionId: session.id, userId, wasCorrect: true },
      select: { countryId: true },
    });
    const recalledIds = new Set(alreadyRecalled.map((row) => row.countryId));

    const match = await matchWithinPool(app.prisma, body.guess, poolIds);
    if (!match) {
      const result: RecallGuessResult = {
        accepted: false,
        duplicate: false,
        country: null,
        recalledCount: recalledIds.size,
      };
      return result;
    }
    if (recalledIds.has(match.countryId)) {
      const country = await app.prisma.country.findUniqueOrThrow({ where: { id: match.countryId } });
      const result: RecallGuessResult = {
        accepted: false,
        duplicate: true,
        country: { id: country.id, name: country.name, isoCode: country.isoCode },
        recalledCount: recalledIds.size,
      };
      return result;
    }

    const country = await app.prisma.country.findUniqueOrThrow({ where: { id: match.countryId } });
    const answeredAt = new Date();
    await app.prisma.sessionAnswer.create({
      data: {
        sessionId: session.id,
        userId,
        countryId: country.id,
        wasCorrect: true,
        answeredAt,
      },
    });
    await recordProgress(app.prisma, {
      userId,
      quizTypeId: session.quizTypeId,
      quizTypeKey: RECALL_QUIZ_TYPE_KEY,
      countryId: country.id,
      wasCorrect: true,
      answeredAt,
    });
    await app.prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      data: { score: recalledIds.size + 1 },
    });

    const result: RecallGuessResult = {
      accepted: true,
      duplicate: false,
      country: { id: country.id, name: country.name, isoCode: country.isoCode },
      recalledCount: recalledIds.size + 1,
    };
    return result;
  });

  /** Stateless recall matching for guests; the client owns the recalled list. */
  app.post('/api/recall/check', async (request) => {
    const body = guestCheckSchema.parse(request.body ?? {});
    const region = parseRegion(body.region);
    const pool = await app.prisma.country.findMany({
      where: region === ALL_FILTER ? {} : { region },
      select: { id: true },
    });
    const already = new Set(body.alreadyRecalledCountryIds ?? []);
    const match = await matchWithinPool(
      app.prisma,
      body.guess,
      pool.map((row) => row.id),
    );
    if (!match) {
      const result: RecallGuessResult = {
        accepted: false,
        duplicate: false,
        country: null,
        recalledCount: already.size,
      };
      return result;
    }
    const country = await app.prisma.country.findUniqueOrThrow({ where: { id: match.countryId } });
    const duplicate = already.has(country.id);
    const result: RecallGuessResult = {
      accepted: !duplicate,
      duplicate,
      country: { id: country.id, name: country.name, isoCode: country.isoCode },
      recalledCount: duplicate ? already.size : already.size + 1,
    };
    return result;
  });

  app.post('/api/recall/:id/finish', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest recall is not persisted — results are computed client-side');
    }
    const { id } = request.params as { id: string };
    const session = await loadOwnedRecallSession(app.prisma, id, userId);
    await app.prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      data: { finishedAt: new Date() },
    });
    await app.prisma.quizSession.update({
      where: { id: session.id },
      data: { status: 'finished' },
    });
    return buildRecallResults(app.prisma, session.id, userId);
  });

  app.get('/api/recall/:id/results', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guest recall is not persisted — results are computed client-side');
    }
    const { id } = request.params as { id: string };
    const session = await loadOwnedRecallSession(app.prisma, id, userId);
    return buildRecallResults(app.prisma, session.id, userId);
  });
}

async function loadOwnedRecallSession(prisma: PrismaClient, id: string, userId: string) {
  if (id.startsWith(GUEST_SESSION_PREFIX)) {
    throw notFound('Guest recall sessions are not stored server-side');
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
    throw notFound(`Unknown recall session ${id}`);
  }
  if (session.quizType.key !== RECALL_QUIZ_TYPE_KEY) {
    throw notFound(`Session ${id} is not an active-recall session`);
  }
  if (!session.participants.some((participant) => participant.userId === userId)) {
    throw forbidden('That session belongs to someone else');
  }
  return session;
}

async function buildRecallResults(
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
): Promise<RecallResults> {
  const session = await prisma.quizSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      questions: { include: { country: true }, orderBy: { country: { name: 'asc' } } },
    },
  });
  const answers = await prisma.sessionAnswer.findMany({
    where: { sessionId, userId, wasCorrect: true },
    include: { country: true },
    orderBy: { answeredAt: 'asc' },
  });
  const recalledIds = new Set(answers.map((answer) => answer.countryId));

  return {
    sessionId,
    region: (session.regionFilter ?? ALL_FILTER) as RegionFilter,
    totalInRegion: session.questionCount,
    recalled: answers.map((answer) => ({
      id: answer.country.id,
      name: answer.country.name,
      isoCode: answer.country.isoCode,
    })),
    missed: session.questions
      .filter((question) => !recalledIds.has(question.countryId))
      .map((question) => ({
        id: question.country.id,
        name: question.country.name,
        isoCode: question.country.isoCode,
      })),
    isGuest: false,
  };
}
