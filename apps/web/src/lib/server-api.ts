import 'server-only';
import { cookies } from 'next/headers';
import { auth } from '@/auth';

/**
 * In-cluster address of apps/api, as the deployment contract names it. Every
 * server-side call (SSR and the BFF proxy) goes here; the browser never has an
 * origin to be relative to during SSR, so this must be absolute.
 */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8080';

/** Set by `TimeZoneCookie` in the browser; read here and forwarded to the api. */
export const TIMEZONE_COOKIE = 'tz';
export const TIMEZONE_HEADER = 'x-cartomancer-timezone';

/**
 * The player's IANA timezone from the cookie the browser keeps, or null on a
 * first visit (before the browser has said), which the api treats as UTC.
 *
 * A plausibility check only: the api validates the zone properly, and a cookie
 * is the player's own to set, so the worst a forged one does is bucket their own
 * days oddly. It is a header value, though, so it must not be able to carry
 * anything but a zone's characters.
 */
export async function currentTimeZone(): Promise<string | null> {
  const value = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  return value && /^[A-Za-z0-9_+\-/]{1,64}$/.test(value) ? value : null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Server-side call into apps/api.
 *
 * The browser never reaches the api directly: this helper (and the /bff
 * proxy that wraps it for client components) is the only path, which is what
 * keeps INTERNAL_API_KEY server-side and makes the user id unforgeable — it is
 * read from the Auth.js session here, never from a request header.
 */
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; userId?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const key = process.env.INTERNAL_API_KEY;
  if (key) {
    headers.authorization = `Bearer ${key}`;
  }
  if (options.userId) {
    headers['x-cartomancer-user-id'] = options.userId;
  }
  // On every call, not only the ones that show a streak: which calls bucket days
  // is the api's business and changes (finishing a quiz shows the streak too),
  // and a call that forgot would be silently wrong for anyone not in UTC (#66).
  const timeZone = await currentTimeZone();
  if (timeZone) {
    headers[TIMEZONE_HEADER] = timeZone;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${API_INTERNAL_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // The production filesystem is read-only, so nothing may land in the fetch
    // cache; quiz state is live data anyway.
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(response.status, detail || response.statusText);
  }
  // A 204 (DELETE /api/me) has no body to parse; `json()` would throw on it.
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** The signed-in user's id, or null for guests. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === 'string' ? id : null;
}
