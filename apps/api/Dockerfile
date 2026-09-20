# syntax=docker/dockerfile:1
#
# Build context is the repository root:
#   docker build -f apps/api/Dockerfile -t cartomancer-api .
#
# Runs as uid/gid 1000 with nothing writable outside /tmp, matching the
# cluster's PodSecurityContext (runAsNonRoot, runAsUser/Group 1000,
# readOnlyRootFilesystem).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests first: this layer only busts when a dependency changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# Every workspace manifest, not just this app's: --frozen-lockfile compares the
# lockfile against the whole workspace, so a missing manifest fails the install.
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @cartomancer/api...

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @cartomancer/db generate \
 && pnpm --filter @cartomancer/shared build \
 && pnpm --filter @cartomancer/db build \
 && pnpm --filter @cartomancer/api build

# Flattens the workspace into a self-contained, production-only tree: the
# runtime image then needs neither pnpm nor the rest of the monorepo. The
# Prisma schema, migrations and the compiled seed travel with it, so the same
# image can run `migrate deploy` as a Job before a rollout.
RUN pnpm deploy --legacy --filter @cartomancer/api --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=1000:1000 /out ./

# Numeric, so Kubernetes can verify runAsNonRoot without resolving a username.
USER 1000:1000
EXPOSE 8080

# Fastify writes nothing to disk; logs go to stdout.
CMD ["node", "dist/index.js"]
