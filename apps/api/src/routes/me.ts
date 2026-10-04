import {
  displayNameProblem,
  type UpdateProfileRequest,
  type UserProfile,
} from '@cartomancer/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound } from '../errors.js';
import { deleteAccount } from '../lib/account.js';

/**
 * `name` is trimmed here, then judged by the same rule the account form uses.
 * `null` clears it. An empty string is not a way to clear it: the api says what
 * it means, and the web form turns "left blank" into null before it asks.
 *
 * Strict, so a body that names anything else — `email`, `authProvider` — is a
 * 400 rather than a silent no-op. Only `name` is writable, and a client that
 * thinks otherwise should find out.
 */
const updateSchema = z
  .object({
    name: z
      .string()
      .transform((value) => value.trim())
      .superRefine((value, context) => {
        const problem = displayNameProblem(value);
        if (problem) {
          context.addIssue({ code: 'custom', message: problem });
        }
      })
      .nullable(),
  })
  .strict();

/**
 * The confirmation is required here as well as on the screen (#64): the form
 * makes the player type it, and this is what makes a stray request — a script, a
 * double-submitted form, a client that forgot — unable to wipe an account. Exact
 * and case-sensitive, because it is the server's check; the form accepts any
 * casing and sends this.
 */
const deleteSchema = z.object({ confirm: z.literal('DELETE') }).strict();

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  async function loadProfile(userId: string): Promise<UserProfile> {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, image: true, authProvider: true, createdAt: true },
    });
    if (!user) {
      throw notFound('No such user');
    }
    return {
      email: user.email,
      name: user.name,
      image: user.image,
      authProvider: user.authProvider,
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    };
  }

  /**
   * The signed-in player's own profile. A 403 for a guest, like the other
   * signed-in-only reads (`/api/progress/:category`): a guest has no account,
   * and an empty profile would be a lie the account page could act on.
   */
  app.get('/api/me', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guests have no account');
    }
    return loadProfile(userId);
  });

  /** Changes the display name — nothing else about a player is editable here. */
  app.patch('/api/me', async (request) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guests have no account');
    }
    const body: UpdateProfileRequest = updateSchema.parse(request.body ?? {});
    const result = await app.prisma.user.updateMany({
      where: { id: userId },
      data: { name: body.name },
    });
    if (result.count === 0) {
      throw notFound('No such user');
    }
    return loadProfile(userId);
  });

  /**
   * Permanently deletes the signed-in player's account and everything that is
   * theirs (see `deleteAccount`). 204 with no body.
   *
   * Idempotent: when the account is already gone it is still a 204, because a
   * retry of a request whose reply was lost should not turn "it worked" into an
   * error (#58). That cannot delete anything it should not: the id comes from
   * the actor, never from the request.
   */
  app.delete('/api/me', async (request, reply) => {
    const { userId } = request.actor;
    if (userId === null) {
      throw forbidden('Guests have no account');
    }
    deleteSchema.parse(request.body ?? {});
    await deleteAccount(app.prisma, userId);
    return reply.code(204).send();
  });
}
