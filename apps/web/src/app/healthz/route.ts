/**
 * Liveness/readiness for the web container. Deliberately trivial: Next.js
 * doesn't own the database connection pool, so a 200 here means "the server is
 * up and serving", and the api's /healthz is what gates on Postgres.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
