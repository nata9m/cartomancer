# syntax=docker/dockerfile:1
#
# Build context is the repository root:
#   docker build -f apps/web/Dockerfile -t cartomancer-web .
#
# Runs as uid/gid 1000 with nothing writable outside /tmp, matching the
# cluster's PodSecurityContext (runAsNonRoot, runAsUser/Group 1000,
# readOnlyRootFilesystem).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# Every workspace manifest, not just this app's: --frozen-lockfile compares the
# lockfile against the whole workspace, so a missing manifest fails the install.
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @cartomancer/web...

COPY packages ./packages
COPY apps/web ./apps/web
# The Prisma client has to be generated before `next build` traces it, since
# the Auth.js adapter imports it.
RUN pnpm --filter @cartomancer/db generate \
 && pnpm --filter @cartomancer/shared build \
 && pnpm --filter @cartomancer/db build \
 && pnpm --filter @cartomancer/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

# `output: "standalone"` ships its own minimal node_modules; static assets and
# public/ are not traced into it and have to be copied alongside.
COPY --from=build --chown=1000:1000 /repo/apps/web/.next/standalone ./
COPY --from=build --chown=1000:1000 /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=1000:1000 /repo/apps/web/public ./apps/web/public

# The root filesystem is read-only in production. Next.js is configured not to
# flush ISR to disk and every API read is `cache: 'no-store'`, so nothing should
# want this directory — but if some future code path does, it lands in /tmp
# (writable) instead of failing on a read-only mount.
RUN mkdir -p /app/apps/web/.next \
 && ln -s /tmp/next-cache /app/apps/web/.next/cache \
 && chown -h 1000:1000 /app/apps/web/.next/cache

USER 1000:1000
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
