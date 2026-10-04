import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ProgressSummary, UserProfile } from '@cartomancer/shared';
import { signOutAction } from '@/app/actions';
import { AccountNameForm } from '@/components/AccountNameForm';
import { Avatar } from '@/components/Avatar';
import { DeleteAccount } from '@/components/DeleteAccount';
import { StatsStrip, StreakBar } from '@/components/HomeStats';
import { IconArrowLeft, IconLogout } from '@/components/icons';
import { displayNameFor, formatMemberSince, providerLabel } from '@/lib/profile';
import { apiFetch, currentUserId } from '@/lib/server-api';

// Per-user and editable: never prerender or cache it.
export const dynamic = 'force-dynamic';

/**
 * /account (#61): what we know about the player, the one thing they can change,
 * and the way out.
 *
 * Signed-in only. A guest has no account to show, so they are sent to /login
 * like anywhere else that needs one — and so is anyone whose session just ended,
 * which is how "Log out, then open /account" lands where it should.
 *
 * Two reads, in parallel. The summary is a courtesy (the same streak and learned
 * counts as the home screen, each linking into its list), so its failure hides
 * that block rather than the page; the profile is the page, so its failure shows
 * an error — with Log out still on it, since being unable to load an account is
 * precisely when someone might want to sign out and in again.
 */
export default async function AccountPage() {
  const userId = await currentUserId();
  if (!userId) {
    redirect('/login');
  }

  const [profile, summary] = await Promise.all([
    apiFetch<UserProfile>('/api/me', { userId }).catch(() => null),
    apiFetch<{ summary: ProgressSummary | null }>('/api/summary', { userId })
      .then((response) => response.summary)
      .catch(() => null),
  ]);

  const logOut = (
    <form action={signOutAction}>
      <button type="submit" className="button-secondary button-danger">
        <IconLogout size={16} stroke={1.9} />
        Log out
      </button>
    </form>
  );

  const header = (
    <div className="screen-header">
      <Link className="icon-button" href="/" aria-label="Back to home">
        <IconArrowLeft size={19} stroke={1.9} />
      </Link>
      <h1 className="screen-title">Account</h1>
    </div>
  );

  if (!profile) {
    return (
      <main className="app-shell">
        {header}
        <p className="error-note">Could not load your account. Try again in a moment.</p>
        <div className="spacer" />
        {logOut}
      </main>
    );
  }

  const name = displayNameFor(profile);
  const provider = providerLabel(profile.authProvider);
  const memberSince = formatMemberSince(profile.createdAt);

  return (
    <main className="app-shell">
      {header}

      <div className="profile-head">
        <Avatar image={profile.image} label={name} size="lg" />
        <div className="profile-id">
          <p className="profile-name">{name}</p>
          <p className="profile-email">{profile.email}</p>
        </div>
      </div>

      <AccountNameForm initialName={profile.name} fallback={displayNameFor({ name: null, email: profile.email })} />

      <dl className="fact-list">
        <div className="fact-row">
          <dt>Email</dt>
          <dd>{profile.email}</dd>
        </div>
        {provider ? (
          <div className="fact-row">
            <dt>Signed in with</dt>
            <dd>{provider}</dd>
          </div>
        ) : null}
        {memberSince ? (
          <div className="fact-row">
            <dt>Member since</dt>
            <dd>{memberSince}</dd>
          </div>
        ) : null}
      </dl>

      {summary ? (
        <div className="stack stack--tight">
          <span className="section-label">Your progress</span>
          <StreakBar summary={summary} />
          <StatsStrip summary={summary} />
        </div>
      ) : null}

      <div className="spacer" />

      {logOut}

      {/* Apart from Log out and below it: a different kind of action, and not one
          to land on by reaching for the button above (#64). */}
      <div className="danger-zone">
        <DeleteAccount />
      </div>
    </main>
  );
}
