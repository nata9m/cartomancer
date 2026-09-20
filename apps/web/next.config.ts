import type { NextConfig } from 'next';

const config: NextConfig = {
  // Required by the container image: a standalone server with its own minimal
  // node_modules, so the runtime stage doesn't need pnpm or the workspace.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

  // Prisma's client and engine must stay outside the bundle.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', '@cartomancer/db'],

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
