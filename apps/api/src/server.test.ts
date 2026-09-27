/**
 * Integration tests for the quiz logic, run through app.inject() against a real
 * seeded Postgres — the interesting behaviour (rotation order, fuzzy matching,
 * streak arithmetic) all lives in SQL, so stubbing the database would test
 * nothing worth testing.
 *
 *   pnpm --filter @cartomancer/api test   # needs a migrated, seeded database
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getPrisma } from '@cartomancer/db';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from './env.js';
import { buildServer } from './server.js';

const prisma = getPrisma();
let app: FastifyInstance;
let userId: string;

const TEST_EMAIL = 'api-test@cartomancer.invalid';

before(async () => {
  app = await buildServer({ ...loadEnv(), LOG_LEVEL: 'warn', INTERNAL_API_KEY: '' });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  const user = await prisma.user.create({
    data: { email: TEST_EMAIL, name: 'API Test', authProvider: 'google' },
  });
  userId = user.id;
});

after(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await app.close();
  await prisma.$disconnect();
});

function userHeaders(): Record<string, string> {
  return { 'x-cartomancer-user-id': userId };
}

describe('health', () => {
  it('reports the database as up', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok', database: 'up' });
  });
});

describe('guest play', () => {
  it('returns a question set without writing anything', async () => {
    const sessionsBefore = await prisma.quizSession.count();
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { quizTypeKey: 'capitals-c2cap-mc', questionCount: 10 },
    });
    assert.equal(response.statusCode, 201);
    const session = response.json();
    assert.equal(session.isGuest, true);
    assert.match(session.id, /^guest-/);
    assert.equal(session.questions.length, 10);
    assert.equal(session.questions[0].options.length, 4);
    assert.equal(session.questions[0].promptLabel, 'Capital of');
    assert.equal(await prisma.quizSession.count(), sessionsBefore);
  });

  it('checks answers statelessly, with no streak', async () => {
    const france = await prisma.country.findFirstOrThrow({ where: { name: 'France' } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/answers/check',
      payload: { quizTypeKey: 'capitals-c2cap-type', countryId: france.id, answer: 'paris' },
    });
    const result = response.json();
    assert.equal(result.wasCorrect, true);
    assert.equal(result.matchedBy, 'exact');
    assert.equal(result.currentStreak, null);
    assert.equal(result.isLearned, null);
    assert.equal(await prisma.progress.count({ where: { countryId: france.id } }), 0);
  });

  it('refuses to persist guest progress through the session endpoints', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions/guest-1234/answers',
      payload: { sequence: 1, answer: 'Paris' },
    });
    assert.equal(response.statusCode, 403);
  });

  it('excludes seen fact IDs for guest trivia rotation', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { quizTypeKey: 'trivia-fact2c-type', questionCount: 10, region: 'Europe' },
    });
    assert.equal(first.statusCode, 201);
    const firstSession = first.json();
    const firstFactIds = firstSession.questions.map((q: { factId: number }) => q.factId);
    assert.equal(firstSession.isGuest, true);

    const second = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        quizTypeKey: 'trivia-fact2c-type',
        questionCount: 10,
        region: 'Europe',
        excludeFactIds: firstFactIds,
      },
    });
    assert.equal(second.statusCode, 201);
    const secondSession = second.json();
    const secondFactIds = secondSession.questions.map((q: { factId: number }) => q.factId);

    const overlap = firstFactIds.filter((id: number) => secondFactIds.includes(id));
    assert.equal(overlap.length, 0, 'guest rotation should exclude previously seen fact IDs');
  });

  it('exposes no summary for guests', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/summary' });
    assert.deepEqual(response.json(), { summary: null, isGuest: true });
  });
});

describe('fuzzy answer matching', () => {
  const check = async (countryName: string, answer: string, quizTypeKey = 'capitals-cap2c-type') => {
    const country = await prisma.country.findFirstOrThrow({ where: { name: countryName } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/answers/check',
      payload: { quizTypeKey, countryId: country.id, answer },
    });
    return response.json();
  };

  it('accepts a hand-seeded alias', async () => {
    const result = await check('United States', 'USA');
    assert.equal(result.wasCorrect, true);
    assert.equal(result.matchedBy, 'alias');
  });

  it('accepts a typo through the trigram fallback', async () => {
    const result = await check('Switzerland', 'Swizerland');
    assert.equal(result.wasCorrect, true);
    assert.equal(result.matchedBy, 'fuzzy');
  });

  it('ignores case, accents and punctuation', async () => {
    const result = await check("Côte d'Ivoire", 'cote divoire');
    assert.equal(result.wasCorrect, true);
  });

  it('does not fuzzily accept a name that exactly names another country', async () => {
    // similarity('Niger', 'Nigeria') is 0.56, well above the threshold.
    const result = await check('Nigeria', 'Niger');
    assert.equal(result.wasCorrect, false);
    assert.equal(result.matchedBy, 'none');
  });

  it('rejects an empty answer', async () => {
    const result = await check('France', '   ');
    assert.equal(result.wasCorrect, false);
  });
});

describe('signed-in quiz session', () => {
  it('records answers, streaks and learned state, and rotates questions', async () => {
    const quizTypeKey = 'capitals-c2cap-type';
    const quizType = await prisma.quizType.findUniqueOrThrow({ where: { key: quizTypeKey } });

    // Round 1: three Oceanian countries, all answered correctly.
    const first = await startSession(quizTypeKey, { region: 'Oceania', questionCount: 3 });
    assert.equal(first.isGuest, false);
    assert.equal(first.questions.length, 3);
    const firstIds = first.questions.map((q: { countryId: number }) => q.countryId);

    for (const question of first.questions) {
      const country = await prisma.country.findUniqueOrThrow({ where: { id: question.countryId } });
      const result = await answer(first.id, question.sequence, country.capital);
      assert.equal(result.wasCorrect, true, `${country.name} → ${country.capital}`);
      assert.equal(result.currentStreak, 1);
      assert.equal(result.isLearned, false);
      assert.equal(result.newlyLearned, false);
    }

    const results = await finish(first.id);
    assert.equal(results.score, 3);
    assert.equal(results.total, 3);
    assert.equal(results.percentCorrect, 100);
    assert.equal(results.missed.length, 0);
    assert.equal(results.newlyLearned.length, 0);
    assert.equal(results.dayStreak, 1);

    // The shared rotation pool means never-seen countries come first, so a
    // second round over the same filters picks three different countries.
    const second = await startSession(quizTypeKey, { region: 'Oceania', questionCount: 3 });
    const secondIds = second.questions.map((q: { countryId: number }) => q.countryId);
    assert.equal(
      secondIds.some((id: number) => firstIds.includes(id)),
      false,
      'rotation should prefer never-seen countries',
    );

    // Two more correct rounds over the first three countries take them to the
    // 3-in-a-row threshold; the third crossing is reported as newly learned.
    for (const round of [2, 3]) {
      const session = await startSessionWith(quizTypeKey, firstIds);
      for (const question of session.questions) {
        const country = await prisma.country.findUniqueOrThrow({
          where: { id: question.countryId },
        });
        const result = await answer(session.id, question.sequence, country.capital);
        assert.equal(result.currentStreak, round);
        assert.equal(result.isLearned, round >= 3);
        assert.equal(result.newlyLearned, round === 3);
      }
      const roundResults = await finish(session.id);
      assert.equal(roundResults.newlyLearned.length, round === 3 ? 3 : 0);
    }

    const learned = await prisma.progress.count({
      where: { userId, quizTypeId: quizType.id, isLearned: true },
    });
    assert.equal(learned, 3);

    // A wrong answer resets the streak, demoting an already-learned country.
    const demotion = await startSessionWith(quizTypeKey, [firstIds[0] as number]);
    const wrong = await answer(demotion.id, 1, 'definitely not a capital city');
    assert.equal(wrong.wasCorrect, false);
    assert.equal(wrong.currentStreak, 0);
    assert.equal(wrong.isLearned, false);
    const demoted = await prisma.progress.findUniqueOrThrow({
      where: {
        userId_countryId_quizTypeId: {
          userId,
          countryId: firstIds[0] as number,
          quizTypeId: quizType.id,
        },
      },
    });
    assert.equal(demoted.currentStreak, 0);
    assert.equal(demoted.isLearned, false);

    const demotionResults = await finish(demotion.id);
    assert.equal(demotionResults.score, 0);
    assert.equal(demotionResults.missed.length, 1);
    assert.ok(demotionResults.missed[0].correctAnswer.length > 0);

    // Re-answering the same question would farm a streak off one prompt.
    const repeat = await app.inject({
      method: 'POST',
      url: `/api/sessions/${demotion.id}/answers`,
      headers: userHeaders(),
      payload: { sequence: 1, answer: 'anything' },
    });
    assert.equal(repeat.statusCode, 409);
  });

  it('keeps sessions private to their participant', async () => {
    const session = await startSession('capitals-c2cap-mc', { questionCount: 2 });
    const other = await prisma.user.create({
      data: { email: `other-${Date.now()}@cartomancer.invalid`, authProvider: 'apple' },
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/sessions/${session.id}`,
      headers: { 'x-cartomancer-user-id': other.id },
    });
    assert.equal(response.statusCode, 403);
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('rehydrates a session with what has already been answered', async () => {
    const session = await startSession('flags-flag2c-mc', { questionCount: 2 });
    assert.equal(session.questions[0].promptIsoCode.length, 2);
    await answer(session.id, 1, 'definitely wrong');
    const response = await app.inject({
      method: 'GET',
      url: `/api/sessions/${session.id}`,
      headers: userHeaders(),
    });
    const rehydrated = response.json();
    assert.equal(rehydrated.answered.length, 1);
    assert.equal(rehydrated.answered[0].wasCorrect, false);
    assert.equal(rehydrated.questions.length, 2);
  });

  it('serves country → flag questions as flag options', async () => {
    const session = await startSession('flags-c2flag-mc', { questionCount: 1 });
    const options = session.questions[0].options;
    assert.equal(options.length, 4);
    for (const option of options) {
      assert.equal(typeof option.isoCode, 'string');
      assert.equal(option.isoCode.length, 2);
    }
  });

  it('only asks trivia about countries that have a clue', async () => {
    const session = await startSession('trivia-fact2c-type', { questionCount: 30 });
    const withFacts = await prisma.countryFact.findMany({ select: { countryId: true } });
    const allowed = new Set(withFacts.map((row) => row.countryId));
    assert.ok(session.questions.length > 0);
    assert.ok(session.questions.length <= allowed.size);
    for (const question of session.questions) {
      assert.ok(allowed.has(question.countryId));
      assert.ok(question.promptText.length > 0);
    }
  });

  it('returns factId on trivia questions for rotation tracking', async () => {
    const session = await startSession('trivia-fact2c-type', { questionCount: 10 });
    for (const question of session.questions) {
      assert.equal(typeof question.factId, 'number', 'trivia questions must carry a factId');
      assert.ok(question.factId > 0);
    }
  });

  it('does not repeat clues across trivia rounds until exhausted', async () => {
    const quizTypeKey = 'trivia-fact2c-type';
    const first = await startSession(quizTypeKey, { region: 'Oceania', questionCount: 10 });
    const firstFactIds = first.questions.map((q: { factId: number }) => q.factId);
    assert.equal(new Set(firstFactIds).size, 10, 'all fact IDs should be unique in a round');

    for (const question of first.questions) {
      const country = await prisma.country.findUniqueOrThrow({ where: { id: question.countryId } });
      await answer(first.id, question.sequence, country.name);
    }
    await finish(first.id);

    const second = await startSession(quizTypeKey, { region: 'Oceania', questionCount: 10 });
    const secondFactIds = second.questions.map((q: { factId: number }) => q.factId);

    const overlap = firstFactIds.filter((id: number) => secondFactIds.includes(id));
    assert.equal(
      overlap.length,
      0,
      'second round should use different clues until the pool is exhausted',
    );
  });

  it('serves fun facts as multiple choice: a clue and four country names', async () => {
    const session = await startSession('trivia-fact2c-mc', { questionCount: 5 });
    assert.equal(session.questions.length, 5);
    for (const question of session.questions) {
      const country = await prisma.country.findUniqueOrThrow({
        where: { id: question.countryId },
      });
      assert.ok(question.promptText.length > 0, 'the clue is the prompt');
      assert.equal(question.options.length, 4);
      const labels = question.options.map((o: { label: string }) => o.label);
      assert.equal(new Set(labels).size, 4, 'four distinct options');
      assert.ok(labels.includes(country.name), `${country.name} should be among its own options`);
      // Country names, not flags: only flags-c2flag-mc puts art on an option.
      for (const option of question.options) {
        assert.equal(option.isoCode, undefined);
      }
      assert.equal(typeof question.factId, 'number');
    }
  });

  it('answers a fun-fact multiple choice round by picking the country', async () => {
    const session = await startSession('trivia-fact2c-mc', { questionCount: 3 });
    for (const question of session.questions) {
      const country = await prisma.country.findUniqueOrThrow({
        where: { id: question.countryId },
      });
      const result = await answer(session.id, question.sequence, country.name);
      assert.equal(result.wasCorrect, true, `${question.promptText} → ${country.name}`);
    }
    const results = await finish(session.id);
    assert.equal(results.score, 3);
  });

  it('rotates clues across both fun-fact modes, not per mode', async () => {
    // The two modes are one game asked two ways (#42), so a clue met in
    // multiple choice must not come back as the next type-in question.
    const first = await startSession('trivia-fact2c-mc', {
      region: 'Oceania',
      questionCount: 5,
    });
    const firstFactIds = first.questions.map((q: { factId: number }) => q.factId);
    for (const question of first.questions) {
      const country = await prisma.country.findUniqueOrThrow({
        where: { id: question.countryId },
      });
      await answer(first.id, question.sequence, country.name);
    }
    await finish(first.id);

    const second = await startSession('trivia-fact2c-type', {
      region: 'Oceania',
      questionCount: 5,
    });
    assert.ok(second.questions.length > 0);
    const overlap = second.questions
      .map((q: { factId: number }) => q.factId)
      .filter((id: number) => firstFactIds.includes(id));
    assert.equal(overlap.length, 0, 'a clue seen in one mode is seen in the other');
  });

  it('filters trivia by clue difficulty, not country difficulty', async () => {
    for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
      const session = await startSession('trivia-fact2c-type', { difficulty, questionCount: 10 });
      assert.ok(session.questions.length > 0, `should have ${difficulty} trivia clues`);
      const factIds = session.questions.map((q: { factId: number }) => q.factId);
      const facts = await prisma.countryFact.findMany({
        where: { id: { in: factIds } },
        select: { difficulty: true },
      });
      assert.ok(
        facts.every((f) => f.difficulty === difficulty),
        `every clue in a ${difficulty} trivia round must be a ${difficulty} clue`,
      );
    }
  });

  it('stores factId on session_questions for rehydration', async () => {
    const session = await startSession('trivia-fact2c-type', { questionCount: 5 });
    const storedQuestions = await prisma.sessionQuestion.findMany({
      where: { sessionId: session.id },
      select: { factId: true },
    });
    assert.ok(
      storedQuestions.every((q) => q.factId !== null),
      'trivia session_questions should store fact_id',
    );
  });

  it('never repeats a country inside one trivia session', async () => {
    const session = await startSession('trivia-fact2c-type', { questionCount: 30 });
    const ids = session.questions.map((q: { countryId: number }) => q.countryId);
    assert.equal(new Set(ids).size, ids.length, 'every trivia question must be a different country');
  });

  it('never repeats a country inside one session', async () => {
    const session = await startSession('capitals-c2cap-mc', { questionCount: 30 });
    const ids = session.questions.map((q: { countryId: number }) => q.countryId);
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30, 'every question must be a different country');
  });

  it('honours the difficulty filter', async () => {
    for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
      const session = await startSession('capitals-c2cap-mc', { difficulty, questionCount: 20 });
      const countries = await prisma.country.findMany({
        where: { id: { in: session.questions.map((q: { countryId: number }) => q.countryId) } },
        select: { difficulty: true },
      });
      assert.equal(countries.length, 20);
      assert.ok(
        countries.every((c) => c.difficulty === difficulty),
        `every question in a ${difficulty} round must be a ${difficulty} country`,
      );
    }
  });

  it('rejects unknown quiz types and bad filters', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: userHeaders(),
      payload: { quizTypeKey: 'nope' },
    });
    assert.equal(unknown.statusCode, 404);

    const badRegion = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: userHeaders(),
      payload: { quizTypeKey: 'capitals-c2cap-mc', region: 'Atlantis' },
    });
    assert.equal(badRegion.statusCode, 400);

    const recallThroughQuiz = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: userHeaders(),
      payload: { quizTypeKey: 'countries-recall' },
    });
    assert.equal(recallThroughQuiz.statusCode, 400);
  });
});

describe('active recall', () => {
  it('marks a country learned on a single successful recall', async () => {
    const start = await app.inject({
      method: 'POST',
      url: '/api/recall',
      headers: userHeaders(),
      payload: { region: 'Oceania' },
    });
    assert.equal(start.statusCode, 201);
    const session = start.json();
    assert.equal(session.totalInRegion, 14);
    assert.equal(session.isGuest, false);

    const guess = async (value: string) => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/recall/${session.id}/guesses`,
        headers: userHeaders(),
        payload: { guess: value },
      });
      return response.json();
    };

    const first = await guess('fiji');
    assert.equal(first.accepted, true);
    assert.equal(first.country.name, 'Fiji');
    assert.equal(first.recalledCount, 1);

    const duplicate = await guess('Fiji');
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.recalledCount, 1);

    const unknown = await guess('Wakanda');
    assert.equal(unknown.accepted, false);
    assert.equal(unknown.duplicate, false);
    assert.equal(unknown.country, null);

    // Out of region: real country, not in this recall pool.
    const outOfRegion = await guess('France');
    assert.equal(outOfRegion.accepted, false);
    assert.equal(outOfRegion.country, null);

    const typo = await guess('new zealend');
    assert.equal(typo.accepted, true);
    assert.equal(typo.country.name, 'New Zealand');

    const recallType = await prisma.quizType.findUniqueOrThrow({
      where: { key: 'countries-recall' },
    });
    const fiji = await prisma.country.findFirstOrThrow({ where: { name: 'Fiji' } });
    const progress = await prisma.progress.findUniqueOrThrow({
      where: {
        userId_countryId_quizTypeId: {
          userId,
          countryId: fiji.id,
          quizTypeId: recallType.id,
        },
      },
    });
    assert.equal(progress.currentStreak, 1);
    assert.equal(progress.isLearned, true, 'one recall is enough');

    const finished = await app.inject({
      method: 'POST',
      url: `/api/recall/${session.id}/finish`,
      headers: userHeaders(),
      payload: {},
    });
    const results = finished.json();
    assert.equal(results.recalled.length, 2);
    assert.equal(results.missed.length, 12);
    assert.equal(results.totalInRegion, 14);
    assert.equal(
      results.missed.some((c: { name: string }) => c.name === 'Fiji'),
      false,
    );
  });

  it('matches guest recall guesses without persisting them', async () => {
    const sessionsBefore = await prisma.quizSession.count();
    const start = await app.inject({ method: 'POST', url: '/api/recall', payload: { region: 'Europe' } });
    const session = start.json();
    assert.equal(session.isGuest, true);
    assert.equal(session.totalInRegion, 44);

    const spain = await prisma.country.findFirstOrThrow({ where: { name: 'Spain' } });
    const hit = await app.inject({
      method: 'POST',
      url: '/api/recall/check',
      payload: { region: 'Europe', guess: 'spain' },
    });
    assert.equal(hit.json().accepted, true);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/recall/check',
      payload: { region: 'Europe', guess: 'Spain', alreadyRecalledCountryIds: [spain.id] },
    });
    assert.equal(dup.json().duplicate, true);
    assert.equal(dup.json().accepted, false);
    assert.equal(await prisma.quizSession.count(), sessionsBefore);
  });
});

describe('home-screen summary', () => {
  it('counts learned countries per category and a day streak', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/summary?tz=UTC',
      headers: userHeaders(),
    });
    const { summary, isGuest } = response.json();
    assert.equal(isGuest, false);
    assert.equal(summary.totalCountries, 195);
    assert.equal(summary.dayStreak, 1);
    assert.equal(summary.weekActivity.filter(Boolean).length, 1);
    assert.equal(summary.weekActivity.length, 7);
    assert.equal(summary.learned.capitals, 2, 'two of the three survived the demotion');
    assert.equal(summary.learned.countries, 2, 'two recalls');
  });
});

describe('missed questions carry the question, not the country twice', () => {
  /**
   * The bug in #37: `correctAnswer` IS the country name for every
   * `*_to_country` quiz, so a row built from the country alone read
   * "Brazil — Brazil" and never showed the clue or the capital that was asked.
   */
  const missAll = async (quizTypeKey: string, questionCount: number) => {
    const session = await startSession(quizTypeKey, { questionCount });
    for (const question of session.questions) {
      await answer(session.id, question.sequence, 'definitely not the answer');
    }
    const results = await finish(session.id);
    return { session, results };
  };

  it('returns the clue for a trivia question', async () => {
    const { session, results } = await missAll('trivia-fact2c-type', 3);
    assert.equal(results.missed.length, 3);

    const promptsAsked = new Map(
      session.questions.map((q: { countryId: number; promptText: string }) => [
        q.countryId,
        q.promptText,
      ]),
    );
    for (const missed of results.missed) {
      assert.ok(missed.promptText.length > 0, 'a trivia miss must carry its clue');
      assert.equal(
        missed.promptText,
        promptsAsked.get(missed.countryId),
        'the clue on the results screen must be the clue that was asked',
      );
      assert.notEqual(
        missed.promptText,
        missed.correctAnswer,
        'the clue is not the country name',
      );
      assert.ok(missed.sequence > 0, 'rows are keyed by the question, not the country');
    }
  });

  it('returns the capital asked about for capital → country', async () => {
    const { results } = await missAll('capitals-cap2c-type', 2);
    for (const missed of results.missed) {
      const country = await prisma.country.findUniqueOrThrow({
        where: { id: missed.countryId },
      });
      assert.equal(missed.promptText, country.capital, 'the question was the capital');
      assert.equal(missed.correctAnswer, country.name);
      // The bug this guards is the row saying one string twice. Six countries
      // are their own capital — Djibouti, Singapore, Luxembourg, Monaco, San
      // Marino, Vatican City — so for those the repeat is a fact, and the
      // questions here are drawn at random: a blanket inequality passed until
      // the draw happened to include one.
      if (country.capital !== country.name) {
        assert.notEqual(
          missed.promptText,
          missed.correctAnswer,
          `${country.name}: the question and the answer are the same string`,
        );
      }
    }
  });

  it('still asks with the country for country → capital, where it always worked', async () => {
    const { results } = await missAll('capitals-c2cap-type', 2);
    for (const missed of results.missed) {
      const country = await prisma.country.findUniqueOrThrow({
        where: { id: missed.countryId },
      });
      assert.equal(missed.promptText, country.name);
      assert.equal(missed.correctAnswer, country.capital);
    }
  });

  /**
   * flag → country asks with a picture, so there is no prompt text to give —
   * the results screen renders the flag from isoCode instead, which is what it
   * could not do while the row carried only 18px of inline badge.
   */
  it('gives a flag question no prompt text, but the iso code to draw it', async () => {
    const { results } = await missAll('flags-flag2c-mc', 2);
    for (const missed of results.missed) {
      assert.equal(missed.promptText, '');
      assert.equal(missed.isoCode.length, 2);
      assert.equal(missed.correctAnswer, missed.countryName);
    }
  });
});

