import type { Prisma, PrismaClient } from '@cartomancer/db';

/**
 * What the write paths accept: the client itself, or the one a `$transaction`
 * hands its callback. They are the same API, which is what lets a helper like
 * `recordProgress` run on its own or as one step of a transaction (#54).
 */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Is this Postgres's unique-constraint failure (Prisma's P2002)?
 *
 * Duck-typed on `code` rather than `instanceof PrismaClientKnownRequestError`:
 * the error crosses a driver adapter and a transaction boundary, and the code is
 * the part of it that is contract.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Is this the pool refusing to hand out a connection in time (#62)?
 *
 * With `connectionTimeoutMillis` set, a request that cannot get a connection
 * fails after a few seconds instead of waiting for ever, and node-postgres says
 * so with a plain `Error('timeout exceeded when trying to connect')` — no Prisma
 * code, no wrapper, which is why this matches the message. It is the same error
 * when Postgres itself cannot be reached in time. Either way it is the server
 * being unable to serve right now, not a bug in the request, so it is a 503
 * with a Retry-After rather than a 500.
 */
export function isPoolExhausted(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('timeout exceeded when trying to connect')
  );
}

/**
 * Takes the participant's row lock, so that everything this player does to this
 * session's score runs one transaction at a time.
 *
 * Why it is needed and not just tidy: the score is "how many of my answers were
 * correct", recounted after each answer. Two answers to different questions in
 * flight together each count before the other has committed, so each writes a
 * score that is one short and the last writer wins — a lost update that no
 * unique constraint catches. And two submits of the *same* question both pass the
 * "already answered?" check. Holding this lock first serialises them: each
 * transaction then starts its reads after the previous one committed, the second
 * same-question submit runs into the first one's row and is told so (a unique
 * violation, answered as a replay), and the recount is right.
 *
 * Per (session, player), so unrelated players never wait on each other.
 */
export async function lockParticipant(
  tx: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  await tx.$queryRawUnsafe(
    `SELECT 1 FROM session_participants
      WHERE session_id = $1::uuid AND user_id = $2::uuid
        FOR UPDATE`,
    sessionId,
    userId,
  );
}
