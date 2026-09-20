import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export type { PrismaClient } from './generated/prisma/client.js';

/**
 * Prisma 7 talks to Postgres through a driver adapter, so the connection string
 * is read here rather than declared in the schema.
 */
export function createPrismaClient(connectionString = process.env['DATABASE_URL']): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Process-wide client, created on first use. Next.js hot reloads would
 * otherwise open a fresh pool per reload, so it is cached on globalThis.
 */
const globalForPrisma = globalThis as unknown as { cartomancerPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.cartomancerPrisma;
  if (existing) {
    return existing;
  }
  const client = createPrismaClient();
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