describe('learned lists', () => {
  const fetchProgress = async (category: string, headers = userHeaders()) =>
    app.inject({ method: 'GET', url: `/api/progress/${category}`, headers });

  /**
   * The point of the endpoint: the list behind a stat must not be able to
   * disagree with the stat. Both count `bool_or(is_learned)` over the category's
   * quiz types, so this asserts they really do share that rule rather than each
   * deriving it from streaks.
   */
  it('agrees with the home-screen summary on every category', async () => {
    const summary = (
      await app.inject({ method: 'GET', url: '/api/summary?tz=UTC', headers: userHeaders() })
    ).json().summary;

    for (const category of ['capitals', 'countries', 'flags'] as const) {
      const response = await fetchProgress(category);
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.category, category);
      const learned = body.countries.filter((row: { learned: boolean }) => row.learned).length;
      assert.equal(learned, summary.learned[category], `${category} count`);
    }
  });

  it('reports the best streak, and learned exactly where it clears the threshold', async () => {
    const capitals = (await fetchProgress('capitals')).json();
    assert.ok(capitals.countries.length > 0, 'the suite has answered capitals questions by now');
    for (const row of capitals.countries) {
      assert.equal(
        row.learned,
        row.bestStreak >= 3,
        `country ${row.countryId}: learned ${row.learned} at streak ${row.bestStreak}`,
      );
    }

    // Recall's threshold is one, so a country is learned the moment it has any
    // streak at all — which is what makes "2/3" meaningless on that list.
    const countries = (await fetchProgress('countries')).json();
    for (const row of countries.countries) {
      assert.equal(row.learned, row.bestStreak >= 1);
    }
  });

  /**
   * Countries with no progress row are absent, not padded in as not-learned:
   * the web app builds the "not learned yet" side from the full country list, so
   * a row here for a country nobody has been asked about would be two sources
   * for the same fact.
   */
  it('returns only the countries that have been answered', async () => {
    const body = (await fetchProgress('capitals')).json();
    const returned = new Set(body.countries.map((row: { countryId: number }) => row.countryId));

    const rows = await prisma.progress.findMany({
      where: { userId, quizType: { category: 'capitals' } },
      select: { countryId: true },
    });
    const expected = new Set(rows.map((row) => row.countryId));

    assert.deepEqual([...returned].sort(), [...expected].sort());
    assert.ok(returned.size < 195, 'not every country has been answered');
  });

  it('refuses guests rather than calling their progress empty', async () => {
    const response = await fetchProgress('capitals', {});
    assert.equal(response.statusCode, 403);
  });

  it('404s an unknown category', async () => {
    const response = await fetchProgress('continents');
    assert.equal(response.statusCode, 404);
  });
});

