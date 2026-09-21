import { redirect } from 'next/navigation';
import { IconBrandApple, IconBrandGoogle, IconMap } from '@/components/icons';
import { continueAsGuest, signInWithProvider } from '@/app/actions';
import { auth, enabledProviders, type SocialProviderId } from '@/auth';

export const dynamic = 'force-dynamic';

const PROVIDER_ICONS: Record<SocialProviderId, React.ReactNode> = {
  google: <IconBrandGoogle size={17} stroke={1.9} />,
  apple: <IconBrandApple size={17} stroke={1.9} />,
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/');
  }

  // Buttons come from the providers that are actually registered, so a provider
  // whose credentials are absent — Apple, for the first release — simply isn't
  // offered, rather than being offered and failing.
  const providers = enabledProviders();

  return (
    <main className="app-shell app-shell--centered">
      <div className="app-mark">
        <IconMap size={28} stroke={1.6} />
      </div>
      <div className="centered">
        <h1 className="app-title">Cartomancer</h1>
        <p className="tagline">Learn capitals, countries, and flags — together</p>
      </div>

      {providers.length > 0 ? (
        <div className="provider-buttons">
          {providers.map((provider) => (
            <form
              key={provider.id}
              action={async () => {
                'use server';
                await signInWithProvider(provider.id);
              }}
            >
              <button type="submit" className="button-secondary">
                {PROVIDER_ICONS[provider.id]}
                {provider.label}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <p className="small-muted centered">
          No sign-in providers are configured, so account sign-in is unavailable. Set
          AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET (see .env.example) once the OAuth app is
          registered. Guest mode works regardless.
        </p>
      )}

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
