/**
 * The database connection pool (#62): how it is configured, what it does when it
 * is full, and what the api reports about it.
 *
 * The configuration tests need no database. The behaviour tests use a real one,
 * because "a saturated pool fails fast instead of hanging" is a claim about
 * node-postgres and Postgres together, and a stub would only test the stub. They
 * build their own small clients, so they cannot disturb the shared one the
 * integration suite uses.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createPrismaClient,
  DEFAULT_POOL_OPTIONS,
  getPoolStats,
  resolvePoolOptions,
} from '@cartomancer/db';
import { isPoolExhausted } from './db.js';
import {
  classifyPool,
  createPoolMonitor,
  recordPoolTimeout,
  takePoolTimeouts,
  type PoolLog,
} from './pool-monitor.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('resolvePoolOptions', () => {
  it('is node-postgres’s old ten connections by default, with timeouts it never had', () => {
    assert.deepEqual(resolvePoolOptions({}, {}), DEFAULT_POOL_OPTIONS);
    assert.equal(DEFAULT_POOL_OPTIONS.max, 10);
    assert.ok(
      DEFAULT_POOL_OPTIONS.connectionTimeoutMillis > 0,
      'a full pool must not wait for ever',
    );
    assert.ok(DEFAULT_POOL_OPTIONS.idleTimeoutMillis > 0);
  });

  it('takes what an app says it needs over the package’s default', () => {
    assert.equal(resolvePoolOptions({ max: 3 }, {}).max, 3);
    assert.equal(resolvePoolOptions({ max: 3 }, {}).connectionTimeoutMillis, 5_000);
  });

  it('lets the environment override both, so a limit changes without a rebuild', () => {
    assert.equal(resolvePoolOptions({ max: 3 }, { DATABASE_POOL_MAX: '7' }).max, 7);
    assert.equal(resolvePoolOptions({}, { DATABASE_POOL_MAX: '25' }).max, 25);
  });

  it('reads each setting on its own', () => {
    assert.deepEqual(
      resolvePoolOptions(
        {},
        {
          DATABASE_POOL_MAX: '4',
          DATABASE_POOL_IDLE_TIMEOUT_MS: '1000',
          DATABASE_POOL_CONNECTION_TIMEOUT_MS: '250',
        },
      ),
      { max: 4, idleTimeoutMillis: 1000, connectionTimeoutMillis: 250 },
    );
    assert.deepEqual(resolvePoolOptions({}, { DATABASE_POOL_CONNECTION_TIMEOUT_MS: '250' }), {
      ...DEFAULT_POOL_OPTIONS,
      connectionTimeoutMillis: 250,
    });
  });

  it('treats a blank value as not set, and trims one that is', () => {
    assert.equal(resolvePoolOptions({}, { DATABASE_POOL_MAX: '' }).max, 10);
    assert.equal(resolvePoolOptions({}, { DATABASE_POOL_MAX: '   ' }).max, 10);
    assert.equal(resolvePoolOptions({}, { DATABASE_POOL_MAX: '  7 ' }).max, 7);
  });

  it('refuses a value that is not a positive whole number, by name, at startup', () => {
    // Quietly becoming the default would leave an operator believing a limit was
    // in force that is not — the failure this setting exists to prevent.
    for (const bad of ['ten', '0', '-1', '1.5', '3 connections', '1e3', '0x10', 'NaN']) {
      assert.throws(
        () => resolvePoolOptions({}, { DATABASE_POOL_MAX: bad }),
        /DATABASE_POOL_MAX must be a positive whole number/,
        JSON.stringify(bad),
      );
    }
    assert.throws(
      () => resolvePoolOptions({}, { DATABASE_POOL_CONNECTION_TIMEOUT_MS: '0' }),
      /DATABASE_POOL_CONNECTION_TIMEOUT_MS/,
    );
    assert.throws(
      () => resolvePoolOptions({}, { DATABASE_POOL_IDLE_TIMEOUT_MS: 'soon' }),
      /DATABASE_POOL_IDLE_TIMEOUT_MS/,
    );
  });
});

describe('a client’s pool', () => {
  it('is sized as asked, and reports it', async () => {
    const prisma = createPrismaClient({ pool: { max: 2, connectionTimeoutMillis: 1234 } });
    try {
      const stats = getPoolStats(prisma);
      assert.ok(stats);
      assert.equal(stats.max, 2);
      assert.equal(stats.connectionTimeoutMillis, 1234);
      assert.equal(stats.idleTimeoutMillis, DEFAULT_POOL_OPTIONS.idleTimeoutMillis);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('opens connections only as they are needed, and closes them all on disconnect', async () => {
    const prisma = createPrismaClient({ pool: { max: 3 } });
    assert.equal(getPoolStats(prisma)?.total, 0, 'nothing is open before the first query');
    await prisma.user.count();
    assert.ok((getPoolStats(prisma)?.total ?? 0) >= 1);
    await prisma.$disconnect();
    // The lifecycle the adapter had before the pool was ours: $disconnect ends it.
    assert.deepEqual(
      [getPoolStats(prisma)?.total, getPoolStats(prisma)?.idle, getPoolStats(prisma)?.waiting],
      [0, 0, 0],
    );
  });

  it('never opens more connections than its maximum, however many requests arrive', async () => {
    const prisma = createPrismaClient({ pool: { max: 3, connectionTimeoutMillis: 10_000 } });
    try {
      await prisma.user.count(); // warm up, so the engine is not what is being raced
      let highest = 0;
      const sampler = setInterval(() => {
        highest = Math.max(highest, getPoolStats(prisma)?.total ?? 0);
      }, 5);
      // Twenty overlapping requests, each holding a connection for a moment.
      const results = await Promise.all(
        Array.from({ length: 20 }, async () =>
          prisma.$queryRawUnsafe<{ n: string }[]>('SELECT pg_sleep(0.05)::text AS n'),
        ),
      );
      clearInterval(sampler);
      assert.equal(results.length, 20, 'every one was served, queueing behind the limit');
      assert.ok(highest <= 3, `the pool held ${highest} connections against a maximum of 3`);
      assert.ok(highest >= 2, 'and it did use the room it had');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('fails fast when full, instead of hanging — and recovers afterwards', async () => {
    const prisma = createPrismaClient({ pool: { max: 1, connectionTimeoutMillis: 300 } });
    try {
      await prisma.user.count(); // warm the engine up so the order below is the pool's order
      // Prisma queries are lazy: this does nothing until something awaits it, so
      // it is started explicitly. It holds the only connection for a second.
      const holder = (async () => prisma.$queryRawUnsafe('SELECT pg_sleep(1)::text AS n'))();
      await wait(100);
      assert.deepEqual(
        [getPoolStats(prisma)?.total, getPoolStats(prisma)?.idle],
        [1, 0],
        'the only connection is in use',
      );

      const startedAt = Date.now();
      const waiter = (async () => prisma.user.count())().then(
        () => undefined,
        (error: unknown) => error,
      );
      await wait(100);
      assert.equal(getPoolStats(prisma)?.waiting, 1, 'a request is queued for a connection');
      assert.equal(classifyPool(getPoolStats(prisma)!), 'saturated');

      const error = await waiter;
      const waited = Date.now() - startedAt;
      assert.ok(isPoolExhausted(error), `expected the pool timeout, got ${String(error)}`);
      assert.ok(
        waited < 900,
        `it failed after ${waited}ms, which is not fast: it was waiting for the holder`,
      );

      await holder;
      assert.equal(await prisma.user.count().then(() => 'served'), 'served', 'and it recovers');
      assert.equal(getPoolStats(prisma)?.waiting, 0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('is not reported for a client it did not make', () => {
    assert.equal(getPoolStats({} as never), undefined);
  });
});

describe('isPoolExhausted', () => {
  it('recognises the pool’s timeout and nothing else', () => {
    assert.equal(isPoolExhausted(new Error('timeout exceeded when trying to connect')), true);
    assert.equal(isPoolExhausted(new Error('Unique constraint failed')), false);
    assert.equal(isPoolExhausted(new Error('Connection terminated unexpectedly')), false);
    assert.equal(isPoolExhausted('timeout exceeded when trying to connect'), false, 'not an Error');
    assert.equal(isPoolExhausted(undefined), false);
    assert.equal(isPoolExhausted(null), false);
  });
});

describe('classifyPool', () => {
  const stats = (over: Partial<ReturnType<typeof base>>) => ({ ...base(), ...over });
  const base = () => ({
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    total: 4,
    idle: 2,
    waiting: 0,
  });

  it('is ok with connections to spare', () => {
    assert.equal(classifyPool(stats({})), 'ok');
    assert.equal(classifyPool(stats({ total: 0, idle: 0 })), 'ok', 'an empty pool is fine');
    assert.equal(classifyPool(stats({ total: 10, idle: 1 })), 'ok', 'full, but one is free');
  });

  it('is busy when every connection is in use and nobody is waiting yet', () => {
    assert.equal(classifyPool(stats({ total: 10, idle: 0 })), 'busy');
  });

  it('is saturated as soon as a request is waiting, whatever else is true', () => {
    assert.equal(classifyPool(stats({ waiting: 1 })), 'saturated');
    assert.equal(classifyPool(stats({ total: 10, idle: 0, waiting: 5 })), 'saturated');
  });

  it('is not busy just because it has not opened its connections yet', () => {
    assert.equal(classifyPool(stats({ total: 3, idle: 0 })), 'ok', '3 of 10 in use');
  });
});

describe('the pool monitor', () => {
  const sequence = (...states: ('ok' | 'busy' | 'saturated')[]) => {
    const calls: { level: string; message: string }[] = [];
    const log: PoolLog = {
      debug: (_f, message) => calls.push({ level: 'debug', message }),
      info: (_f, message) => calls.push({ level: 'info', message }),
      warn: (_f, message) => calls.push({ level: 'warn', message }),
    };
    const shapes = {
      ok: { total: 2, idle: 1, waiting: 0 },
      busy: { total: 10, idle: 0, waiting: 0 },
      saturated: { total: 10, idle: 0, waiting: 3 },
    };
    let index = 0;
    const monitor = createPoolMonitor({
      log,
      summaryEvery: 4,
      getStats: () => ({
        max: 10,
        idleTimeoutMillis: 1,
        connectionTimeoutMillis: 1,
        ...shapes[states[index++] ?? 'ok'],
      }),
    });
    for (let i = 0; i < states.length; i += 1) monitor.sample();
    return calls;
  };

  it('stays at debug while nothing is wrong', () => {
    assert.deepEqual(
      sequence('ok', 'ok', 'ok').map((c) => c.level),
      ['debug', 'debug', 'debug'],
    );
  });

  it('warns on every sample while saturated, because that is the state that hurts', () => {
    const levels = sequence('saturated', 'saturated', 'saturated').map((c) => c.level);
    assert.deepEqual(levels, ['warn', 'warn', 'warn']);
  });

  it('notes busy once when it starts, not on every sample under steady load', () => {
    const levels = sequence('ok', 'busy', 'busy', 'busy').map((c) => c.level);
    // ok → debug; busy begins → info; still busy → debug; and the fourth sample
    // is the periodic summary (summaryEvery is 4), not a repeat of the warning.
    assert.deepEqual(levels, ['debug', 'info', 'debug', 'info']);
  });

  it('says when a warning is over', () => {
    const calls = sequence('saturated', 'ok');
    assert.equal(calls[0]?.level, 'warn');
    assert.equal(calls[1]?.level, 'info');
    assert.match(calls[1]?.message ?? '', /recovered/);
  });

  it('writes an ordinary summary now and then, so the trend can be read off the logs', () => {
    const levels = sequence('ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok').map((c) => c.level);
    assert.deepEqual(levels, [
      'debug',
      'debug',
      'debug',
      'info',
      'debug',
      'debug',
      'debug',
      'info',
    ]);
  });

  it('counts requests that gave up, because a sample can fall between two waits', () => {
    // The first version only sampled, and when the pool was saturated on purpose
    // it reported "busy" and then "recovered" without once saying "saturated":
    // a request waits for at most the connection timeout, and the sample landed
    // in a gap. A request that failed cannot be missed.
    const calls: { level: string; message: string; fields: Record<string, unknown> }[] = [];
    const log: PoolLog = {
      debug: (fields, message) =>
        calls.push({ level: 'debug', message, fields: fields as Record<string, unknown> }),
      info: (fields, message) =>
        calls.push({ level: 'info', message, fields: fields as Record<string, unknown> }),
      warn: (fields, message) =>
        calls.push({ level: 'warn', message, fields: fields as Record<string, unknown> }),
    };
    let failed = 3;
    const monitor = createPoolMonitor({
      log,
      getStats: () => ({
        max: 10,
        idleTimeoutMillis: 1,
        connectionTimeoutMillis: 1,
        // Nothing is waiting at the instant of the sample…
        total: 4,
        idle: 4,
        waiting: 0,
      }),
      takeTimeouts: () => {
        const now = failed;
        failed = 0;
        return now;
      },
    });

    // …and it is still reported as saturated, with how many, and only once.
    assert.equal(monitor.sample(), 'saturated');
    assert.equal(calls[0]?.level, 'warn');
    assert.equal(calls[0]?.fields['timeouts'], 3);
    assert.match(calls[0]?.message ?? '', /3 requests gave up waiting/);

    assert.equal(monitor.sample(), 'ok');
    assert.equal(calls[1]?.level, 'info');
    assert.match(calls[1]?.message ?? '', /recovered/);
  });

  it('says "1 request", not "1 requests"', () => {
    const messages: string[] = [];
    const monitor = createPoolMonitor({
      log: { debug() {}, info() {}, warn: (_f, message) => messages.push(message) },
      getStats: () => ({
        max: 1,
        idleTimeoutMillis: 1,
        connectionTimeoutMillis: 1,
        total: 1,
        idle: 1,
        waiting: 0,
      }),
      takeTimeouts: () => 1,
    });
    monitor.sample();
    assert.match(messages[0] ?? '', /1 request gave up/);
  });

  it('keeps a running count that a sample takes and resets', () => {
    takePoolTimeouts();
    recordPoolTimeout();
    recordPoolTimeout();
    assert.equal(takePoolTimeouts(), 2);
    assert.equal(takePoolTimeouts(), 0, 'taken once, then it starts again from nothing');
  });

  it('does nothing for a client with no pool to report', () => {
    const monitor = createPoolMonitor({
      getStats: () => undefined,
      log: { debug() {}, info() {}, warn() {} },
    });
    assert.equal(monitor.sample(), undefined);
  });
});
