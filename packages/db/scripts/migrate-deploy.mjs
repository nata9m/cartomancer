#!/usr/bin/env node
/**
 * Applies pending migrations, from inside the api container.
 *
 * Intended to be run as a Kubernetes Job or an initContainer against the api
 * image before a rollout:
 *
 *   node node_modules/@cartomancer/db/scripts/migrate-deploy.mjs
 *
 * It exists because the image's dependency tree is produced by `pnpm deploy`,
 * which ships no node_modules/.bin shims — so `prisma` can't be invoked by
 * name. Resolving the CLI entry point works regardless of how the tree is laid
 * out. DATABASE_URL comes from the environment, as prisma.config.ts expects.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const packageRoot = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [cli, ...(args.length > 0 ? args : ['migrate', 'deploy'])], {
  cwd: packageRoot,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
