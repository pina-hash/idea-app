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

The site is **public-first**: signing in is optional and only unlocks extra
ability, it is not required to browse the portal.

- **Public tier (no login):** almost everything. The landing page at `/` (the
  restored original IDEA index), every assignment and reference doc
  (`/assignments/<slug>`), the VANGUARD game (`/vanguard/`), and the coin
  leaderboard (`/coins/`). Future public pages slot into this tier.
- **Gated tier (login required):** the **teacher-only** dashboard `/dashboard`
  and the teacher-only coin entry tool (`/coin-entry`). Anonymous users are
  redirected off `/dashboard` by `hooks.server.ts`; non-teacher signed-in users
  are redirected to `/` by `dashboard/+page.server.ts` (the role lives in
  `profiles`, so the teacher check happens in the load).
- **Students have no separate dashboard:** the **homepage `/` is the student
  dashboard**. A signed-in student self-selects their 2026-27 class once; it is
  stored in `profiles.section_id` and pinned at the top of `/` (and shown as a
  chip in the header). See "2026-27 curriculum" below.
- **Optional sign-in:** the landing page header has a Google sign-in control.
  Signing in is additive: it unlocks signed-in features (VANGUARD cloud saves,
  pinning your class) and, for teachers, the dashboard. After sign-in from `/`
  the user returns to `/` (`/auth/callback` honors a `next` query param; default
  `/dashboard`).
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

## 2026-27 curriculum

`src/lib/curriculum.ts` is the single source of truth for the live curriculum. It
is **plain data** (no `?raw`/`$lib/legacy` imports) so it is safe in the client
bundle.

- `SECTIONS`: every section. Sections of the same course are modeled separately
  (e.g. `eng1h-sophomore` vs `eng1h-senior`) so a student sees their own. Each has
  an `id`, `course`, `title`, `year` (1-4), `instructor`, `term`, `status`, and an
  optional `assignments` list (empty for the new courses until content exists).
  The **Freshman Summer Program** (`summer-2026`) is the `status: 'live'` "next
  live course"; its title/dates are placeholders to fill in.
- Helpers: `sectionsByYear()` (the curriculum grid), `nextLiveCourse()`,
  `sectionById()`, `selfSelectOptions()` (the picker), `activeCourseCount()`.
- **Per-student class:** a signed-in student self-selects a section on `/`; the
  page writes `profiles.section_id` via the browser Supabase client (allowed by
  the `update own profile` RLS policy) and pins that section. `section_id` is
  free-form text (a `Section.id`), intentionally not a FK, so the curriculum can
  change in code without a migration. Column added by `0003_profile_section.sql`.
- **Archive:** the discontinued 2025-26 courses (IDEA-113/208/303/403) live as
  `ARCHIVE_COURSES` in the same file and render on `/archive`
  (`src/routes/archive/+page.svelte`), linked discreetly from the homepage footer.
  Their assignment bodies are still served by the public `/assignments/<slug>`
  endpoint; the archive page only links to them.

## Supabase migration convention

- SQL lives in `supabase/migrations/`, sequentially numbered:
  `0001_*.sql`, `0002_*.sql`, ...
- Migrations are applied **manually in the Supabase SQL editor** (no automated
  migration runner yet).
- Migrations should be idempotent where practical (`create or replace`,
  `if not exists`, `drop ... if exists` before `create`).

## Carrying over legacy content

Legacy content from the old static IDEA site is brought over without rebuilding
or modifying its HTML internals. There are a few serving patterns. All later
content must follow one of them.

### Public static pattern (no login)

For static content anyone may see with no per-request logic (for example the
coin leaderboard). Copy the files, unchanged, into `static/`. SvelteKit serves
`static/` at the site root, so `static/coins/` is viewable at
`/coins/index.html`. Legacy assets that use relative paths resolve correctly
under that folder.

- Proven by: `static/coins/` served at `/coins/index.html`, linked from `/`.
- Link to the explicit `index.html`: the Vite dev server does not resolve a
  bare directory to its `index.html` in dev (404), though Vercel does in
  production. Linking to `/coins/index.html` works in both.

### Public raw-import endpoint pattern (no login)