describe('catalog', () => {
  it('serves the quiz types from the database', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/quiz-types' });
    const body = response.json();
    assert.equal(body.quizTypes.length, 10);
    assert.equal(body.unmapped, 0);
  });

  it('serves country reference data for a region', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/countries?region=Oceania' });
    const body = response.json();
    assert.equal(body.total, 14);
    assert.equal(body.countries[0].isoCode.length, 2);
  });
});

describe('internal api key', () => {
  it('rejects callers without the shared secret when one is configured', async () => {
    const guarded = await buildServer({ ...loadEnv(), LOG_LEVEL: 'warn', INTERNAL_API_KEY: 'sekrit' });
    const denied = await guarded.inject({ method: 'GET', url: '/api/summary' });
    assert.equal(denied.statusCode, 401);

    const allowed = await guarded.inject({
      method: 'GET',
      url: '/api/summary',
      headers: { authorization: 'Bearer sekrit' },
    });
    assert.equal(allowed.statusCode, 200);

    const health = await guarded.inject({ method: 'GET', url: '/healthz' });
    assert.equal(health.statusCode, 200, 'health checks must not need credentials');
    await guarded.close();
  });

  it('refuses to start in production without one', async () => {
    // Fail closed: /api is published on the public internet, and an empty key
    // means the api trusts any caller's x-cartomancer-user-id. A warning is the
    // wrong terminal behaviour in a cluster, where nobody reads boot logs.
    await assert.rejects(
      buildServer({ ...loadEnv(), LOG_LEVEL: 'warn', INTERNAL_API_KEY: '', NODE_ENV: 'production' }),
      /INTERNAL_API_KEY is required when NODE_ENV=production/,
    );
  });

  it('starts in production when one is set', async () => {
    const app1 = await buildServer({
      ...loadEnv(),
      LOG_LEVEL: 'warn',
      INTERNAL_API_KEY: 'sekrit',
      NODE_ENV: 'production',
    });
    const health = await app1.inject({ method: 'GET', url: '/healthz' });
    assert.equal(health.statusCode, 200);
    await app1.close();
  });

  it('still only warns outside production', async () => {
    const dev = await buildServer({
      ...loadEnv(),
      LOG_LEVEL: 'warn',
      INTERNAL_API_KEY: '',
      NODE_ENV: 'development',
    });
    const open = await dev.inject({ method: 'GET', url: '/api/quiz-types' });
    assert.equal(open.statusCode, 200, 'local development must not need the key');
    await dev.close();
  });
});

async function startSession(
  quizTypeKey: string,
  options: { region?: string; difficulty?: string; questionCount?: number } = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: userHeaders(),
    payload: { quizTypeKey, ...options },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

/**
 * Creates a session over an exact set of countries. The rotation order is the
 * point of the production path, so these tests drive specific countries by
 * writing the session rows directly.
 */
async function startSessionWith(quizTypeKey: string, countryIds: number[]) {
  const quizType = await prisma.quizType.findUniqueOrThrow({ where: { key: quizTypeKey } });
  const created = await prisma.quizSession.create({
    data: {
      quizTypeId: quizType.id,
      questionCount: countryIds.length,
      createdBy: userId,
      participants: { create: [{ userId }] },
      questions: {
        create: countryIds.map((countryId, index) => ({ sequence: index + 1, countryId })),
      },
    },
  });
  const response = await app.inject({
    method: 'GET',
    url: `/api/sessions/${created.id}`,
    headers: userHeaders(),
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

async function answer(sessionId: string, sequence: number, value: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionId}/answers`,
    headers: userHeaders(),
    payload: { sequence, answer: value, timeTakenMs: 1234 },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

async function finish(sessionId: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionId}/finish`,
    headers: userHeaders(),
    payload: {},
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
