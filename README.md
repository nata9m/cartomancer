# Cartomancer

A self-hosted geography trainer — capitals, countries and flags — for two
people. Deployed into a Talos Kubernetes cluster by FluxCD from a separate
GitOps repository (`ktmb1/home-ops`); this repository holds the application and
the images it publishes, and nothing about the cluster itself.

Quizzes cover the 195 UN member and observer states, with a region and
difficulty filter, spaced rotation so you see the countries you saw least
recently first, and a "learned" notion built on answer streaks. Signing in with
Google or Apple persists progress; there is also a guest mode that never writes
to the database at all.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js (App Router, TypeScript). Every screen, Auth.js sign-in, and the BFF proxy that fronts the api. Published as `ghcr.io/nata9m/cartomancer-web`. |
| `apps/api` | Fastify + Prisma. Quiz sessions, answer checking, progress. Published as `ghcr.io/nata9m/cartomancer-api`. |
| `packages/db` | Prisma schema, migrations, generated client, seed script. |
| `packages/shared` | Quiz taxonomy, the 195-country reference data, answer normalisation and the request/response contracts both apps use. |

pnpm workspaces; Node 22.

### How the pieces talk

The browser only ever talks to `apps/web`. Client-side calls go to
`/api/bff/<path>`, and that route handler forwards them to the api, attaching
`INTERNAL_API_KEY` and — only when someone is signed in — their user id, both
read server-side from the Auth.js session. So the api needs no CORS, is never
exposed publicly, and a browser cannot claim to be a user it isn't.

`apps/web` touches Postgres directly for exactly one thing: the Auth.js Prisma
adapter (users and linked accounts). Everything else goes through the api.

## Local development

Requires Node 22 and pnpm 10. Postgres 16 with the `pg_trgm` extension —
`docker compose up -d postgres` brings up a matching one.

```bash
pnpm install
pnpm db:up                       # local Postgres on :5432 (or bring your own)

cp packages/db/.env.example packages/db/.env   # DATABASE_URL
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

pnpm -r build                    # shared and db must be built before the seed
pnpm db:migrate                  # prisma migrate dev
pnpm db:seed                     # quiz types, 195 countries, starter trivia

pnpm --filter @cartomancer/api dev    # http://localhost:8080
pnpm --filter @cartomancer/web dev    # http://localhost:3000
```

Sign-in is disabled until OAuth credentials exist (see below), but
**"Skip for now" works immediately** — guest mode exercises every quiz type.

Useful extras:

```bash
pnpm --filter @cartomancer/api test          # integration tests, needs a seeded DB
pnpm --filter @cartomancer/db verify:matching # SQL/TS normalisation parity + fuzzy tuning
pnpm --filter @cartomancer/db studio          # Prisma Studio
```

`apps/web/restart-dev-server.sh` serves the production standalone build locally,
the way the container does (`next start` refuses to run a `standalone` build).

## Environment variables

Each app has a commented `.env.example`; the short version:

**`apps/api`** — `DATABASE_URL`, `PORT` (8080), `HOST` (0.0.0.0),
`INTERNAL_API_KEY`, optional `CORS_ORIGIN`, `LOG_LEVEL`.

**`apps/web`** — `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`,
`AUTH_APPLE_PRIVATE_KEY`, `API_BASE_URL`, `INTERNAL_API_KEY`, `DATABASE_URL`,
`PORT` (3000).

`INTERNAL_API_KEY` must match between the two. Leaving it empty disables the
check, which is fine locally and never in the cluster — the api logs a warning
at boot when it is unset.

## Containers and CI

Two images, both multi-stage, both running as uid/gid 1000 with nothing written
outside `/tmp` (the cluster enforces `runAsNonRoot`, `runAsUser/Group: 1000` and
`readOnlyRootFilesystem`). Build context is the repository root:

```bash
docker build -f apps/api/Dockerfile -t cartomancer-api .
docker build -f apps/web/Dockerfile -t cartomancer-web .
```

`.github/workflows/build.yml` runs the build, typecheck and the API test suite
against a Postgres service container on every push and pull request, then — on
pushes to `main` only — builds both images with buildx and pushes them to GHCR
tagged with the short commit SHA (`ghcr.io/nata9m/cartomancer-web:abc1234`).
No `latest` tag: the Flux repo pins by digest and Renovate opens PRs for new
digests.

### Running migrations in the cluster

The api image carries the Prisma schema, the migrations and the Prisma CLI, so
the same image can apply migrations as a Job or initContainer before a rollout:

```bash
node node_modules/@cartomancer/db/scripts/migrate-deploy.mjs
```

and, for a first-time database, seed the reference data with:

```bash
node node_modules/@cartomancer/db/dist/seed.js
```

The seed is idempotent (every write is an upsert on a natural key), so re-running
it is safe and is how updated reference data — the difficulty tiers below, more
trivia clues — gets applied.

## How the mechanics work

**Learned.** Three correct answers in a row for a (user, country, quiz type)
marks that country learned; one wrong answer resets the streak to zero, which
demotes it again. `is_learned` is never written independently — it is
recomputed as `current_streak >= threshold` on every answer, so it cannot drift.
Active recall is the exception: a single successful recall is enough.

