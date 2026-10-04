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
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { getPrisma } from '@cartomancer/db';
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameProblem,
  matchesAcceptedAnswer,
  normalizeAnswer,
} from '@cartomancer/shared';
import { type ClueCandidate, pickClues } from './lib/quiz.js';
import type { FastifyInstance } from 'fastify';
import { clearCountryCache, loadAllCountries } from './lib/countries.js';
import { loadSummary } from './lib/progress.js';
import { requestTimeZone } from './timezone.js';
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

  it('puts clues the guest has met behind the ones they have not', async () => {
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
        seenFacts: Object.fromEntries(firstFactIds.map((id: number) => [String(id), Date.now()])),
      },
    });
    assert.equal(second.statusCode, 201);
    const secondSession = second.json();
    const secondFactIds = secondSession.questions.map((q: { factId: number }) => q.factId);

    const overlap = firstFactIds.filter((id: number) => secondFactIds.includes(id));
    assert.equal(overlap.length, 0, 'guest rotation should serve unmet clues first');
  });

  it('exposes no summary for guests', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/summary' });
    assert.deepEqual(response.json(), { summary: null, isGuest: true });
  });
});

describe('fuzzy answer matching', () => {
  const check = async (
    countryName: string,
    answer: string,
    quizTypeKey = 'capitals-cap2c-type',
  ) => {
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

describe('aliases are scored against the domain they name (#35)', () => {
  const check = async (quizTypeKey: string, countryName: string, answer: string) => {
    const country = await prisma.country.findFirstOrThrow({ where: { name: countryName } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/answers/check',
      payload: { quizTypeKey, countryId: country.id, answer },
    });
    return response.json();
  };

  // One column used to hold every alias, and the matcher read all of it
  // whichever way the question was asked — so a geography trainer said the
  // capital of Australia was Oz.
  const wrongNow: [string, string, string][] = [
    ['capitals-c2cap-type', 'Israel', 'Tel Aviv'],
    ['capitals-c2cap-type', 'United Arab Emirates', 'Dubai'],
    ['capitals-c2cap-type', 'Turkey', 'Istanbul'],
    ['capitals-c2cap-type', 'Switzerland', 'Zurich'],
    ['capitals-c2cap-type', 'Tanzania', 'Dar es Salaam'],
    // A country-name alias is not an answer to a capital question…
    ['capitals-c2cap-type', 'Australia', 'Oz'],
    ['capitals-c2cap-type', 'Netherlands', 'Holland'],
    // …and a capital is not an answer to a country question.
    ['capitals-cap2c-type', 'South Africa', 'Cape Town'],
    ['flags-flag2c-type', 'Netherlands', 'The Hague'],
  ];

  for (const [quizTypeKey, countryName, answer] of wrongNow) {
    it(`"${answer}" is not the answer to ${countryName} in ${quizTypeKey}`, async () => {
      const result = await check(quizTypeKey, countryName, answer);
      assert.equal(result.wasCorrect, false, `${answer} should not be accepted here`);
      assert.equal(result.matchedBy, 'none');
    });
  }

  // The same column carries the genuinely correct cases, which is why this
  // could never be fixed by dropping entries.
  const stillRight: [string, string, string][] = [
    ['capitals-c2cap-type', 'South Africa', 'Cape Town'],
    ['capitals-c2cap-type', 'Bolivia', 'La Paz'],
    ['capitals-c2cap-type', 'Netherlands', 'The Hague'],
    ['capitals-c2cap-type', 'Malaysia', 'Putrajaya'],
    ['capitals-c2cap-type', 'Czechia', 'Praha'],
    ['capitals-c2cap-type', 'Kazakhstan', 'Nur-Sultan'],
    ['capitals-cap2c-type', 'Czechia', 'Czech Republic'],
    ['flags-flag2c-type', "Côte d'Ivoire", 'Ivory Coast'],
    ['flags-flag2c-type', 'Myanmar', 'Burma'],
    ['flags-flag2c-type', 'Netherlands', 'Holland'],
  ];

  for (const [quizTypeKey, countryName, answer] of stillRight) {
    it(`"${answer}" is still right for ${countryName} in ${quizTypeKey}`, async () => {
      const result = await check(quizTypeKey, countryName, answer);
      assert.equal(result.wasCorrect, true, `${answer} should still be accepted here`);
      assert.equal(result.matchedBy, 'alias');
    });
  }

  it('serves all three alias lists to the register, and keeps them apart', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/countries?region=Africa' });
    const body = response.json();
    const southAfrica = body.countries.find((c: { name: string }) => c.name === 'South Africa');
    assert.deepEqual(southAfrica.nameAliases, ['RSA']);
    assert.deepEqual(southAfrica.capitalAliases, ['Cape Town', 'Bloemfontein']);
    assert.deepEqual(southAfrica.searchAliases, []);
    const tanzania = body.countries.find((c: { name: string }) => c.name === 'Tanzania');
    assert.deepEqual(tanzania.searchAliases, ['Dar es Salaam']);
  });

  it('never accepts a search-only alias, in either direction', async () => {
    // The register can find Turkey by "Istanbul"; a quiz may not accept it.
    for (const quizTypeKey of ['capitals-c2cap-type', 'capitals-cap2c-type', 'flags-flag2c-type']) {
      const result = await check(quizTypeKey, 'Turkey', 'Istanbul');
      assert.equal(result.wasCorrect, false, `${quizTypeKey} accepted Istanbul`);
    }
  });
});

/**
 * The type-in questions let the browser accept a correct answer the moment it
 * is typed, which means the browser has to recognise it without being told it
 * (#69). These tests hold the two halves of that bargain: the client can match
 * exactly what the server would accept, and the answer itself never leaves the
 * api.
 *
 * `matchesAcceptedAnswer` is the function the quiz screen calls, so a passing
 * test here is a statement about the browser, not only about the payload.
 */
describe('type-in answers are hashed, not sent (#69)', () => {
  interface HashedQuestion {
    sequence: number;
    countryId: number;
    promptText: string;
    answerHashes?: string[];
    options?: unknown[];
  }

  const sessionOver = async (quizTypeKey: string, countryNames: string[]) => {
    const countries = await Promise.all(
      countryNames.map((name) => prisma.country.findFirstOrThrow({ where: { name } })),
    );
    const session = await startSessionWith(
      quizTypeKey,
      countries.map((country) => country.id),
    );
    return { session, countries };
  };

  it('accepts the canonical answer as soon as it is typed, in any casing', async () => {
    const { session } = await sessionOver('capitals-c2cap-type', ['France']);
    const salt: string = session.answerSalt;
    const hashes: string[] = session.questions[0].answerHashes;
    assert.ok(salt, 'a type-in round needs a salt for its hashes');

    for (const typed of ['Paris', 'paris', 'PARIS', '  Paris  ']) {
      assert.equal(
        await matchesAcceptedAnswer(salt, hashes, typed),
        true,
        `"${typed}" should auto-accept for France`,
      );
    }
  });

  it('accepts the aliases the server accepts, in both directions', async () => {
    const capitals = await sessionOver('capitals-c2cap-type', ['Czechia', 'Ukraine']);
    for (const typed of ['Praha', 'Prague', 'Kyiv', 'Kiev']) {
      const matched = await Promise.all(
        capitals.session.questions.map((question: HashedQuestion) =>
          matchesAcceptedAnswer(capitals.session.answerSalt, question.answerHashes ?? [], typed),
        ),
      );
      assert.ok(matched.some(Boolean), `"${typed}" should auto-accept for its capital`);
    }

    const flags = await sessionOver('flags-flag2c-type', ["Côte d'Ivoire", 'Myanmar']);
    for (const typed of ['Ivory Coast', "Cote d'Ivoire", 'Burma', 'Myanmar']) {
      const matched = await Promise.all(
        flags.session.questions.map((question: HashedQuestion) =>
          matchesAcceptedAnswer(flags.session.answerSalt, question.answerHashes ?? [], typed),
        ),
      );
      assert.ok(matched.some(Boolean), `"${typed}" should auto-accept for its country`);
    }
  });

  it('never auto-accepts a typo, a wrong answer or an empty box', async () => {
    const { session } = await sessionOver('capitals-c2cap-type', ['Australia']);
    const salt: string = session.answerSalt;
    const hashes: string[] = session.questions[0].answerHashes;

    // The acceptance criterion: a near miss is indistinguishable from a wrong
    // answer to a hash, so the player is never marked wrong mid-word. Enter
    // still accepts "Canbera" through the server's fuzzy pass.
    for (const typed of ['Canbera', 'Canberr', 'Canberraa', 'Sydney', 'Paris', '', '   ', '-']) {
      assert.equal(
        await matchesAcceptedAnswer(salt, hashes, typed),
        false,
        `"${typed}" must not auto-accept for Australia`,
      );
    }
  });

  it('never auto-accepts what the matcher would reject (#35)', async () => {
    // Auto-accepting something the server then marks wrong is worse than no
    // auto-accept at all, so the hashed set is exactly the accepted set: the
    // domain's aliases, never a search-only alias and never the other domain's.
    const capitals = await sessionOver('capitals-c2cap-type', [
      'Turkey',
      'Australia',
      'Netherlands',
    ]);
    for (const typed of ['Istanbul', 'Oz', 'Holland']) {
      for (const question of capitals.session.questions as HashedQuestion[]) {
        assert.equal(
          await matchesAcceptedAnswer(
            capitals.session.answerSalt,
            question.answerHashes ?? [],
            typed,
          ),
          false,
          `"${typed}" must not auto-accept for a capital question`,
        );
      }
    }

    const flags = await sessionOver('flags-flag2c-type', ['Netherlands', 'South Africa']);
    for (const typed of ['The Hague', 'Cape Town']) {
      for (const question of flags.session.questions as HashedQuestion[]) {
        assert.equal(
          await matchesAcceptedAnswer(flags.session.answerSalt, question.answerHashes ?? [], typed),
          false,
          `"${typed}" must not auto-accept for a country question`,
        );
      }
    }
  });

  /**
   * The invariant behind all of the above, over the whole table rather than a
   * handful of examples: one hash per distinct normalised spelling the matcher
   * accepts, and not one more. A count that is right stops a future alias column
   * being hashed by accident — which no example test would notice.
   */
  for (const [quizTypeKey, domain] of [
    ['capitals-c2cap-type', 'capital'],
    ['flags-flag2c-type', 'country'],
  ] as const) {
    it(`hashes every accepted ${domain} spelling for all 195, and nothing else`, async () => {
      const all = await prisma.country.findMany({ orderBy: { id: 'asc' } });
      const session = await startSessionWith(
        quizTypeKey,
        all.map((country) => country.id),
      );
      const salt: string = session.answerSalt;
      const byId = new Map(all.map((country) => [country.id, country]));

      for (const question of session.questions as HashedQuestion[]) {
        const country = byId.get(question.countryId);
        assert.ok(country, `question ${question.sequence} names an unknown country`);
        const accepted =
          domain === 'capital'
            ? [country.capital, ...country.capitalAliases]
            : [country.name, ...country.nameAliases];

        for (const form of accepted) {
          assert.equal(
            await matchesAcceptedAnswer(salt, question.answerHashes ?? [], form),
            true,
            `"${form}" is accepted by the api but not hashed for ${country.name}`,
          );
        }
        const distinct = new Set(accepted.map(normalizeAnswer).filter((v) => v.length > 0));
        assert.equal(
          question.answerHashes?.length,
          distinct.size,
          `${country.name} carries hashes for something other than its ${domain} answers`,
        );
      }
    });
  }

  /**
   * Every type-in format, over the whole table: the answer is not in the payload
   * in any spelling the player could read off.
   *
   * Two fields are the question rather than the answer, and are excluded
   * deliberately rather than quietly: `promptText` is what the player is shown
   * (a country, a capital, a clue), and `promptIsoCode` is the flag to draw,
   * which a flag question cannot ask without. Both are asserted to be exactly
   * what the question needs, so the exclusion cannot hide a leak — and the clue
   * is checked against the answer separately, since a clue that named its own
   * country would give the game away with or without this feature.
   */
  for (const [quizTypeKey, domain] of [
    ['capitals-c2cap-type', 'capital'],
    ['capitals-cap2c-type', 'country'],
    ['flags-flag2c-type', 'country'],
    ['trivia-fact2c-type', 'country'],
  ] as const) {
    it(`sends no ${domain} answer text in ${quizTypeKey}`, async () => {
      const all = await prisma.country.findMany({ orderBy: { id: 'asc' } });
      const byId = new Map(all.map((country) => [country.id, country]));
      const session = await startSessionWith(
        quizTypeKey,
        all.map((country) => country.id),
      );

      for (const question of session.questions as HashedQuestion[] & { promptIsoCode?: string }[]) {
        const country = byId.get(question.countryId);
        assert.ok(country);
        const accepted =
          domain === 'capital'
            ? [country.capital, ...country.capitalAliases]
            : [country.name, ...country.nameAliases];

        if (quizTypeKey === 'flags-flag2c-type') {
          assert.equal(question.promptIsoCode, country.isoCode);
          assert.equal(question.promptText, '');
        } else if (quizTypeKey === 'trivia-fact2c-type') {
          assert.equal(question.promptIsoCode, undefined);
          // The house rule for a clue, which is also what makes excluding
          // promptText below safe.
          assert.ok(
            !question.promptText.toLowerCase().includes(country.name.toLowerCase()),
            `the clue for ${country.name} names its own answer`,
          );
        } else {
          assert.equal(question.promptIsoCode, undefined);
          assert.equal(question.promptText, domain === 'capital' ? country.name : country.capital);
        }

        const wire = JSON.stringify({
          ...question,
          promptText: undefined,
          promptIsoCode: undefined,
        }).toLowerCase();
        for (const form of accepted) {
          assert.ok(
            !wire.includes(form.toLowerCase()),
            `the ${quizTypeKey} question for ${country.name} leaks "${form}"`,
          );
        }
      }
    });
  }

  it('hashes a guest round exactly as it hashes a signed-in one', async () => {
    // Guests go through the same code path, which is the whole reason there is
    // one — but they are the players most likely to be on a type-in round, so
    // the payload is worth asserting rather than assuming.
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { quizTypeKey: 'trivia-fact2c-type', questionCount: 10 },
    });
    const session = response.json();
    assert.equal(session.isGuest, true);
    assert.ok(session.answerSalt, 'a guest type-in round needs a salt too');

    for (const question of session.questions as HashedQuestion[]) {
      const country = await prisma.country.findUniqueOrThrow({
        where: { id: question.countryId },
      });
      assert.equal(
        await matchesAcceptedAnswer(session.answerSalt, question.answerHashes ?? [], country.name),
        true,
        `a guest cannot auto-accept ${country.name}`,
      );
    }
  });

  it('salts every question set separately', async () => {
    const first = await sessionOver('capitals-c2cap-type', ['Japan']);
    const second = await sessionOver('capitals-c2cap-type', ['Japan']);

    assert.notEqual(first.session.answerSalt, second.session.answerSalt);
    assert.notDeepEqual(
      first.session.questions[0].answerHashes,
      second.session.questions[0].answerHashes,
      'the same answer under two salts must not hash alike',
    );
    // Each payload still recognises its own answer, which is all a salt has to
    // make true — there is nothing to match across two responses.
    for (const { session } of [first, second]) {
      assert.equal(
        await matchesAcceptedAnswer(session.answerSalt, session.questions[0].answerHashes, 'Tokyo'),
        true,
      );
    }
  });

  it('leaves multiple choice and recall alone', async () => {
    for (const quizTypeKey of ['capitals-c2cap-mc', 'flags-flag2c-mc', 'trivia-fact2c-mc']) {
      const session = await startSession(quizTypeKey, { questionCount: 3 });
      assert.equal(session.answerSalt, undefined, `${quizTypeKey} needs no salt`);
      for (const question of session.questions as HashedQuestion[]) {
        // The options already carry the answer in plain text; they have to, to
        // be tappable. Hashes would say nothing new.
        assert.equal(question.answerHashes, undefined);
        assert.equal(question.options?.length, 4);
      }
    }

    const recall = await app.inject({
      method: 'POST',
      url: '/api/recall',
      headers: userHeaders(),
      payload: { region: 'Oceania' },
    });
    assert.equal(recall.statusCode, 201, recall.body);
    assert.equal(recall.json().answerSalt, undefined);
  });
});

