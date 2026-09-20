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
