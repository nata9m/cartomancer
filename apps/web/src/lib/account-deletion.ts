import 'server-only';
import { getPrisma } from './db';
import { createAppleClientSecret, revokeAppleToken } from './apple';

/** A token Apple issued for this player, and which kind it is. */
export interface AppleToken {
  token: string;
  hint: 'refresh_token' | 'access_token';
}

/**
 * The Apple tokens held for a player, read *before* their account is deleted:
 * they live in the `accounts` row that deleting the player removes, so this is
 * the last moment they can be found.
 *
 * The refresh token is preferred, because revoking it withdraws the app's whole
 * authorisation; the access token is the fallback for an account that has only
 * that. Google accounts and players with no stored token yield nothing.
 */
export async function collectAppleTokens(userId: string): Promise<AppleToken[]> {
  const accounts = await getPrisma().account.findMany({
    where: { userId, provider: 'apple' },
    select: { refresh_token: true, access_token: true },
  });
  return accounts.flatMap((account): AppleToken[] => {
    if (account.refresh_token) return [{ token: account.refresh_token, hint: 'refresh_token' }];
    if (account.access_token) return [{ token: account.access_token, hint: 'access_token' }];
    return [];
  });
}

/**
 * Revokes the tokens with Apple, and never fails.
 *
 * Revocation is something the app owes Apple, not something the player is owed:
 * what the player asked for is that their data be gone, and that has already
 * happened by the time this runs. So every failure here — Apple is unreachable,
 * it refuses the token (already revoked, expired), the key is misconfigured — is
 * logged and swallowed, never raised to the player as "deletion failed" over an
 * account that no longer exists.
 *
 * What is logged is the fact and the kind of failure, never a token, the client
 * secret, an email or an id.
 */
export async function revokeAppleTokens(tokens: AppleToken[]): Promise<void> {
  if (tokens.length === 0) return;

  const clientId = process.env.AUTH_APPLE_ID;
  const teamId = process.env.AUTH_APPLE_TEAM_ID;
  const keyId = process.env.AUTH_APPLE_KEY_ID;
  const privateKey = process.env.AUTH_APPLE_PRIVATE_KEY;
  if (!clientId || !teamId || !keyId || !privateKey) {
    // Apple sign-in has been switched off since this player signed in, so there
    // is no key to sign the request with.
    console.warn('apple revocation skipped: sign in with Apple is not configured');
    return;
  }

  try {
    const clientSecret = await createAppleClientSecret({ clientId, teamId, keyId, privateKey });
    for (const { token, hint } of tokens) {
      const accepted = await revokeAppleToken({
        clientId,
        clientSecret,
        token,
        tokenTypeHint: hint,
      });
      if (!accepted) {
        console.warn(`apple revocation was refused for a ${hint}`);
      }
    }
  } catch (cause) {
    console.warn(
      `apple revocation failed: ${cause instanceof Error ? cause.name : 'unknown error'}`,
    );
  }
}
