import { redirect } from 'next/navigation';
import type { ProgressSummary } from '@cartomancer/shared';
import { FilterChips } from '@/components/FilterChips';
import { HomeQuizCards } from '@/components/HomeQuizCards';
import { SignInBanner, StatsStrip, StreakBar } from '@/components/HomeStats';
import { isGuest } from '@/lib/guest';
import { apiFetch, currentUserId } from '@/lib/server-api';
import { readFilters } from '@/lib/filters';

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

  const filters = readFilters(await searchParams);

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

      <FilterChips filters={filters} />
      <HomeQuizCards filters={filters} />

      <p className="footer-note">Based on the 195 UN member and observer states</p>
    </main>
  );
}
