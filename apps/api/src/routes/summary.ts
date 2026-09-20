import type { FastifyInstance } from 'fastify';
import { loadSummary } from '../lib/progress.js';

export async function registerSummaryRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Home-screen stats. Guests have no persisted progress at all, so they get an
   * explicit null rather than a zeroed summary — the guest home screen shows the
   * sign-in banner in place of the streak bar and stats strip.
   */
  app.get('/api/summary', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      return { summary: null, isGuest: true };
    }
    const query = request.query as { tz?: string };
    const summary = await loadSummary(app.prisma, userId, query.tz ?? 'UTC');
    return { summary, isGuest: false };
  });
}
