import type { NextConfig } from 'next';

const config: NextConfig = {
  // Required by the container image: a standalone server with its own minimal
  // node_modules, so the runtime stage doesn't need pnpm or the workspace.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

  // @prisma/client must stay external: it loads its wasm query compiler by
  // path. Turbopack emits externals under a content-hashed specifier
  // (`@prisma/client-<hash>/runtime/client`) and creates the matching alias
  // symlink in .next/node_modules — which is why the container image has to
  // ship a materialised copy of that directory; see apps/web/Dockerfile.
  //
  // @cartomancer/db and @prisma/adapter-pg are deliberately NOT listed. A
  // workspace package marked external is left out of the standalone output
  // altogether, which would break the Auth.js Prisma adapter at the first OAuth
  // callback; and every additional external is one more alias the image has to
  // carry, for no gain when the package bundles cleanly.
  serverExternalPackages: ['@prisma/client'],

  // The production filesystem is read-only (readOnlyRootFilesystem: true), so
  // nothing may be written under .next at runtime. Every API read is
  // `cache: 'no-store'` and no route is statically revalidated, so the only
  // writer left would be the ISR flush — turned off here. The image also points
  // .next/cache at /tmp as a belt-and-braces measure; see apps/web/Dockerfile.
  experimental: {
    isrFlushToDisk: false,
  },
};

export default config;
