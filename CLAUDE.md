# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

## What this is

`idea-app` is the authenticated foundation for the unified **IDEA portal** at
Bosco Tech. It will replace the existing static IDEA site (GitHub Pages) over
the coming phases. This repo is the new home; the old static repo is separate.

- **Stack:** SvelteKit + Supabase + Vercel
- **Repo:** https://github.com/pina-hash/idea-app
  (intended home is the `mrpina-dev` account; transfer or move the remote there
  when that account is available)
- **Local path:** `C:\idea-app`

## Access model

- **Public tier (no login):** open pages anyone can see. Today this is the
  landing page at `/`. Future public pages slot into this tier.
- **Gated tier (login required):** identity and any save features. Today this
  is `/dashboard`. Unauthenticated users hitting a gated route are redirected
  to `/`.
- **Roles:** `student`, `teacher`, `visitor`, derived from the sign-in email
  domain:
  - `@boscotech.edu` -> `teacher`
  - `@boscotech.net` -> `student`
  - anything else -> `visitor`
- **Role editing:** teachers can change other users' roles. No one can change
  their own role. This is enforced server-side (a guard trigger plus RLS), not
  in client code.
- **Extensible:** roles are intentionally open-ended. Adding a future role
  (for example `parent`) means extending the CHECK constraint and the
  `role_for_email` logic, not a rebuild.

## Auth

Server-side auth uses the current `@supabase/ssr` pattern (not the deprecated
`auth-helpers`):

- `src/hooks.server.ts` creates a per-request server client and runs the route
  guard. It validates sessions with `getClaims()`.
- `src/routes/+layout.server.ts` and `src/routes/+layout.ts` create the
  client for server and browser and expose `supabase` + `claims` to pages.
- `src/routes/auth/callback/+server.ts` handles the Google OAuth code
  exchange.

Sessions are available server-side, so route guards run on the server.

## Environment

Env vars are read via `$env/static/public`:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

See `.env.example`. **Never hardcode keys.** Never commit `.env`.

## Supabase migration convention

- SQL lives in `supabase/migrations/`, sequentially numbered:
  `0001_*.sql`, `0002_*.sql`, ...
- Migrations are applied **manually in the Supabase SQL editor** (no automated
  migration runner yet).
- Migrations should be idempotent where practical (`create or replace`,
  `if not exists`, `drop ... if exists` before `create`).

## Carrying over legacy content

Legacy content from the old static IDEA site is brought over without rebuilding
or modifying its HTML internals. There are two serving patterns. All later
content must follow one of them.

### Public static pattern (no login)

For content anyone may see (for example the VANGUARD game). Copy the files,
unchanged, into `static/`. SvelteKit serves `static/` at the site root, so a
folder copied to `static/vanguard/` is playable at `/vanguard/index.html`.
Legacy assets that use relative paths (VANGUARD loads `audio/...`) resolve
correctly under that folder. Link to it from a public page.

- Proven by: `static/vanguard/` served at `/vanguard/index.html` and
  `static/coins/` (the coin leaderboard) at `/coins/index.html`, both linked
  from `/`.
- Link to the explicit `index.html`: the Vite dev server does not resolve a
  bare directory (`/vanguard/`) to its `index.html` (404 in dev), though Vercel
  does in production. Linking to `/vanguard/index.html` works in both.

### Gated raw-import endpoint pattern (login required)

For content only signed-in users may see (for example assignments). The HTML
must live OUTSIDE `static/` so it is never served publicly. It lives in
`src/lib/legacy/assignments/` and is pulled in at build time via Vite raw
imports (`import.meta.glob(..., { query: '?raw' })`), never runtime `fs` reads,
so it works on Vercel serverless.

A `+server` endpoint is the only way to reach it. It checks the server session
via `locals.claims`: if not signed in it redirects to `/`; if signed in it
returns the original HTML, unchanged, with `content-type: text/html`.

- Registry: `src/lib/legacy/index.ts` (`assignmentSlugs`, `loadAssignmentHtml`,
  `courses`, `rewriteLegacyLinks`).
- Endpoint: `src/routes/assignments/[slug]/+server.ts`, served at
  `/assignments/<slug>`. Slugs are the exact filename without `.html`, case
  preserved, so legacy cross-links map cleanly.
- Index: the `/dashboard` Assignments list is grouped by course (`courses` in
  the registry), mirroring how the legacy `index.html` grouped them. The legacy
  `index.html` itself is not carried over; this replaces it.

### Asset-path strategy for carried-over HTML

Legacy files are served verbatim, but they assume the old GitHub Pages base
path `/IDEA/`. Two mechanisms make those references resolve without editing any
legacy file on disk:

1. **`static/IDEA/` mirror.** The shared root icons (`android-chrome-512x512`,
   `favicon-32x32`, and the `ib-`/`md-`/`md2-`/`sp-` PNGs) are copied into
   `static/IDEA/`, so any absolute `/IDEA/<asset>` reference resolves in
   production. These references are left as-is.
2. **Serve-time `.html` link rewrite.** `rewriteLegacyLinks()` maps inter-page
   links `/IDEA/<name>.html` -> `/assignments/<name>` on the served HTML string
   only (never the source files). It touches `.html` path links only; `/IDEA/`
   icon PNGs and external links (https://, Google Classroom) are untouched.

When adding more legacy HTML, check its references against this: icons under
`static/IDEA/` resolve, `.html` cross-links get rewritten, anything else (for
example a relative favicon, or per-page assets) does not and should be flagged.

### Role-gated endpoint pattern (specific role required)

A variant of the gated pattern that also checks the user's role. The role lives
in `profiles`, not the JWT, so the endpoint looks it up via `locals.supabase`.

- Example: `src/routes/coin-entry/+server.ts` serves the legacy coin entry tool
  (`src/lib/legacy/coin-entry.html`) to teachers only. Signed out -> `/`;
  signed in non-teacher -> `/dashboard`; teacher -> the HTML.
- The dashboard link to it renders only when `isTeacher` is true, but the
  endpoint is the real guard (UI gating is convenience, not security).

## Working conventions

- **No em dashes in user-facing copy.** Use commas, periods, or "to" for ranges.
- **Intent-based, surgical edits.** Change what the task needs and no more.
- **Commit and push every session.** Do not leave work uncommitted.
- **Keep this file current.** When the app gains routes, tiers, roles, env
  vars, or conventions, update CLAUDE.md in the same change. This
  self-maintenance is part of the job.

## Scope guardrails

Phase 1 (done) was the **foundation**: Google login, profiles/roles backend,
and the public-vs-protected route split.

Phase 2 is **carrying over legacy content** without rebuilding it. Slice 1
(done) established the two serving patterns above. Slice 2 (done) fanned them
across all remaining content: every assignment and reference HTML is gated, the
VANGUARD game and coin leaderboard are public, the coin entry tool is gated to
teachers, and the `/IDEA/` asset paths are handled by the `static/IDEA/` mirror
plus the serve-time `.html` link rewrite. No coin economy logic yet. Do not
modify legacy HTML internals.
