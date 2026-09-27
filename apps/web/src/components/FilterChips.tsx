'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DIFFICULTIES, QUESTION_COUNT_OPTIONS, REGIONS } from '@cartomancer/shared';
import { IconChevronDown } from './icons';
import { DEFAULT_MODE, QUIZ_MODES, type Filters, type QuizMode } from '@/lib/filters';

const MODE_LABELS: Record<QuizMode, string> = {
  mc: 'Multiple choice',
  type: 'Type the answer',
};

/**
 * Region, difficulty, and (optionally) question-count and mode filters as pill
 * chips.
 *
 * The selection lives in the URL, so a server-rendered quiz-type card can carry
 * it straight into a session start and a reloaded or shared link keeps it. The
 * current values arrive as props (read server-side) and are mirrored in local
 * state so the chip updates instantly while the route change settles.
 *
 * A native <select> sits invisibly over each chip: mobile gets its own picker
 * for free and the chip stays a chip.
 */
export function FilterChips({
  filters,
  showDifficulty = true,
  showQuestionCount = false,
  showMode = false,
}: {
  filters: Filters;
  showDifficulty?: boolean;
  showQuestionCount?: boolean;
  /** Fun facts is the only screen with two ways to play (#42). */
  showMode?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [local, setLocal] = useState<Filters>(filters);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  const update = (key: keyof Filters, value: string): void => {
    const next = { ...local, [key]: value };
    setLocal(next);
    const params = new URLSearchParams();
    if (next.region !== 'all') params.set('region', next.region);
    if (next.difficulty !== 'all') params.set('difficulty', next.difficulty);
    if (next.questionCount) params.set('count', next.questionCount);
    // Carried whenever it is shown, default or not: the whole row is rebuilt
    // from scratch on every change, so anything left out here is a chip that
    // silently resets when a neighbouring one is touched.
    if (showMode) params.set('mode', next.mode);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const countLabel = local.questionCount
    ? `${local.questionCount} questions`
    : '20 questions';

  return (
    <div className="filter-chips">
      <span className={`chip${local.region === 'all' ? '' : ' chip--active'}`}>
        {local.region === 'all' ? 'All regions' : local.region}
        <IconChevronDown size={14} stroke={1.75} />
        <select
          aria-label="Filter by region"
          value={local.region}
          onChange={(event) => update('region', event.target.value)}
        >
          <option value="all">All regions</option>
          {REGIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </span>

      {showDifficulty ? (
        <span className={`chip${local.difficulty === 'all' ? '' : ' chip--active'}`}>
          {local.difficulty === 'all' ? 'All levels' : local.difficulty}
          <IconChevronDown size={14} stroke={1.75} />
          <select
            aria-label="Filter by difficulty"
            value={local.difficulty}
            onChange={(event) => update('difficulty', event.target.value)}
          >
            <option value="all">All levels</option>
            {DIFFICULTIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </span>
      ) : null}

      {showMode ? (
        <span className={`chip${local.mode === DEFAULT_MODE ? '' : ' chip--active'}`}>
          {MODE_LABELS[local.mode]}
          <IconChevronDown size={14} stroke={1.75} />
          <select
            aria-label="How to answer"
            value={local.mode}
            onChange={(event) => update('mode', event.target.value)}
          >
            {QUIZ_MODES.map((option) => (
              <option key={option} value={option}>
                {MODE_LABELS[option]}
              </option>
            ))}
          </select>
        </span>
      ) : null}

      {showQuestionCount ? (
        <span className={`chip${local.questionCount && local.questionCount !== '20' ? ' chip--active' : ''}`}>
          {countLabel}
          <IconChevronDown size={14} stroke={1.75} />
          <select
            aria-label="Number of questions"
            value={local.questionCount || '20'}
            onChange={(event) => update('questionCount', event.target.value)}
          >
            {QUESTION_COUNT_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n} questions
              </option>
            ))}
          </select>
        </span>
      ) : null}
    </div>
  );
}
