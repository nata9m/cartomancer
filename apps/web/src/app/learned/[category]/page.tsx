import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CategoryProgress, CountryRef } from '@cartomancer/shared';
import { SignInBanner } from '@/components/HomeStats';
import { LearnedList } from '@/components/LearnedList';
import { IconArrowLeft } from '@/components/icons';
import { readFilters } from '@/lib/filters';
import { LEARNED_COPY, parseLearnedCategory } from '@/lib/learned';
import { apiFetch, currentUserId } from '@/lib/server-api';

// Per-user progress, like the home screen it drills into.
export const dynamic = 'force-dynamic';

/**
 * /learned/countries, /learned/capitals, /learned/flags — the list behind each
 * home-screen stat.
 *
 * Two requests, in parallel: the 195 countries (public reference data, and the
 * only place the not-learned side can come from) and this user's state for the
 * category. They are joined in the component, so "learned" and "not learned
 * yet" together are the full list by construction rather than by agreement
 * between two queries.
 */
export default async function LearnedPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const category = parseLearnedCategory((await params).category);
  if (!category) {
    notFound();
  }
  const filters = readFilters(await searchParams);
  const userId = await currentUserId();

  // A guest has no progress at all, so there is no list to show — not an empty
  // one, which would read as "you have learned nothing". The api agrees and
  // answers 403; this never asks it.
  if (!userId) {
    return (
      <main className="app-shell">
        <div className="screen-header">
          <Link className="icon-button" href="/" aria-label="Back to home">
            <IconArrowLeft size={19} stroke={1.9} />
          </Link>
          <h1 className="screen-title">{LEARNED_COPY[category].label}</h1>
        </div>
        <SignInBanner />
      </main>
    );
  }

  const [{ countries }, progress] = await Promise.all([
    apiFetch<{ countries: CountryRef[]; total: number }>('/api/countries?region=all'),
    apiFetch<CategoryProgress>(`/api/progress/${category}`, { userId }),
  ]);

  return (
    <LearnedList
      category={category}
      countries={countries}
      progress={progress.countries}
      filters={filters}
    />
  );
}
