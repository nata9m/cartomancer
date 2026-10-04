import {
  displayNameProblem,
  type UpdateProfileRequest,
  type UserProfile,
} from '@cartomancer/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound } from '../errors.js';

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
}
