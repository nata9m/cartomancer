import { defineConfig, devices } from '@playwright/test';

// Smoke tests (#55): the real api and the real production build of the web app,
// against the seeded database, driven in a browser. They catch what unit tests
// cannot — that the screens, the proxy and the api still agree with each other.
//
//   pnpm -r build && pnpm db:seed && pnpm test:e2e
//
// Both servers are started here, on ports of their own so a `pnpm dev` already
// running is left alone; locally an already-running pair on these ports is
// reused. Everything under test is guest play, which writes nothing, so the
// tests need no sign-in and leave no rows behind.

const API_PORT = 18080;
const WEB_PORT = 13000;
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://cartomancer:cartomancer@localhost:5432/cartomancer?schema=public';

export default defineConfig({
  testDir: './e2e',
  // One worker: the tests share two servers and a quiz is a sequence of clicks,
  // not something that gains from being run in parallel with itself.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // A phone, which is the screen this app is designed for.
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node dist/index.js',
      cwd: 'apps/api',
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        DATABASE_URL,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'sh e2e/serve-web.sh',
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        PORT: String(WEB_PORT),
        HOSTNAME: '0.0.0.0',
        API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
        DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-only-secret-not-used-for-anything-real',
      },
    },
  ],
});
