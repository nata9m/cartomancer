import { redirect } from 'next/navigation';
import type { ProgressSummary } from '@cartomancer/shared';
import { FilterChips } from '@/components/FilterChips';
import { HomeQuizCards } from '@/components/HomeQuizCards';
import { SignInBanner, StatsStrip, StreakBar } from '@/components/HomeStats';
import { isGuest } from '@/lib/guest';
import { apiFetch, currentUserId } from '@/lib/server-api';
import { ALL, readFilters } from '@/lib/filters';

// Progress is per-user live data; never prerender or cache it.
export const dynamic = 'force-dynamic';

/** Shown when GIT_SHA is unset, which is every local run. */
const DEV_COMMIT = 'dev';
const REPO_URL = 'https://github.com/nata9m/cartomancer';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await currentUserId();

  // Neither signed in nor an explicit guest: the login screen is the entry point.
  if (!userId && !(await isGuest())) {
    redirect('/login');
  }

  // Difficulty is dropped here rather than merely hidden. Countries — the one
  // game this screen starts directly — ignores it by design (recall is
  // region-only, see routes/recall.ts), and the other three cards open screens
  // that carry their own difficulty chip. Normalising means a stale
  // ?difficulty=Hard in the URL can't ride into Capitals or Flags invisibly,
  // where it would filter a round nothing on this screen said it would.
  const filters = { ...readFilters(await searchParams), difficulty: ALL };

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

      <FilterChips filters={filters} showDifficulty={false} />
      <HomeQuizCards filters={filters} />

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
