import type { FastifyInstance } from 'fastify';
import { loadReview, loadSummary } from '../lib/progress.js';
import { requestTimeZone } from '../timezone.js';

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
    const summary = await loadSummary(app.prisma, userId, requestTimeZone(request));
    return { summary, isGuest: false };
  });

  /**
   * What the player has missed, by quiz type (#108). Each game's start screen asks
   * for this and offers a review round for its own modes. A guest has no
   * persisted progress, so gets an empty object: nothing to review, not an error.
   */
  app.get('/api/review', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      return { review: {}, isGuest: true };
    }
    return { review: await loadReview(app.prisma, userId), isGuest: false };
  });
}