/**
 * Fun-facts rotation (#70): a clue that has been answered does not come back
 * until every clue matching the filters has been met once.
 *
 * `pickClues` is the rule and is tested on its own, with no database and no
 * dice. The rest simulates play through the real endpoints, for a signed-in
 * player (fact_progress) and a guest (the browser's list, sent with the
 * request), because the bugs were in the plumbing around the rule: where "met"
 * was recorded, and what it was keyed by.
 */
describe('fun-facts rotation (#70)', () => {
  const clue = (factId: number, countryId: number, lastSeen: number | null): ClueCandidate => ({
    factId,
    countryId,
    fact: `clue ${factId}`,
    lastSeen,
  });
  const ids = (picked: { factId: number }[]) => picked.map((p) => p.factId);

  describe('pickClues', () => {
    it('serves every unmet clue before any met one', () => {
      const pool = [clue(1, 1, 500), clue(2, 2, null), clue(3, 3, 100), clue(4, 4, null)];
      assert.deepEqual(ids(pickClues(pool, 2, () => 0.5)).sort(), [2, 4]);
    });

    it('then serves the met clues oldest first, so a spent pool simply restarts', () => {
      const pool = [clue(1, 1, 500), clue(2, 2, 100), clue(3, 3, 300), clue(4, 4, 200)];
      assert.deepEqual(ids(pickClues(pool, 3)), [2, 4, 3]);
    });

    it('prefers a country not met at all over a new clue for one that was', () => {
      // Country 1 has met clue 1 and has an unmet clue 2; country 2 is untouched.
      const pool = [clue(1, 1, 100), clue(2, 1, null), clue(3, 2, null)];
      assert.deepEqual(ids(pickClues(pool, 1)), [3]);
      // …but it is only a preference between unmet clues: a met clue never wins.
      assert.deepEqual(ids(pickClues(pool, 2)), [3, 2]);
    });

    it('asks one clue per country, however many it has', () => {
      const pool = [clue(1, 1, null), clue(2, 1, null), clue(3, 1, null), clue(4, 2, null)];
      const picked = pickClues(pool, 10);
      assert.equal(picked.length, 2, 'short, not padded with a second clue for a country');
      assert.deepEqual(picked.map((p) => p.countryId).sort(), [1, 2]);
    });

    it('returns a short round rather than repeats when the pool is small', () => {
      assert.equal(pickClues([clue(1, 1, null), clue(2, 2, 50)], 20).length, 2);
      assert.deepEqual(pickClues([], 5), []);
    });

    it('shuffles ties, so a new cycle is a reshuffle', () => {
      const pool = [clue(1, 1, null), clue(2, 2, null), clue(3, 3, null)];
      assert.deepEqual(ids(pickClues(pool, 3, () => 0.5)), [1, 2, 3], 'stable when the dice tie');
      const rolls = [0.9, 0.5, 0.1];
      assert.deepEqual(ids(pickClues(pool, 3, () => rolls.shift() ?? 0)), [3, 2, 1]);
    });
  });

  // ─── simulating play ───────────────────────────────────────────────────────

  type Round = { id: string; questions: { sequence: number; countryId: number; factId: number }[] };

  const resetRotation = async () => {
    await prisma.factProgress.deleteMany({ where: { userId } });
  };

  const poolFor = (region?: string, difficulty?: string) =>
    prisma.countryFact.findMany({
      where: {
        ...(difficulty ? { difficulty } : {}),
        ...(region ? { country: { region } } : {}),
      },
      select: { id: true, countryId: true },
    });

  /**
   * The rule, stated as an invariant over one round: a clue that had been met is
   * served only when every unmet matching clue belongs to a country that is
   * already in the round (a country is asked once a round, so those cannot be
   * asked). Anything else is a repeat served while something new was available.
   */
  const assertNoPrematureRepeat = async (
    served: { countryId: number; factId: number }[],
    seen: Set<number>,
    region?: string,
    difficulty?: string,
  ) => {
    const pool = await poolFor(region, difficulty);
    const inRound = new Set(served.map((q) => q.countryId));
    const unmetElsewhere = pool.filter((f) => !seen.has(f.id) && !inRound.has(f.countryId));
    const repeats = served.filter((q) => seen.has(q.factId));
    if (unmetElsewhere.length > 0) {
      assert.deepEqual(
        repeats.map((q) => q.factId),
        [],
        `served already-met clues while ${unmetElsewhere.length} unmet ones were available`,
      );
    }
  };

  const playSignedIn = async (
    quizTypeKey: string,
    options: { region?: string; difficulty?: string; questionCount: number },
    answerThem = true,
  ): Promise<Round> => {
    const round = (await startSession(quizTypeKey, options)) as Round;
    if (answerThem) {
      for (const question of round.questions) {
        const country = await prisma.country.findUniqueOrThrow({
          where: { id: question.countryId },
        });
        await answer(round.id, question.sequence, country.name);
      }
      await finish(round.id);
    }
    return round;
  };

  const startAsGuest = async (
    quizTypeKey: string,
    options: { region?: string; difficulty?: string; questionCount: number },
    seenFacts: Record<string, number>,
  ): Promise<Round> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { quizTypeKey, ...options, seenFacts },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  };

  it('signed in: no clue repeats until the whole pool has been met, then the oldest return', async () => {
    await resetRotation();
    // Europe + Easy is 20 clues over 20 countries, so four rounds of five use the
    // pool exactly once.
    const options = { region: 'Europe', difficulty: 'Easy', questionCount: 5 };
    const factIds: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      const played = await playSignedIn('trivia-fact2c-type', options);
      factIds.push(...played.questions.map((q) => q.factId));
    }
    assert.equal(new Set(factIds).size, 20, 'a clue came back before the pool was spent');

    const fifth = await playSignedIn('trivia-fact2c-type', options, false);
    assert.deepEqual(
      fifth.questions.map((q) => q.factId).sort((a, b) => a - b),
      factIds.slice(0, 5).sort((a, b) => a - b),
      'a spent pool restarts with the clues met longest ago',
    );
  });

  it('signed in: multiple choice and type-in share one rotation', async () => {
    await resetRotation();
    const options = { region: 'Europe', difficulty: 'Easy', questionCount: 5 };
    const factIds: number[] = [];
    for (const quizTypeKey of [
      'trivia-fact2c-mc',
      'trivia-fact2c-type',
      'trivia-fact2c-mc',
      'trivia-fact2c-type',
    ]) {
      const played = await playSignedIn(quizTypeKey, options);
      factIds.push(...played.questions.map((q) => q.factId));
    }
    assert.equal(new Set(factIds).size, 20, 'a clue met in one mode came back in the other');
  });

  it('signed in: holds the rule over a long run of rounds across changing filters', async () => {
    await resetRotation();
    const seen = new Set<number>();
    const plans = [
      { region: undefined, difficulty: 'Easy' },
      { region: 'Europe', difficulty: 'Easy' },
      { region: 'Asia', difficulty: undefined },
      { region: undefined, difficulty: 'Easy' },
      { region: 'Europe', difficulty: undefined },
      { region: 'Africa', difficulty: 'Hard' },
      { region: undefined, difficulty: undefined },
      { region: 'Europe', difficulty: 'Easy' },
    ];
    for (const plan of plans) {
      const options = { ...plan, questionCount: 12 };
      const played = await playSignedIn('trivia-fact2c-mc', options);
      await assertNoPrematureRepeat(played.questions, seen, plan.region, plan.difficulty);
      played.questions.forEach((q) => seen.add(q.factId));
    }
  });

  it('signed in: abandoning a round does not consume its clues', async () => {
    await resetRotation();
    const options = { region: 'Europe', difficulty: 'Easy', questionCount: 20 };
    const abandoned = await playSignedIn('trivia-fact2c-type', options, false);
    assert.equal(abandoned.questions.length, 20);
    assert.equal(await prisma.factProgress.count({ where: { userId } }), 0);

    // Start one and answer only half: only the answered half is met.
    const half = await playSignedIn('trivia-fact2c-type', { ...options, questionCount: 10 }, false);
    for (const question of half.questions.slice(0, 5)) {
      const country = await prisma.country.findUniqueOrThrow({ where: { id: question.countryId } });
      await answer(half.id, question.sequence, country.name);
    }
    const met = await prisma.factProgress.findMany({ where: { userId }, select: { factId: true } });
    assert.deepEqual(
      met.map((m) => m.factId).sort((a, b) => a - b),
      half.questions
        .slice(0, 5)
        .map((q) => q.factId)
        .sort((a, b) => a - b),
    );
  });

  it('signed in: a replayed answer still records the clue as met', async () => {
    // The first call can die between the answer and the rotation row (#58); the
    // retry then replays "answered" and, before this, never wrote the row.
    await resetRotation();
    const round = await playSignedIn('trivia-fact2c-type', { questionCount: 1 }, false);
    const question = round.questions[0]!;
    const country = await prisma.country.findUniqueOrThrow({ where: { id: question.countryId } });
    await answer(round.id, question.sequence, country.name);
    await prisma.factProgress.deleteMany({ where: { userId, factId: question.factId } });

    const replay = await answer(round.id, question.sequence, country.name);
    assert.equal(replay.matchedBy, 'replay');
    assert.equal(
      await prisma.factProgress.count({ where: { userId, factId: question.factId } }),
      1,
    );

    // …without dragging a later, newer sighting backwards.
    const later = new Date(Date.now() + 86_400_000);
    await prisma.factProgress.update({
      where: { userId_factId: { userId, factId: question.factId } },
      data: { lastAnsweredAt: later },
    });
    await answer(round.id, question.sequence, country.name);
    const kept = await prisma.factProgress.findUniqueOrThrow({
      where: { userId_factId: { userId, factId: question.factId } },
    });
    assert.equal(kept.lastAnsweredAt.getTime(), later.getTime());
  });

  it('a pool smaller than the round returns a short round with no repeats', async () => {
    // Oceania + Easy is 19 clues over just 5 countries.
    const guest = await startAsGuest(
      'trivia-fact2c-type',
      { region: 'Oceania', difficulty: 'Easy', questionCount: 10 },
      {},
    );
    assert.equal(guest.questions.length, 5);
    assert.equal(new Set(guest.questions.map((q) => q.countryId)).size, 5);
    assert.equal(new Set(guest.questions.map((q) => q.factId)).size, 5);

    await resetRotation();
    const signedIn = await playSignedIn(
      'trivia-fact2c-type',
      { region: 'Oceania', difficulty: 'Easy', questionCount: 10 },
      false,
    );
    assert.equal(signedIn.questions.length, 5);
  });

  it('guest: no clue repeats until the pool is spent, whatever the filters were', async () => {
    const seen: Record<string, number> = {};
    let clock = 1_000;
    const options = { region: 'Europe', difficulty: 'Easy', questionCount: 5 };
    const factIds: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      const played = await startAsGuest('trivia-fact2c-type', options, seen);
      for (const question of played.questions) {
        factIds.push(question.factId);
        seen[String(question.factId)] = clock += 10;
      }
    }
    assert.equal(new Set(factIds).size, 20, 'a guest saw a clue twice before the pool was spent');
  });

  it('guest: changing region or difficulty between rounds does not replay a clue', async () => {
    // The old list was keyed by region + difficulty, so a clue met under "All
    // regions" was new under "Europe".
    const seen: Record<string, number> = {};
    const known = new Set<number>();
    let clock = 1_000;
    const plans = [
      { region: undefined, difficulty: 'Easy' },
      { region: 'Europe', difficulty: 'Easy' },
      { region: 'Asia', difficulty: undefined },
      { region: undefined, difficulty: 'Easy' },
      { region: 'Europe', difficulty: undefined },
      { region: 'Europe', difficulty: 'Easy' },
      { region: undefined, difficulty: undefined },
    ];
    for (const plan of plans) {
      const played = await startAsGuest('trivia-fact2c-mc', { ...plan, questionCount: 12 }, seen);
      await assertNoPrematureRepeat(played.questions, known, plan.region, plan.difficulty);
      for (const question of played.questions) {
        known.add(question.factId);
        seen[String(question.factId)] = clock += 10;
      }
    }
  });

  it('guest: a spent pool restarts with the clues seen longest ago', async () => {
    const options = { region: 'Europe', difficulty: 'Easy' };
    const all = await startAsGuest('trivia-fact2c-type', { ...options, questionCount: 20 }, {});
    assert.equal(all.questions.length, 20);

    // Every clue met, in the order they were served.
    const seen = Object.fromEntries(all.questions.map((q, i) => [String(q.factId), 1_000 + i]));
    const next = await startAsGuest('trivia-fact2c-type', { ...options, questionCount: 8 }, seen);
    assert.deepEqual(
      next.questions.map((q) => q.factId).sort((a, b) => a - b),
      all.questions
        .slice(0, 8)
        .map((q) => q.factId)
        .sort((a, b) => a - b),
      'the new cycle starts with the oldest',
    );
  });

  it('guest: ignores the seen list it is not allowed to believe', async () => {
    for (const seenFacts of [{ 'not-a-number': 1 }, { '12': -5 }, { '12': 'yesterday' }]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { quizTypeKey: 'trivia-fact2c-type', questionCount: 5, seenFacts },
      });
      assert.equal(response.statusCode, 400, JSON.stringify(seenFacts));
    }
  });
});

