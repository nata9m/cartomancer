import type { PrismaClient } from '@cartomancer/db';
import type { RequestActor } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Who this request acts for; `userId: null` means guest play. */
    actor: RequestActor;
  }
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export {};
