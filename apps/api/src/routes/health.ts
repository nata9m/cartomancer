import type { FastifyInstance } from 'fastify';
import { getPoolStats } from '@cartomancer/db';
import { isPoolExhausted } from '../lib/db.js';
import { recordPoolTimeout } from '../lib/pool-monitor.js';

/**
 * Liveness/readiness for the cluster. 200 only once Postgres answers, per the
 * deployment contract; the web app's own /healthz is a plain 200 because it
 * doesn't own a database connection.
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (error) {
      // The same error comes from a pool with no free connection as from a database
      // that cannot be reached, and they are not the same event (#62). A busy pool
      // is still a 503 — this pod cannot serve right now, which is what readiness
      // is for — but it says `busy`, not `down`, so nobody goes looking for a
      // database outage that is really a traffic spike, and it is a warning, not an
      // error with a stack.
      if (isPoolExhausted(error) && (getPoolTotal(app) ?? 0) > 0) {
        recordPoolTimeout();
        app.log.warn('health check failed: every database connection is in use');
        return reply.code(503).send({ status: 'degraded', database: 'busy' });
      }
      app.log.error({ err: error }, 'health check failed: database unreachable');
      return reply.code(503).send({ status: 'degraded', database: 'down' });
    }
  });
}

/** Connections the pool currently holds open: above zero, the database has answered us. */
function getPoolTotal(app: FastifyInstance): number | undefined {
  return getPoolStats(app.prisma)?.total;
}