For content anyone may see that is served through an endpoint (so it can be
rewritten per request). Assignments use this. The HTML lives OUTSIDE `static/`
in `src/lib/legacy/assignments/` and is pulled in at build time via Vite raw
imports (`import.meta.glob(..., { query: '?raw' })`), never runtime `fs` reads,
so it works on Vercel serverless.

A `+server` endpoint is the only way to reach it. It returns the original HTML
(after `rewriteLegacyLinks`), with `content-type: text/html`. No auth check:
assignments are public.

- Registry: `src/lib/legacy/index.ts` (`assignmentSlugs`, `loadAssignmentHtml`,
  `courses`, `rewriteLegacyLinks`).
- Endpoint: `src/routes/assignments/[slug]/+server.ts`, served at
  `/assignments/<slug>`. Slugs are the exact filename without `.html`, case
  preserved, so legacy cross-links map cleanly.
- Index: the landing page `/` lists every assignment by course (the restored
  original IDEA index). The `/dashboard` also groups them via `courses` in the
  registry. The legacy `index.html` is not carried over verbatim; `/` replaces
  it.

### VANGUARD endpoint (public, with optional cloud-save injection)

The VANGUARD game is served at `/vanguard/` by
`src/routes/vanguard/+server.ts`. The game HTML lives in
`src/lib/legacy/vanguard/index.html` (raw import, byte-identical to the
original); its assets (`audio/`, `dev/`) stay in `static/vanguard/` and resolve
via the endpoint's `trailingSlash = 'always'`.

- Signed out: the game is served verbatim (saves stay in browser localStorage).
- Signed in: a small bootstrap is injected into `<head>` (the serve-time
  injection convention, like `rewriteLegacyLinks`) that seeds the user's cloud
  save into the `vanguard_*` localStorage keys before the game reads them, and
  wraps `localStorage.setItem` to push `vanguard_*` changes to
  `/api/vanguard-save` (debounced + a `sendBeacon` flush on page hide).
- Backend: `src/routes/api/vanguard-save/+server.ts` (GET/POST, cookie-auth via
  `locals.supabase`) and the `vanguard_saves` table
  (`supabase/migrations/0002_vanguard_saves.sql`, own-row RLS keyed on
  `auth.uid()`, mirroring `profiles`). The game file itself is never modified.
