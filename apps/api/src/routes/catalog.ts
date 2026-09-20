import { QUIZ_TYPES, type CountryRef, type Difficulty, type Region } from '@cartomancer/shared';
import type { FastifyInstance } from 'fastify';
import { parseRegion } from '../lib/quiz.js';
import { summarize } from '../lib/quiz.js';
import { quizTypeByKey } from '@cartomancer/shared';

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The active quiz types, joined with their taxonomy entry. Proves the
   * extensibility contract: the list is rows in `quiz_types`, not a hard-coded
   * array in the API.
   */
  app.get('/api/quiz-types', async () => {
    const rows = await app.prisma.quizType.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    const types = rows
      .map((row) => quizTypeByKey(row.key))
      .filter((definition): definition is NonNullable<typeof definition> => definition !== undefined)
      .map(summarize);
    return { quizTypes: types, unmapped: rows.length - types.length };
  });

  /**
   * Country reference data. Used by the guest recall results screen, which has
   * to list the countries that weren't recalled without anything persisted.
   */
  app.get('/api/countries', async (request) => {
    const query = request.query as { region?: string };
    const region = parseRegion(query.region);
    const rows = await app.prisma.country.findMany({
      where: region === 'all' ? {} : { region },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isoCode: true, capital: true, region: true, difficulty: true },
    });
    const countries: CountryRef[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      isoCode: row.isoCode,
      capital: row.capital,
      region: row.region as Region,
      difficulty: row.difficulty as Difficulty,
    }));
    return { countries, total: countries.length };
  });

  /** Static taxonomy, handy for the filter chips without a round trip to the DB. */
  app.get('/api/taxonomy', async () => ({ quizTypes: QUIZ_TYPES }));
}
