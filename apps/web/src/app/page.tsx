import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ProgressSummary } from '@cartomancer/shared';
import { HomeQuizCards } from '@/components/HomeQuizCards';
import { CountryOfTheDay } from '@/components/CountryOfTheDay';
import { SignInBanner, StatsStrip, StreakBar } from '@/components/HomeStats';
import { IconArrowRight } from '@/components/icons';
import { isGuest } from '@/lib/guest';
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
  if (userId) {
    const response = await apiFetch<{ summary: ProgressSummary | null }>('/api/summary', {
      userId,
    }).catch(() => ({ summary: null }));
    summary = response.summary;
  }

  return (
    <main className="app-shell">
      <header>
        <h1 className="app-title">Cartomancer</h1>
        <p className="tagline">Capitals, countries, and flags</p>
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

      {/* One element, two lines: .app-shell is a flex column with an 18px gap,
          so two siblings here would read as two separate footers. */}
      <footer className="footer-note">
        <p>Based on the 195 UN member and observer states</p>
        <p className="footer-note__commit">
          {commit === DEV_COMMIT ? (
            commit
          ) : (
            <a href={`${REPO_URL}/commit/${commit}`} rel="noreferrer">
              {commit}
            </a>
          )}
        </p>
      </footer>
    </main>
  );
}
