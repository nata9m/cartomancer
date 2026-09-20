import 'server-only';
import { cookies } from 'next/headers';

/**
 * Marks "I chose to skip signing in". Guest mode has no user row, no session
 * row and no progress row — this cookie exists purely so the home screen knows
 * to render the guest variant instead of bouncing to /login.
 */
export const GUEST_COOKIE = 'cartomancer-guest';

export async function isGuest(): Promise<boolean> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value === '1';
}
