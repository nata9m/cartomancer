import type { FastifyInstance } from 'fastify';

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
      app.log.error({ err: error }, 'health check failed: database unreachable');
      return reply.code(503).send({ status: 'degraded', database: 'down' });
    }
  });
}
