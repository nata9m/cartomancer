import { PrismaAdapter } from '@auth/prisma-adapter';
import { getPrisma } from '@cartomancer/db';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Apple from 'next-auth/providers/apple';
import Google from 'next-auth/providers/google';
import { createAppleClientSecret } from './lib/apple';

export const SOCIAL_PROVIDER_IDS = ['google', 'apple'] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

export interface SocialProvider {
  id: SocialProviderId;
  label: string;
}

/**
 * Which social providers are actually wired up, decided per provider from the
 * environment.
 *
 * Every provider is optional. Apple in particular needs a paid Developer
 * Program membership to issue a Services ID and a Sign in with Apple key, so
 * the first release ships Google-only and the four AUTH_APPLE_* variables are
 * simply absent from the container. Absent must mean "that provider is off",
 * never "fail to boot": the Apple provider below is constructed only inside
 * this check, so nothing reads those variables — or tries to sign a client
 * secret with them — when they aren't there.
 *
 * Turning Apple back on is exactly: set the four variables, redeploy.
 */
export function enabledProviders(): SocialProvider[] {
  const enabled: SocialProvider[] = [];
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    enabled.push({ id: 'google', label: 'Continue with Google' });
  }
  if (
    process.env.AUTH_APPLE_ID &&
    process.env.AUTH_APPLE_TEAM_ID &&
    process.env.AUTH_APPLE_KEY_ID &&
    process.env.AUTH_APPLE_PRIVATE_KEY
  ) {
    enabled.push({ id: 'apple', label: 'Continue with Apple' });
  }
  return enabled;
}

export const isProviderEnabled = (id: SocialProviderId): boolean =>
  enabledProviders().some((provider) => provider.id === id);

/**
 * Lazy config: Apple's client secret has to be signed asynchronously, so the
 * whole config is built per-request (Auth.js caches nothing that matters here).
 */
export const { handlers, signIn, signOut, auth } = NextAuth(async () => {
  const providers: NextAuthConfig['providers'] = [];
  const enabled = enabledProviders().map((provider) => provider.id);

  if (enabled.includes('google')) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID as string,
        clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (enabled.includes('apple')) {
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
