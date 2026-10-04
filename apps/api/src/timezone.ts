import type { FastifyRequest } from 'fastify';
import { isValidTimeZone } from './lib/progress.js';

/**
 * The player's IANA timezone, as the web app forwards it. A header rather than a
 * `?tz=` on the endpoints that need it, so that no route has to remember to ask:
 * a day streak counted in the wrong zone is silently wrong (#66), and the
 * routes that bucket days are not all ones a client thinks of as "the summary" —
 * finishing a quiz shows the streak too.
 */
export const TIMEZONE_HEADER = 'x-cartomancer-timezone';

/**
 * The zone to bucket this request's days in: the header, else `?tz=` (the
 * original form of the summary endpoint), else UTC. Anything that is not a zone
 * Intl knows is UTC, never an error — a bad value must not stop a player seeing
 * their own home screen — and `loadSummary` validates it again regardless.
 */
export function requestTimeZone(request: FastifyRequest): string {
  const header = request.headers[TIMEZONE_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const query = request.query as { tz?: unknown } | undefined;
  const fromQuery = typeof query?.tz === 'string' ? query.tz : undefined;

  for (const candidate of [fromHeader, fromQuery]) {
    if (candidate && isValidTimeZone(candidate)) {
      return candidate;
    }
  }
  return 'UTC';
}
