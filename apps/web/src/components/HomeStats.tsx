import type { ProgressSummary } from '@cartomancer/shared';
import { IconFlame, IconLock } from './icons';

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

export function StatsStrip({ summary }: { summary: ProgressSummary }) {
  const stats: [number, string][] = [
    [summary.learned.countries, 'Countries learned'],
    [summary.learned.capitals, 'Capitals learned'],
    [summary.learned.flags, 'Flags learned'],
  ];
  return (
    <div className="stats-strip">
      {stats.map(([value, label]) => (
        <div className="stat" key={label}>
          <div className="stat-value">
            {value}/{summary.totalCountries}
          </div>
          <div className="stat-label">{label}</div>
        </div>
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
