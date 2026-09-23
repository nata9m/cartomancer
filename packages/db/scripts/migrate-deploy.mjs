#!/usr/bin/env node
/**
 * Brings the database up to date with this image, from inside the api
 * container: pending migrations first, then the reference data.
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
 *
 * Why it seeds too: countries, quiz types and trivia live in the database, not
 * the image, so an image whose reference data changed used to need a manual
 * seed after the rollout. Missing it is invisible until someone plays — the
 * difficulty tiers shipped and the live site answered "No countries match
 * those filters" for Easy and Hard for two days, because production still held
 * the pre-tier data. The seed is idempotent (every write upserts on a natural
 * key) and never touches user progress, so running it on every rollout costs a
 * couple of seconds and removes the manual step. Set CARTOMANCER_SKIP_SEED to
 * turn it off.
 *
 * A failed seed is loud but not fatal: migrations still gate the rollout, and
 * refusing to start the api over reference data would turn stale tiers into an
 * outage. The api logs the same warning at boot if the data looks unseeded.
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

// Only the rollout path seeds. Someone running this by hand for `migrate
// status` or `migrate resolve` is inspecting or repairing, not deploying.
const isRollout = args.length === 0 || (args[0] === 'migrate' && args[1] === 'deploy');

if (result.status === 0 && isRollout && !process.env.CARTOMANCER_SKIP_SEED) {
  const seed = fileURLToPath(new URL('../dist/seed.js', import.meta.url));
  const seeded = spawnSync(process.execPath, [seed], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (seeded.status !== 0) {
    console.error(
      '\nWARNING: migrations applied but the seed failed. The database keeps the\n' +
        'reference data it already had, which may not match this image — difficulty\n' +
        'filters and trivia are the usual casualties. Re-run by hand:\n' +
        '  node node_modules/@cartomancer/db/dist/seed.js\n',
    );
  }
}

// Exit status follows the migration alone: it is what must gate the rollout.
process.exit(result.status ?? 1);