describe('type-in feedback and hints (#53)', () => {
  const named = (name: string) => prisma.country.findFirstOrThrow({ where: { name } });

  const submit = async (sessionId: string, sequence: number, value: string, hintUsed?: boolean) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/answers`,
      headers: userHeaders(),
      payload: { sequence, answer: value, hintUsed },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };

  it('offers a first-letter hint on type-in questions only', async () => {
    const australia = await named('Australia');
    const typeIn = await startSessionWith('capitals-c2cap-type', [australia.id]);
    assert.equal(typeIn.questions[0].answerHint, 'C _ _ _ _ _ _ _');
    const flags = await startSessionWith('flags-flag2c-type', [australia.id]);
    assert.equal(flags.questions[0].answerHint, 'A _ _ _ _ _ _ _ _');
    const choice = await startSessionWith('capitals-c2cap-mc', [australia.id]);
    assert.equal(choice.questions[0].answerHint, undefined);
  });

  it('names the country a wrong answer actually was', async () => {
    const australia = await named('Australia');
    const session = await startSessionWith('flags-flag2c-type', [australia.id]);
    const result = await submit(session.id, 1, 'Austria');
    assert.equal(result.wasCorrect, false);
    assert.equal(result.matchedCountryName, 'Austria');
  });

  it('does the same for a capital that belongs to another country', async () => {
    const australia = await named('Australia');
    const session = await startSessionWith('capitals-c2cap-type', [australia.id]);
    const result = await submit(session.id, 1, 'Vienna');
    assert.equal(result.wasCorrect, false);
    assert.equal(result.matchedCountryName, 'Austria');
  });

  it('names nothing for a right answer, a typo, or gibberish', async () => {
    const countries = await Promise.all(['Switzerland', 'France', 'Japan'].map(named));
    const session = await startSessionWith(
      'flags-flag2c-type',
      countries.map((country) => country.id),
    );
    const typo = await submit(session.id, 1, 'Swizerland');
    assert.equal(typo.matchedBy, 'fuzzy');
    assert.equal(typo.matchedCountryName, undefined);
    const right = await submit(session.id, 2, 'France');
    assert.equal(right.matchedCountryName, undefined);
    const nonsense = await submit(session.id, 3, 'qzxqzx');
    assert.equal(nonsense.wasCorrect, false);
    assert.equal(nonsense.matchedCountryName, undefined);
  });

  it('a hinted correct answer is correct but leaves the streak where it was', async () => {
    const quizTypeKey = 'flags-flag2c-type';
    const peru = await named('Peru');
    const play = async (value: string, hintUsed?: boolean) => {
      const session = await startSessionWith(quizTypeKey, [peru.id]);
      return submit(session.id, 1, value, hintUsed);
    };

    const first = await play('Peru');
    assert.equal(first.currentStreak, 1);

    const hinted = await play('Peru', true);
    assert.equal(hinted.wasCorrect, true);
    assert.equal(hinted.currentStreak, 1, 'neither grown nor reset');
    assert.equal(hinted.newlyLearned, false);

    const second = await play('Peru');
    assert.equal(second.currentStreak, 2);

    // A hint on what would have been the learning answer does not learn it.
    const hintedThird = await play('Peru', true);
    assert.equal(hintedThird.wasCorrect, true);
    assert.equal(hintedThird.currentStreak, 2);
    assert.equal(hintedThird.isLearned, false);
    assert.equal(hintedThird.newlyLearned, false);

    // An unhinted one is the third in a row. It does not learn the country yet:
    // each hint cost some ease (#50), so the interval is 6 x 2.2 = 13.2 days, a
    // little short of the 14 that counts as learned.
    const third = await play('Peru');
    assert.equal(third.currentStreak, 3);
    assert.equal(third.isLearned, false);
    assert.equal(third.newlyLearned, false);

    // The next one does.
    const fourth = await play('Peru');
    assert.equal(fourth.currentStreak, 4);
    assert.equal(fourth.newlyLearned, true);

    // A hint never softens a wrong answer.
    const wrong = await play('Chile', true);
    assert.equal(wrong.wasCorrect, false);
    assert.equal(wrong.currentStreak, 0);
  });

  it('a hinted first answer starts the country at zero, not one', async () => {
    const fiji = await named('Fiji');
    const session = await startSessionWith('flags-flag2c-type', [fiji.id]);
    const result = await submit(session.id, 1, 'Fiji', true);
    assert.equal(result.wasCorrect, true);
    assert.equal(result.currentStreak, 0);
  });
});

describe('map mode (#52)', () => {
  const named = (name: string) => prisma.country.findFirstOrThrow({ where: { name } });

  const submit = async (sessionId: string, sequence: number, value: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/answers`,
      headers: userHeaders(),
      payload: { sequence, answer: value },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };

  it('asks for a country by name, or by capital, and offers no options to pick from', async () => {
    const brazil = await named('Brazil');
    const byCountry = await startSessionWith('map-c2loc', [brazil.id]);
    assert.equal(byCountry.quizType.format, 'map_tap');
    assert.equal(byCountry.questions[0].promptLabel, 'Find on the map');
    assert.equal(byCountry.questions[0].promptText, 'Brazil');
    assert.equal(byCountry.questions[0].options, undefined);
    assert.equal(byCountry.questions[0].answerHint, undefined);
    assert.equal(byCountry.questions[0].answerHashes, undefined);

    const byCapital = await startSessionWith('map-cap2loc', [brazil.id]);
    assert.equal(byCapital.questions[0].promptText, 'Brasília');
    assert.equal(byCapital.questions[0].promptLabel, 'Find the country with the capital');
  });

  it('is right when the country tapped is the one asked for, whatever the casing', async () => {
    const brazil = await named('Brazil');
    for (const tapped of ['br', 'BR', ' Br ']) {
      const session = await startSessionWith('map-c2loc', [brazil.id]);
      const result = await submit(session.id, 1, tapped);
      assert.equal(result.wasCorrect, true, tapped);
      assert.equal(result.matchedBy, 'exact');
      assert.equal(result.correctAnswer, 'Brazil');
      assert.equal(result.correctIsoCode, 'BR');
    }
  });

  it('says which country a wrong tap was', async () => {
    const brazil = await named('Brazil');
    const session = await startSessionWith('map-c2loc', [brazil.id]);
    const result = await submit(session.id, 1, 'ar');
    assert.equal(result.wasCorrect, false);
    assert.equal(result.matchedCountryName, 'Argentina');
    assert.equal(result.correctAnswer, 'Brazil');
  });

  it('is wrong, and names nothing, for a tap on nowhere or on something that is not a country', async () => {
    const brazil = await named('Brazil');
    for (const tapped of ['', '  ', 'zz', 'not-a-code']) {
      const session = await startSessionWith('map-c2loc', [brazil.id]);
      const result = await submit(session.id, 1, tapped);
      assert.equal(result.wasCorrect, false, JSON.stringify(tapped));
      assert.equal(result.matchedCountryName, undefined);
    }
  });

  it('scores into the same streaks as every other quiz type', async () => {
    const tonga = await named('Tonga');
    const first = await startSessionWith('map-c2loc', [tonga.id]);
    assert.equal((await submit(first.id, 1, 'to')).currentStreak, 1);
    const second = await startSessionWith('map-c2loc', [tonga.id]);
    assert.equal((await submit(second.id, 1, 'to')).currentStreak, 2);
    const third = await startSessionWith('map-c2loc', [tonga.id]);
    assert.equal((await submit(third.id, 1, 'fj')).currentStreak, 0);
  });

  it('is checked statelessly for a guest too', async () => {
    const brazil = await named('Brazil');
    const check = async (answer: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/answers/check',
          payload: { quizTypeKey: 'map-cap2loc', countryId: brazil.id, answer },
        })
      ).json();
    assert.equal((await check('br')).wasCorrect, true);
    assert.equal((await check('ar')).wasCorrect, false);
  });

  it('is a start-able round for a region', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: userHeaders(),
      payload: { quizTypeKey: 'map-c2loc', region: 'Oceania', questionCount: 5 },
    });
    assert.equal(response.statusCode, 201, response.body);
    const session = response.json();
    assert.equal(session.questions.length, 5);
    for (const question of session.questions) {
      assert.equal(question.options, undefined);
      const country = await prisma.country.findUniqueOrThrow({ where: { id: question.countryId } });
      assert.equal(country.region, 'Oceania');
    }
  });
});

