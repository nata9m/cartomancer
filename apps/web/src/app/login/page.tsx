import { redirect } from 'next/navigation';
import { IconBrandApple, IconBrandGoogle, IconMap } from '@/components/icons';
import { continueAsGuest, signInWithProvider } from '@/app/actions';
import { auth, providerStatus } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/');
  }

  const noProviders = !providerStatus.google && !providerStatus.apple;

  return (
    <main className="app-shell app-shell--centered">
      <div className="app-mark">
        <IconMap size={28} stroke={1.6} />
      </div>
      <div className="centered">
        <h1 className="app-title">Cartomancer</h1>
        <p className="tagline">Learn capitals, countries, and flags — together</p>
      </div>

      <div className="provider-buttons">
        <form
          action={async () => {
            'use server';
            await signInWithProvider('google');
          }}
        >
          <button type="submit" className="button-secondary" disabled={!providerStatus.google}>
            <IconBrandGoogle size={17} stroke={1.9} />
            Continue with Google
          </button>
        </form>

        <form
          action={async () => {
            'use server';
            await signInWithProvider('apple');
          }}
        >
          <button type="submit" className="button-secondary" disabled={!providerStatus.apple}>
            <IconBrandApple size={17} stroke={1.9} />
            Continue with Apple
          </button>
        </form>
      </div>

      {noProviders ? (
        <p className="small-muted centered">
          No OAuth credentials are configured yet, so sign-in is disabled. Set AUTH_GOOGLE_ID /
          AUTH_GOOGLE_SECRET and the AUTH_APPLE_* variables (see .env.example) once the apps are
          registered with Google and Apple. Guest mode works regardless.
        </p>
      ) : null}

      <form action={continueAsGuest} className="centered" style={{ marginTop: 4 }}>
        <button type="submit" className="link-underline">
          Skip for now
        </button>
      </form>

      <p className="small-muted centered">
        Without an account your progress, streak, and learned stats won&rsquo;t be saved
      </p>
    </main>
  );
}
