# idea-app

The **IDEA portal** at Bosco Tech: the student-facing site at
[ideabosco.com](https://ideabosco.com), built with SvelteKit, Supabase and
Vercel. It replaced the old static IDEA site, which lived in a separate repo.

The site is **public-first**. Signing in with a Bosco Tech Google account
unlocks more, but browsing does not require it.

## What is in here

Each of these is a subsystem with its own routes under `src/routes/`; `APPS` in
`src/lib/site-manifest.ts` is the registry that maps paths onto them.

| | |
|---|---|
| **IDEA Classroom** (`/classroom`) | Classes, stream, units, assignments, rubrics, grading, roster, check-ins, presentation decks, and a student-facing update log at `/classroom/updates` |
| **Digital notebook** (`/notebook`) | Entries, photos, written notes, folders, and the instructor review console |
| **IDEA Coins** (`/coins`, `/coin-desk`) | The coin economy: a public ledger, and an admin desk for logging, categories, contracts and payouts |
| **IDEA Foundry** (`/foundry`) | Students publish web apps; they are reviewed, then served from a second origin (see below) |
| **GAUNTLET** (`/gauntlet`) | CAD skills challenges, rooms and a leaderboard |
| **GREENLINE** (`/greenline`) | 3D combat racing, with community tracks |
| **VANGUARD** (`/vanguard`) | The legacy arcade game, with cloud saves |
| **Tournaments** (`/tournaments`) | Brackets, live match state and Web Push alerts |
| **FRC Training** (`/frc`) | Training modules, quizzes and completion gates |
| **IDEA Maps** (`/maps`) | A public viewer for where tools live in the building, plus an admin editor |
| **Assignments** (`/assignments/<slug>`) | Standalone HTML assignments, served from `src/lib/legacy/assignments/` |
| **Ported HTML assignments** (`/hx/<docId>`) | A whole document a student works inside, framed by the classroom |
| **Portal shell** (`/`, `/dashboard`, `/admin`) | The homepage launcher, the admin dashboard and site configuration |
| **Archive** (`/archive`, `/fsp`) | Discontinued courses and the concluded Freshman Summer Program |

`/dev/*` holds the development harnesses. They render only when `dev` is true,
404 in production, and need no auth or Supabase.

## Access

- **Public:** the landing page, assignment and reference documents, the coin
  leaderboard, tournaments, VANGUARD, the maps viewer, and short links like
  `/209h`.
- **Signed in** (any role): classroom, notebook, GAUNTLET, GREENLINE, FRC,
  Foundry. `authedPrefixes` in `src/hooks.server.ts` is the list.
- **Admin:** `/dashboard`, `/coin-desk`, `/admin`, the Foundry review queue, the
  maps editor and the moderation surfaces. These answer 404 to everyone else,
  because the existence of a review lane is not public.

Roles (`student`, `teacher`, `visitor`) are derived from the sign-in email
domain. **`teacher` on its own grants nothing privileged** -- every elevated
capability needs an explicit admin grant, checked by `is_admin()` in the
database. See `CLAUDE.md` for the full tier model.

## Stack

- [SvelteKit](https://kit.svelte.dev/) (Svelte 5, runes)
- [Supabase](https://supabase.com/) auth + Postgres, via `@supabase/ssr`
- [Vercel](https://vercel.com/) via `@sveltejs/adapter-vercel`
- One Supabase Edge Function, `supabase/functions/foundry-ingest`

**Two extra origins on the same Vercel project**, both so a document a student
supplies never executes where the session cookies live: `apps.ideabosco.com`
serves Foundry bundles, and a sandbox host serves ported HTML assignments. The
portal's cookies are host-only on `ideabosco.com` and simply do not exist on
either, which is an absence rather than a header. `CLAUDE.md` has the argument.

## Getting started

```bash
npm ci          # not `npm install` -- see below
npm run dev     # http://localhost:5173
```

Copy `.env.example` to `.env` and fill in `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY`. Every other variable is optional: each one missing
degrades its feature to a clear "not configured" response rather than breaking
the build. `.env.example` documents what each is for and which single module
reads it. **Never commit `.env`.**

Sign-in is Google OAuth, so it cannot be exercised against a local Supabase
stack. `/dev/login` is the password sign-in that stands in for it; it 404s in
production.

**Use `npm ci`, not `npm install`.** This repo's `package.json` is tab-indented
and its `package-lock.json` is two-space indented, so `npm install` rewrites the
whole 4,600-line lockfile to match and buries the real change.

**Do not run Prettier.** It is not a project dependency and there is no config,
so it reformats a tab-indented codebase to two-space defaults.

## Scripts

```bash
npm run dev              # dev server
npm run check            # svelte-kit sync && svelte-check
npm test                 # the full suite (vitest, serial -- see tools/run-tests.mjs)
npm run verify:browser   # the /dev routes measured in a real Chromium at 375px and 1440px
npm run build            # production build (Vercel adapter)
npm run preview          # preview the production build
npm run history:index    # the by-subsystem / by-migration indexes over docs/history/
```

The test suite is deliberately narrow: it covers guarantees whose regression
would be **silent** (security boundaries, data visibility, exclusion filters,
migrations over real data). Everything that fails visibly is verified in a dev
harness and a browser pass instead.

## Database

SQL lives in `supabase/migrations/`, sequentially numbered. There is no
migration runner: each file is applied **one at a time**, by hand in the
Supabase SQL editor or through `node tools/apply-migration.mjs <number>`, which
refuses anything but the lowest unapplied file and rolls back on a failed
self-check. Never run `supabase db push` against this project.

Every write goes through a `SECURITY DEFINER` RPC that re-checks the caller;
feature tables carry no client write grants at all, and reads are filtered by
row-level security rather than by a client-side identity filter.

The test fixture is a real embedded Postgres with the real migration files
applied unmodified (`tests/db/harness.ts`).

## Docs

- **`CLAUDE.md`** -- the operating rules for working in this repo, and the
  reasoning behind them. Read it first.
- **`docs/history/`** -- one file per shipped bundle: what changed, what was
  measured, what was left undone. `grep -r` is how you search it.
- **`docs/standards/`** -- the IDEA programme standards (interface, material
  spec, rubrics, verification).
- **`docs/prompt-ledger/`** -- every prompt at the moment it was issued, so a
  second session can tell whether work is already in flight.