describe('spaced repetition (#50)', () => {
  let srsUserId: string;
  const SRS_EMAIL = 'api-srs@cartomancer.invalid';
  const DAY = 86_400_000;

  before(async () => {
    await prisma.user.deleteMany({ where: { email: SRS_EMAIL } });
    const user = await prisma.user.create({
      data: { email: SRS_EMAIL, name: 'SRS', authProvider: 'google' },
    });
    srsUserId = user.id;
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email: SRS_EMAIL } });
  });

  const headers = () => ({ 'x-cartomancer-user-id': srsUserId });
  const quizTypeKey = 'flags-flag2c-type';

  const sessionFor = async (countryIds: number[]) => {
    const quizType = await prisma.quizType.findUniqueOrThrow({ where: { key: quizTypeKey } });
    const created = await prisma.quizSession.create({
      data: {
        quizTypeId: quizType.id,
        questionCount: countryIds.length,
        createdBy: srsUserId,
        participants: { create: [{ userId: srsUserId }] },
        questions: {
          create: countryIds.map((countryId, index) => ({ sequence: index + 1, countryId })),
        },
      },
    });
    return created.id;
  };

  const play = async (countryId: number, value: string, timeTakenMs = 5000) => {
    const sessionId = await sessionFor([countryId]);
    const before = Date.now();
    const response = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/answers`,
      headers: headers(),
      payload: { sequence: 1, answer: value, timeTakenMs },
    });
    assert.equal(response.statusCode, 200, response.body);
    return { result: response.json(), before, sessionId };
  };

  const rowFor = async (countryId: number) => {
    const quizType = await prisma.quizType.findUniqueOrThrow({ where: { key: quizTypeKey } });
    return prisma.progress.findUniqueOrThrow({
      where: {
        userId_countryId_quizTypeId: { userId: srsUserId, countryId, quizTypeId: quizType.id },
      },
    });
  };

  const country = (name: string) => prisma.country.findFirstOrThrow({ where: { name } });

  it('stretches the interval 1, 6, then by the ease factor, and learns at two weeks', async () => {
    const norway = await country('Norway');

    const first = await play(norway.id, 'Norway');
    assert.equal(first.result.nextReviewInDays, 1);
    assert.equal(first.result.isLearned, false);
    let row = await rowFor(norway.id);
    assert.equal(row.intervalDays, 1);
    assert.ok(row.dueAt, 'a due date is stored');
    assert.ok(Math.abs(row.dueAt.getTime() - (row.lastAnsweredAt?.getTime() ?? 0) - DAY) < 1000);

    const second = await play(norway.id, 'Norway');
    assert.equal(second.result.nextReviewInDays, 6);
    assert.equal(second.result.isLearned, false);

    const third = await play(norway.id, 'Norway');
    assert.equal(third.result.currentStreak, 3);
    // 6 days x an ease that three quick answers have raised from 2.5.
    assert.ok(third.result.nextReviewInDays >= 15, String(third.result.nextReviewInDays));
    assert.equal(third.result.isLearned, true);
    assert.equal(third.result.newlyLearned, true);
    row = await rowFor(norway.id);
    assert.equal(row.isLearned, true);
    assert.ok(row.learnedAt, 'learned_at is stamped when it becomes learned');
    const learnedAt = row.learnedAt;

    // Another success keeps it learned, is not "newly" learned, and keeps learned_at.
    const fourth = await play(norway.id, 'Norway');
    assert.equal(fourth.result.isLearned, true);
    assert.equal(fourth.result.newlyLearned, false);
    assert.equal((await rowFor(norway.id)).learnedAt?.getTime(), learnedAt.getTime());
  });

  it('a miss brings it back at once and un-learns it', async () => {
    const sweden = await country('Sweden');
    for (let i = 0; i < 3; i += 1) await play(sweden.id, 'Sweden');
    assert.equal((await rowFor(sweden.id)).isLearned, true);

    const { result } = await play(sweden.id, 'Denmark');
    assert.equal(result.wasCorrect, false);
    assert.equal(result.currentStreak, 0);
    assert.equal(result.isLearned, false);
    assert.equal(result.nextReviewInDays, 0);
    const row = await rowFor(sweden.id);
    assert.equal(row.intervalDays, 0);
    assert.equal(row.learnedAt, null, 'a lapse clears learned_at');
    assert.ok(row.dueAt && row.dueAt.getTime() <= Date.now() + 1000, 'due straight away');
  });

  it('answer speed moves the ease: fast raises it, slow lowers it, never past the bounds', async () => {
    const [fast, slow] = await Promise.all([country('Finland'), country('Iceland')]);
    for (let i = 0; i < 6; i += 1) await play(fast.id, 'Finland', 800);
    for (let i = 0; i < 6; i += 1) await play(slow.id, 'Iceland', 60_000);
    const fastRow = await rowFor(fast.id);
    const slowRow = await rowFor(slow.id);
    assert.ok(fastRow.ease > 2.5 && fastRow.ease <= 3, String(fastRow.ease));
    assert.ok(slowRow.ease < 2.5 && slowRow.ease >= 1.3, String(slowRow.ease));
  });

  it('typed answers are allowed more time before they count as slow', async () => {
    const chad = await country('Chad');
    await play(chad.id, 'Chad', 15_000);
    // 15 s is slow for a tap but ordinary for typing a name: no ease change.
    assert.equal((await rowFor(chad.id)).ease, 2.5);
  });

  it('asks for what is due first, then what is new, then what is not yet due', async () => {
    const [due, fresh, later, overdue] = await Promise.all(
      ['Peru', 'Chile', 'Bolivia', 'Ecuador'].map(country),
    );
    const quizType = await prisma.quizType.findUniqueOrThrow({ where: { key: quizTypeKey } });
    const seed = (countryId: number, dueAt: Date) =>
      prisma.progress.create({
        data: {
          userId: srsUserId,
          countryId,
          quizTypeId: quizType.id,
          currentStreak: 1,
          intervalDays: 1,
          dueAt,
          lastAnsweredAt: new Date(Date.now() - 2 * DAY),
        },
      });
    await seed((later as { id: number }).id, new Date(Date.now() + 10 * DAY));
    await seed((due as { id: number }).id, new Date(Date.now() - 1 * DAY));
    await seed((overdue as { id: number }).id, new Date(Date.now() - 20 * DAY));

    // Every other South American country is "new", so the round is exactly the
    // ones with a schedule plus new ones, in that order.
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: headers(),
      payload: { quizTypeKey, region: 'Americas', questionCount: 195 },
    });
    assert.equal(response.statusCode, 201, response.body);
    const ids: number[] = response.json().questions.map((q: { countryId: number }) => q.countryId);
    const at = (id: number) => ids.indexOf(id);
    assert.ok(at((overdue as { id: number }).id) === 0, 'the most overdue is first');
    assert.ok(at((due as { id: number }).id) === 1, 'then the next due');
    assert.ok(at((fresh as { id: number }).id) > 1, 'new countries follow what is due');
    assert.ok(
      at((later as { id: number }).id) > at((fresh as { id: number }).id),
      'what is not yet due comes last',
    );
    assert.equal(ids[ids.length - 1], (later as { id: number }).id);
  });

  it('reports a newly learned country on the results, once', async () => {
    const mali = await country('Mali');
    let last;
    for (let i = 0; i < 3; i += 1) last = await play(mali.id, 'Mali');
    const finished = await app.inject({
      method: 'POST',
      url: `/api/sessions/${last?.sessionId}/finish`,
      headers: headers(),
      payload: {},
    });
    assert.equal(finished.statusCode, 200, finished.body);
    assert.deepEqual(
      finished.json().newlyLearned.map((c: { countryName: string }) => c.countryName),
      ['Mali'],
    );
    const again = await play(mali.id, 'Mali');
    const results = await app.inject({
      method: 'POST',
      url: `/api/sessions/${again.sessionId}/finish`,
      headers: headers(),
      payload: {},
    });
    assert.deepEqual(results.json().newlyLearned, []);
  });

  it('counts both of two answers to the same country sent at once', async () => {
    const togo = await country('Togo');
    const [a, b] = await Promise.all([sessionFor([togo.id]), sessionFor([togo.id])]);
    const send = (sessionId: string) =>
      app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/answers`,
        headers: headers(),
        payload: { sequence: 1, answer: 'Togo', timeTakenMs: 5000 },
      });
    const responses = await Promise.all([send(a), send(b)]);
    for (const response of responses) assert.equal(response.statusCode, 200, response.body);
    const row = await rowFor(togo.id);
    assert.equal(row.currentStreak, 2, 'neither answer was lost');
    assert.equal(row.intervalDays, 6);
  });
});

