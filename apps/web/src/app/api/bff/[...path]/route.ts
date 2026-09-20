import { type NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/server-api';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8080';

/**
 * Backend-for-frontend proxy.
 *
 * Client components fetch `/api/bff/<api path>` and this handler forwards it to
 * apps/api, attaching the shared secret and — only if someone is actually
 * signed in — their user id. Both headers are built here from the server-side
 * session, so a browser cannot claim to be another user (or any user), and the
 * api stays unreachable from outside the cluster.
 */
async function forward(request: NextRequest, path: string[]): Promise<Response> {
  const search = request.nextUrl.search;
  const target = `${API_BASE_URL}/api/${path.join('/')}${search}`;

  const headers: Record<string, string> = { accept: 'application/json' };
  const key = process.env.INTERNAL_API_KEY;
  if (key) {
    headers.authorization = `Bearer ${key}`;
  }
  const userId = await currentUserId();
  if (userId) {
    headers['x-cartomancer-user-id'] = userId;
  }

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
    headers['content-type'] = 'application/json';
  }

  const upstream = await fetch(target, { method: request.method, headers, body, cache: 'no-store' });
  const payload = await upstream.text();
  return new NextResponse(payload, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}
