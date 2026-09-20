import { PrismaAdapter } from '@auth/prisma-adapter';
import { getPrisma } from '@cartomancer/db';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Apple from 'next-auth/providers/apple';
import Google from 'next-auth/providers/google';
import { createAppleClientSecret } from './lib/apple';

/**
 * Which social providers are wired up. The OAuth apps still have to be
 * registered with Google and Apple by hand, so the app has to work — guest mode
 * included — with either or neither configured. The login screen renders both
 * buttons and disables the ones with no credentials rather than pretending.
 */
export const providerStatus = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  apple: Boolean(
    process.env.AUTH_APPLE_ID &&
      process.env.AUTH_APPLE_TEAM_ID &&
      process.env.AUTH_APPLE_KEY_ID &&
      process.env.AUTH_APPLE_PRIVATE_KEY,
  ),
};

/**
 * Lazy config: Apple's client secret has to be signed asynchronously, so the
 * whole config is built per-request (Auth.js caches nothing that matters here).
 */
export const { handlers, signIn, signOut, auth } = NextAuth(async () => {
  const providers: NextAuthConfig['providers'] = [];

  if (providerStatus.google) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID as string,
        clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (providerStatus.apple) {
    providers.push(
      Apple({
        clientId: process.env.AUTH_APPLE_ID as string,
        clientSecret: await createAppleClientSecret({
          clientId: process.env.AUTH_APPLE_ID as string,
          teamId: process.env.AUTH_APPLE_TEAM_ID as string,
          keyId: process.env.AUTH_APPLE_KEY_ID as string,
          privateKey: process.env.AUTH_APPLE_PRIVATE_KEY as string,
        }),
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  return {
    // The adapter owns users/accounts; quiz data is the api's business.
    adapter: PrismaAdapter(getPrisma() as never),
    providers,
    // JWT sessions: the api is a separate service and is handed the user id by
    // the BFF proxy, so there's nothing to gain from a session table round trip.
    session: { strategy: 'jwt' },
    pages: { signIn: '/login' },
    trustHost: true,
    callbacks: {
      jwt({ token, user }) {
        if (user?.id) {
          token.userId = user.id;
        }
        return token;
      },
      session({ session, token }) {
        if (typeof token.userId === 'string') {
          session.user.id = token.userId;
        }
        return session;
      },
    },
    events: {
      /**
       * `users.auth_provider` is NOT NULL and the adapter's createUser call has
       * no idea which provider is in play, hence the 'pending' default and this
       * event, which stamps the real one as soon as the account is linked.
       */
      async linkAccount({ user, account }) {
        if (!user.id) {
          return;
        }
        await getPrisma().user.update({
          where: { id: user.id },
          data: { authProvider: account.provider, emailVerified: new Date() },
        });
      },
    },
  } satisfies NextAuthConfig;
});
