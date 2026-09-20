import 'server-only';
import { auth } from '@/auth';

/**
 * In-cluster address of apps/api, as the deployment contract names it. Every
 * server-side call (SSR and the BFF proxy) goes here; the browser never has an
 * origin to be relative to during SSR, so this must be absolute.
 */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8080';

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
  return (await response.json()) as T;
}

/** The signed-in user's id, or null for guests. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === 'string' ? id : null;
}
