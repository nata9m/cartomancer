import Fastify, { type FastifyInstance } from 'fastify';
import { getPrisma } from '@cartomancer/db';
import { z } from 'zod';
import { type RequestActor, resolveActor } from './auth.js';
import type { Env } from './env.js';
import { HttpError } from './errors.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerRecallRoutes } from './routes/recall.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerSummaryRoutes } from './routes/summary.js';
import './types.js';

export async function buildServer(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    // Behind the cluster ingress.
    trustProxy: true,
  });

  app.decorate('prisma', getPrisma());
  app.decorateRequest('actor', null as unknown as RequestActor);

  if (!env.INTERNAL_API_KEY) {
    // Without the shared secret the api trusts whoever sends
    // x-cartomancer-user-id, and the Gateway publishes /api on the public
    // internet — so in production this is a hole, not a warning. Refusing to
    // boot is the only signal that gets noticed in a cluster: nobody reads the
    // logs of a pod that started fine, but a pod that will not start is loud
    // and immediate.
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'INTERNAL_API_KEY is required when NODE_ENV=production: without it the api ' +
          'would accept any caller\'s x-cartomancer-user-id header and serve another ' +
          "user's progress. Set it to the same value as the web app's.",
      );
    }
    app.log.warn(
      'INTERNAL_API_KEY is empty — every caller is trusted to name a user id. ' +
        'Fine for local development, never in the cluster (where an empty key ' +
        'refuses to start).',
    );
  }

  if (env.CORS_ORIGIN) {
    const allowed = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && allowed.includes(origin)) {
        reply.header('access-control-allow-origin', origin);
        reply.header('access-control-allow-headers', 'authorization,content-type,x-cartomancer-user-id');
        reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
      }
      if (request.method === 'OPTIONS') {
        return reply.code(204).send();
      }
    });
  }

  // Health checks must answer without credentials; everything else resolves an
  // actor first, so no handler ever has to wonder whether it is serving a guest.
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/healthz')) {
      request.actor = { userId: null };
      return;
    }
    request.actor = resolveActor(request, env.INTERNAL_API_KEY);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: 'bad_request',
        message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
    }
    request.log.error({ err: error }, 'unhandled error');
    const candidate = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 500;
    return reply.code(statusCode).send({
      error: statusCode === 400 ? 'bad_request' : 'internal_error',
      message:
        statusCode >= 500 || typeof candidate.message !== 'string'
          ? 'Something went wrong'
          : candidate.message,
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: 'not_found', message: `No route for ${request.method} ${request.url}` }),
  );

  await registerHealthRoutes(app);
  await registerCatalogRoutes(app);
  await registerSummaryRoutes(app);
  await registerSessionRoutes(app);
  await registerRecallRoutes(app);

  void warnIfReferenceDataLooksUnseeded(app);

  return app;
}

/**
 * Reference data lives in the database, so an api serving a database that was
 * never seeded for this image looks healthy and answers wrongly. That happened:
 * every country carried the placeholder tier, and the live site said "No
 * countries match those filters" for Easy and Hard while Medium quietly
 * returned all 195.
 *
 * The rollout seeds now (packages/db/scripts/migrate-deploy.mjs), so this is
 * the backstop for when that did not run or failed. It warns rather than
 * refusing to boot: unlike a missing INTERNAL_API_KEY, stale reference data is
 * not a security hole, and taking the site down over it would be worse than
 * the bug. Never awaited — the api must come up whether or not this query can.
 */
async function warnIfReferenceDataLooksUnseeded(app: FastifyInstance): Promise<void> {
  try {
    const tiers = await app.prisma.country.groupBy({
      by: ['difficulty'],
      _count: { _all: true },
    });

    if (tiers.length === 0) {
      app.log.error(
        'No countries in the database: every quiz will fail to start. Run ' +
          'node node_modules/@cartomancer/db/dist/seed.js',
      );
      return;
    }
    const only = tiers.length === 1 ? tiers[0] : undefined;
    if (only) {
      app.log.error(
        { difficulty: only.difficulty, countries: only._count._all },
        'Every country shares one difficulty, so the difficulty filter returns ' +
          'nothing for the other two tiers. The database is behind this image — run ' +
          'node node_modules/@cartomancer/db/dist/seed.js',
      );
    }
  } catch (error) {
    app.log.warn({ err: error }, 'could not check whether reference data is seeded');
  }
}
