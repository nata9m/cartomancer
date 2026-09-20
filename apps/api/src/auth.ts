import type { FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from './errors.js';

export const USER_ID_HEADER = 'x-cartomancer-user-id';

/**
 * Who the request is for. Guests have no id at all — that is the whole point:
 * every persistence branch keys off `userId === null`, so a guest request cannot
 * accidentally write a row.
 */
export interface RequestActor {
  userId: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The browser never reaches this service directly: apps/web proxies every call
 * server-side, attaching the shared secret and — when someone is signed in —
 * their user id. So a caller holding the secret is trusted to name the user,
 * and a caller without it gets nothing.
 */
export function resolveActor(request: FastifyRequest, internalApiKey: string): RequestActor {
  if (internalApiKey) {
    const header = request.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!timingSafeEqual(presented, internalApiKey)) {
      throw unauthorized('Missing or invalid internal API key');
    }
  }

  const rawUserId = request.headers[USER_ID_HEADER];
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (userId === undefined || userId === '') {
    return { userId: null };
  }
  if (!UUID_PATTERN.test(userId)) {
    throw forbidden(`Malformed ${USER_ID_HEADER}`);
  }
  return { userId };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
