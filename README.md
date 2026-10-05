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
`/bff/<path>`, and that route handler forwards them to the api at
`API_INTERNAL_URL`, attaching `INTERNAL_API_KEY` and — only when someone is
signed in — their user id, both read server-side from the Auth.js session. So
the api needs no CORS and a browser cannot claim to be a user it isn't.

The proxy lives at `/bff`, not `/api/bff`, because the Gateway routes `/api` to
the api service; see the deployment contract below.

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

## Checks and tests (#55)

CI runs all of these, in this order, on every push and pull request — static
checks first, so a failure there costs seconds, and the browser last. Each is one
command from the repo root:

```bash
pnpm typecheck      # every package, the web app's tests, and the tooling configs
pnpm lint           # ESLint over the whole workspace, warnings fail
pnpm format:check   # Prettier (pnpm format rewrites)
pnpm --filter @cartomancer/api test   # integration tests, needs a migrated, seeded DB
pnpm test:unit      # Vitest: the web app's own logic, no server
pnpm test:e2e       # Playwright smoke tests: needs `pnpm -r build` and a seeded DB
```

**Lint.** One flat config (`eslint.config.mjs`) for the workspace: `eslint-config-next`
(Core Web Vitals + TypeScript) with `react-hooks/exhaustive-deps` raised to an
error, because a missing dependency in the hand-maintained effect and callback
arrays is a stale closure, not a style note. Warnings fail the build
(`--max-warnings 0`); where the code does something a rule objects to on
purpose, the line carries a directive and the reason beside it.

**Format.** Prettier, with the style the code already had (single quotes, trailing
commas, 100 columns). It covers code and CSS only — the README, JSON and YAML are
hand-wrapped, and the three generated-looking data tables in `packages/shared`
(`countries.ts`, `country-details.ts`, `facts.ts`) are ignored because their layout
carries meaning.

**Unit tests** live next to what they test, as `apps/web/src/**/*.test.ts`. They
run in Node, and a file that needs a browser's storage opts into jsdom with a
`// @vitest-environment jsdom` docblock, so the pure ones cannot lean on a
`window` that is not there. The day-streak and week helpers in the api are
covered the same way by `apps/api/src/lib/progress.test.ts`, on the api's own
runner (`node:test`), with no database. Web tests are *excluded* from
`apps/web/tsconfig.json` and type-checked by `tsconfig.test.json` instead: `next
build` checks every file the first one includes, and the container image does
not install the test runner.

**Smoke tests** (`e2e/`, config in `playwright.config.ts`) start the real api and
the production build of the web app themselves, on ports `18080` and `13000` so a
running `pnpm dev` is left alone, and drive them as a guest on a phone-sized
viewport: a Capitals multiple-choice round to the results screen, and a type-in
round where an exact answer accepts itself and a typo waits for Enter. Guest
play writes nothing, so the tests need no sign-in and leave no rows. After a
failed CI run, the traces and screenshots are attached as the
`playwright-report` artifact. Locally, `pnpm exec playwright install chromium`
once, or set `PLAYWRIGHT_BROWSERS_PATH` to an existing install.

All of the tooling is a root `devDependency`, so the Dockerfiles' filtered
`pnpm install` installs it too: that is the build stage only — the runtime images
are the standalone output and a `pnpm deploy --prod`, which never see it — but it
is real extra work there (a filtered install of the web app goes from 192
packages to about 570). If that ever matters, the way out is a private `tools/`
workspace package that the Dockerfiles do not `COPY`; pnpm's frozen filtered
install tolerates a workspace package that is in the lockfile and absent from the
build context.

## Environment variables

Each app has a commented `.env.example`; the short version:

**`apps/api`** — `DATABASE_URL`, `PORT` (8080), `HOST` (0.0.0.0),
`INTERNAL_API_KEY`, optional `CORS_ORIGIN`, `LOG_LEVEL`.

