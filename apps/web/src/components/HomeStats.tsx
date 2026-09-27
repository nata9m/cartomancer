import Link from 'next/link';
import type { ProgressSummary } from '@cartomancer/shared';
import { IconChevronRight, IconFlame, IconLock } from './icons';
import { LEARNED_CATEGORIES, LEARNED_COPY, learnedHref } from '@/lib/learned';

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Weekly streak bar: flame + day count, then a dot per day of the current week. */
export function StreakBar({ summary }: { summary: ProgressSummary }) {
  return (
    <div className="streak-bar">
      <span className="streak-flame">
        <IconFlame size={16} stroke={1.9} />
        {summary.dayStreak} day streak
      </span>
      <div className="streak-days">
        {DAY_INITIALS.map((initial, index) => (
          <span className="day" key={`${initial}-${index}`}>
            <span className={`day-dot${summary.weekActivity[index] ? ' day-dot--filled' : ''}`} />
            {initial}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The three learned counts. Each one is a link into its own list (#33): the
 * number says how many, and the only way to find out *which* was to play until
 * a country stopped coming back.
 *
 * The chevron sits next to the value rather than at the tile's trailing edge,
 * where a list row would put it: these are three tiles side by side at 390px,
 * and the labels ("Countries learned") already fill their column at 10px.
 */
export function StatsStrip({ summary }: { summary: ProgressSummary }) {
  return (
    <div className="stats-strip">
      {LEARNED_CATEGORIES.map((category) => (
        <Link className="stat" href={learnedHref(category)} key={category}>
          <div className="stat-value">
            {summary.learned[category]}/{summary.totalCountries}
            <IconChevronRight className="stat-chevron" size={13} stroke={2} />
          </div>
          <div className="stat-label">{LEARNED_COPY[category].label}</div>
        </Link>
      ))}
    </div>
  );
}

/** Guest home screen: shown where the streak bar and stats strip would be. */
export function SignInBanner() {
  return (
    <div className="signin-banner">
      <IconLock size={16} stroke={1.9} />
      <span>Sign in to save your progress and improve your learning</span>
      <a href="/login">Sign in</a>
    </div>
  );
}
