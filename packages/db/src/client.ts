import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from './generated/prisma/client.js';

export type { PrismaClient } from './generated/prisma/client.js';

/**
 * How one process's connection pool to Postgres is sized and timed (#62).
 *
 * Prisma 7 talks to Postgres through `@prisma/adapter-pg`, which is a
 * node-postgres `Pool`, so the `?connection_limit=` URL parameter that older
 * Prisma versions honoured does nothing here. Until this existed nothing in the
 * repo set any of these, so every process quietly used node-postgres's defaults:
 * ten connections, and no limit at all on how long a request would wait for one.
 */
export interface PoolOptions {
  /**
   * The most connections this process will hold open. Across the whole system
   * the budget is `replicas × max` for each app, plus migrations and admin
   * access, and it has to stay under Postgres's `max_connections` (100 unless
   * changed) — see the README.
   */
  max: number;
  /** How long an unused connection is kept before it is closed. */
  idleTimeoutMillis: number;
  /**
   * How long a request waits for a free connection before it fails. Without it
   * a saturated pool does not fail, it hangs: every request queues behind the
   * ones in front of it and the app looks down without erroring. Failing after a
   * few seconds turns that into an error that is visible, logged and retried.
   */
  connectionTimeoutMillis: number;
}

/** What a process gets if neither its code nor its environment says otherwise. */
export const DEFAULT_POOL_OPTIONS: PoolOptions = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

const ENV_NAMES = {
  max: 'DATABASE_POOL_MAX',
  idleTimeoutMillis: 'DATABASE_POOL_IDLE_TIMEOUT_MS',
  connectionTimeoutMillis: 'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
} as const satisfies Record<keyof PoolOptions, string>;

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim();
  // Refused rather than "close enough": `DATABASE_POOL_MAX=ten` or `=0` silently
  // becoming the default would leave an operator believing a limit was in force
  // that is not, which is the failure this whole setting exists to prevent.
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${name} must be a positive whole number, but it is "${raw}"`);
  }
  return Number(value);
}

/**
 * The pool settings for a process, in order of precedence: the environment, then
 * the `defaults` the app passes for what it needs (the web app wants three, the
 * api ten), then the package's own. The environment wins so an operator can
 * change a limit without a rebuild, which is also how the cluster would.
 *
 * Throws on a value that is not a positive whole number, at startup, where it is
 * seen — not on the first request, where it is not.
 */
export function resolvePoolOptions(
  defaults: Partial<PoolOptions> = {},
  env: Record<string, string | undefined> = process.env,
): PoolOptions {
  const base = { ...DEFAULT_POOL_OPTIONS, ...defaults };
  return {
    max: positiveInteger(ENV_NAMES.max, env[ENV_NAMES.max], base.max),
    idleTimeoutMillis: positiveInteger(
      ENV_NAMES.idleTimeoutMillis,
      env[ENV_NAMES.idleTimeoutMillis],
      base.idleTimeoutMillis,
    ),
    connectionTimeoutMillis: positiveInteger(
      ENV_NAMES.connectionTimeoutMillis,
      env[ENV_NAMES.connectionTimeoutMillis],
      base.connectionTimeoutMillis,
    ),
  };
}

/** What one process's pool is doing right now, and what it is allowed to do. */
export interface PoolStats extends PoolOptions {
  /** Connections open, in use or not. Never more than `max`. */
  total: number;
  /** Open and free to take a query straight away. */
  idle: number;
  /** Requests queued for a connection. Anything above zero means the pool is full. */
  waiting: number;
}

/**
 * The pool behind each client, kept so that its state can be read. The client
 * hides the pool it was given; this is how the api reports it.
 */
const pools = new WeakMap<object, pg.Pool>();

export function getPoolStats(client: PrismaClient): PoolStats | undefined {
  const pool = pools.get(client);
  if (!pool) {
    return undefined;
  }
  return {
    max: pool.options.max ?? DEFAULT_POOL_OPTIONS.max,
    idleTimeoutMillis: pool.options.idleTimeoutMillis ?? DEFAULT_POOL_OPTIONS.idleTimeoutMillis,
    connectionTimeoutMillis:
      pool.options.connectionTimeoutMillis ?? DEFAULT_POOL_OPTIONS.connectionTimeoutMillis,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export interface CreateClientOptions {
  /** Defaults to `DATABASE_URL`. */
  connectionString?: string;
  /** What this app wants for its pool; the environment can still override it. */
  pool?: Partial<PoolOptions>;
  /**
   * Called when a connection that was sitting idle errors — Postgres restarting,
   * a network cut. node-postgres surfaces it as an `error` event on the pool and
   * the adapter would otherwise note it at debug level only, so by default it is
   * written to stderr: a pool that is quietly losing connections is exactly what
   * should be visible.
   */
  onPoolError?: (error: Error) => void;
}

/**
 * Prisma 7 talks to Postgres through a driver adapter, so the connection string
 * is read here rather than declared in the schema.
 *
 * The pool is created here, not by the adapter, for two reasons: it is the only
 * way to be handed the pool's own counters (`getPoolStats`), and it is where the
 * size and the timeouts are set. `disposeExternalPool` keeps the lifecycle what
 * it was — `$disconnect()` still closes it.
 *
 * Accepts a bare connection string, as it always did.
 */
export function createPrismaClient(options: string | CreateClientOptions = {}): PrismaClient {
  const {
    connectionString,
    pool: poolDefaults,
    onPoolError,
  } = typeof options === 'string' ? { connectionString: options } : options;
  const url = connectionString ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new pg.Pool({ connectionString: url, ...resolvePoolOptions(poolDefaults) });
  const client = new PrismaClient({
    adapter: new PrismaPg(pool, {
      disposeExternalPool: true,
      onPoolError:
        onPoolError ?? ((error) => console.error(`database pool error: ${error.message}`)),
    }),
  });
  pools.set(client, pool);
  return client;
}

/**
 * Process-wide client, created on first use. Next.js hot reloads would
 * otherwise open a fresh pool per reload, so it is cached on globalThis.
 *
 * The options only matter on the first call, which is the one that creates the
 * client. Every caller within one app should therefore pass the same ones — the
 * web app does, through a single wrapper — because a later call with different
 * options would not change a pool that already exists.
 */
const globalForPrisma = globalThis as unknown as { cartomancerPrisma?: PrismaClient };

export function getPrisma(options?: Omit<CreateClientOptions, 'connectionString'>): PrismaClient {
  const existing = globalForPrisma.cartomancerPrisma;
  if (existing) {
    return existing;
  }
  const client = createPrismaClient(options);
  globalForPrisma.cartomancerPrisma = client;
  return client;
}

/**
 * Convenience handle over {@link getPrisma}. Resolution is deferred to first
 * property access so that merely importing this module — as `next build` does
 * while collecting page data — never requires DATABASE_URL or opens a pool.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrisma() as object, property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getPrisma() as object, property);
  },
});