**Rotation.** One shared "last seen" pool per (user, quiz type), tracked by
`progress.last_answered_at` and *not* reset per filter. A session's questions
are the eligible countries (after the region/difficulty filter) ordered by
`last_answered_at ASC NULLS FIRST` — never-seen first, then oldest-seen — so
once you have been through a pool it cycles naturally. Ties are shuffled, which
makes each new cycle feel like a reshuffle. `last_answered_at` is stamped on
wrong answers too, otherwise a missed country would come straight back.

**Answer matching.** Exact first: the typed answer is normalised (case,
accents, punctuation, `&`, `St.`/`the`) and compared against the canonical name
or capital and the hand-seeded aliases. Only if nothing matches exactly does it
fall back to `pg_trgm` similarity, above `FUZZY_MATCH_THRESHOLD` (0.45).

Two guards make that safe, because the threshold alone is not enough —
`similarity('Niger', 'Nigeria')` is 0.56:

1. an answer that exactly names a *different* country is simply wrong, and never
   reaches the fuzzy pass;
2. a fuzzy match counts only if the expected country is the single best trigram
   match in the whole table.

`pnpm --filter @cartomancer/db verify:matching` prints the ranked candidates for
a set of probe guesses (and asserts that the SQL and TypeScript normalisers
agree on all 528 seeded strings), which is how to re-tune the threshold.

**Guest mode.** A guest has no `user_id`, and there is no synthetic user row.
Starting a quiz returns the same question set with a `guest-…` id and writes
nothing; answers are checked by stateless endpoints (`/api/answers/check`,
`/api/recall/check`) that run identical matching and return `null` where a
streak would be. Session state lives in the browser's `sessionStorage`, so a
guest's play is not merely unpersisted, it is never sent. The persisted
endpoints refuse guests outright.

**Streaks and stats** on the home screen are derived from `session_answers`
rather than stored: a "day practised" is exactly "a day with at least one
answer". Days are bucketed in the browser's timezone, which the web app passes
to the api.

**Adding a quiz type** is a data change: a row in `quiz_types` plus an entry in
`QUIZ_TYPES` in `packages/shared/src/taxonomy.ts` describing its direction.
Rendering branches on category + format (+ direction), never on a specific key.

## Placeholders and TODOs

These are the things that are deliberately unfinished, and what finishing them
involves:

- **Difficulty tiers — placeholder.** Every one of the 195 countries is seeded
  `difficulty: 'Medium'`, marked `TODO(difficulty)` in
  `packages/shared/src/countries.ts`. The real split is a hand-drafted,
  roughly-equal three-way tiering that lives with the human. Until it lands the
  difficulty filter is a no-op (any tier other than Medium matches nothing, and
  "All levels" behaves normally). Applying it is a one-file data edit plus a
  re-seed — no schema or query change, since nothing branches on a specific tier.
- **Trivia clues — 10 of 195.** `packages/shared/src/facts.ts` holds a starter
  set so the quiz can be played end to end. The trivia quiz only offers
  countries that have a clue, so it currently caps out at ten questions
  regardless of the 10/20/30 choice. Append rows and re-seed.
- **OAuth apps not registered.** `AUTH_GOOGLE_*` and `AUTH_APPLE_*` are
  placeholders; the apps still have to be created with Google and Apple (the
  redirect URIs are documented in `apps/web/.env.example`). The login screen
  renders both buttons and disables whichever has no credentials, and guest mode
  works regardless. Apple issues no static client secret, so the web app mints
  the ES256 JWT itself from the team id, key id and private key.
- **GHCR package visibility.** After the first successful push, the
  `cartomancer-web` and `cartomancer-api` packages default to private. They need
  to be set to **public** by hand on github.com (package → Package settings →
  Change visibility) so the cluster can pull without an imagePullSecret. This
  cannot be done from CI — it is a setting on the package, not the repository.

### Smaller decisions worth knowing

- **Alias lists do double duty.** `countries.aliases` holds both alternative
  country names ("USA", "Holland") and alternative capitals for states with more
  than one ("La Paz", "Cape Town"), because the schema has one alias column.
  Matching accepts an alias in either direction, so in principle "Cape Town" is
  accepted as a country name. Harmless for a trainer; a second column would be
  the fix if it ever grates.
- **Region assignment** follows the UN geoscheme for the transcontinental cases:
  Turkey, Cyprus, Georgia, Armenia, Azerbaijan and Kazakhstan are in Asia,
  Russia in Europe.
- **Mode pickers.** Capitals, Flags and Fun facts each get a mode-select screen
  (two directions × two formats, and three lengths respectively). Countries
  starts a recall round straight from the home card, since the region chip on
  that screen is its only input.
- **Auth.js sessions are JWTs**, not database rows, because the api is a
  separate service that is handed the user id by the proxy. The adapter's
  `Session` table exists anyway so switching is a config change.
- **`users.auth_provider`** defaults to `'pending'` and is stamped with the real
  provider by the Auth.js `linkAccount` event — the adapter's `createUser` call
  doesn't know which provider is in play.
- **Multiplayer (phase 2) is not built**, but the schema is already
  participant-aware: a match is a `quiz_sessions` row with two
  `session_participants`, and `session_answers.time_taken_ms` is recorded now so
  speed-based scoring has data when it arrives.
