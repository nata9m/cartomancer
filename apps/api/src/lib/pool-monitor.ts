import type { PoolStats } from '@cartomancer/db';

/**
 * Makes the database pool's state visible before it becomes errors (#62).
 *
 * A full pool does not announce itself: requests queue for a connection, the app
 * gets slow, and the first thing anyone sees is a timeout. The counters that say
 * so — connections open, free, and requests waiting — exist on the pool and
 * nothing read them. This does, on an interval, and says something only when
 * there is something to say.
 *
 *   ok         connections to spare
 *   busy       every connection is in use, nobody is waiting: the next request
 *              will have to — one step from saturated, and the useful warning
 *   saturated  requests are waiting for a connection: the pool is the bottleneck
 */
export type PoolState = 'ok' | 'busy' | 'saturated';

export function classifyPool(stats: PoolStats): PoolState {
  if (stats.waiting > 0) {
    return 'saturated';
  }
  if (stats.total >= stats.max && stats.idle === 0) {
    return 'busy';
  }
  return 'ok';
}

/**
 * Requests that gave up waiting for a connection since the monitor last looked.
 *
 * Sampling the pool cannot catch this on its own: "requests are waiting" is only
 * true for as long as one waits, which is at most the connection timeout, and a
 * sample every few seconds can fall entirely between two such moments. Found by
 * saturating a pool on purpose and watching the monitor report "busy" and then
 * "recovered" without ever saying "saturated". A failed request cannot be missed,
 * so each one is counted here and the next sample reports the total.
 *
 * Module state, because there is one pool per process and the thing that sees the
 * failure (the error handler) is nowhere near the thing that reports it.
 */
let timeoutsSinceLastSample = 0;

export function recordPoolTimeout(): void {
  timeoutsSinceLastSample += 1;
}

export function takePoolTimeouts(): number {
  const count = timeoutsSinceLastSample;
  timeoutsSinceLastSample = 0;
  return count;
}

/** The slice of a Fastify/pino logger this needs, so a test can pass a stub. */
export interface PoolLog {
  debug(fields: object, message: string): void;
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

/**
 * One sample of the pool.
 *
 *  - Saturated: a warning on *every* sample while it lasts, because it is the
 *    state that is hurting people and a single line scrolling past is easy to
 *    miss.
 *  - Busy: noted once when it starts, not on every sample under steady load.
 *  - Back to ok: noted once, so a warning is always followed by its ending.
 *  - Otherwise quiet (debug), with an info line every `summaryEvery` samples so
 *    the trend can be read off ordinary logs.
 */
export function createPoolMonitor(options: {
  getStats: () => PoolStats | undefined;
  log: PoolLog;
  /** Every how many samples to write an info summary when nothing is wrong. */
  summaryEvery?: number;
  /** Failed waits since the last call; see `takePoolTimeouts`. */
  takeTimeouts?: () => number;
}) {
  const { getStats, log, summaryEvery = 20, takeTimeouts = takePoolTimeouts } = options;
  let previous: PoolState = 'ok';
  let samples = 0;

  return {
    sample(): PoolState | undefined {
      const stats = getStats();
      if (!stats) {
        return undefined;
      }
      samples += 1;
      const timeouts = takeTimeouts();
      // A request that gave up is saturation whether or not one is waiting at the
      // instant of the sample.
      const state = timeouts > 0 ? 'saturated' : classifyPool(stats);

      if (timeouts > 0) {
        log.warn(
          { pool: stats, timeouts },
          `database pool saturated: ${timeouts} request${timeouts === 1 ? '' : 's'} gave up waiting for a connection since the last check — raise DATABASE_POOL_MAX, add capacity, or look for slow queries holding connections`,
        );
      } else if (state === 'saturated') {
        log.warn(
          { pool: stats },
          'database pool saturated: requests are waiting for a connection — raise DATABASE_POOL_MAX, add capacity, or look for slow queries holding connections',
        );
      } else if (state === 'busy' && previous !== 'busy') {
        log.info(
          { pool: stats },
          'database pool is fully in use: the next concurrent request will have to wait',
        );
      } else if (state === 'ok' && previous !== 'ok') {
        log.info({ pool: stats }, 'database pool has recovered');
      } else if (samples % summaryEvery === 0) {
        log.info({ pool: stats }, 'database pool');
      } else {
        log.debug({ pool: stats }, 'database pool');
      }

      previous = state;
      return state;
    },
  };
}
