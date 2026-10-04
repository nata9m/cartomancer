import type { PrismaClient } from '@cartomancer/db';

/**
 * Permanently removes a player and everything that is theirs (#64).
 *
 * Deleting the `users` row does most of it on its own: `accounts` (the provider
 * link and its tokens, including the `id_token`, which carries the email),
 * `auth_sessions`, `progress`, `fact_progress`, `session_participants` and
 * `session_answers` all cascade. Two things do not, and are handled here:
 *
 *  - **Quiz sessions.** `quiz_sessions.created_by` is `SET NULL`, so without
 *    this the player's sessions would outlive them as anonymous rows. They hold
 *    no personal data, but they are not the player's to leave behind either, and
 *    nothing would ever clean them up. A session is deleted when it was theirs —
 *    created or taken part in — and nobody else took part. One that someone else
 *    shared (a head-to-head, when there is one) stays, minus this player's rows,
 *    because it is that other person's history too.
 *  - **Verification tokens.** `verification_tokens.identifier` is an email with
 *    no foreign key to anything, so no cascade can reach it. None are written
 *    while sign-in is Google/Apple only, but the table exists for email flows and
 *    a row there is a stored email.
 *
 * All of it is one transaction: a deletion that stops half-way would leave a
 * player with an account that has lost its history, which is worse than either
 * outcome. Returns false when there is no such player — a repeated request, or
 * one whose reply was lost, is not an error (#58): the account is gone, which is
 * what was asked for.
 */
export async function deleteAccount(prisma: PrismaClient, userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
      return false;
    }

    await tx.$executeRawUnsafe(
      `DELETE FROM quiz_sessions q
        WHERE (q.created_by = $1::uuid
               OR EXISTS (SELECT 1 FROM session_participants me
                           WHERE me.session_id = q.id AND me.user_id = $1::uuid))
          AND NOT EXISTS (SELECT 1 FROM session_participants other
                           WHERE other.session_id = q.id AND other.user_id <> $1::uuid)`,
      userId,
    );
    await tx.$executeRawUnsafe(
      'DELETE FROM verification_tokens WHERE lower(identifier) = lower($1)',
      user.email,
    );
    // deleteMany, not delete: a second request racing this one has already waited
    // out the first's locks and finds nothing left, which is a success rather
    // than a "record not found" thrown into a 500.
    await tx.user.deleteMany({ where: { id: userId } });
    return true;
  });
}
