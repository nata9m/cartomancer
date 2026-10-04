'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { displayNameProblem, type UserProfile } from '@cartomancer/shared';
import { isProviderEnabled, signIn, signOut, type SocialProviderId } from '@/auth';
import { GUEST_COOKIE } from '@/lib/guest';
import type { NameFormState } from '@/lib/profile';
import { ApiError, apiFetch, currentUserId } from '@/lib/server-api';

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

export async function signInWithProvider(provider: SocialProviderId): Promise<void> {
  // The login screen only offers registered providers, but a hand-rolled POST
  // could still name one that isn't — and Auth.js would throw for an unknown
  // provider. Send those back to the login screen instead.
  if (!isProviderEnabled(provider)) {
    redirect('/login');
  }
  await signIn(provider, { redirectTo: '/' });
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
  await signOut({ redirectTo: '/login' });
}

/**
 * Saves the display name from the account form (#61).
 *
 * The api is the judge of what a name may be — this checks the same rule first
 * only so a bad one is answered without a round trip. Blank means "no custom
 * name" and goes as null. The signed-in player is read from the session, never
 * from the form: a name can only ever be changed for the person making the
 * request.
 *
 * Nothing needs to be pushed into the Auth.js session afterwards. The name is
 * not kept in the JWT — every screen reads it from `/api/me` — so there is no
 * stale copy to refresh; `revalidatePath` only clears the client router cache so
 * the home screen's avatar picks the new initial up on the way back.
 */
export async function updateDisplayName(
  _previous: NameFormState,
  formData: FormData,
): Promise<NameFormState> {
  const userId = await currentUserId();
  if (!userId) {
    redirect('/login');
  }

  const trimmed = String(formData.get('name') ?? '').trim();
  const problem = trimmed === '' ? null : displayNameProblem(trimmed);
  if (problem) {
    return { status: 'error', message: problem };
  }

  try {
    const profile = await apiFetch<UserProfile>('/api/me', {
      method: 'PATCH',
      body: { name: trimmed === '' ? null : trimmed },
      userId,
    });
    revalidatePath('/');
    revalidatePath('/account');
    return { status: 'saved', name: profile.name };
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 400) {
      return { status: 'error', message: 'That name is not allowed. Try a different one.' };
    }
    return { status: 'error', message: 'Could not save that. Check your connection and try again.' };
  }
}
