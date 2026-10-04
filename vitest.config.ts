import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the web app's own logic (#55): the modules under
// apps/web/src/lib that have behaviour worth pinning and need no server.
//
// Node by default; a file that needs a browser's storage opts in with a
// `// @vitest-environment jsdom` docblock, so the pure ones stay fast and cannot
// lean on a `window` that is not there in the code they are really testing.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
  },
  test: {
    include: ['apps/web/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Every test starts from a clean slate: no stubbed globals, no timers, no
    // storage left over from the one before.
    restoreMocks: true,
    unstubGlobals: true,
  },
});
