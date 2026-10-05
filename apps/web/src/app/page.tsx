import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ProgressSummary, UserProfile } from '@cartomancer/shared';
import { Avatar } from '@/components/Avatar';
import { HomeQuizCards } from '@/components/HomeQuizCards';
import { ReviewCard } from '@/components/ReviewCard';
import { ThemeSetting } from '@/components/ThemeSetting';
import { CountryOfTheDay } from '@/components/CountryOfTheDay';
import { SignInBanner, StatsStrip, StreakBar } from '@/components/HomeStats';
import { IconArrowRight } from '@/components/icons';
import { isGuest } from '@/lib/guest';
import { displayNameFor } from '@/lib/profile';
import { apiFetch, currentUserId } from '@/lib/server-api';

// Progress is per-user live data; never prerender or cache it.
export const dynamic = 'force-dynamic';

/** Shown when GIT_SHA is unset, which is every local run. */
const DEV_COMMIT = 'dev';
const REPO_URL = 'https://github.com/nata9m/cartomancer';

export default async function HomePage() {
  const userId = await currentUserId();

  // Neither signed in nor an explicit guest: the login screen is the entry point.
  if (!userId && !(await isGuest())) {
    redirect('/login');
  }

  // Which build is live, so a bug report from a phone says so without anyone
  // having to go and look. The runtime image has no .git, so the workflow bakes
  // it in as a build arg — the same seven characters the image is tagged with,
  // taken from the same job output, so the footer and the tag cannot drift.
  // Read per request rather than inlined at build time: this page is already
  // force-dynamic, and a NEXT_PUBLIC_ value would have to be known before
  // `next build`, which is a layer the SHA must not invalidate.
  const commit = process.env.GIT_SHA || DEV_COMMIT;

  let summary: ProgressSummary | null = null;
  let profile: UserProfile | null = null;
  if (userId) {
    // In parallel, and each allowed to fail alone: the account button is a
    // convenience and the stats are the screen, so neither takes the other down.
    const [summaryResponse, profileResponse] = await Promise.all([
      apiFetch<{ summary: ProgressSummary | null }>('/api/summary', { userId }).catch(() => ({
        summary: null,
      })),
      apiFetch<UserProfile>('/api/me', { userId }).catch(() => null),
    ]);
    summary = summaryResponse.summary;
    profile = profileResponse;
  }

  return (
    <main className="app-shell">
      <header className="home-header">
        <div>
          <h1 className="app-title">Cartomancer</h1>
          <p className="tagline">Capitals, countries, and flags</p>
        </div>
        {/* Signed in only (#61): a guest has no account to open, and keeps the
            sign-in banner below. If the profile could not be read the button is
            still here, with a generic initial — the account page is where Log
            out lives, and it should not vanish with an api hiccup. */}
        {userId ? (
          <Link className="account-button" href="/account" aria-label="Account">
            <Avatar
              image={profile?.image ?? null}
              label={profile ? displayNameFor(profile) : 'Account'}
              size="sm"
            />
          </Link>
        ) : null}
      </header>

      {summary ? (
        <>
          <StreakBar summary={summary} />
          <StatsStrip summary={summary} />
        </>
      ) : (
        <SignInBanner />
      )}

      <CountryOfTheDay />

      {summary?.review ? <ReviewCard review={summary.review} /> : null}

      {/* No filter chips here any more (#28). Every card opens a screen that
          owns its own, so a chip on this one either duplicated theirs or, for
          the three that ignored it, promised something it did not do. */}
      <HomeQuizCards />

      {/* Not a fifth card: the four above start a round, this one only looks
          something up, and giving it the same weight would invite a tap from
          someone who meant to play. */}
      <Link className="link-row" href="/countries">
        Browse all countries
        <IconArrowRight size={15} stroke={1.9} />
      </Link>

      <ThemeSetting />

      {/* One element, two lines: .app-shell is a flex column with an 18px gap,
          so two siblings here would read as two separate footers. */}
      <footer className="footer-note">
        <p>Based on the 195 UN member and observer states</p>
        <p className="footer-note__commit">
          {/* Where the borrowed data is credited (#47). It sits beside the build
              number because both are the same kind of small print, and because
              the alternative — a credit line under all 195 country pages — read
              as developer notes on a page meant for looking a country up. */}
          <Link href="/credits">Sources</Link>
          {' · '}
          {commit === DEV_COMMIT ? (
            commit
          ) : (
            /* A new tab, not this one: tapping the build number should not
               take someone out of the app they were using, and the rel was
               already written for a link that leaves (noreferrer implies
               noopener everywhere current). The label says so out loud,
               because an unannounced new tab is disorienting with a screen
               reader. */
            <a
              href={`${REPO_URL}/commit/${commit}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Commit ${commit} on GitHub — opens in a new tab`}
            >
              {commit}
            </a>
          )}
        </p>
      </footer>
    </main>
  );
}
