import { SignJWT, importPKCS8 } from 'jose';

/**
 * Apple doesn't issue a static client secret: it expects a short-lived ES256 JWT
 * signed with the "Sign in with Apple" private key. Auth.js takes a plain
 * string, so it is minted here at boot from the four env vars the operator sets.
 *
 * Six months is Apple's maximum; the app is restarted far more often than that
 * (every image bump), so there's no refresh machinery to maintain.
 */
export async function createAppleClientSecret(options: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}): Promise<string> {
  // Secrets pasted into a single-line env var keep their \n as two characters.
  const pem = options.privateKey.replace(/\\n/g, '\n').trim();
  const key = await importPKCS8(pem, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  const sixMonths = 60 * 60 * 24 * 180;

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: options.keyId })
    .setIssuer(options.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + sixMonths)
    .setAudience('https://appleid.apple.com')
    .setSubject(options.clientId)
    .sign(key);
}

export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/**
 * Tells Apple the player has withdrawn this app's access to their Apple ID
 * (#64). Apple requires it of an app that offers Sign in with Apple and lets an
 * account be deleted: otherwise the app stays listed under "Sign in with Apple"
 * in the player's Apple ID settings long after it has forgotten them.
 *
 * Returns whether Apple accepted it; throws on a network failure or a timeout.
 * The caller treats both as "log and carry on" — the player's data is removed
 * either way — so the timeout is short: someone who tapped Delete should not
 * wait on Apple's availability.
 *
 * `fetchImpl` is a parameter so it can be checked without calling Apple.
 */
export async function revokeAppleToken(options: {
  clientId: string;
  clientSecret: string;
  token: string;
  tokenTypeHint: 'refresh_token' | 'access_token';
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<boolean> {
  const response = await (options.fetchImpl ?? fetch)(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      token: options.token,
      token_type_hint: options.tokenTypeHint,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
  });
  return response.ok;
}
