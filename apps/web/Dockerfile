# syntax=docker/dockerfile:1
#
# Build context is the repository root:
#   docker build -f apps/web/Dockerfile -t cartomancer-web .
#
# Runs as uid/gid 1000 from /app, per the deployment contract: the only writable
# paths in production are /tmp and /app/.next/cache, so the app root has to be
# /app exactly (Next's standalone output nests it under apps/web by default —
# the runtime stage flattens that).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Next's standalone output copies node_modules exactly as it finds them. Under
# pnpm's default symlinked layout those links point out of the standalone tree
# and into the workspace store, so the copied output cannot resolve `next` once
# the workspace is gone. A hoisted install makes them real directories.
ENV NPM_CONFIG_NODE_LINKER=hoisted

# Every workspace manifest, not just this app's: --frozen-lockfile compares the
# lockfile against the whole workspace, so a missing manifest fails the install.
# tsconfig.base.json is not optional: packages/*/tsconfig.json extend it, and
# `prisma generate` reads the db package's tsconfig to emit its client.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
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

# Turbopack compiles server externals (@prisma/client) to a content-hashed
# specifier such as `@prisma/client-2c3a283f.../runtime/client`, and writes the
# matching alias symlinks into .next/node_modules — which the standalone output
# copies as symlinks into the store, dangling once the workspace is gone. So the
# first render that touches Prisma dies with "Cannot find module". Replace them
# with the real packages here, where the targets still resolve, since COPY
# neither follows symlinks nor overwrites one with a directory.
RUN rm -rf apps/web/.next/standalone/apps/web/.next/node_modules \
 && cp -rLT apps/web/.next/node_modules apps/web/.next/standalone/apps/web/.next/node_modules

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

# Flattened standalone output: server.js and .next land directly in /app.
COPY --from=build --chown=1000:1000 /repo/apps/web/.next/standalone/apps/web ./
COPY --from=build --chown=1000:1000 /repo/apps/web/.next/standalone/node_modules ./node_modules
# Neither static assets nor public/ are traced into the standalone output.
COPY --from=build --chown=1000:1000 /repo/apps/web/.next/static ./.next/static
COPY --from=build --chown=1000:1000 /repo/apps/web/public ./public

# The commit this image was built from, shown in the home screen's footer:
# there is no .git here to read it from at runtime. Last in the stage on
# purpose — it changes every build, so anything above it would be a cache miss
# every time, including the install and `next build` layers. The workflow passes
# the same seven characters the image is tagged with.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

USER 1000:1000
EXPOSE 3000

# Nothing writes to disk at runtime: every API read is `cache: 'no-store'` and
# the ISR flush is disabled in next.config.ts. /app/.next/cache is mounted by
# the cluster anyway, and is the only path Next would ever reach for.
CMD ["node", "server.js"]
