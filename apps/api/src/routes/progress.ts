import { QUIZ_CATEGORIES, type QuizCategory } from '@cartomancer/shared';
import type { FastifyInstance } from 'fastify';
import { forbidden, notFound } from '../errors.js';
import { loadCategoryProgress } from '../lib/progress.js';

export async function registerProgressRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The per-country breakdown behind one home-screen stat: which countries are
   * learned in this category, and how far along the rest are.
   *
   * Signed-in only, and a 403 rather than an empty list for a guest: a guest has
   * no progress at all, and an empty list is indistinguishable from "you have
   * learned nothing", which is a different and discouraging thing to say. The
   * web app never asks — it shows the sign-in prompt instead.
   */
  app.get('/api/progress/:category', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Progress is only tracked for signed-in players');
    }
    const { category } = request.params as { category: string };
    if (!isQuizCategory(category)) {
      throw notFound(`Unknown category ${category}`);
    }
    return loadCategoryProgress(app.prisma, userId, category);
  });
}

function isQuizCategory(value: string): value is QuizCategory {
  return (QUIZ_CATEGORIES as readonly string[]).includes(value);
}