**`apps/web`** — `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `API_INTERNAL_URL`, `INTERNAL_API_KEY`, `DATABASE_URL`,
`PORT` (3000), `HOSTNAME` (0.0.0.0), plus the four optional `AUTH_APPLE_*`
variables below.

Every sign-in provider is optional and decided per provider from the
environment. `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID` and
`AUTH_APPLE_PRIVATE_KEY` may be absent entirely: the Apple provider is then not
registered, its button is not rendered, and the app boots normally on Google
alone (plus guest mode). Apple needs a paid Developer Program membership, so the
first release ships without it; setting all four turns it back on with no code
change. The same is true of Google — with neither configured, sign-in is simply
unavailable and guest mode still works.

`INTERNAL_API_KEY` must match between the two. Leaving it empty disables the
check: fine locally, where the api logs a warning at boot and carries on, and
impossible in the cluster — with `NODE_ENV=production` an empty key makes the
api refuse to start.

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

### Releasing

**Merging to `main` is the release.** There is no PR to open against the cluster
repo for a routine version bump — CI publishes both images and the cluster picks
them up on its own.

Each build publishes two tags per image, and never `:latest` (everything
downstream pins by digest):

| Tag | Example | Used for |
| --- | --- | --- |
| `<short-sha>` | `abc1234` | `kubectl set image` in the dev namespace |
| `<unix-ts>-<short-sha>` | `1758441419-abc1234` | how the cluster tells which build is newest |

The timestamp is computed **once**, in its own job, and read by every job after
it. That is not incidental: the cluster selects the newest build by sorting that
timestamp and deploys web and api as a pair — the api image runs the migrations —
so the two images must carry the *same* timestamp for a commit. If each job
computed its own `date`, they would differ by seconds and the pair could split.

**The web image knows which commit it is.** The `build` job passes the stamp
job's short SHA to the web image as a `GIT_SHA` build arg, and the home screen's
last line shows it, linking to the commit. The value is the same one the image
is tagged with — from the same job output, not a second truncation — so the
footer and the tag cannot drift, and a bug report from a phone names its build.
The `ARG`/`ENV` pair sits below the `COPY` layers in the Dockerfile's runtime
stage so those keep their cache; only `USER`, `EXPOSE` and `CMD` follow it. It
is deliberately *not* a global `ARG` above the first `FROM`, which is the
placement that would cost something: shared into the build stage, a value that
changes every commit joins that stage's cache key and `pnpm install` and
`next build` stop being cached. Declared only in `runtime`, it cannot reach
them.
A build step asserts that the loaded image really carries it: a typo in the
build arg would otherwise ship a perfectly good image whose footer reads `dev`,
which is also what a local run shows.

**Building and publishing are separate jobs, and that is the point.** The matrix
`build` jobs never touch the registry: each writes its image to a local tarball
and hands it over as an artifact, and the job is not granted `packages: write`,
so no step in it could push even if one tried. The `publish` job `needs` the
whole matrix, so GitHub will not start it unless *both* images built; it loads
both tarballs, logs in, and pushes all four tags. A failing web build therefore
cannot leave a published api image behind, because when web fails nothing has
been pushed at all.

What is left is much smaller and unavoidable: two sequential pushes to two
separate packages cannot be made one atomic operation, so a registry outage
between them can still land web without api. That is a retry rather than a silent
split: **Re-run failed jobs** keeps the stamp job's outputs and the uploaded
tarballs (kept for a day), so it republishes the *same* tags instead of inventing
a new timestamp. It also cannot be caused by our own code failing to build,
which is the failure that actually happens.

What the cluster requires of every build, and what breaks if it stops being true:

1. **Both images, every time.** They are upgraded as a pair; publishing one
   without the other will not deploy — hence the build/publish split above.
2. **Both packages stay public.** The cluster has no pull credential for them.
3. **The api image keeps shipping Prisma**, so the init container's
   `node_modules/.bin/prisma migrate deploy` keeps working.
4. **The sortable tag keeps being published**, on both images, same value.

A merge reaches production in roughly 5–10 minutes with no review and no CI gate
on the cluster side — **this repository's CI is the last thing between a merge
and the live site.** Treat a red build accordingly.

**Reference-data changes** (difficulty tiers, trivia clues, country data) live
in the database, not the image, and the rollout now applies them: the same
initContainer step that runs the migrations seeds afterwards. It used to be a
manual command, and forgetting it cost two days of "No countries match those
filters" on Easy and Hard while production still held the pre-tier data. The
seed upserts on natural keys and never touches progress, so re-running it on
every rollout is safe; `CARTOMANCER_SKIP_SEED` turns it off, and a seed that
fails is loud but does not block the rollout — the api repeats the warning at
boot if the data still looks unseeded.

One thing is *not* automatic:

- **New environment variables or secrets, new routes or ports, and resource
  limits** need a reviewed PR on the cluster side. Ask before building something
  that depends on one.

Migrations run in an init container before the api starts, and a failed
migration stops the rollout with the previous version still serving. That makes
backwards-compatible migrations a requirement rather than a preference: during a
rollout the old code briefly runs against the new schema, so additive changes
are safe and a destructive one (dropping or renaming a column the old code still
reads) needs the usual expand / migrate / contract split across two releases.

### Running migrations in the cluster

The api image carries the Prisma schema, the migrations and the Prisma CLI, so
the same image applies them as a Job or initContainer before a rollout. The
exact command, and the rest of what the cluster and the app have agreed on, is
in **Deployment contract** below.

## Deployment contract

What the cluster commits to, and how the app meets it. Anything here that
differs from the manifest side is called out explicitly.

**Migrations.** The api image satisfies the agreed initContainer command
verbatim, from its default working directory (`/app`):

```sh
/bin/sh -c "node_modules/.bin/prisma migrate deploy"
```

That `.bin/prisma` is a two-line shim the image installs, because `pnpm deploy`
produces no `.bin` entries. It execs
`node_modules/@cartomancer/db/scripts/migrate-deploy.mjs`, which resolves the
Prisma CLI and runs it from the package that holds `prisma.config.ts`, the
schema and `migrations/`. Verified against the deployed bundle.

**That step also seeds**, after the migrations succeed and only for the
`migrate deploy` invocation — the cluster's command is unchanged, but it now
does more than its name says, which is worth knowing when reading its logs.
Reference data lives in the database rather than the image, so without this a
rollout ships code expecting data the database does not have. The seed is
idempotent, keyed on natural keys, and leaves user progress alone. It can be
run on its own with the same effect:

```sh
node node_modules/@cartomancer/db/dist/seed.js
```

`CARTOMANCER_SKIP_SEED=1` skips it. A failed seed prints a warning and leaves
the exit status to the migration, so reference data can never block a rollout;
the api logs the same complaint at boot if every country still shares one
difficulty, which is what an unseeded database looks like from the outside.

**Routing.** Every Fastify route is under `/api/` and receives the full,
unstripped path; none is under `/api/auth/`. Auth.js stays at its default
basePath. `/healthz` is at the root on both services.

| Path | Service | What it is |
| --- | --- | --- |
| `/api/auth/*` | web | Auth.js (default basePath) |
| `/api/*` | api | quiz sessions, answers, recall, summary |
| `/bff/*` | web | the BFF proxy — **not** under `/api`, so the Gateway reaches it |
| `/healthz` | both | probed directly by kubelet, never through the Gateway |
| `/*` | web | the app |

One deviation worth knowing: the browser never calls `/api/*` itself. Client
components call `/bff/<path>` on the web origin, and the web container forwards
that to `API_INTERNAL_URL` in-cluster, which is what keeps the shared secret and
the user id server-side. The Gateway's `/api` → api route therefore carries no
browser traffic in normal use; it is still worth keeping for direct debugging,
and `INTERNAL_API_KEY` is what protects it while it is publicly reachable.

**Server-side rendering** uses `API_INTERNAL_URL` (absolute, in-cluster) for
every server-side fetch, including inside the `/bff` proxy. Browser-side fetches
are relative and same-origin. Both paths go through one wrapper
(`apps/web/src/lib/server-api.ts` and `client-api.ts`).

**Writable paths.** Verified against a container-shaped copy of the build:
nothing is written outside `/tmp` at runtime. The web app root is `/app`
exactly, so the `/app/.next/cache` mount lands where Next would look; in
practice it stays empty, since `isrFlushToDisk` is off and every API read is
`cache: 'no-store'`. The api writes nothing at all. **No additional mounts are
needed.**

**Env vars — one addition to the contract's lists.** `INTERNAL_API_KEY` is
required by **both** containers, and must hold the same value in each. It is not
in the contract's lists, so flagging it here as agreed. The reason: the Gateway
routes `/api` to the api from the public hostname, and the api trusts an
`x-cartomancer-user-id` header to identify the user. Without a shared secret to
authenticate the caller, anyone could read or write another user's progress by
sending that header. With it set, the api rejects every caller that is not the
web container (401), and guest play still works through the proxy.

**An empty key fails closed in production.** With `NODE_ENV=production` the api
refuses to start and exits non-zero, so a missing secret surfaces as a pod that
will not come up rather than one that quietly trusts every caller — a warning is
the wrong terminal behaviour somewhere nobody reads boot logs. Outside
production it still warns and carries on, which is what local development
relies on.

**Sign-in providers are optional, individually.** The web container does not
require the four `AUTH_APPLE_*` variables: absent means the Apple provider is
not registered and its button is not rendered, not that the container fails to
start. The first release is Google-only for that reason (Apple requires a paid
Developer Program membership), and the Apple code is still in place — set the
four variables and redeploy to bring the button back. Nothing in the app's env
validation requires them.

Everything else comes from the contract's lists as given. `HOST` (api) and
`HOSTNAME` (web) default to `0.0.0.0` in the images, so they need not be set.

**Apple's private key.** `AUTH_APPLE_PRIVATE_KEY` is read with literal `\n`
sequences converted back to real newlines before the key reaches the ES256
signer (`apps/web/src/lib/apple.ts`), so the Parameter Store JSON-string form
works as-is.

**Image notes.** The web image is built with pnpm's hoisted node-linker: Next's
standalone output copies `node_modules` as it finds them, and pnpm's default
symlinks point outside the standalone tree, so the image could not resolve
`next` once the workspace was gone. The image also ships a materialised copy of
`.next/node_modules` — Turbopack compiles server externals to a content-hashed
specifier (`@prisma/client-<hash>/runtime/client`) and puts the matching alias
symlinks there; without it the first render that touches Prisma fails with
"Cannot find module". Both were found by running the image's exact file layout
with the build tree deleted.

## How the mechanics work

**Learned and spaced repetition (#50).** Each (user, country, quiz type) in
`progress` carries a review schedule: an interval in days, an ease factor, and
`due_at`. The rules are one pure function, `nextSchedule` in
`packages/shared/src/scheduling.ts`, a simplified SM-2: the first success is due
in 1 day, the second in 6, then each interval is the last times the ease
(starting at 2.5); a wrong answer collapses the interval to nothing (due at once)
and costs ease; a correct answer taken with the type-in hint (#53) changes
neither streak nor interval, is due tomorrow and costs a little ease. How fast an
answer came (`timeTakenMs`, with more allowance for typing than for tapping)
nudges the ease up or down, so slow-but-right is not treated as known.

A country is **learned** when its interval is at least 14 days
(`LEARNED_INTERVAL_DAYS`; active recall, whose single success is the whole claim,
learns at its first, 1 day). With the default ease that is the third unhinted
success in a row (1, 6, 15 days), so it feels the same on the way in, but it is a
statement about retention: a lapse takes it away. `is_learned` and `learned_at`
are recomputed from the interval on every answer (`recordProgress`), never
written on their own, and "newly learned" on the results is `learned_at` inside
the session. `current_streak` is kept as "correct in a row so far". Learned does
not expire by itself while nobody answers: what changes is that overdue
countries are asked first, and one answered wrong is no longer learned. The
migration backfills the schedule from each row's streak (so nobody's progress
moves) with due dates counted from the last answer.

**Rotation.** One pool per (user, quiz type), *not* reset per filter. A
session's questions are the eligible countries (after the region/difficulty
filter) ordered by what is due: countries whose review has come round first, most
overdue first (a miss is due at once, so it leads the next round); then countries
never asked; then the rest, soonest-due first, which is also how a pool smaller
than the round cycles back through itself. Ties are shuffled, which makes each
new cycle feel like a reshuffle. `last_answered_at` is still stamped on every
answer, right or wrong.

**Answer matching.** Exact first: the typed answer is normalised (case,
accents, punctuation, `&`, `St.`/`the`) and compared against the canonical name
or capital and the hand-seeded aliases *for that domain* — a capital question
reads `capital_aliases`, a country question `name_aliases` (#35). Only if
nothing matches exactly does it
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

**Type-in auto-accept.** A correct answer on a type-in question is accepted the
moment it is typed — no Enter, no *Check answer* — which saves a tap per
question on a phone. Only an **exact** match does this: "Canbera" is left alone
and still needs Enter, where the fuzzy pass forgives it, so a player is never
marked wrong half-way through a word. "I don't know" is unchanged.

The browser has to recognise the answer without being given it. Each type-in
question therefore carries `answerHashes` — `sha256(salt + ':' +
normalizeAnswer(form))` for the canonical answer and each accepted alias — plus
a per-payload `answerSalt`; the quiz screen hashes what was typed, 150 ms after
the last keystroke, and compares. No request per keystroke, and the matcher's
normaliser is the shared one, so "exactly right" means the same on both sides.
The hashed set is exactly what the api accepts (`acceptedAnswerForms`,
`apps/api/src/lib/quiz.ts`): the domain's aliases, never the other domain's and
never a `search_alias`, because auto-accepting an answer the server then marks
wrong would be worse than no auto-accept at all.

This is a **deterrent, not a security boundary**, and the alternative (a
debounced `/peek` endpoint) was turned down for the request-per-pause it costs on
a mobile connection (#58). Anyone with DevTools can hash the 195 capitals against
the salt and find the match, and the number of hashes hints at how many spellings
are accepted — which is no harder than looking the answer up, in a game with no
leaderboards. What it does buy is that the answer is not sitting in the page
source. Nothing is *decided* in the browser: a local match submits through the
ordinary answer path and the **server still matches, scores and owns streaks and
`is_learned`**, exactly as it does for a typed Enter.

**Answering is atomic and safe to race (#54).** Recording an answer is one
transaction: the answer row, the streak, the clue's rotation row and the
session score either all happen or none do, so a failure part-way leaves nothing
for a retry to trip over. The transaction takes the participant's row lock first
(`lockParticipant`), which serialises one player's answers to one session: a
second submit of the same question waits for the first instead of racing it, and
the score — a recount of correct answers — never comes up one short when several
questions are answered together. A submit that loses that race is answered like
any other repeat (#58): what the winner recorded, `matchedBy: 'replay'`, not an
error and not a 409 that would tell the player a counted answer had failed. The
streak itself is a single `INSERT … ON CONFLICT DO UPDATE` that increments in
the database, so the same country answered in two sessions at once loses no
answer from the count. Recall guesses take the same path, with the same
duplicate answer for the same country sent twice. A unique-constraint error that
nothing handled is a 409, never a 500. The 195 countries used for
multiple-choice distractors are held in memory for ten minutes rather than read
on every session start and rehydrate.

**"I don't know"** on a type-in question submits an empty answer, so it is
scored and recorded exactly like a wrong guess — streak reset, country on the
missed list — while revealing the correct answer. Giving up teaches something
and still costs what a wrong guess costs.

**Recall entry.** Countries are submitted with the *Add country* button or the
Enter key; both run the same match. A guess that names no country in the region
is refused outright — the counter and the recalled list don't move — and a
duplicate is called out rather than counted twice.

**Recall finishes itself (#67).** Naming the last country in the region ends the
round: the input locks, the counter turns green and says "All 44 countries of
Europe!" for about a second, and the screen moves to the results, which for a
full round read "Perfect — every country recalled" with no "missed" list. "I'm
done" works as before and stays on screen (it is sticky) however long the list
grows. Finishing is idempotent end to end: the screen guards it with a ref, and
`POST /api/recall/:id/finish` stamps `finished_at` only if it is still unset, so
the automatic call racing a tap, or a retried request (#58), leaves one finish
at one moment. A round that is already complete when it loads is *not* finished
on load — that would bounce anyone who pressed Back from the results straight
back to them — it just offers "Show results".

**Guest mode.** A guest has no `user_id`, and there is no synthetic user row.
Starting a quiz returns the same question set with a `guest-…` id and writes
nothing; answers are checked by stateless endpoints (`/api/answers/check`,
`/api/recall/check`) that run identical matching and return `null` where a
streak would be. Session state lives in the browser's `sessionStorage`, so a
guest's play is not merely unpersisted, it is never sent. The persisted
endpoints refuse guests outright.

**Account (#61).** Signed in, the home screen has a round avatar (or initial)
button at the top right; it opens `/account`, which shows the picture, display
name, email, provider and member-since date, the same streak and learned counts
as the home screen, and **Log out**. Guests see none of it — no button, and
`/account` sends them to `/login`, as it does anyone whose session has ended.
Only the display name is editable: `GET /api/me` reads the profile and
`PATCH /api/me` takes `{ name }` and nothing else (a body that names `email` or
`authProvider` is a 400, not a silent no-op). One rule, `displayNameProblem` in
`@cartomancer/shared`, decides what a name may be — 1–50 characters counted as
the player sees them (fifty emoji are fine), no control or invisible
characters — so the form can say so before a request goes out and the api
enforces the same thing. A blank name is stored as null and every screen then
uses the part of the email before the `@`. The name is never kept in the Auth.js
JWT; every screen reads it from `/api/me`, so there is no stale copy to refresh
after saving. The provider's picture is shown with `no-referrer` and falls back
to the initial if it fails — including when it failed before the page hydrated,
which an `onError` handler alone misses.

**Deleting an account (#64).** *Delete account* sits under *Log out* on
`/account`, behind a panel: the player types `DELETE` (any casing — the word
rather than the email, which on a phone is a worse thing to retype, and for an
Apple relay address is random characters) before the final button enables. The
web action re-checks it and `DELETE /api/me` demands `{ "confirm": "DELETE" }`
in its own right, exactly, so a stray request cannot wipe an account. It is one
transaction (`deleteAccount`, `apps/api/src/lib/account.ts`): either all of it
happens or none of it does, and a failure leaves the account intact with an
error on the panel. A repeat is a 204, not an error — the account is gone, which
is what was asked.

What goes: the `users` row, and with it by cascade `accounts` (the provider link,
its tokens and the `id_token`, which carries the email), `auth_sessions`,
`progress`, `fact_progress`, `session_participants` and `session_answers`. Two
things the cascades cannot reach are removed explicitly. **Quiz sessions:**
`quiz_sessions.created_by` is `SET NULL`, so left alone a player's sessions would
outlive them as anonymous rows nothing would ever clean up; a session is deleted
when it was theirs (made or taken part in) and nobody else took part, and one
someone else shared stays, minus this player's rows. **Verification tokens:**
`verification_tokens.identifier` is an email with no foreign key. The Auth.js
session is a JWT with no row, so signing out (which clears the cookie) is the
whole of ending it, and the player lands on `/login?deleted=1` with a notice.

What is *not* deleted, because it is not in the database: **request logs.**
Fastify logs each request's method, URL and remote address (the player's IP is
personal data) and never a user id, header or email — nothing in this repo logs
one — but how long the cluster keeps those logs is the cluster's setting, not
this repository's. There is no analytics. Apple keeps its own record of the
authorisation until it is revoked, below.

**Sign in with Apple.** Apple expects a deleted account to revoke its token. The
web action reads the stored Apple token *before* deleting (it lives in the
`accounts` row that goes), deletes through the api, and only then calls
`POST https://appleid.apple.com/auth/revoke` — after, not before, so a delete
that fails does not leave the player with an account whose Apple authorisation
was already withdrawn. Revocation is best-effort and bounded (five seconds): it
is something the app owes Apple, not something the player is owed, and their data
is already gone, so any failure — Apple down, token refused, Sign in with Apple
since switched off — is logged (the kind of failure only, never a token, the
client secret or an id) and swallowed. It lives in the web app because the Apple
key does; putting it in the api would need new secrets in the cluster, which is a
reviewed change on that side.

**Streaks and stats** on the home screen are derived from `session_answers`
rather than stored: a "day practised" is exactly "a day with at least one
answer". Days are bucketed in the player's timezone (#66), which the web app
now really does pass — it used to say so and not do it, so every day was UTC's,
and a missed day never broke the streak for anyone ahead of UTC. `TimeZoneCookie`
(root layout) keeps the browser's IANA zone in a `tz` cookie on every load; the
server-side helpers (`apiFetch` and the `/bff` proxy) forward it as
`x-cartomancer-timezone` on **every** call rather than only on the ones that show
a streak, and the api reads it with `requestTimeZone` wherever it buckets days
(`/api/summary`, and finishing a quiz, whose results show the streak too). A bad
or missing zone is UTC, never an error. On a first visit the page is rendered
before the cookie exists, so it is rendered once in UTC and then re-requested
once; a later load finds the cookie current and does nothing.

**Adding a quiz type** is a data change: a row in `quiz_types` plus an entry in
`QUIZ_TYPES` in `packages/shared/src/taxonomy.ts` describing its direction.
Rendering branches on category + format (+ direction), never on a specific key.

**Map mode (#52)** is the one format whose answer is not text: a tap on a world
map is sent as the ISO alpha-2 code of the country tapped and judged by exact
comparison (`judgeAnswer`), so there is no matching. The map outlines are a
generated, committed module (`apps/web/src/lib/world-map-data.ts`, Natural Earth
1:50m, loaded on demand when a map question first needs it); regenerate it with
`scripts/generate-world-map.mjs` — the header explains the throwaway install of
its inputs, which are deliberately not dependencies of the repository.

## Placeholders and TODOs

These are the things that are deliberately unfinished, and what finishing them
involves:

- **Difficulty tiers — applied.** The approved hand-drafted split is in
  `packages/shared/src/countries.ts`: 63 Easy, 69 Medium, 63 Hard. Revising it
  is an edit to those values plus a re-seed; nothing branches on a specific
  tier.
- **Trivia clues — 143 of 195.** `packages/shared/src/facts.ts` holds one clue
  per country, so the trivia quiz draws on 143 distinct questions — well beyond
  its longest round. The remaining 52 countries have none yet; appending rows
  and re-seeding is all it takes, and the house rules for writing a playable
  clue are at the top of that file.
- **OAuth apps not registered.** `AUTH_GOOGLE_*` are placeholders; the app still
  has to be created with Google (the redirect URI is documented in
  `apps/web/.env.example`). The login screen offers exactly the providers that
  are configured, and guest mode works regardless.
- **Apple sign-in is off by default.** It needs a paid Apple Developer Program
  membership, so the first release ships Google-only. The code is intact: set
  `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID` and
  `AUTH_APPLE_PRIVATE_KEY` and the provider and its button come back. Apple
  issues no static client secret, so the web app mints the ES256 JWT itself from
  the team id, key id and private key.
- **GHCR package visibility.** After the first successful push, the
  `cartomancer-web` and `cartomancer-api` packages default to private. They need
  to be set to **public** by hand on github.com (package → Package settings →
  Change visibility) so the cluster can pull without an imagePullSecret. This
  cannot be done from CI — it is a setting on the package, not the repository.

### Smaller decisions worth knowing

- **Aliases are split by what they name.** `countries.name_aliases` holds other
  names for the country ("USA", "Holland", "Deutschland"); `capital_aliases`
  holds other names for the capital — a second seat of government ("La Paz",
  "Cape Town", "The Hague"), another spelling or language ("Praha", "Kiev"), or
  a former name of the same city ("Nur-Sultan"). The matcher reads only the
  column belonging to the question's domain, so a capital question is judged
  against the capital and its aliases and never against the country's.
  One column used to hold all of it, consulted whichever way the question was
  asked, which marked "the capital of Australia is Oz", "…of Israel is Tel
  Aviv" and "…of Turkey is Istanbul" correct (#35). The merely famous city —
  Istanbul, Tel Aviv, Dubai, Zurich, Almaty, Dar es Salaam, Belize City, Monte
  Carlo — is in neither: a trainer that accepts it teaches the opposite of its
  job. It lives in a third column, `search_aliases`, which the register's lookup
  box searches and nothing else reads: typing "Istanbul" should still find
  Turkey, and finding a country asserts nothing about it. The first two columns
  are safe to print, which is what lets a country's page show "also known as"
  and a second capital.
- **Flag artwork is vendored** in `apps/web/public/flag-art`, one SVG per
  country, generated by `apps/web/scripts/vendor-flags.mjs` from a pinned
  `svg-country-flags`. The common icon sets normalise every flag to 4x3 or 1x1
  by *clipping* it, which cut the sides off Bosnia and Herzegovina (1:2) and
  Canada's bands — a real bug on a screen that asks you to recognise the flag.
  These keep each flag's official proportions; the answer tiles stay a uniform
  4:3 grid and letterbox the flag inside. Re-run the script after changing the
  country list, and do not hand-edit the files. The renderings are Wikimedia
  Commons' and in the public domain, and are credited on `/credits` with the
  two data sources.
- **Form fields are never smaller than 16px.** iOS WebKit zooms the page in on
  a focused field below that and does not zoom back out, which left the recall
  answer input unusable on an iPhone. The base `input`/`select` rule in
  `globals.css` carries it; the alternative, `maximum-scale=1` in the viewport,
  would also take pinch-zoom away from everyone.
- **Country of the day needs no storage.** The UTC day number indexes a fixed
  permutation of all 195, so everyone sees the same country until midnight UTC,
  each one comes up exactly once per 195-day cycle, and nothing is written or
  cached. The shuffle is a seeded PRNG rather than `Math.random`, because two
  replicas shuffling independently would serve different countries the same
  second; and a permutation rather than `hash(day) % 195`, which collides and
  would show some countries three times a cycle and others never. The list is
  sorted by `isoCode` before shuffling so inserting a country into the middle of
  `countries.ts` cannot silently reorder the rotation. Changing the seed
  reshuffles everything, so it is meant to stay put.
- **The country register sorts itself, and searches both alias lists.**
  `/countries` fetches all 195 rows once and does every filter in the browser,
  so the search box never waits on a round trip. Two things there are
  deliberate. It re-sorts by `localeCompare` instead of trusting the api's
  `ORDER BY name`: Postgres collates by the database's own locale, which on this
  cluster puts Côte d'Ivoire *after* Czechia — invisible to the quizzes, which
  never show a list in order, and plainly wrong in an A-Z register. And it
  searches all three alias columns, because "Holland", "Cape Town" and
  "Istanbul" are each things someone might type into a lookup box — and finding
  a country is not claiming anything about it, which is why `search_aliases` is
  searchable here and accepted nowhere. It prints none of them: a 195-row list
  is for finding a country, and the aliases are shown on the country's own page
  (see the alias bullet below).
- **The home screen has no filters at all, and every card opens a start
  screen.** #15 took the difficulty chip off it, #28 took the region chip too:
  three of the four cards opened screens carrying their own region chip, so the
  home one either duplicated theirs or, for those three, promised something it
  did not do. Countries was the reason it was there — it used to start a round
  straight from the card — and now has its own screen at `/recall`, region chip
  and Play, beside `/recall/[sessionId]` for a round in progress. No filters
  travel on the links any more, so every screen opens on "All regions" and
  nothing off the home screen can narrow a round invisibly.
- **The home stats are links, and the lists behind them count the same way the
  stats do.** Each of the three tiles opens `/learned/:category` (#33), which
  asks `GET /api/progress/:category` for the per-country state and joins it with
  the full country list, so "Learned" and "Not learned yet" together are always
  all 195. The endpoint counts `bool_or(is_learned)` over the category's quiz
  types — the same rule `/api/summary` counts with, and the reason the list's
  total cannot drift from the tile's. Its heading keeps the unfiltered number
  even when the region chip narrows the sections, because that is the number you
  tapped. A guest gets 403 rather than an empty list: an empty list would say
  "you have learned nothing", which is a different thing.
- **A country's page carries five things, and only two of them are fetched.**
  `/countries/:isoCode` (#38) shows the flag, the capital, the population, the
  language(s) and the country's own trivia clues. Capital, flag and clues are
  already in `countries.ts` and `facts.ts`, so the generated
  `country-details.ts` holds just population (World Bank, via
  `datasets/population`, CC BY 4.0) and languages (mledoze/countries, ODbL) —
  both credited on `/credits`, as both licences ask. The credit used to sit
  under every country, where it read as developer notes; #47 moved it to one
  page, reached from the "Sources" link beside the build number in the home
  footer. Dropping the attribution instead would have to be a deliberate
  decision written down here, not a side effect of tidying a page. It is committed rather than
  fetched per request, so a page is instant, works whether or not either service
  is up, and a changed figure shows in a PR diff; refresh it with
  `node packages/shared/scripts/fetch-country-details.mjs`, which fails loudly
  rather than writing a hole. Area, currency and calling code are a line each in
  that script if they are ever wanted — the page is deliberately short, because
  the register is for looking a country up, not for reading an encyclopedia.
- **A missed row is the question and the answer, not the country twice.**
  `correctAnswer` IS the country name for every `*_to_country` quiz, so a
  results row built from the country alone read "Brazil — Brazil" and never
  showed the clue or the flag that was actually missed (#37). `MissedQuestion`
  carries `promptText` — the same string the question carried, rebuilt with the
  same `promptFor` the round used rather than a second expression of the rule —
  and the row renders by category: the flag at 64px for either flags direction,
  the clue stacked over the answer for trivia, prompt and answer on one line for
  capitals. Six countries (Djibouti, Singapore, Luxembourg, Monaco, San Marino,
  Vatican City) still show one name twice on a capitals round, because their
  capital really does share their name.
- **`PlayPicker` is the start screen for a one-mode game**, which since #49 is
  Countries alone: chips, a muted line saying what the round will be, an
  optional note, and one Play button. Play is `.button-primary`, the same
  control as "Try again" on the results screens, and it sits where a mode picker
  puts its first card so all four start screens line up (#36 — it was briefly a
  one-off hybrid: card layout with a primary button's fill, reading as neither).
  Fun facts shared it while its multiple-choice mode was a chip (#42); the chip
  made the one screen with two ways to play look unlike the two others that have
  them, so the mode went back to being a place you tap.
- **One failed request does not end a round.** A TLS/ECH handshake failure on a
  single `POST /bff/sessions/:id/answers` used to replace the whole quiz with
  Chrome's "Failed to fetch" and a link home, losing every answer given so far
  (#58). Three things changed. `client-api.ts` retries a *transport* failure
  twice (300ms, 900ms) — a 4xx or 5xx is an answer and is never retried, and a
  POST only retries if it says so, which is why starting a session does not: a
  second one would be a second round. If it still fails, the question stays on
  screen with the tapped option still marked and the typed answer still there,
  under an inline message and a Try again button. And answering twice is now a
  *replay* rather than a 409: the api returns what it recorded, writes nothing,
  and scores nothing twice, because a request can commit and still never reach
  the browser. `matchedBy: 'replay'` is how a response says it is that reply.
  The results screens follow the same rule: if "Play again" fails, the score
  stays on screen with the error by the button, and only a failure to load the
  results at all — when there is nothing to keep — is the full-screen one.
  The infra half of #58 — ECH configs advertised for the zone that the edge
  cannot honour — lives in the cluster repo, not here.
- **Flag artwork is fetched a question ahead.** An `<img>` only starts loading
  once it is rendered, so every question's flags used to arrive a round-trip
  after the question — 160–500ms on an emulated Slow 4G link, worst in
  Country → flag, where four land at once and a few carry detailed coats of arms
  (`ec.svg` is 177KB against a ~650-byte median). `lib/flag-art.ts` owns both the
  URL and the warming, `QuizRunner` calls it one question ahead, and the two
  places that start a round call it for question one, whose artwork nothing else
  precedes. A bare `new Image()` rather than `<link rel="preload">`: same HTTP
  cache, no element to hide or keep out of the accessibility tree, and no
  "preloaded but not used" warnings when a player leaves a question open.
- **A tapped multiple-choice option marks itself before the answer is checked.**
  The green/red reveal waits on a round-trip to the api, which on mobile data is
  long enough that an unmarked tile reads as a missed tap. `option--pending`
  gives the tapped tile the accent treatment and `option--waiting` dims the rest
  until the result lands. Hover cannot do this job: a phone has no pointer, and
  `.option:disabled` deliberately keeps disabled tiles at full opacity so the
  reveal is not washed out.
- **Region assignment** follows the UN geoscheme for the transcontinental cases:
  Turkey, Cyprus, Georgia, Armenia, Azerbaijan and Kazakhstan are in Asia,
  Russia in Europe.
- **Mode pickers.** Capitals, Flags and Fun facts each get a mode-select screen:
  two directions × two formats for Capitals, three cards for Flags, and one card
  per format for Fun facts. Fun facts is the only one that shows the question-
  count chip, and the only one that sends a guest's clue list with the start
  request (#42, #49). Countries starts a recall round from `PlayPicker`, since
  the region chip is its only input.
- **Fun-facts rotation (#70).** A clue that has been answered does not come back
  until every clue matching the filters has been met once. The api orders the
  matching clues strictly least-recently-met first (`pickClues`): never-met
  clues, those of countries not met at all before those of countries met through
  another clue, then met clues oldest first. A spent pool therefore restarts by
  itself, with nothing to reset. "Met" is recorded **on answer**, never on
  start, so an abandoned round consumes nothing: for a signed-in player in
  `fact_progress` (one rotation for both modes), for a guest in one list per
  browser — `localStorage` `{ factId: lastSeenMs }`, not per region and
  difficulty — sent as `seenFacts` and ignored when signed in. At most one clue
  per country is asked in a round (`session_answers` is keyed by country), so a
  round is capped by the countries that have a matching clue and comes back
  *short* rather than padded with repeats; the player is told ("Only 5 countries
  have a clue matching these filters"). The tail of a cycle can still repeat a
  met clue while an unmet one remains, but only when every remaining unmet clue
  belongs to a country already in that round.
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