- Conflict policy (MVP): on load the cloud snapshot seeds localStorage (cloud
  wins for the user's own data); on change local pushes to cloud
  (last-write-wins). Cross-device score-array merging is not done yet.

### Asset-path strategy for carried-over HTML

Legacy files are served verbatim, but they assume the old GitHub Pages base
path `/IDEA/`. Without editing any legacy file on disk, these mechanisms make
the references resolve:

1. **`static/IDEA/` mirror.** The shared root icons (`MIRRORED_ICONS` in
   `src/lib/legacy/index.ts`: `android-chrome-512x512`, `favicon-32x32`, and
   the `ib-`/`md-`/`md2-`/`sp-` PNGs) are copied into `static/IDEA/`, so any
   absolute `/IDEA/<icon>` reference resolves in production. Left as-is.
2. **Serve-time rewrite (`rewriteLegacyLinks()`).** Applied to the served HTML
   string only, never the source files:
   - Inter-page links `/IDEA/<name>.html` -> `/assignments/<name>`.
   - Bare-filename references to a mirrored icon (for example a relative
     `<link rel="icon" href="sp-android-chrome-512x512.png">`) ->
     `/IDEA/<icon>`. Only an `href`/`src` value that is exactly a mirrored
     filename matches, so an already-absolute `/IDEA/...png` is not doubled.
   - External links (https://, Google Classroom) and other `/IDEA/...` refs are
     untouched.
3. **Exact-path legacy redirects (`hooks.server.ts`).** Old base-path
   directory links that have no home here are redirected (308), scoped to the
   exact path so they never shadow the mirrored icon files (which are served
   directly and never reach the hook): `/IDEA/` -> `/`, `/IDEA/coins/` ->
   `/coins/`, `/IDEA/entry/` -> `/coin-entry`.

When adding more legacy HTML, check its references against this: mirrored icons
(absolute or bare) resolve, `.html` cross-links get rewritten, the three base
paths redirect; anything else (per-page assets, the deferred coin-entry PWA
manifest) does not and should be flagged.

### Role-gated endpoint pattern (specific role required)

A variant of the gated pattern that also checks the user's role. The role lives
in `profiles`, not the JWT, so the endpoint looks it up via `locals.supabase`.

- Example: `src/routes/coin-entry/+server.ts` serves the legacy coin entry tool
  (`src/lib/legacy/coin-entry.html`) to teachers only. Signed out -> `/`;
  signed in non-teacher -> `/`; teacher -> the HTML.
- The dashboard link to it renders only for teachers, but the endpoint is the
  real guard (UI gating is convenience, not security).

## Changelog automation

The site changelog is **auto-generated from git history** and never hand-edited.
`vite.config.ts` exposes a `virtual:changelog` module: at build / dev-server start
it runs `git log` and emits `{ date, note }[]` from each commit's date + subject.
The homepage imports `virtual:changelog` and renders it.

Implication: **commit subjects are user-facing changelog copy.** Write them as
readable changelog lines (the first line of every commit shows up on `/`). There
is no changelog file to update; making a commit is the update.

## Visual theme

The app shell uses the **IDEA Green** program aesthetic. The token set and font
stack are the source of truth; do not invent colors or swap fonts.

- **Tokens:** defined once as CSS variables in `src/app.css` (`:root`).
  Backgrounds `--bg0`/`--bg1`/`--bg2`; semantic colors `--green` (primary),
  `--gold` (special callouts), `--cyan` (metadata: role, timestamps, version),
  `--amber` (warning), `--teal` (in progress), `--violet` (special, sparingly),
  `--white` (body text), `--dim` (secondary/placeholder), `--ice` (disabled).
  The semantic roles are fixed; do not reassign them. Never use pure red, pure
  white (`#FFFFFF`), or pure yellow.
- **Fonts:** `Rajdhani` (display headings, body, input values) and
  `Share Tech Mono` (metadata, button/nav labels, mono chrome), loaded via
  `@fontsource` imports in `src/routes/+layout.svelte`. Never use Arial, Inter,
  Roboto, or system fonts. The landing page `/` and `/archive` additionally use
  `Orbitron` (also `@fontsource`) for display type, matching the original IDEA
  index aesthetic.
- **Shared classes** live in `src/app.css`: the app-shell set (`.wordmark`,
  `.btn`/`.btn.secondary`, `.card`, `.field`, `.hero`, `.eyebrow`, `.app-header`)
  and the `.legacy-index ...` theme (header/hero/course-card/assignment-item/
  picker/changelog/footer) shared by `/` and `/archive`. All `.legacy-index`
  rules are scoped under that wrapper class so they never affect the app shell.
- **Wordmark:** no logo mark exists; use the plain `IDEA` wordmark (green,
  `--glow-green`) in headers and the landing hero. No trailing period or accent
  dot.
- **Background:** a restrained CSS-only scanline + vignette overlay (`.bg-fx`
  in the root layout), disabled under `prefers-reduced-motion`. Legibility
  first; keep ambiance subtle and load light.

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

Phase 2 (done) was **carrying over legacy content** without rebuilding it: the
serving patterns above, with every assignment/reference HTML carried over, the
VANGUARD game and coin leaderboard available, the coin entry tool gated to
teachers, and the `/IDEA/` asset paths handled by the `static/IDEA/` mirror plus
the serve-time `.html` link rewrite. Do not modify legacy HTML internals.

Phase 3 (done) was the **public-first pivot**: the original IDEA index restored
as the public landing page `/`, assignments made public, optional sign-in, and
the first signed-in feature **VANGUARD cloud saves** (see the VANGUARD endpoint
section).

Phase 4 (current) reshapes the portal around the **2026-27 curriculum**: the
homepage is the student dashboard (the dashboard is teacher-only), students
self-select their class (`profiles.section_id`) and see it pinned, the
discontinued IDEA-113/208/303/403 courses moved to `/archive`, and the changelog
is auto-generated from git history. Per-user IDEA Coin login is still deferred:
the coin system lives entirely in Google Sheets / Apps Script, with no Supabase
coin backend yet. No coin economy logic in this repo. Do not modify legacy HTML
internals.