describe('review rounds (#51)', () => {
  let reviewUserId: string;
  const REVIEW_EMAIL = 'api-review@cartomancer.invalid';

  before(async () => {
    await prisma.user.deleteMany({ where: { email: REVIEW_EMAIL } });
    const user = await prisma.user.create({
      data: { email: REVIEW_EMAIL, name: 'Review', authProvider: 'google' },
    });
    reviewUserId = user.id;
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email: REVIEW_EMAIL } });
  });

  const asReviewer = { 'x-cartomancer-user-id': '' };
  const headers = () => ({ ...asReviewer, 'x-cartomancer-user-id': reviewUserId });

  const start = (payload: Record<string, unknown>, guest = false) =>
    app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: guest ? {} : headers(),
      payload,
    });

  const play = async (sessionId: string, sequence: number, value: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/answers`,
      headers: headers(),
      payload: { sequence, answer: value },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };

  const ids = async (...names: string[]) =>
    (
      await Promise.all(names.map((name) => prisma.country.findFirstOrThrow({ where: { name } })))
    ).map((country) => country.id);

  it('starts a round over exactly the countries asked for, ignoring the filters', async () => {
    const wanted = await ids('Japan', 'Brazil', 'Kenya');
    const response = await start({
      quizTypeKey: 'capitals-c2cap-mc',
      region: 'Europe',
      difficulty: 'Hard',
      countryIds: wanted,
    });
    assert.equal(response.statusCode, 201, response.body);
    const session = response.json();
    assert.deepEqual(
      session.questions.map((question: { countryId: number }) => question.countryId).sort(),
      [...wanted].sort(),
    );
    assert.equal(session.questionCount, 3);
    assert.deepEqual(
      session.questions.map((question: { sequence: number }) => question.sequence),
      [1, 2, 3],
    );
  });

  it('works for a guest too, writing nothing', async () => {
    const wanted = await ids('Japan', 'Brazil');
    const before = await prisma.quizSession.count();
    const response = await start({ quizTypeKey: 'flags-flag2c-type', countryIds: wanted }, true);
    assert.equal(response.statusCode, 201, response.body);
    const session = response.json();
    assert.equal(session.isGuest, true);
    assert.equal(session.questions.length, 2);
    assert.equal(await prisma.quizSession.count(), before);
  });

  it('asks a trivia round about the clue for each country', async () => {
    const withFacts = await prisma.countryFact.findMany({ take: 3, select: { countryId: true } });
    const wanted = [...new Set(withFacts.map((fact) => fact.countryId))];
    const response = await start({ quizTypeKey: 'trivia-fact2c-mc', countryIds: wanted });
    assert.equal(response.statusCode, 201, response.body);
    const session = response.json();
    assert.equal(session.questions.length, wanted.length);
    for (const question of session.questions) {
      assert.ok(question.promptText.length > 0);
      assert.ok(question.factId !== undefined);
    }
  });

  it('refuses ids that are not countries, an empty list, and more than there are', async () => {
    const unknown = await start({ quizTypeKey: 'capitals-c2cap-mc', countryIds: [999999] });
    assert.equal(unknown.statusCode, 400);
    const empty = await start({ quizTypeKey: 'capitals-c2cap-mc', countryIds: [] });
    assert.equal(empty.statusCode, 400);
    const tooMany = await start({
      quizTypeKey: 'capitals-c2cap-mc',
      countryIds: Array.from({ length: 196 }, (_, index) => index + 1),
    });
    assert.equal(tooMany.statusCode, 400);
  });

  it('counts a repeated id once', async () => {
    const [japan] = await ids('Japan');
    const response = await start({
      quizTypeKey: 'capitals-c2cap-mc',
      countryIds: [japan, japan],
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().questions.length, 1);
  });

  it('summarises what needs review: missed, most recent first, and gone once answered right', async () => {
    const summary = () => loadSummary(prisma, reviewUserId);
    assert.equal((await summary()).review, null, 'nothing answered yet');

    const [japan, brazil, kenya] = await ids('Japan', 'Brazil', 'Kenya');
    const quizTypeKey = 'capitals-c2cap-type';
    const session = (await start({ quizTypeKey, countryIds: [japan, brazil, kenya] })).json();
    const order: number[] = session.questions.map(
      (question: { countryId: number }) => question.countryId,
    );
    const answers = new Map<number, string>([
      [japan as number, 'Tokyo'],
      [brazil as number, 'Brasília'],
      [kenya as number, 'Nairobi'],
    ]);
    // Miss two of the three; get one right.
    const right = order[0] as number;
    for (const [position, countryId] of order.entries()) {
      await play(
        session.id,
        position + 1,
        countryId === right ? (answers.get(countryId) as string) : 'nope',
      );
    }

    const review = (await summary()).review;
    assert.ok(review);
    assert.equal(review.quizTypeKey, quizTypeKey);
    assert.equal(review.count, 2);
    assert.deepEqual([...review.countryIds].sort(), order.filter((id) => id !== right).sort());
    assert.equal(review.countryIds.includes(right), false, 'a correct answer needs no review');
    assert.equal(review.quizTypeName.length > 0, true);

    // Answering one of them correctly takes it off the list.
    const again = (await start({ quizTypeKey, countryIds: review.countryIds })).json();
    const first = again.questions[0] as { countryId: number };
    await play(again.id, 1, answers.get(first.countryId) as string);
    const after = (await summary()).review;
    assert.equal(after?.count, 1);
    assert.equal(after?.countryIds.includes(first.countryId), false);
  });

  it('is served by the summary endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/summary', headers: headers() });
    assert.equal(response.statusCode, 200);
    assert.ok('review' in response.json().summary);
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

    // Re-answering the same question replays what was recorded rather than
    // farming a streak off one prompt (#58).
    const repeat = await app.inject({
      method: 'POST',
      url: `/api/sessions/${demotion.id}/answers`,
      headers: userHeaders(),
      payload: { sequence: 1, answer: 'anything' },
    });
    assert.equal(repeat.statusCode, 200);
    const replay = repeat.json();
    assert.equal(replay.matchedBy, 'replay');
    assert.equal(replay.wasCorrect, false, 'the recorded answer was wrong, and stays wrong');
    assert.equal(replay.currentStreak, 0);
    assert.equal(replay.newlyLearned, false);
  });

  it('replays a repeated answer instead of scoring it twice', async () => {
    const quizTypeKey = 'capitals-c2cap-type';
    const quizType = await prisma.quizType.findUniqueOrThrow({ where: { key: quizTypeKey } });
    const session = await startSession(quizTypeKey, { questionCount: 1 });
    const question = session.questions[0];
    const country = await prisma.country.findUniqueOrThrow({ where: { id: question.countryId } });

    const first = await answer(session.id, question.sequence, country.capital);
    assert.equal(first.wasCorrect, true);
    const streak = first.currentStreak;

    // The same POST again — what a retry sends when the first response never
    // made it back to the browser.
    const again = await answer(session.id, question.sequence, country.capital);
    assert.equal(again.wasCorrect, true, 'the recorded answer is reported again');
    assert.equal(again.correctAnswer, first.correctAnswer);
    assert.equal(again.correctCountryId, first.correctCountryId);
    assert.equal(again.matchedBy, 'replay');
    assert.equal(again.currentStreak, streak, 'the streak does not move');
    assert.equal(again.newlyLearned, false);

    // Nothing was written twice: one answer row, and the streak is where the
    // first call left it.
    const rows = await prisma.sessionAnswer.count({
      where: { sessionId: session.id, countryId: country.id },
    });
    assert.equal(rows, 1);
    const progress = await prisma.progress.findUniqueOrThrow({
      where: {
        userId_countryId_quizTypeId: { userId, countryId: country.id, quizTypeId: quizType.id },
      },
    });
    assert.equal(progress.currentStreak, streak);

    // And the round still scores once.
    const results = await finish(session.id);
    assert.equal(results.total, 1);
    assert.equal(results.score, 1);
  });

  it('replays a wrong answer without resetting the streak a second time', async () => {
    const quizTypeKey = 'capitals-c2cap-type';
    const session = await startSession(quizTypeKey, { questionCount: 1 });
    const question = session.questions[0];

    const first = await answer(session.id, question.sequence, 'not a capital at all');
    assert.equal(first.wasCorrect, false);
    const again = await answer(session.id, question.sequence, 'not a capital at all');
    assert.equal(again.wasCorrect, false);
    assert.equal(again.currentStreak, first.currentStreak);
    const rows = await prisma.sessionAnswer.count({ where: { sessionId: session.id } });
    assert.equal(rows, 1);
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
    assert.equal(
      new Set(ids).size,
      ids.length,
      'every trivia question must be a different country',
    );
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

/**
 * The day streak is counted in the player's own days, not UTC's (#66).
 *
 * The web app never said where the player was, so every day was bucketed in UTC.
 * For someone ahead of it, Wednesday 07:41 is still Tuesday in UTC: "today" was
 * a day behind, Tuesday looked like today, and a missed Tuesday never broke the
 * streak. These pin the boundary directly — `loadSummary` takes `now`, so the
 * test chooses the instant instead of racing the clock — in zones on both sides
 * of UTC, where the buggy and the correct answer differ.
 */
describe('day streak is counted in the player timezone (#66)', () => {
  const EMAIL = 'tz-test@cartomancer.invalid';
  let tzUserId: string;

  before(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    tzUserId = (
      await prisma.user.create({ data: { email: EMAIL, name: 'TZ Test', authProvider: 'google' } })
    ).id;
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  });

  /** Replaces the user's answers with one per instant, each on its own country. */
  const answeredAt = async (instants: string[]) => {
    await prisma.quizSession.deleteMany({ where: { createdBy: tzUserId } });
    if (instants.length === 0) return;
    const quizType = await prisma.quizType.findUniqueOrThrow({
      where: { key: 'capitals-c2cap-mc' },
    });
    const countries = await prisma.country.findMany({
      take: instants.length,
      orderBy: { id: 'asc' },
    });
    const session = await prisma.quizSession.create({
      data: {
        quizTypeId: quizType.id,
        questionCount: instants.length,
        createdBy: tzUserId,
        participants: { create: [{ userId: tzUserId }] },
        questions: {
          create: countries.map((country, index) => ({
            sequence: index + 1,
            countryId: country.id,
          })),
        },
      },
    });
    await prisma.sessionAnswer.createMany({
      data: countries.map((country, index) => ({
        sessionId: session.id,
        userId: tzUserId,
        countryId: country.id,
        wasCorrect: true,
        answeredAt: new Date(instants[index]!),
      })),
    });
  };

  const summaryAt = (now: string, zone?: string) =>
    loadSummary(prisma, tzUserId, zone, new Date(now));

  // 2026-09-28 is a Monday, so Wednesday is the 30th. Brisbane is UTC+10 all
  // year (no DST), which keeps the arithmetic below honest.
  it('UTC+10: a missed day breaks the streak on the morning after it', async () => {
    // Played Monday, not Tuesday. Wednesday 07:41 in Brisbane is Tuesday 21:41 UTC.
    await answeredAt(['2026-09-28T02:00:00Z']); // Monday 12:00 Brisbane
    const now = '2026-09-29T21:41:00Z';

    const local = await summaryAt(now, 'Australia/Brisbane');
    assert.equal(local.dayStreak, 0, 'Tuesday was missed, so the streak is over');
    // Monday filled, and the week is the one that contains Wednesday.
    assert.deepEqual(local.weekActivity, [true, false, false, false, false, false, false]);

    // What the player saw: UTC thinks it is still Tuesday, so Monday is "yesterday".
    assert.equal((await summaryAt(now)).dayStreak, 1);
  });

  it('UTC+10: yesterday still counts until the end of the player’s own day', async () => {
    await answeredAt(['2026-09-28T02:00:00Z', '2026-09-29T02:00:00Z']); // Mon, Tue (Brisbane)
    const morning = await summaryAt('2026-09-29T21:41:00Z', 'Australia/Brisbane'); // Wed 07:41
    assert.equal(morning.dayStreak, 2, 'not played yet today: the grace day, streak unchanged');
    assert.deepEqual(morning.weekActivity, [true, true, false, false, false, false, false]);

    // The same two answers a full local day later: Wednesday has now been missed too.
    const nextMorning = await summaryAt('2026-09-30T21:41:00Z', 'Australia/Brisbane'); // Thu 07:41
    assert.equal(nextMorning.dayStreak, 0);
  });

  it('an answer at 23:30 local counts towards that local day', async () => {
    // Tuesday 23:30 in New York (EDT, UTC-4) is Wednesday 03:30 UTC.
    await answeredAt(['2026-09-30T03:30:00Z']);
    const now = '2026-09-30T13:00:00Z'; // Wednesday 09:00 New York

    const local = await summaryAt(now, 'America/New_York');
    assert.deepEqual(
      local.weekActivity,
      [false, true, false, false, false, false, false],
      'Tuesday',
    );
    assert.equal(local.dayStreak, 1, 'played yesterday, not yet today');

    const utc = await summaryAt(now);
    assert.deepEqual(
      utc.weekActivity,
      [false, false, true, false, false, false, false],
      'Wednesday',
    );
  });

  it('UTC-4: just after UTC midnight it is still the previous local day', async () => {
    // Played Monday only. 00:30 UTC on Wednesday is Tuesday 20:30 in New York, so
    // Tuesday is "today" and not yet missed; UTC already calls it Wednesday and
    // has written the streak off.
    await answeredAt(['2026-09-28T14:00:00Z']); // Monday 10:00 New York
    const now = '2026-09-30T00:30:00Z';

    assert.equal((await summaryAt(now, 'America/New_York')).dayStreak, 1);
    assert.equal((await summaryAt(now, 'UTC')).dayStreak, 0);
  });

  it('UTC players are unchanged around midnight', async () => {
    await answeredAt(['2026-09-29T23:30:00Z']);
    assert.equal((await summaryAt('2026-09-29T23:59:00Z', 'UTC')).dayStreak, 1, 'today');
    assert.equal((await summaryAt('2026-09-30T00:01:00Z', 'UTC')).dayStreak, 1, 'yesterday, grace');
    assert.equal((await summaryAt('2026-10-01T00:01:00Z', 'UTC')).dayStreak, 0, 'a day missed');
  });

  it('counts a streak of several local days, across a UTC date change in the middle', async () => {
    // Three evenings in Sydney (UTC+10), each after 14:00 UTC — so each falls on
    // the NEXT UTC date than the one the player lived it on.
    await answeredAt(['2026-09-27T14:30:00Z', '2026-09-28T14:30:00Z', '2026-09-29T14:30:00Z']);
    const now = '2026-09-30T00:00:00Z'; // Wednesday 10:00 in Brisbane
    assert.equal((await summaryAt(now, 'Australia/Brisbane')).dayStreak, 3);
  });

  it('falls back to UTC for a zone it does not know, rather than failing', async () => {
    await answeredAt(['2026-09-28T02:00:00Z']);
    const now = '2026-09-29T21:41:00Z';
    const expected = await summaryAt(now, 'UTC');
    for (const bad of ['Not/AZone', '', "UTC'; DROP TABLE users;--", '../../etc/passwd']) {
      assert.deepEqual(await summaryAt(now, bad), expected, JSON.stringify(bad));
    }
  });

  describe('requestTimeZone', () => {
    const request = (header?: string, tz?: unknown) =>
      ({
        headers: header === undefined ? {} : { 'x-cartomancer-timezone': header },
        query: { tz },
      }) as never;

    it('prefers the header, then ?tz=, then UTC', () => {
      assert.equal(requestTimeZone(request('Australia/Sydney')), 'Australia/Sydney');
      assert.equal(requestTimeZone(request(undefined, 'America/New_York')), 'America/New_York');
      assert.equal(requestTimeZone(request('Asia/Tokyo', 'America/New_York')), 'Asia/Tokyo');
      assert.equal(requestTimeZone(request()), 'UTC');
    });

    it('treats anything that is not a zone as UTC, and a bad header does not hide a good ?tz=', () => {
      assert.equal(requestTimeZone(request('nonsense')), 'UTC');
      assert.equal(requestTimeZone(request('nonsense', 'Europe/Paris')), 'Europe/Paris');
      assert.equal(requestTimeZone(request(undefined, 42)), 'UTC');
    });
  });

  it('the summary endpoint buckets days in the zone it is sent', async () => {
    // Expected values come from a few lines of Intl in the test, not from the
    // code under test, so an endpoint that ignored the header would disagree for
    // any zone whose day boundary falls between the two readings.
    const dayIn = (instant: Date, zone: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(instant);
    const now = new Date();
    const answeredInstant = new Date(now.getTime() - 30 * 3_600_000);
    await answeredAt([answeredInstant.toISOString()]);

    for (const zone of ['Pacific/Kiritimati', 'Etc/GMT+12', 'America/New_York', 'UTC']) {
      const daysAgo =
        (Date.parse(dayIn(now, zone)) - Date.parse(dayIn(answeredInstant, zone))) / 86_400_000;
      const response = await app.inject({
        method: 'GET',
        url: '/api/summary',
        headers: { 'x-cartomancer-user-id': tzUserId, 'x-cartomancer-timezone': zone },
      });
      assert.equal(response.statusCode, 200, response.body);
      // One answer: it is a streak of 1 if it was today or yesterday, else none.
      assert.equal(
        response.json().summary.dayStreak,
        daysAgo <= 1 ? 1 : 0,
        `${zone}, ${daysAgo}d ago`,
      );
    }

    // A zone that is not one is UTC, not a failed home screen.
    const bad = await app.inject({
      method: 'GET',
      url: '/api/summary',
      headers: { 'x-cartomancer-user-id': tzUserId, 'x-cartomancer-timezone': 'nonsense' },
    });
    assert.equal(bad.statusCode, 200);
  });
});

/**
 * Answering is atomic and safe to race (#54).
 *
 * It used to be four independent statements: the "already answered?" check, the
 * answer row, the streak, the score. Two submits of one question — a double tap,
 * or a client retry (#58) arriving while the original is in flight — both passed
 * the check and the second hit the primary key as a 500; two answers to
 * different questions each recounted the score before the other committed; and
 * a failure part-way left the pieces disagreeing with each other for good.
 *
 * Races are only ever probable, never certain, so the concurrent tests repeat
 * and fire several at once. They are cheap, and with the fix reverted they fail.
 */
describe('answering is atomic and safe to race (#54)', () => {
  const EMAIL = 'atomic-test@cartomancer.invalid';
  let playerId: string;
  const as = () => ({ 'x-cartomancer-user-id': playerId });

  before(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    playerId = (
      await prisma.user.create({
        data: { email: EMAIL, name: 'Atomic Test', authProvider: 'google' },
      })
    ).id;
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  });

  const QUIZ = 'capitals-c2cap-type';

  /** A session for this player over exactly these countries. */
  const sessionOver = async (
    countryIds: number[],
    quizTypeKey = QUIZ,
  ): Promise<{ id: string; quizTypeId: number }> => {
    const quizType = await prisma.quizType.findUniqueOrThrow({ where: { key: quizTypeKey } });
    const created = await prisma.quizSession.create({
      data: {
        quizTypeId: quizType.id,
        questionCount: countryIds.length,
        createdBy: playerId,
        participants: { create: [{ userId: playerId }] },
        questions: {
          create: countryIds.map((countryId, index) => ({ sequence: index + 1, countryId })),
        },
      },
    });
    return { id: created.id, quizTypeId: quizType.id };
  };

  const submit = (sessionId: string, sequence: number, value: string) =>
    app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/answers`,
      headers: as(),
      payload: { sequence, answer: value },
    });

  const countries = async (take: number, skip = 0) =>
    prisma.country.findMany({ orderBy: { id: 'asc' }, take, skip });

  const score = async (sessionId: string) =>
    (
      await prisma.sessionParticipant.findUniqueOrThrow({
        where: { sessionId_userId: { sessionId, userId: playerId } },
      })
    ).score;

  it('two submits of one question at once: one is counted, the rest replay it, none fail', async () => {
    const pool = await countries(6, 20);
    for (const country of pool) {
      const session = await sessionOver([country.id]);
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => submit(session.id, 1, country.capital)),
      );

      for (const response of responses) {
        assert.equal(response.statusCode, 200, `${country.name}: ${response.body}`);
        assert.equal(response.json().wasCorrect, true);
      }
      const matched = responses.map((r) => r.json().matchedBy);
      assert.equal(
        matched.filter((by) => by !== 'replay').length,
        1,
        `exactly one submit is the real one: ${matched.join(',')}`,
      );
      assert.equal(matched.filter((by) => by === 'replay').length, 3);

      // Counted once, however many arrived.
      assert.equal(
        await prisma.sessionAnswer.count({ where: { sessionId: session.id, userId: playerId } }),
        1,
      );
      const progress = await prisma.progress.findUniqueOrThrow({
        where: {
          userId_countryId_quizTypeId: {
            userId: playerId,
            countryId: country.id,
            quizTypeId: session.quizTypeId,
          },
        },
      });
      assert.equal(progress.currentStreak, 1, 'a double tap is one answer, not two in a row');
      assert.equal(await score(session.id), 1);
    }
  });

  it('answers to different questions at once all count towards the score', async () => {
    // Each used to recount the score before the others had committed, so each
    // wrote a score one short and the last writer won.
    const pool = await countries(12, 40);
    const session = await sessionOver(pool.map((c) => c.id));
    const responses = await Promise.all(
      pool.map((country, index) => submit(session.id, index + 1, country.capital)),
    );
    for (const response of responses) {
      assert.equal(response.statusCode, 200, response.body);
    }
    assert.equal(
      await prisma.sessionAnswer.count({
        where: { sessionId: session.id, userId: playerId, wasCorrect: true },
      }),
      12,
    );
    assert.equal(await score(session.id), 12, 'the score is what session_answers says it is');
  });

  it('the same country answered in several sessions at once loses no streak', async () => {
    // Two tabs, or two sessions: the streak was read, incremented in JavaScript
    // and written back, so concurrent answers read the same value and one
    // correct answer vanished from the count.
    // Not narrowed with assert.ok: inside this loop that makes the types depend
    // on the assertions below them, which TypeScript reports as a cycle.
    const country = (await countries(1, 70))[0]!;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await prisma.progress.deleteMany({ where: { userId: playerId, countryId: country.id } });
      const sessions: { id: string; quizTypeId: number }[] = await Promise.all(
        Array.from({ length: 3 }, () => sessionOver([country.id])),
      );
      const responses = await Promise.all(
        sessions.map((session) => submit(session.id, 1, country.capital)),
      );
      const results = responses.map((r) => {
        assert.equal(r.statusCode, 200, r.body);
        return r.json();
      });

      assert.deepEqual(
        results.map((r) => r.currentStreak).sort(),
        [1, 2, 3],
        'every correct answer moved the streak up by one',
      );
      assert.equal(results.filter((r) => r.newlyLearned).length, 1, 'learned exactly once');
      assert.equal(results.find((r) => r.newlyLearned)?.currentStreak, 3);
      const stored = await prisma.progress.findFirstOrThrow({
        where: { userId: playerId, countryId: country.id },
      });
      assert.equal(stored.currentStreak, 3);
      assert.equal(stored.isLearned, true);
    }
  });

  it('a wrong answer still resets the streak and demotes, in one statement', async () => {
    const country = (await countries(1, 80))[0]!;
    const rounds: [string, number, boolean][] = [
      [country.capital, 1, false],
      [country.capital, 2, false],
      [country.capital, 3, true],
      [country.capital, 4, true],
      ['definitely not it', 0, false],
      [country.capital, 1, false],
    ];
    for (const [value, streak, learned] of rounds) {
      const session = await sessionOver([country.id]);
      const result = (await submit(session.id, 1, value)).json();
      assert.equal(result.currentStreak, streak, value);
      assert.equal(result.isLearned, learned, value);
    }
  });

  it('a failure part-way through leaves nothing behind, and a retry starts clean', async () => {
    // Injected at the very last step: a constraint the third correct answer's
    // score would violate. Before, the answer row and the streak were already
    // committed by then, and nothing ever reconciled them with the score.
    const pool = await countries(3, 100);
    const session = await sessionOver(pool.map((c) => c.id));
    await prisma.$executeRawUnsafe(
      // NOT VALID: earlier tests left participants above 3, and this only needs the
      // rows that change from here on to be held to it.
      'ALTER TABLE session_participants ADD CONSTRAINT tmp_score_below_3 CHECK (score < 3) NOT VALID',
    );
    try {
      for (const [index, country] of pool.slice(0, 2).entries()) {
        assert.equal((await submit(session.id, index + 1, country.capital)).statusCode, 200);
      }
      const third = pool[2]!;
      const failed = await submit(session.id, 3, third.capital);
      assert.equal(failed.statusCode, 500, 'the injected failure surfaces');

      assert.equal(
        await prisma.sessionAnswer.count({ where: { sessionId: session.id, userId: playerId } }),
        2,
        'the answer row was rolled back with the rest',
      );
      assert.equal(
        await prisma.progress.count({
          where: { userId: playerId, countryId: third.id, quizTypeId: session.quizTypeId },
        }),
        0,
        'and so was the streak',
      );
      assert.equal(await score(session.id), 2);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE session_participants DROP CONSTRAINT tmp_score_below_3',
      );
    }

    // The failure was not recorded as an answer, so the retry is a real one.
    const retried = await submit(session.id, 3, pool[2]!.capital);
    assert.equal(retried.statusCode, 200, retried.body);
    assert.notEqual(retried.json().matchedBy, 'replay');
    assert.equal(retried.json().currentStreak, 1);
    assert.equal(await score(session.id), 3);
  });

  describe('recall guesses', () => {
    const startRecall = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/recall',
          headers: as(),
          payload: { region: 'Oceania' },
        })
      ).json() as { id: string };
    const guess = (sessionId: string, value: string) =>
      app.inject({
        method: 'POST',
        url: `/api/recall/${sessionId}/guesses`,
        headers: as(),
        payload: { guess: value },
      });
    const recallScore = async (sessionId: string) =>
      (
        await prisma.sessionParticipant.findUniqueOrThrow({
          where: { sessionId_userId: { sessionId, userId: playerId } },
        })
      ).score;

    it('the same country sent several times at once is accepted once and the rest are duplicates', async () => {
      const round = await startRecall();
      const responses = await Promise.all(Array.from({ length: 4 }, () => guess(round.id, 'Fiji')));
      for (const response of responses) {
        assert.equal(response.statusCode, 200, response.body);
      }
      const bodies = responses.map((r) => r.json());
      assert.equal(bodies.filter((b) => b.accepted).length, 1, 'counted once');
      assert.equal(bodies.filter((b) => b.duplicate).length, 3);
      for (const body of bodies) {
        assert.equal(body.country.name, 'Fiji');
      }
      assert.equal(
        await prisma.sessionAnswer.count({ where: { sessionId: round.id, userId: playerId } }),
        1,
      );
      assert.equal(await recallScore(round.id), 1);
    });

    it('different countries named at once all count towards the score', async () => {
      const round = await startRecall();
      const names = ['Fiji', 'Samoa', 'Tonga', 'Tuvalu', 'Vanuatu', 'Nauru'];
      const responses = await Promise.all(names.map((name) => guess(round.id, name)));
      for (const response of responses) {
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().accepted, true);
      }
      assert.equal(await recallScore(round.id), 6, 'no recount came up one short');
      assert.equal(
        await prisma.sessionAnswer.count({ where: { sessionId: round.id, userId: playerId } }),
        6,
      );
    });
  });

  it('turns an unhandled unique violation into a 409, not a 500', async () => {
    const net = await buildServer({ ...loadEnv(), LOG_LEVEL: 'fatal', INTERNAL_API_KEY: '' });
    net.get('/__unique', async () => {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    });
    const response = await net.inject({ method: 'GET', url: '/__unique' });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error, 'conflict');
    await net.close();
  });
});

