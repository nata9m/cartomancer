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

      <p className="footer-note">Based on the 195 UN member and observer states</p>
    </main>
  );
}
