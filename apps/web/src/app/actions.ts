'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import { GUEST_COOKIE } from '@/lib/guest';

/** "Skip for now": remembers the choice and shows the guest home screen. */
export async function continueAsGuest(): Promise<void> {
  const store = await cookies();
  store.set(GUEST_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect('/');
}

export async function signInWithProvider(provider: 'google' | 'apple'): Promise<void> {
  await signIn(provider, { redirectTo: '/' });
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
  await signOut({ redirectTo: '/login' });
}