describe('the country list used for distractors is cached (#54)', () => {
  const fake = (calls: { n: number }, fail = false) =>
    ({
      country: {
        findMany: async () => {
          calls.n += 1;
          if (fail) throw new Error('database blip');
          return [{ id: calls.n }];
        },
      },
    }) as never;

  it('reads once within the TTL, and again after it', async () => {
    clearCountryCache();
    const calls = { n: 0 };
    const db = fake(calls);
    const t0 = 1_000_000;
    const [a, b] = await Promise.all([loadAllCountries(db, t0), loadAllCountries(db, t0 + 5)]);
    assert.equal(calls.n, 1, 'concurrent first requests share one query');
    assert.strictEqual(a, b);
    await loadAllCountries(db, t0 + 9 * 60_000);
    assert.equal(calls.n, 1, 'still fresh at nine minutes');
    await loadAllCountries(db, t0 + 11 * 60_000);
    assert.equal(calls.n, 2, 'read again once stale');
    clearCountryCache();
  });

  it('does not remember a failed read', async () => {
    clearCountryCache();
    const calls = { n: 0 };
    await assert.rejects(loadAllCountries(fake(calls, true), 5_000_000));
    await new Promise((resolve) => setImmediate(resolve));
    const rows = await loadAllCountries(fake(calls), 5_000_001);
    assert.equal(rows.length, 1, 'the next request tries again rather than replaying the failure');
    clearCountryCache();
  });

  it('serves real sessions from the cache without changing what they ask', async () => {
    clearCountryCache();
    const first = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { quizTypeKey: 'capitals-c2cap-mc', questionCount: 5 },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { quizTypeKey: 'capitals-c2cap-mc', questionCount: 5 },
    });
    for (const response of [first, second]) {
      assert.equal(response.statusCode, 201);
      for (const question of response.json().questions) {
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options.map((o: { label: string }) => o.label)).size, 4);
      }
    }
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

  it('a completed round finishes cleanly, and finishing again changes nothing (#67)', async () => {
    // The round now ends by itself when the last country is named, so the
    // automatic finish and a tap on "I'm done" (or a retried request, #58) can
    // both arrive. The session has to be marked finished once, and keep the
    // moment it was.
    // Its own player: naming every country makes them all "learned", which the
    // shared test user's later summary assertions must not inherit.
    const email = 'recall-complete@cartomancer.invalid';
    await prisma.user.deleteMany({ where: { email } });
    const player = await prisma.user.create({
      data: { email, name: 'Recall Complete', authProvider: 'google' },
    });
    const headers = { 'x-cartomancer-user-id': player.id };

    try {
      const start = await app.inject({
        method: 'POST',
        url: '/api/recall',
        headers,
        payload: { region: 'Oceania' },
      });
      const session = start.json();
      const oceania = await prisma.country.findMany({ where: { region: 'Oceania' } });
      assert.equal(oceania.length, session.totalInRegion);

      let last: { recalledCount: number } | undefined;
      for (const country of oceania) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/recall/${session.id}/guesses`,
          headers,
          payload: { guess: country.name },
        });
        last = response.json();
        assert.equal((last as { accepted?: boolean }).accepted, true, country.name);
      }
      assert.equal(last?.recalledCount, session.totalInRegion, 'the counter reaches the total');

      const finish = () =>
        app.inject({
          method: 'POST',
          url: `/api/recall/${session.id}/finish`,
          headers,
          payload: {},
        });
      const stamp = async () =>
        (
          await prisma.sessionParticipant.findUniqueOrThrow({
            where: { sessionId_userId: { sessionId: session.id, userId: player.id } },
          })
        ).finishedAt;

      const first = await finish();
      assert.equal(first.statusCode, 200, first.body);
      const results = first.json();
      assert.equal(results.recalled.length, session.totalInRegion);
      assert.deepEqual(results.missed, [], 'full marks: nothing missed');
      const firstStamp = await stamp();
      assert.ok(firstStamp, 'finishing sets the finish time');

      await new Promise((resolve) => setTimeout(resolve, 15));
      const second = await finish();
      assert.equal(second.statusCode, 200, second.body);
      assert.deepEqual(second.json(), results, 'a repeat reports the same results');
      assert.equal(
        (await stamp())?.getTime(),
        firstStamp.getTime(),
        'a repeat must not re-stamp the finish time',
      );

      // Two arriving together, as the automatic call and a tap can.
      const [a, b] = await Promise.all([finish(), finish()]);
      assert.equal(a.statusCode, 200);
      assert.equal(b.statusCode, 200);
      assert.equal((await stamp())?.getTime(), firstStamp.getTime());
      const stored = await prisma.quizSession.findUniqueOrThrow({ where: { id: session.id } });
      assert.equal(stored.status, 'finished');
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('matches guest recall guesses without persisting them', async () => {
    const sessionsBefore = await prisma.quizSession.count();
    const start = await app.inject({
      method: 'POST',
      url: '/api/recall',
      payload: { region: 'Europe' },
    });
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

/**
 * The account page's two endpoints (#61): read the signed-in player's profile,
 * and change the one thing about it that is theirs to change — the name.
 */
describe('account profile (#61)', () => {
  const EMAIL = 'profile-test@cartomancer.invalid';
  let profileUserId: string;
  const as = () => ({ 'x-cartomancer-user-id': profileUserId });

  before(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    profileUserId = (
      await prisma.user.create({
        data: {
          email: EMAIL,
          name: 'Provider Name',
          image: 'https://example.invalid/avatar.png',
          authProvider: 'google',
        },
      })
    ).id;
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  });

  const get = () => app.inject({ method: 'GET', url: '/api/me', headers: as() });
  const patch = (payload: unknown) =>
    app.inject({ method: 'PATCH', url: '/api/me', headers: as(), payload: payload as never });

  it('returns what is known about the player', async () => {
    const response = await get();
    assert.equal(response.statusCode, 200, response.body);
    const profile = response.json();
    assert.equal(profile.email, EMAIL);
    assert.equal(profile.name, 'Provider Name');
    assert.equal(profile.image, 'https://example.invalid/avatar.png');
    assert.equal(profile.authProvider, 'google');
    assert.match(profile.createdAt, /^\d{4}-\d{2}-\d{2}T/, 'an ISO timestamp');
    assert.deepEqual(
      Object.keys(profile).sort(),
      ['authProvider', 'createdAt', 'email', 'image', 'name'],
      'nothing else about a player leaves the api here',
    );
  });

  it('guests have no account', async () => {
    for (const method of ['GET', 'PATCH'] as const) {
      const response = await app.inject({
        method,
        url: '/api/me',
        ...(method === 'PATCH' ? { payload: { name: 'Nobody' } } : {}),
      });
      assert.equal(response.statusCode, 403, method);
    }
  });

  it('changes the name, trims it, and the change persists', async () => {
    const response = await patch({ name: '  Natalia  ' });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().name, 'Natalia');
    assert.equal((await get()).json().name, 'Natalia', 'a later read sees it');
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: profileUserId } })).name,
      'Natalia',
    );
  });

  it('null clears the name', async () => {
    await patch({ name: 'Someone' });
    const response = await patch({ name: null });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().name, null);
    assert.equal((await get()).json().name, null);
  });

  it('accepts a name at the limit, counted in characters rather than code units', async () => {
    const atLimit = 'é'.repeat(DISPLAY_NAME_MAX_LENGTH);
    assert.equal((await patch({ name: atLimit })).statusCode, 200);
    // Fifty emoji are a hundred UTF-16 code units: refusing them would cut the
    // limit in half for exactly the names that look shortest.
    const emoji = '🌍'.repeat(DISPLAY_NAME_MAX_LENGTH);
    const response = await patch({ name: emoji });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().name, emoji);
  });

  it('refuses what is not a usable name, and changes nothing', async () => {
    await patch({ name: 'Kept' });
    const bad: [string, unknown][] = [
      ['empty', { name: '' }],
      ['only spaces', { name: '    ' }],
      ['too long', { name: 'x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1) }],
      ['a newline', { name: 'two\nlines' }],
      ['a tab', { name: 'tab\there' }],
      ['invisible only', { name: '​​' }],
      ['not a string', { name: 42 }],
      ['no name at all', {}],
    ];
    for (const [label, payload] of bad) {
      const response = await patch(payload);
      assert.equal(response.statusCode, 400, `${label}: ${response.body}`);
    }
    assert.equal((await get()).json().name, 'Kept');
  });

  it('only the name is writable', async () => {
    const before = (await get()).json();
    for (const extra of [
      { name: 'Same', email: 'someone-else@example.invalid' },
      { name: 'Same', authProvider: 'apple' },
      { name: 'Same', image: 'https://example.invalid/other.png' },
      { name: 'Same', createdAt: '2000-01-01T00:00:00Z' },
    ]) {
      const response = await patch(extra);
      assert.equal(response.statusCode, 400, JSON.stringify(extra));
    }
    const after = (await get()).json();
    assert.deepEqual({ ...after, name: null }, { ...before, name: null });
    assert.equal(after.name, before.name, 'a rejected body does not change the name either');
  });

  it('acts on the caller and never on someone else', async () => {
    const other = await prisma.user.create({
      data: { email: 'profile-other@cartomancer.invalid', name: 'Other', authProvider: 'google' },
    });
    try {
      await patch({ name: 'Mine' });
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).name,
        'Other',
      );
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  describe('displayNameProblem', () => {
    it('is the rule the form and the api share', () => {
      assert.equal(displayNameProblem('Natalia'), null);
      assert.equal(displayNameProblem('Zoë 🌍'), null);
      assert.ok(displayNameProblem(''));
      assert.ok(displayNameProblem('x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)));
      assert.ok(displayNameProblem('a\u0000b'));
      assert.equal(displayNameProblem('x'.repeat(DISPLAY_NAME_MAX_LENGTH)), null);
    });
  });
});

/**
 * Deleting an account removes the player and everything that is theirs (#64).
 *
 * The cascades do most of it, and the first thing these tests do is prove that
 * by looking at every table that can hold a player rather than at the one the
 * code happens to touch. The rest is what the cascades cannot reach: the quiz
 * sessions the player made, which `SET NULL` would otherwise leave behind, and
 * `verification_tokens`, whose email has no foreign key at all.
 */
describe('deleting an account (#64)', () => {
  const future = () => new Date(Date.now() + 86_400_000);
  const created: string[] = [];

  after(async () => {
    await prisma.verificationToken.deleteMany({
      where: { identifier: { in: created.map((email) => email.toUpperCase()) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: created } } });
  });

  interface Player {
    id: string;
    email: string;
    /** Every quiz session this player made or took part in. */
    sessionIds: string[];
  }

  const as = (player: Pick<Player, 'id'>) => ({ 'x-cartomancer-user-id': player.id });

  /** A player with a row in every table that can hold one. */
  const makePlayer = async (label: string): Promise<Player> => {
    const email = `delete-${label}-${randomUUID().slice(0, 8)}@cartomancer.invalid`;
    created.push(email);
    const user = await prisma.user.create({
      data: {
        email,
        name: `Delete ${label}`,
        authProvider: 'apple',
        image: 'https://example.invalid/a.png',
      },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        type: 'oauth',
        provider: 'apple',
        providerAccountId: randomUUID(),
        refresh_token: 'refresh-token',
        access_token: 'access-token',
        id_token: 'a.jwt.carrying-the-email',
      },
    });
    await prisma.session.create({
      data: { sessionToken: randomUUID(), userId: user.id, expires: future() },
    });
    // A different case on purpose: the email is matched without regard to it.
    await prisma.verificationToken.create({
      data: { identifier: email.toUpperCase(), token: randomUUID(), expires: future() },
    });

    const player: Player = { id: user.id, email, sessionIds: [] };

    // A quiz session answered through the api: answer, progress, score.
    const quizType = await prisma.quizType.findUniqueOrThrow({
      where: { key: 'capitals-c2cap-type' },
    });
    const countries = await prisma.country.findMany({ take: 3, orderBy: { id: 'asc' } });
    const quiz = await prisma.quizSession.create({
      data: {
        quizTypeId: quizType.id,
        questionCount: countries.length,
        createdBy: user.id,
        participants: { create: [{ userId: user.id }] },
        questions: { create: countries.map((c, i) => ({ sequence: i + 1, countryId: c.id })) },
      },
    });
    player.sessionIds.push(quiz.id);
    for (const [index, country] of countries.entries()) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${quiz.id}/answers`,
        headers: as(player),
        payload: { sequence: index + 1, answer: country.capital },
      });
      assert.equal(response.statusCode, 200, response.body);
    }

    // A trivia session, so the clue rotation has a row for this player too.
    const fact = await prisma.countryFact.findFirstOrThrow({ orderBy: { id: 'asc' } });
    const triviaType = await prisma.quizType.findUniqueOrThrow({
      where: { key: 'trivia-fact2c-type' },
    });
    const trivia = await prisma.quizSession.create({
      data: {
        quizTypeId: triviaType.id,
        questionCount: 1,
        createdBy: user.id,
        participants: { create: [{ userId: user.id }] },
        questions: { create: [{ sequence: 1, countryId: fact.countryId, factId: fact.id }] },
      },
    });
    player.sessionIds.push(trivia.id);
    const country = await prisma.country.findUniqueOrThrow({ where: { id: fact.countryId } });
    const answered = await app.inject({
      method: 'POST',
      url: `/api/sessions/${trivia.id}/answers`,
      headers: as(player),
      payload: { sequence: 1, answer: country.name },
    });
    assert.equal(answered.statusCode, 200, answered.body);

    // A recall round.
    const recall = (
      await app.inject({
        method: 'POST',
        url: '/api/recall',
        headers: as(player),
        payload: { region: 'Oceania' },
      })
    ).json();
    player.sessionIds.push(recall.id);
    for (const name of ['Fiji', 'Samoa']) {
      await app.inject({
        method: 'POST',
        url: `/api/recall/${recall.id}/guesses`,
        headers: as(player),
        payload: { guess: name },
      });
    }
    return player;
  };

  /** Every place a player can be held, by user id — and the email table beside them. */
  const footprint = async (player: Pick<Player, 'id' | 'email'>) => ({
    users: await prisma.user.count({ where: { id: player.id } }),
    accounts: await prisma.account.count({ where: { userId: player.id } }),
    authSessions: await prisma.session.count({ where: { userId: player.id } }),
    progress: await prisma.progress.count({ where: { userId: player.id } }),
    factProgress: await prisma.factProgress.count({ where: { userId: player.id } }),
    participations: await prisma.sessionParticipant.count({ where: { userId: player.id } }),
    answers: await prisma.sessionAnswer.count({ where: { userId: player.id } }),
    createdQuizzes: await prisma.quizSession.count({ where: { createdBy: player.id } }),
    verificationTokens: await prisma.verificationToken.count({
      where: { identifier: player.email.toUpperCase() },
    }),
  });

  const remove = (player: Pick<Player, 'id'>, payload: unknown = { confirm: 'DELETE' }) =>
    app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: as(player),
      payload: payload as never,
    });

  it('removes the player and every row that refers to them', async () => {
    const player = await makePlayer('everything');
    const before = await footprint(player);
    // Every one of these is something the test is about to claim is gone.
    for (const [table, count] of Object.entries(before)) {
      assert.ok(count > 0, `the fixture has no ${table} row, so removing it proves nothing`);
    }

    const response = await remove(player);
    assert.equal(response.statusCode, 204, response.body);
    assert.equal(response.body, '', 'no body');

    assert.deepEqual(await footprint(player), {
      users: 0,
      accounts: 0,
      authSessions: 0,
      progress: 0,
      factProgress: 0,
      participations: 0,
      answers: 0,
      createdQuizzes: 0,
      verificationTokens: 0,
    });
    assert.equal(
      await prisma.quizSession.count({ where: { id: { in: player.sessionIds } } }),
      0,
      'their quiz sessions are deleted, not left behind as anonymous rows',
    );
    assert.equal(
      await prisma.sessionQuestion.count({ where: { sessionId: { in: player.sessionIds } } }),
      0,
    );
  });

  it('leaves every other player, and a session someone else shared, as it was', async () => {
    const leaving = await makePlayer('leaving');
    const staying = await makePlayer('staying');
    const stayingBefore = await footprint(staying);

    // A session the leaving player made and the staying player took part in: it
    // is that player's history too, so it stays — minus the one who left.
    const quizType = await prisma.quizType.findUniqueOrThrow({
      where: { key: 'capitals-c2cap-type' },
    });
    const country = await prisma.country.findFirstOrThrow({ orderBy: { id: 'desc' } });
    const shared = await prisma.quizSession.create({
      data: {
        quizTypeId: quizType.id,
        questionCount: 1,
        createdBy: leaving.id,
        participants: { create: [{ userId: leaving.id }, { userId: staying.id }] },
        questions: { create: [{ sequence: 1, countryId: country.id }] },
      },
    });
    await prisma.sessionAnswer.createMany({
      data: [leaving.id, staying.id].map((userId) => ({
        sessionId: shared.id,
        userId,
        countryId: country.id,
        wasCorrect: true,
      })),
    });
    const stayingWithShared = await footprint(staying);

    assert.equal((await remove(leaving)).statusCode, 204);

    assert.deepEqual(await footprint(staying), stayingWithShared, 'the other player lost nothing');
    assert.ok(stayingWithShared.answers > stayingBefore.answers);
    const kept = await prisma.quizSession.findUniqueOrThrow({
      where: { id: shared.id },
      include: { participants: true, answers: true },
    });
    assert.equal(kept.createdBy, null, 'the creator is anonymised');
    assert.deepEqual(
      kept.participants.map((p) => p.userId),
      [staying.id],
    );
    assert.deepEqual(
      kept.answers.map((a) => a.userId),
      [staying.id],
    );
    assert.equal(await prisma.user.count({ where: { id: staying.id } }), 1);

    await prisma.quizSession.delete({ where: { id: shared.id } });
  });

  it('refuses a delete that does not carry the confirmation, and touches nothing', async () => {
    const player = await makePlayer('unconfirmed');
    const before = await footprint(player);
    // No body at all goes straight to inject: `remove`'s default would fill in
    // the very confirmation this case is about leaving out.
    const bare = await app.inject({ method: 'DELETE', url: '/api/me', headers: as(player) });
    assert.equal(bare.statusCode, 400, `no body: ${bare.body}`);
    for (const [label, payload] of [
      ['empty object', {}],
      ['wrong word', { confirm: 'delete' }],
      ['the email instead', { confirm: player.email }],
      ['empty string', { confirm: '' }],
      ['true', { confirm: true }],
      ['extra keys', { confirm: 'DELETE', everything: true }],
    ] as [string, unknown][]) {
      const response = await remove(player, payload);
      assert.equal(response.statusCode, 400, `${label}: ${response.body}`);
    }
    assert.deepEqual(await footprint(player), before);
  });

  it('is for signed-in players only', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/me',
      payload: { confirm: 'DELETE' },
    });
    assert.equal(response.statusCode, 403);
  });

  it('can only ever delete the caller', async () => {
    const caller = await makePlayer('caller');
    const other = await makePlayer('other');
    const otherBefore = await footprint(other);
    // Nothing in the request names an id; the one that counts is the actor's.
    assert.equal((await remove(caller)).statusCode, 204);
    assert.deepEqual(await footprint(other), otherBefore);
  });

  it('a repeat of a delete that already happened is still a success', async () => {
    const player = await makePlayer('twice');
    assert.equal((await remove(player)).statusCode, 204);
    // The reply to the first may never have arrived (#58); the account is gone,
    // which is what was asked for.
    assert.equal((await remove(player)).statusCode, 204);
    const [a, b] = await Promise.all([remove(player), remove(player)]);
    assert.equal(a.statusCode, 204);
    assert.equal(b.statusCode, 204);
    const profile = await app.inject({ method: 'GET', url: '/api/me', headers: as(player) });
    assert.equal(profile.statusCode, 404, 'the profile is gone with it');
  });

  it('two deletes at once leave nothing and fail neither', async () => {
    const player = await makePlayer('racing');
    const responses = await Promise.all([remove(player), remove(player), remove(player)]);
    for (const response of responses) {
      assert.equal(response.statusCode, 204, response.body);
    }
    assert.equal(
      Object.values(await footprint(player)).reduce((a, b) => a + b, 0),
      0,
    );
  });

  it('is all or nothing: a failure part-way through deletes nothing', async () => {
    const player = await makePlayer('rollback');
    const before = await footprint(player);
    // The last step of the transaction is deleting the user. Block exactly that,
    // so every earlier step — the sessions, the tokens — has already run.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION tmp_block_user_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.email = '${player.email}' THEN RAISE EXCEPTION 'blocked for test'; END IF;
        RETURN OLD;
      END $$`);
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER tmp_block_user_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION tmp_block_user_delete()',
    );
    try {
      const failed = await remove(player);
      assert.equal(failed.statusCode, 500);
      assert.deepEqual(
        await footprint(player),
        before,
        'the sessions and tokens came back with it',
      );
      assert.equal(
        await prisma.quizSession.count({ where: { id: { in: player.sessionIds } } }),
        player.sessionIds.length,
      );
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER tmp_block_user_delete ON users');
      await prisma.$executeRawUnsafe('DROP FUNCTION tmp_block_user_delete()');
    }
    assert.equal((await remove(player)).statusCode, 204, 'and the retry then works');
    assert.equal(
      Object.values(await footprint(player)).reduce((a, b) => a + b, 0),
      0,
    );
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
      assert.notEqual(missed.promptText, missed.correctAnswer, 'the clue is not the country name');
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
    assert.equal(body.quizTypes.length, 12);
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
    const guarded = await buildServer({
      ...loadEnv(),
      LOG_LEVEL: 'warn',
      INTERNAL_API_KEY: 'sekrit',
    });
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
      buildServer({
        ...loadEnv(),
        LOG_LEVEL: 'warn',
        INTERNAL_API_KEY: '',
        NODE_ENV: 'production',
      }),
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
