# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

## What this is

`idea-app` is the authenticated foundation for the unified **IDEA portal** at
Bosco Tech, and beyond that the foundation of the **Bosco Tech student
platform**: any Bosco Tech student can sign in, and every student is identified
by their pathway (see "Pathways (0038)" below). It will replace the existing
static IDEA site (GitHub Pages) over the coming phases. This repo is the new
home; the old static repo is separate.

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
- **Signed-in tier (any role):** the **GAUNTLET** CAD skills dojo at
  `/gauntlet` and the **FRC Training** track at `/frc` are open to any
  authenticated user, student or teacher. This is a second gated tier:
  `hooks.server.ts` redirects anonymous users off these prefixes (the guard
  covers a list of authed prefixes, not just `/dashboard`), but no role is
  required to enter. GAUNTLET's teacher-only authoring page
  (`/gauntlet/author`) is gated in that page's load, the same way the
  dashboard is. See the "IDEA // GAUNTLET" and "FRC Training track" sections
  below.
- **Students have no separate dashboard:** the **homepage `/` is the student
  dashboard**. A signed-in student self-selects their 2026-27 class once; it is
  stored in `profiles.section_id` and pinned at the top of `/` (and shown as a
  chip in the header). See "2026-27 curriculum" below.
- **Homepage app launcher:** the old stacked promo callouts are replaced by a
  curated app grid (`src/lib/AppLauncher.svelte`, registry + layout helpers in
  `src/lib/portal-apps.ts`): groups Games / Tools / Class, teacher-only tools
  filtered by role, the GAUNTLET card offering sign-in when anonymous. The
  default (unconfigured) view is the clean curated grouping; signed-in users
  can pin favorites, reorder within groups, collapse groups, and toggle a
  compact view, persisted to `profiles.preferences.homepage` (anonymous
  visitors can collapse/compact for the session only, unsaved). The "next
  live course" promo callout stays above the launcher.
- **Optional sign-in:** the landing page header has a Google sign-in control.
  Signing in is additive: it unlocks signed-in features (VANGUARD cloud saves,
  pinning your class) and, for teachers, the dashboard. After sign-in from `/`
  the user returns to `/` (`/auth/callback` honors a `next` query param; default
  `/dashboard`).
- **Roles:** `student`, `teacher`, `visitor`, derived from the sign-in email
  domain (`role_for_email` in 0001; any `@boscotech.net` account is a student
  regardless of pathway):
  - `@boscotech.edu` -> `teacher`
  - `@boscotech.net` -> `student`
  - anything else -> `visitor`
- **Role editing:** teachers can change other users' roles. No one can change
  their own role. This is enforced server-side (a guard trigger plus RLS), not
  in client code.
- **Global profiles (0020):** `profiles` also carries `display_name` (user
  editable), `avatar` (`preset:<id>` from `AVATAR_PRESETS` in
  `src/lib/profile.ts`, `upload:<path>` in the public `avatars` Storage bucket,
  or null to fall back to the Google `avatar_url`, then initials), and
  `preferences` (free-form JSONB: homepage layout, theme, ...). The root
  `+layout.server.ts` loads the signed-in profile once as `userProfile` (a key
  no page load shadows) so it is in `page.data` everywhere;
  `src/lib/ProfileMenu.svelte` (mounted in every page header: homepage,
  archive, dashboard, GAUNTLET Header, VANGUARD history) is self-contained,
  reads it from `$app/state`, and inline-edits name/picture through the
  browser client under the existing "update own profile" RLS policy. Uploads
  write only to the user's own `<uid>/` folder (Storage RLS). Role assignment
  is untouched. Shared sign-out (including the lab-machine VANGUARD wipe)
  lives in `signOutEverywhere()` in `src/lib/profile.ts`.
- **Pathways (0038):** every Bosco Tech student is identified by their pathway,
  one of six: IDEA, ACE, BMET, CSEE, MSET, MAT. Stored in `profiles.pathway`
  (text + CHECK like `role`, nullable; `0038_profile_pathway.sql`), unset until
  the student chooses it. **Identity and attribution ONLY, never an access
  gate:** no route, policy, or feature may branch access on pathway, and it is
  independent of the email-domain role. No new RLS: students set their own via
  the existing "update own profile" policy; teachers see and change any
  student's via the existing "teachers select/update any profile" policies
  (the "Students & Pathways" roster on `/dashboard`, with filter and per-row
  editor). The registry `src/lib/pathways.ts` (plain data, client-safe) owns
  the fixed identity palette and inlined lucide icons: IDEA green `#00FF41`
  box, ACE orange `#FF8C00` building-2, BMET purple `#B47CFF` dna, CSEE blue
  `#3D7DFF` cpu, MSET red `#FF2E2E` hexagon, MAT yellow `#FFE600` aperture.
  **Display rule:** `src/lib/PathwayChip.svelte` is the colored pill (icon +
  short label, color never alone) shown BESIDE the profile image, never
  replacing it, and the display name tints in the pathway color. Applied in
  ProfileMenu (trigger + panel, so every header shows it) and the GAUNTLET
  leaderboard boards (`gauntlet_leaderboards()` returns `pathway` since 0038;
  the web side treats it as optional so it fails soft pre-migration, as does
  the root layout's profile select). `src/lib/PathwayPicker.svelte` is the
  one-time first-login picker, mounted once in the root layout: it renders
  only for a signed-in STUDENT with no pathway, persists the choice, and never
  prompts again ("Choose later" hides it for the browser session only).
  **Color discipline:** MSET red `#FF2E2E` is identity only, never a status
  color; the reserved status crimson `#FF3355` (LIVE / REC / error) is never
  an identity color. Dev harness: `/dev/pathways` (404 in production) renders
  chips, tinted identity rows, the discipline strip, and the REAL root-layout
  picker against a stubbed student profile.
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

### VANGUARD is unfrozen and editable (standing rule)

The byte-identical "never modify legacy HTML internals" freeze was a
migration-phase safeguard. It is now **retired for VANGUARD specifically**:

- `src/lib/legacy/vanguard/index.html` is the **editable, canonical** VANGUARD
  source. Game-feature edits to it (controls, settings UI, etc.) are allowed and
  expected; idea-app is VANGUARD's home now.
- Edits must stay **surgical**: change the smallest unique chunk needed, no
  full-file rewrites, no reformatting or churn in untouched code.
- The `vanguard_*` localStorage key/pattern remains the state convention; the
  serve-time cloud-save injection (`src/routes/vanguard/+server.ts`) only depends
  on those keys, so it keeps working as the game evolves. New input/preset state
  uses the same pattern (for example `vanguard_preset`).
- The freeze **still applies to every other carried-over legacy file** (the
  assignments, coin tools, etc.). Do not modify those internals unless they are
  likewise explicitly unfrozen here first.

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
`src/lib/legacy/vanguard/index.html` (raw import). It is the **editable
canonical source** for the game (see "VANGUARD is unfrozen" above); its assets
(`audio/`, `dev/`) stay in `static/vanguard/` and resolve via the endpoint's
`trailingSlash = 'always'`.

- Signed out: a minimal "sign in to sync" pill is injected; saves stay in
  browser localStorage (the game logic is untouched).
- Signed in: a small bootstrap is injected into `<head>` (the serve-time
  injection convention, like `rewriteLegacyLinks`) that **merges** the user's
  cloud save into the `vanguard_*` localStorage keys before the game reads them,
  wraps `localStorage.setItem` to push changes to `/api/vanguard-save`
  (debounced + a `sendBeacon` flush on page hide), and renders a floating
  cloud-save widget (status pill + device-class tag + manual Back up / Restore).
  Back up forces an immediate push; Restore re-merges the cloud save into this
  device and reloads.
- Backend: `src/routes/api/vanguard-save/+server.ts` (GET/POST, cookie-auth via
  `locals.supabase`) and the `vanguard_saves` table
  (`supabase/migrations/0002_vanguard_saves.sql`, own-row RLS keyed on
  `auth.uid()`, mirroring `profiles`). The injection touches only `<head>` and
  the `vanguard_*` keys, never the game's own logic, so it stays decoupled from
  game-feature edits to the file.
- **Smart merge** (`src/lib/vanguard-save.ts`, the server-canonical logic;
  mirrored as compact JS inside the injection because the seed must run
  synchronously before the game reads localStorage). Saves are a structured v2
  blob: shared `progression` + per-device-class `prefs` (`mobile`/`desktop`).
  - PROGRESSION (`vanguard_build`, `vanguard_scores`, `vanguard_games`,
    `vanguard_tutdone`) merges across all devices: max each upgrade, union
    unlocked weapons, merge+dedupe+top-10 the score list, max the games counter.
  - PREFERENCES (settings, keybinds, gfx, mute, mode, sfx levels, ...) are stored
    per device class, last-write-wins within a class, so mobile and desktop stay
    separate.
  - DEVICE-LOCAL (`vanguard_did`) is never synced.
  - Legacy v1 flat rows normalize to v2 on read (`normalizeStored`); the `data`
    column is `jsonb` so no migration was needed.
- **In-game nav + identity:** the endpoint injects a fixed top-right nav chip
  (a "IDEA" home link, plus the signed-in player's avatar + name) so a player can
  leave the game and confirm their account, styled like the existing cloud-save
  widget.
- **Cross-device run save/resume (`0032`, reworked to one-run-per-mode in
  `0037`):** distinct from the between-run progression sync above, a signed-in
  player can quit an in-progress run on one device and resume it on another. The
  game captures a MINIMAL sector-boundary checkpoint (loadout + sector + score +
  coins/lives + a `continued` flag) via `window.__ideaCaptureRun` when it
  launches into a new sector (`launchFromRefit`), and clears it at run end
  (`endRun`); the injection persists it to the owner-scoped `vanguard_run_state`
  table through `/api/vanguard-run-state` (GET/POST/DELETE) and calls
  `window.__ideaRestoreRun` to rebuild a valid play state. It is a checkpoint,
  not a per-frame snapshot (enemies/bullets are transient and rebuild for the
  sector); both game hooks are guarded so a bad payload can never break normal
  play, and the checkpoint I/O is signed-in only. (This supersedes the earlier
  decision to omit mid-run resume; the checkpoint approach sidesteps the
  non-deterministic-RNG problem by restarting the sector rather than replaying
  it.)
  - **One saved run PER MODE (`0037`).** `vanguard_run_state` was rebuilt with a
    COMPOSITE primary key `(user_id, mode)` (dropped + recreated; the checkpoint
    is ephemeral, so no data was preserved), so a player holds one in-progress
    run for NORMAL and a separate one for HARDCORE. Only rankable modes
    (`normal`/`hardcore`) own a slot; dev/tune/calib are rejected. The API upserts
    on `(user_id, mode)` with the mode derived from `snapshot.gameMode`, DELETEs
    only the caller's given mode (query param), and GET returns the ARRAY of a
    user's saved runs. Death/run-end threads `gameMode` into the clear so a
    HARDCORE death never wipes a saved NORMAL run and vice versa.
  - **Title-screen entry point.** The old top-right "Resume S<n>" nav button is
    retired. The page load selects ALL of the user's rows and injects them as
    `window.__ideaRunStates`; the game's title screen renders a prominent per-mode
    RESUME card (gold callout, green NORMAL / cyan HARDCORE, never the hardcore
    red) for each saved run at Sector 2+, and clicking one calls
    `__ideaRestoreRun` with that mode's snapshot. A resumed run sets the
    `continued` flag true (rides every later checkpoint and the score submit as
    `cont=1`; a clean run submits `cont=0` — the leaderboard ignores it for now,
    this only establishes the data flow). A dev-only `?mockresume=1` flag seeds
    sample run states so the cards can be eyeballed without a live checkpoint.

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

## IDEA // GAUNTLET (CAD skills dojo)

GAUNTLET is a **container for multiple CAD challenge modes**, not a single game.
Students enter to train SolidWorks skills, get scored, and level up over time
("enter weak, leave strong"). The full intent lives in `docs/GAUNTLET.md` (the
north star, read it before extending GAUNTLET). Summary of what exists:

- **Six modes, two families.** Modeling modes (Speedrun, Reverse Engineer,
  Feature Golf) read part geometry from a later SolidWorks VBA macro; knowledge
  modes (Drawing Reading, GD&T and Tolerance, Spot the Error) are web only and
  answer-graded. The catalog is `src/lib/gauntlet.ts` (plain data, like
  `curriculum.ts`, client-safe). **All six modes are live** (Drawing Reading,
  Speedrun, Reverse Engineer, Feature Golf, GD&T and Tolerance, Spot the Error).
- **Routes** (all under the signed-in `/gauntlet` tier):
  - `/gauntlet`: dojo landing + mode-select grid. Teachers also see an
    authoring entry point.
  - `/gauntlet/drawing-reading` and `/.../[id]`: the knowledge mode end to end
    (drawing + question, answer, server-graded submit, per-challenge board).
  - `/gauntlet/speedrun` and `/.../[id]`: the modeling mode end to end
    (reveal-on-start drawing + submit code, macro-verified ranked run over
    Realtime, manual practice fallback, per-challenge board). See "Speedrun".
  - `/gauntlet/speedrun/quickstart`: student-facing quick-start for the
    SolidWorks "IDEA // GAUNTLET" add-in (VIEWPORT-styled reference page, one tap
    from the Speedrun list and the play-screen framing).
  - `/gauntlet/reverse-engineer` and `/gauntlet/feature-golf` (+ `/.../[id]`):
    the other two modeling modes, sharing `ModelingRun.svelte`. Reverse Engineer
    is untimed (scored on form deviation); Feature Golf ranks on feature count.
  - `/gauntlet/gdt-tolerance` and `/gauntlet/spot-the-error` (+ `/.../[id]`):
    the two web-only knowledge modes, sharing `KnowledgePlay.svelte`, graded
    through `gauntlet_submit` like Drawing Reading.
  - `/gauntlet/tools`: download + setup for the SolidWorks capture macro.
  - `/gauntlet/author` (+ `/new`, `/[id]`): the teacher-only authoring tool, the
    create/edit/publish/delete surface across all six modes. See "Authoring".
  - `/gauntlet/rooms` (+ `/[id]`): live synchronized Speedrun rooms (host +
    racers/spectators, Realtime). See "Live Rooms".
  - `/gauntlet/leaderboard`: the overall standings, reachable from the dojo
    landing and the FeatureManager nav. See "Leaderboards".
  - Shared header: `src/lib/gauntlet/Header.svelte`.
- **Data model** (`supabase/migrations/0004_gauntlet.sql`), built to serve all
  six modes so later modes need no schema rework:
  - `gauntlet_mode` enum over the six modes (kept in sync with
    `GauntletModeId` in `src/lib/gauntlet.ts`).
  - `challenges`: `id`, `mode`, `title`, `difficulty` (1 to 5), `asset_ref`,
    `status` (`draft`|`published`|`archived`, since 0009; `published` is now a
    trigger-derived boolean from it, so all existing published-based gating is
    unchanged), `author_id`, timestamps, and the spec's single JSONB payload
    **split into two columns**, `prompt` (public) and `answer` (private). The
    split exists so a column-level `GRANT` can expose the public framing to
    students while withholding the answer entirely. Knowledge-mode drawings are
    public (`prompt->>'drawing'`); the Speedrun drawing is hidden in
    `answer->>'drawing'` for reveal-on-start (see "Speedrun" below).
  - `submissions`: `id`, `user_id`, `challenge_id`, `mode`, `value` (JSONB),
    `is_correct`, `score_metric` (numeric, **lower always ranks better**; the
    metric is per-mode: elapsed seconds for Speedrun/knowledge, feature count for
    Feature Golf, mean percent deviation for Reverse Engineer),
    `source` (`'manual'`|`'macro'`, since 0006), `created_at`.
  - `gauntlet_run_tokens` (since 0006): single-use, expiring Speedrun submit
    codes bound to `(user_id, challenge_id)` with a server-side `reveal_at`. No
    client grant; only the reveal / macro-submit RPCs touch it.
  - `gauntlet_leaderboard`: a **view** (not a table), best submission per user
    per challenge, ranked `is_correct DESC, score_metric ASC, created_at ASC`.
    It runs with owner privileges (NOT `security_invoker`) so every player sees
    the whole board, and exposes only board-safe columns (no raw answers). It is
    **mode- and source-aware**: modeling modes rank only PASSING **macro**
    submissions (since 0006), so the modeling boards are machine-verified and
    manual entries are unranked; knowledge modes keep every attempt, so Drawing
    Reading is unchanged. Each mode stores its own `score_metric` (lower better),
    so the single ordering works for all; an elapsed-time tiebreak (from
    `value->>'elapsed_ms'`) was added in 0007 for Feature Golf ties.
- **Security model** (this is the important part to preserve):
  - Students read published challenge **prompts** and the board, and read their
    own submissions. They can never read an `answer` column (no client grant),
    and they cannot insert submissions directly.
  - **Grading is server-side and authoritative.** Submissions are written only
    by the `gauntlet_submit(p_challenge_id, p_value, p_elapsed_ms)` SECURITY
    DEFINER RPC, which reads the hidden answer, grades, and inserts with
    `user_id = auth.uid()`. Direct client inserts are blocked so a student
    cannot forge `is_correct` or a zero time. This is the "block direct client
    inserts where appropriate" guidance applied to grading.
  - Teachers (the `profiles.role` from 0001, via the reused `is_teacher()`)
    author challenges, gated by RLS. Any future staff cross-user write (e.g. a
    teacher entering a student's measured mass) routes through a SECURITY
    DEFINER RPC, never a direct client write.
- **Verification principle (modeling modes):** verify on **volume** internally
  (geometric, material-independent) but present challenges in TooTallToby
  convention (material, density, target mass). Manual mass entry is supervised
  practice; the **macro is the ranked path**, verifying on volume. Capture
  surface area and feature count for audit.
- **Speedrun** (`0005` manual practice, `0006` macro): the first modeling mode.
  The dimensioned **drawing is in the hidden `answer` column** (never in the page
  load), so it is unfetchable before Start. **Ranked path (macro):**
  `gauntlet_speedrun_reveal(id)` reveals the drawing AND mints a single-use,
  ~30-min submit code with a server-side `reveal_at` (in `gauntlet_run_tokens`).
  The SolidWorks macro (`static/gauntlet/idea-gauntlet-speedrun.bas`) reads the
  part and POSTs to `gauntlet_macro_submit(code, volume_mm3, ...)` via PostgREST
  with the **public anon key** (the code is the credential, so it is granted to
  `anon`). That RPC computes **elapsed = now() - reveal_at** (server-stamped, no
  client clock to tamper with; binding the geometry to the reveal stays
  supervised-trust, see `docs/GAUNTLET.md`), verifies on **volume** vs
  `answer->>'target_volume_mm3'` within tolerance, marks the code used, and
  inserts `source = 'macro'`. The play screen subscribes via **Realtime** to its
  own submissions so the result + board update live. **Practice (manual):**
  `gauntlet_submit` still grades a typed mass and records `source = 'manual'`,
  which the leaderboard view does not rank. Demo seeds are placeholders marked
  `demo`. The macro's **Author capture** mode prints canonical geometry for
  seeding real challenges. See `docs/GAUNTLET.md`.
- **Reverse Engineer + Feature Golf** (`0007`): two more modeling modes reusing
  the macro unchanged. `gauntlet_macro_submit` now selects `score_metric` by mode
  (Speedrun time, Feature Golf `feature_count`, Reverse Engineer mean percent
  deviation of volume + surface area) while verifying pass/fail on volume for
  all; `gauntlet_speedrun_reveal` mints the token for any modeling mode. Reverse
  Engineer is untimed and shows its `reference` in the public `prompt`; Feature
  Golf gates its drawing behind Start like Speedrun (`feature_count` is a raw
  tree count, gameable, acceptable for v1, see `docs/GAUNTLET.md`). Both use the
  shared `ModelingRun.svelte`. See `docs/GAUNTLET.md`.
- **GD&T and Tolerance + Spot the Error** (`0008`): the last two knowledge modes,
  web-only and graded like Drawing Reading through `gauntlet_submit`. Its
  knowledge branch now grades by answer `type`: `choice` (exact id, the default,
  so Drawing Reading is unchanged), `text` (case/space-insensitive), and
  `numeric` (within an optional `tolerance`). The prompt carries either `options`
  (multiple choice) or an `input` (text/numeric). Both share `KnowledgePlay.svelte`.
  Single answer per challenge for v1; Spot the Error is pick-the-numbered-callout
  (click-to-locate is a v2). See `docs/GAUNTLET.md`.
- **GD&T content seed** (`0011`): 20 real GD&T and Tolerance challenges (symbol
  ID, frame anatomy, datum precedence, fits, MMC/LMC, bonus/virtual condition)
  seeded as **drafts** for teacher review and publish in the authoring UI. They
  reuse the existing knowledge contract unchanged (no grading or component
  change): multiple choice grades by option id, numeric by numeric value. Each
  carries a `slug` in the public `prompt` (harmless to expose) which is the
  idempotency key, so re-running never duplicates. `asset_svg` maps to
  `prompt->>'drawing'` (rendered inline by `Asset.svelte`); a null drawing shows
  no art. The source listed every correct choice first, so option order is
  rotated deterministically to distribute the answer across positions. Drawings
  use the 0008 palette resolved to **concrete hex** (because `var()` and bare
  font names are unreliable inside `{@html}`-injected SVG): frame and tolerance
  text `--white` `#e8ffe8`, characteristic symbol `--cyan` `#00f0ff`, circled M
  `--gold` `#c8ff00`, datum letters `--green` `#00ff41`, font Share Tech Mono
  with a `monospace` fallback. The provenance source `gauntlet_gdt_seed.json`
  lives at the repo root (not `static/`, so it is never publicly served).
- **Spot the Error content seed** (`0012`): 15 real Spot the Error challenges
  seeded as **drafts** for teacher review and publish, mirroring the 0011 GD&T
  seed in mechanism. Same knowledge contract, no grading/route/component change:
  the 0008 knowledge branch already grades `spot_the_error` by option id and
  returns the explanation, and the mode already routes through `KnowledgePlay`.
  Two question shapes, both multiple choice: pick-the-flawed-callout (options
  `'1'..'4'`, the option id IS the callout number) and identify-the-problem
  (descriptive options, lettered ids). Option order is preserved **verbatim, no
  rotation** (numbered callouts must read in order; descriptive answers are
  already distributed). Drawings are author-styled to the program palette and
  inserted as-is into `prompt->>'drawing'`. The source file labels the mode
  `spot_error`, but the migration uses the real enum value `spot_the_error`.
  `slug` is the idempotency key; the provenance source `gauntlet_spot_seed.json`
  lives at the repo root (not `static/`, so the answer key is never served).
  `0013` patches one stale explanation on `spot-undefined-datum` (the rebalance
  renumbered the answer to callout 4 but the prose still said "Callout 1");
  `jsonb_set` touches only `answer.explanation`, grading was unaffected.
- **Authoring** (`0009`): the teacher-only web tool that replaces hand-edited SQL
  seeds. A `status` column (draft/published/archived) drives a trigger-derived
  `published`, so all existing gating is unchanged and students never see drafts
  (default draft). Direct client DML on `challenges` is **revoked**; all writes go
  through SECURITY DEFINER RPCs (`gauntlet_author_upsert` / `_set_status` /
  `_delete` / `_get`) that re-check `is_teacher()` and validate required fields
  **per mode** before publish (`gauntlet_publish_blocker`). Delete soft-deletes
  (archives) when submissions exist. The mode-aware `ChallengeForm.svelte` writes
  the exact existing payload shapes; modeling modes have a paste box for the
  macro's Author-capture output. Assets upload to a public `gauntlet` Storage
  bucket (gated drawings still live in the hidden `answer`, revealed on Start);
  `Asset.svelte` renders inline SVG or an uploaded `<img>`. See `docs/GAUNTLET.md`.
- **Live Rooms** (`0010`): a synchronized orchestration layer over Speedrun (v1,
  single round), not a new mode. A room run is a **normal submission tagged with
  `room_id`** (added to `submissions` + `gauntlet_run_tokens`), so it also hits
  the global board. `gauntlet_rooms` / `gauntlet_room_participants` hold the
  session + roster. Host-only SECURITY DEFINER RPCs (`gauntlet_room_create` /
  `_set_challenge` / `_start` / `_set_state`, enforced by `host_id`): **Start sets
  one authoritative `started_at` and bulk-mints a token per racer** with
  `reveal_at = started_at` (shared clock). The drawing stays gated in `answer`,
  handed back only by `gauntlet_room_reveal` once live. Students join by code
  (`gauntlet_room_join`; late join = spectator); they submit by the macro
  (`gauntlet_macro_submit`, now copies the token's `room_id`) or
  `gauntlet_room_manual_submit` (elapsed computed server-side from `started_at`,
  verified on mass). **Manual ranks in a room** (host-supervised). The
  `gauntlet_room_board` view ranks both sources; clients use Realtime
  (`postgres_changes`) on the room, roster, and room submissions, with a refresh
  fallback; room state is DB-authoritative. See `docs/GAUNTLET.md`.
  **Delete (`0025`):** the hosting teacher can delete a room from the rooms list
  (teacher-only UI, two-step inline confirm) via the `gauntlet_room_delete`
  SECURITY DEFINER RPC, enforced by `host_id` + `is_teacher()` server-side so
  students never see or can call it. It removes the room's session rows (tokens,
  participants, the room) and **un-tags** its submissions (`room_id -> NULL`) so
  graded records stay on the global board rather than being erased.
- **Speedrun formalization + 3D preview** (`0015`): formalizes the Speedrun
  challenge record and adds a three.js part preview. Governing principle: the
  drawing (PNG) and the 3D model (STL) are pure-geometry artifacts with no
  identity/metadata; everything else is site data. New site-data fields live in
  the existing `prompt`/`answer` JSONB (no new columns): `slug` (stable, url-safe,
  a partial unique index enforces it for Speedrun), `par_time` (seconds), plus the two Storage
  references `model_path` (STL, public in `prompt`, shown as a shape-only preview
  before Start) and `drawing_image_path` (dimensioned PNG, gated in `answer`,
  handed back by the reveal RPC on Start like the SVG `drawing`). A single
  **global ruleset** (`gauntlet_speedrun_ruleset`, one singleton row: units label,
  projection, rule lines) is shared across every Speedrun challenge, teacher-
  editable via a plain teacher-gated RLS update policy, and edited on the
  authoring landing page. Two **private** Storage buckets `gauntlet-drawings` and
  `gauntlet-models` hold the artifacts (authenticated read, teacher write; reads
  are short-lived signed URLs), tightening the 0009 public-`gauntlet`-bucket
  pattern to authenticated read. `StlViewer.svelte` is a reusable three.js +
  STLLoader viewer (orbit controls, machined-metal physical material under a
  pushed studio rig, RoomEnvironment IBL with ACES tone mapping, supersampled
  render resolution, soft contact shadow on a clean deep backdrop, slow
  auto-orbit that stops on first interaction and is disabled under reduced
  motion, auto-fit 3/4 framing, shape only, no measurement/download) and
  replaces the isometric view that used to live on the drawing. It is shown
  **by default** on the Speedrun and room play pages (no toggle).
  `three` is a runtime dependency, imported
  dynamically (browser-only, SSR-safe). The macro/reveal/token/leaderboard flow is
  unchanged; reveal-on-start still gates the dimensioned drawing.
- **Speedrun single drawing source + framed viewer** (batch, supersedes the
  0015 dual-field drawing storage): the Speedrun drawing is now ONE field,
  `answer.drawing` (inline SVG, a full URL, or a `gauntlet-drawings` storage path
  signed on reveal). The 0015 `answer.drawing_image_path` is a READ-ONLY
  fallback only, so a challenge carrying both renders `answer.drawing`. The
  reveal page (`speedrun/[id]`), the room reveal (which always read only
  `answer.drawing`), and the authoring editor preview all resolve and render the
  IDENTICAL single image with the same precedence (SVG as-is, URL direct, bare
  path signed, else the legacy path), so what a teacher authors is exactly what
  the student sees. The authoring form has ONE drawing upload (the duplicate
  "dimensioned drawing (PNG)" picker is gone; the STL preview stays). This
  removed a class of bug where a challenge's two drawing fields diverged (good
  content-cropped image in one, raw full-sheet export in the other) and the
  reveal rendered the raw export tiny in a corner with the focus regions on
  blank paper. `DrawingViewer` now presents the drawing as a **framed light
  sheet**: a bounded black-on-white card (kept light for dimension legibility)
  floating in the dark viewport with a dark margin at the default fit, a clearer
  card frame (shadow + faint on-theme green hairline), still ink-cropped to
  content. No migration or re-upload was needed; the change is code-only.
- **Speedrun unit system + demo cleanup** (`0018`, `0019`): Speedrun challenges
  now carry a per-challenge `unit_system` (`IPS` or `MMGS`, site data in
  `prompt`, like `slug`/`par_time`) so a challenge's density, target
  mass, and dimension-reading convention are never mixed across systems: IPS is
  inch/lb/lb-in3, MMGS is mm/g/g-cm3. The authoring form derives `density_unit`
  / `mass_unit` / `length_unit` from the selected system (Reverse Engineer and
  Feature Golf are unaffected, unchanged fixed g/cm3 convention); the Speedrun
  and room play pages show the per-challenge system's dimension label instead
  of the global ruleset's generic one when a challenge specifies it;
  `gauntlet_publish_blocker` requires it before publish. `0019` also fixes
  `gauntlet_author_delete`: a challenge flagged `demo` (the placeholder seeds
  from `0005`/`0007`) now hard-deletes outright, cascading to its submissions
  and run tokens, instead of archiving forever once it has test submissions
  attached (the author page has no status filter, so an archived-forever demo
  row looked "stuck"); the migration also purges every currently-seeded demo
  row once. Non-demo challenges keep the existing archive-if-submissions-exist
  safety net unchanged. The Speedrun ruleset's "Projection" line was removed
  from both the student-facing panel and the author's ruleset editor.
- **Progression layer** (`0021`): XP, levels, streaks, personal bests, badges,
  post-run results, and the homepage nudge, all **derived read-only from
  submissions**, never stored: the `gauntlet_progression()` SECURITY DEFINER
  RPC returns the caller's aggregates (distinct attempted/cleared ids,
  per-mode counts vs published totals, distinct practice days in
  America/Los_Angeles, macro clears, sub-par clears, a within-half-tolerance
  "dead on" flag; only booleans/counters derived from `answer`, never its
  contents). The model lives in `src/lib/gauntlet/progression.ts` (pure TS,
  client-safe): distinct-based XP (15/attempt, 120/clear, 20/practice day, so
  re-submitting farms nothing), quadratic level curve with dojo rank names, a
  streak walk with a **one-missed-day grace** ("gentle restore window": one
  missed day survives, two consecutive kills it), the badge catalog, and the
  next-best suggestion. Surfaces: the dojo landing shows level + XP bar,
  streak (with restore hint), per-mode progress rings + per-challenge
  completion dots on mode cards, and the badge strip;
  `src/lib/gauntlet/RunResults.svelte` is the shared post-run results screen
  (metric, accuracy, PB delta vs a pre-run snapshot, XP gained, suggested
  next drawing from `src/lib/gauntlet/next-challenge.ts`) mounted in all six
  modes, with a green/gold PB-beat flourish (crimson stays reserved); the
  homepage renders a signed-in "continue / next best" nudge card from
  `+page.server.ts`. No pressure timers, no dark patterns, and no coin
  payouts (coins stay deferred).
- **Speedrun drawing UX + series + tutorial (`0022`, `0023`):** four additive
  Speedrun improvements, all layered on the existing reveal-on-start / gated
  drawing model without touching scoring or timing.
  - **Interactive drawing viewer (rebuilt on the PDF contract).**
    `src/lib/gauntlet/DrawingViewer.svelte` is the reusable pan (drag) / zoom
    (wheel, pinch, +/- controls, numeric readout) / fit viewer with a corner
    minimap position indicator and a focus-region "Jump to" strip (one chip per
    region plus an always-present "Whole drawing" chip). Its primary input is a
    **full-sheet PDF** rendered with pdf.js (`pdfjs-dist`, loaded lazily and
    browser-only via `src/lib/gauntlet/pdf.ts`, which also owns `isPdfRef`);
    multi-page PDFs render one sheet per page, stacked. Legacy raster (PNG) and
    inline-SVG drawings still render (a hidden measure element bootstraps their
    intrinsic size). Architecture rules learned from the old viewer's layout bug,
    keep these invariants:
    - **One shared transform.** The rendered sheets AND the region hotspots live
      inside a single `.dv-world` wrapper laid out at intrinsic size (the pdf.js
      page viewport, the raster's natural size, or the SVG viewBox); every
      pan/zoom is ONE `translate(tx,ty) scale(s)` on that wrapper, so
      drawing-to-region alignment holds at every zoom by construction. Never
      position the overlay layer independently of the drawing.
    - **Fit after measure.** The fit is computed only once the stage has settled
      non-zero dimensions (ResizeObserver-fed) AND the content dimensions are
      known; the world stays hidden until then, and the reveal animation is
      triggered off the same gate so it can never race the fit. The ink-probe
      content-fit hack is retired; PDFs are full sheets, fit frames the page.
    - **Crisp PDF zoom.** Page canvases re-render on zoom settle at the display
      scale (DPR-aware, offscreen render + blit so the sheet never blanks) while
      their CSS boxes stay in intrinsic units inside the shared transform.
      Renders use pdf.js `intent: 'print'`: display intent paces on
      requestAnimationFrame, which a backgrounded tab or throttled window never
      ticks, hanging the render forever. Do not pass a transparent `background`
      (pdf.js normalizes it through an alpha-dropping parser to opaque black);
      the paper knock-down overlay does that job.
    - **Seated compositing + reveal.** The sheet is seated into the frame, not
      stark white: off-white paper, inset bezel + inner shadow, phosphor edge
      glow, a low-opacity `.dv-tone` veil, and a frame-fixed (never transformed)
      `.dv-crt` scanline/grain/vignette overlay. On `reveal` (the Speedrun/room
      play pages pass it) a deterministic sub-second CRT plotter scan-in plays:
      power-up line, phosphor bar sweeping a stage-space clip mask, one settle
      pulse. Presentation only, it never touches run timing or the
      server-authoritative clock; `prefers-reduced-motion` gets an instant fade.
    - **PiP-safe.** Interaction listeners are attached with `addEventListener`
      (NOT Svelte's delegated `on:`), controls are siblings of the pan surface,
      styles are scoped with hardcoded token fallbacks, and the transform tween
      ticks on rAF-or-timeout so jumps complete even in a throttled window.
    The dev harness `/dev/viewer` (404 in production, no auth / Supabase) mounts
    it with a runtime-generated two-page vector PDF fixture (FRONT / RIGHT
    regions on page 1, SECTION on page 2), the legacy raster/SVG samples, a
    reveal replay, and the pop-out, for verifying every interaction in a browser.
  - **Focus regions (normalized page coordinates).** Author-defined labelled
    rectangles in FRACTIONS of the page (0 to 1, top-left origin) plus a 0-based
    `page` index for multi-page PDFs (`FocusRegion.page`; missing = page 0, so
    every pre-PDF region reads unchanged, no migration). They describe the hidden
    dimensioned drawing, so they live in the gated `answer.focus_regions` and are
    handed back only by `gauntlet_speedrun_reveal` on Start (0023; the JSONB
    passes through verbatim, so page indices needed no RPC change). Degrade to
    plain pan/zoom when none exist. Authored either by the **visual picker**
    (`src/lib/gauntlet/RegionEditor.svelte`: drag-to-draw, move / resize, select,
    reorder, zoom; renders PDFs through pdf.js one page at a time with a page
    stepper, stamping new regions with the shown page) or the numeric percent
    rows (which grow a "Pg" column for multi-page PDFs); both bind the same
    `form.focusRegions`, and region order is the student "Jump to" order.
  - **Drawing storage.** `answer.drawing` holds inline SVG markup, a full URL, or
    a bare path in the private `gauntlet-drawings` bucket (signed per read).
    **PDF uploads in the authoring form go to `gauntlet-drawings` as a bare
    path** (never the public `gauntlet` bucket), so the gated sheet is never at a
    public URL; image uploads keep the legacy public-bucket behavior. No schema
    change was needed for the PDF contract: the reference and the regions are
    free-form JSONB and the buckets carry no mime allowlist.
  - **Picture-in-picture / pop-out** (`src/lib/gauntlet/popout.ts`). A "Pop out"
    control floats the drawing over SolidWorks so students don't alt-tab mid-run.
    Tiered by capability: primary is the Document Picture-in-Picture API (the
    school Chrome target), which MOVES the live viewer node into an always-on-top
    OS window so its pan/zoom carries; fallback is a detached `window.open`
    drawing-only window (self-contained HTML with its own pan/zoom; a PDF drawing
    embeds the browser's own PDF viewer full-bleed instead); baseline is an
    in-app draggable + resizable floating panel. The moved node is always
    restored inline on close / retry / result / unmount.
  - **Drawing series / collections (`0022`).** A first-class organizing unit:
    `gauntlet_series` (name, description, sort_order; plain teacher-gated RLS like
    the ruleset, no private data) plus `series_id` / `series_order` columns on
    `challenges` (a challenge belongs to one series or none). Membership is a
    real relation in real columns, deliberately NOT prompt JSONB, so a content
    edit through `gauntlet_author_upsert` never clobbers it; assignment / move /
    reorder route through the `gauntlet_series_assign` SECURITY DEFINER RPC
    because direct DML on `challenges` is revoked (0009). Students browse and
    filter Speedruns by series on `/gauntlet/speedrun`; teachers create / rename /
    reorder / delete series and assign / order drawings on `/gauntlet/author`.
  - **Per-drawing YouTube tutorial.** An optional `prompt.tutorial_video_id`
    (Speedrun site data, normalized from any YouTube URL/id by
    `normalizeYouTubeId`); rendered as a collapsible Tutorial panel on the play
    page, collapsed by default with the iframe lazily mounted on open so it never
    touches the network during a timed run. No migration (free-form JSONB).
  - **Migrations to apply:** `0022_gauntlet_drawing_series.sql` (required before
    deploy: the Speedrun and author loads now select `series_id`/`series_order`)
    and `0023_gauntlet_reveal_focus_regions.sql`. Both are manual per the
    convention; the reveal change fails soft (missing field -> no regions).
- **Leaderboards (`0024`):** the overall standings at `/gauntlet/leaderboard`
  (route + a dojo-landing callout + a FeatureManager leaf). One read-only
  SECURITY DEFINER RPC `gauntlet_leaderboards(p_limit)`, in the spirit of
  `gauntlet_progression`: everything is derived from graded submissions (nothing
  forgeable), and it returns two boards in one payload. **Overall** ranks every
  player by total XP computed the SAME way the dojo's own progression does
  (distinct attempted + cleared + practice days; the XP constants mirror
  `progression.ts` and the client derives the level/name via `levelFromXp`), ties
  sharing a rank. **Speedrun** returns one row per published Speedrun drawing with
  its record holder (fastest passing run, read from the `gauntlet_leaderboard`
  view so ties go to the earliest holder), left-joined so drawings with no record
  come back with a null holder (clean empty state), listed flat by difficulty then
  title. Board-safe columns only (display name + avatar, never email/answers);
  readable by any signed-in user (same visibility as the per-challenge board).
  Migration is manual; fails soft to empty boards pre-migration.
- **SolidWorks add-in (`tools/solidworks-addin/`):** a .NET Framework 4.8
  SOLIDWORKS COM add-in (C#, `ISwAddin`, WinForms task pane) that replaces the
  two VBA capture macros with a persistent in-SOLIDWORKS panel: live mass /
  volume / surface area / feature count honoring the part's unit system (IPS
  reads in lb, MMGS in g, both always shown), a target-mass comparison field,
  and the Start / Submit run flow. It speaks the EXACT macro contract from
  0016/0017/0027/0030, `gauntlet_macro_start(p_code, p_volume_mm3)` then
  `gauntlet_macro_submit(p_code, p_volume_mm3, p_run_id, ..., p_material,
  p_unit_system)` via
  PostgREST with the public anon key, and stores the run id in the same
  `GAUNTLET_RUN_ID` part custom property, so the add-in and the `.bas` macros
  are interchangeable mid-run. If a migration changes those RPCs, update
  `GauntletClient.cs` in the same change. The pane's live readout goes through
  the status-checked `GetMassProperties2` (a one-shot `IMassProperty` created
  mid-command reads zeros, the old live-zeros bug; `PartReader.cs` documents
  it), it surfaces the applied material continuously, and it is styled as a
  neutral host-matched panel (SOLIDWORKS 2025 light theme, restrained IDEA
  green) with a runtime-generated hex-boss icon (`AddinIcons.cs`, task pane
  tab + Add-Ins dialog; never a SolidWorks-like mark). It references the
  locally installed
  SOLIDWORKS interops (no version hardcoded; the running version is detected
  at runtime) and is not part of the SvelteKit build; build + regasm steps are
  in its README (sources stay C# 5-compatible so the no-Visual-Studio
  `build.ps1` path keeps working). After building, the double-click
  `register.bat` / `unregister.bat` (self-locating, self-elevating wrappers
  around the 64-bit `RegAsm /codebase`) are the primary install path; the manual
  regasm command is the documented fallback.
- **Material gate (`0026`):** a modeling run passes only if the part's applied
  material matches the challenge's material. The required name is the existing
  public framing field `prompt->>'material'` (no new schema field; it is what
  students already see in the spec card and teachers already author).
  `gauntlet_macro_submit` gains `p_material` (the applied material's library
  name, read via `GetMaterialPropertyName2` by the add-in and the Submit
  macro) and REJECTS the submit, recording nothing and consuming nothing,
  when the challenge names a material and none is applied ("No material
  applied...") or the wrong one is ("Wrong material ..., expected ..."),
  case-insensitive and trimmed; challenges with no material skip the gate.
  Volume tolerance stays the geometry check; material is a gate on top. The
  Author capture macro now prints the exact library `material :` line and the
  authoring form parses it into the Material field, so authored names match
  what SolidWorks reports. Manual practice and host-supervised room manual
  submits cannot read the part and are unchanged.
- **Material by density (`0027`, supersedes the 0026 name match):** the 0026
  exact-name gate false-blocked correct runs (a custom-library name like
  "6061-T6 (SS)" never matched an authored "6061 Alloy", and an unread name read
  as "no material"). `gauntlet_macro_submit` now verifies material by DENSITY:
  measured density = `mass / volume` vs the challenge's expected density
  (`answer->>'density'`, normalized to g/cm3 from its unit system) within a
  tolerance (`answer->>'density_tolerance_pct'`, default 1%). A material counts
  as present from a non-empty name OR a real density; the server BLOCKS only when
  there is genuinely none (empty name AND ~1.0/zero density). A present-but-wrong
  material grades `is_correct = false` (unranked, retry on the clock), never a
  hard block. The block message and result carry the detected material and
  measured/expected density. The Submit macro reads material from the ACTIVE
  config via `PartDoc` and its `JsonField` now unescapes so a quoted server
  message is not truncated.
- **Live rooms: short code + host plays (`0028`):** room join codes are 4 upper
  chars over the unambiguous alphabet (no O/0/I/1/L) via `gauntlet_gen_room_code`
  (submit codes stay 8-char credentials). The host is enrolled as a racer at
  create and `gauntlet_room_start` mints the host a token too, so the host races;
  the room page shows the host the full racing panel (shared `racePanel` snippet)
  beside their End-round control.
- **Tiers removed (`0029`):** the T1..T4 Speedrun `tier` (prompt JSONB, dup of
  difficulty) is gone from the editor, player, room, and leaderboard (Speedrun
  records list flat by difficulty then title; standings stay XP-only).
  `gauntlet_leaderboards()` no longer returns/orders by tier; the dead
  `prompt->>'tier'` key is stripped from existing challenges.
- **Unit system gate (`0030`):** `unit_system` (IPS/MMGS) is a first-class
  per-challenge attribute (Speedrun prompt, backfilled to IPS; RE/FG read as
  MMGS). The authoring toggle auto-converts density and target mass with exact
  factors (1 in = 25.4 mm, 1 lb = 453.59237 g). `gauntlet_macro_submit` gains
  `p_unit_system` (the SolidWorks DOCUMENT unit system reported by the macro /
  add-in) and blocks a submit whose document units differ from the level's,
  showing both; it also reports the measured mass in the level's unit (lb/g).
  Built on the 0027 density gate (not a revert).
- **Verification model: geometry-only, mass from level density (`0034`,
  SUPERSEDES the 0026/0027 material gates and the 0030 document-unit gate).**
  The single rule, enforced everywhere (server, VBA macros, C# add-in, web):
  density and target mass are ALWAYS sourced from the level record, NEVER from
  the part's assigned material. No verification or mass path reads the part's
  material or its material density.
  - **Ranked = volume-as-checksum.** `gauntlet_macro_submit` grades on measured
    geometric volume vs the level's stored `answer.target_volume_mm3` within
    tolerance, only. It no longer reads/requires an assigned material and never
    blocks on material or document units. `p_material` is a non-gating advisory,
    `p_unit_system` is informational, `p_mass_g` is ignored. (Restores the 0016
    volume-only path.)
  - **Mass = measured volume x level density**, computed server-side and shown as
    both the level's target mass and the student's computed mass, in the level's
    unit system (TooTallToby: IPS shows lb / in3, MMGS shows g / mm3; presentation
    is driven by the level's `unit_system`, not the student's document units).
    Because density is a fixed level constant, hitting target mass == hitting
    target volume, so ranked stays volume-only.
  - **Tolerance constant** `GAUNTLET_VOLUME_TOL_PCT = 0.1` (relative percent, was
    0.5; tightened in migration `0036`) is the shared DEFAULT across layers. The
    SERVER copy governs ranked pass/fail: `gauntlet_macro_submit.c_volume_tol_pct`
    (and the preview/practice display copy `gauntlet_run_targets.c_volume_tol_pct`).
    The VBA `GAUNTLET_VOLUME_TOL_PCT` and C# `GauntletMath.VolumeTolPct` copies are
    PREVIEW-ONLY (the practice check + reference-cube self-check), kept in sync. A
    level's `answer.tolerance_pct` still takes precedence when set (both server
    functions coalesce to the constant only when it is absent).
  - **Canonical volume:** extract on an explicit SI basis (mass properties
    `UseSystemUnits = true` -> m3) and convert ONCE via `1 m3 = 1e9 mm3`
    (`M3_TO_MM3` / `GauntletMath.CubicMToCubicMm`). NO layer branches on the
    document display unit system to read volume, so an IPS part and an MMGS part
    of identical geometry verify identically. Author values are converted at
    author time (the author macro/form emit canonical mm3 + density in the
    level's unit).
  - **Practice mass verify (unranked, non-blocking):** the macro
    (`PracticeMassVerify`) and the add-in ("Practice mass check") compute mass
    from the level density (fetched via the read-only `gauntlet_run_targets(code)`
    RPC) and report closeness to the level's target mass. They write nothing and
    never affect ranked state.
  - **Reference-cube self-check:** the macro (`ReferenceCubeSelfCheck`) and the
    add-in ("Reference-cube self-check") read a 100 mm cube, assert 1,000,000
    canonical mm3 within tolerance, and print the measured volume (and mass at a
    level density if a code is given). Proves the unit path in any document unit
    system.
  - **Material advisory (optional, OFF by default):** the add-in can show whether
    the applied material name matches the level's, as an informational note only;
    it never gates ranked or practice. The macros omit it entirely.
  - The add-in fetches the level via `gauntlet_run_targets`; the failing
    `p_mass_g` / material-density read is gone from `PartReader` (geometry only).
    Add-in is v1.4.
- **Speedrun telemetry (`0035`): fail-safe modeling-process capture + live and
  post-run analysis.** Append-only `gauntlet_run_events` (run_id, seq, t_ms,
  event_type, payload) is the raw stream, keyed to the run; a materialized
  `gauntlet_run_analysis` summary is upserted at submit for fast reads. Writes go
  through SECURITY DEFINER RPCs (`gauntlet_run_events_insert` batch,
  `gauntlet_run_analysis_upsert`) with the CODE + run_id as the credential (owner
  resolved from the token, anon-granted like the macro RPCs); Realtime is enabled
  on the events table; RLS scopes reads to own rows (teachers all).
  - **HARD RULE, fail-safe:** telemetry is best-effort and NEVER affects a run.
    Capture is decoupled from verification; every add-in path is guarded so an
    exception in capture/batching/network can neither crash the add-in nor abort
    a run.
  - **Capture is add-in only** (`TelemetryRecorder.cs`); the .bas macros keep
    start/submit snapshots only. Minor-appropriate scope: modeling-process and
    integrity signals for the ACTIVE part only, NO keylogging, screenshots, or
    filesystem scraping. The reliable core is a per-tick model-state SNAPSHOT
    (volume/features/area) from the pane refresh; native SOLIDWORKS events
    (feature add/delete, undo, redo, rebuild, command behind a flag) enrich it
    and are bound best-effort. Events buffer and flush to the batch RPC
    periodically with a guaranteed final flush + summary at submit. Add-in v1.5.
  - **Live in-run analysis** (`src/lib/gauntlet/LiveTelemetry.svelte`, mounted on
    the Speedrun play page): subscribes to the run's `gauntlet_run_events` over
    Realtime and renders volume-vs-target, computed mass (level density) vs
    target, feature count, a live activity feed, rebuild health, and pace vs par.
    Crimson LIVE badge, Share Tech Mono numerics, motion behind reduced-motion.
  - **Post-run critical analysis** (`src/lib/gauntlet/PostRunAnalysis.svelte`,
    mounted on the results): a coaching read of the full stream, dependency-light
    inline-SVG charts (volume-over-time, time-per-feature with the stuck point
    highlighted), command usage, active/idle, undo/redo, vs-par, vs-class-median
    and self learning-curve comparisons, integrity, and plain-language coaching
    callouts.
  - **Level config:** optional `prompt.par_feature_count` (Speedrun) feeds the
    vs-par / stuck-point views; `par_time` is reused. Degrades gracefully unset.
  - **Dev harnesses (no SW / Supabase):** `/dev/run-telemetry` (live replay),
    `/dev/run-analysis` (saved sample run).
- **Speedrun tooling, attempts, series, room timers (batch):** a set of
  additive Speedrun improvements.
  - **Unified Tools page + static hosting.** All run tooling lives on ONE page
    (`/gauntlet/tools`): a "which should I use" comparison plus two columns
    (SolidWorks add-in, VBA macros), each with a single download, version and
    last-updated date, install steps, and usage steps, and a teacher-only author
    section. The scattered tool entry points on the Speedrun list and play pages
    collapse to a single "Tools" link. Every download is now served DIRECTLY from
    `static/tools/` (the three `.bas` macros, the built add-in
    `idea-gauntlet-addin.zip`, and `tools-manifest.json`), which removes the
    Supabase-Storage add-in-download 404 class of bug entirely. Paths are the
    `*_MACRO_PATH` / `ADDIN_DOWNLOAD_PATH` / `TOOLS_MANIFEST_PATH` constants in
    `src/lib/gauntlet.ts` (the old `gauntlet-tools` bucket helper is gone). The
    add-in zip is (re)built by `tools/solidworks-addin/build.ps1 -Package`, which
    now writes straight into `static/tools/`.
  - **Update mechanism.** `static/tools/tools-manifest.json` lists the current
    macro and add-in versions, dates, and a short changelog; the Tools page reads
    it (the load fetches the static file, fails soft). Downloads always serve the
    latest. The add-in has a fully defensive, non-blocking startup version check
    (`AddinUpdate.cs`, appends an "update available" note to the pane footer);
    it no-ops until `ManifestUrl` is set (clear TODO), so the shipped build makes
    no unverified network call. Add-in version is `1.3`.
  - **All attempts logged (0033).** Every Speedrun attempt is persisted
    server-side in `gauntlet_speedrun_attempts` (run_id, user_id, challenge_id,
    series_id, room_id, elapsed_ms, result, created_at) by two EXCEPTION-SAFE
    triggers: the run token gaining a run_id/started_at logs the START
    (`in_progress`); a graded submission (macro or manual) reconciles it to
    `passed`/`failed`; a started run whose token expired with no finish reads as
    `abandoned` in the `gauntlet_speedrun_attempt_history` view (no cron). The
    triggers swallow all exceptions so logging can never break grading. A
    definer RPC `gauntlet_log_speedrun_attempt` is available for explicit client
    logging. The per-user history is at `/gauntlet/speedrun/history` (linked from
    the Speedrun list), RLS-scoped to own rows (teachers read all).
  - **Collapsible series + rotating thumbnail.** Speedrun series are collapsible,
    the collapsed state persisted per browser in `localStorage`
    (`gauntlet_speedrun_series_collapsed`). A collapsed series shows one
    `SeriesThumbRotator` slot that cross-fades (~3.5s) through its levels'
    isometric thumbnails (reusing `part-thumbs.ts`), degrades to one static
    thumbnail under `prefers-reduced-motion`, and to a VIEWPORT wireframe
    placeholder when no model renders.
  - **Live-room parity + two timers.** The room race screen reuses the same
    interactive `DrawingViewer` (pan/zoom) as the solo page for SVG drawings, and
    renders `RoomClocks`: two server-anchored timers in Share Tech Mono, a ROOM
    session timer (from `gauntlet_rooms.created_at`) and a per-RUN timer (from the
    round `started_at`, frozen on the racer's scored time at submit), with a
    crimson LIVE badge. No scoring or room-timing change.
  - **DrawingViewer rebuilt on one transform matrix.** `DrawingViewer.svelte`
    pan/zoom is a single `translate()+scale()` on one wrapper (GPU-composited),
    replacing the per-step box-resize model that re-decoded the raster on every
    wheel tick and made real-drawing zoom stutter. Wheel zoom is cursor-anchored,
    drag pans via pointer capture, Fit frames the ink content, scale clamped to
    sane min/max. Verified in `/dev/viewer`.
  - **ProfileMenu display-name edit fix.** The outside-dismiss handler now runs on
    `pointerdown` (not `click`) and ignores detached targets, so clicking Edit no
    longer closes the whole popup (the click that opened the inline editor is
    never seen by the dismiss handler).
  - **Dev harnesses (regression tools, 404 in prod, no auth):** `/dev/viewer`,
    `/dev/series`, `/dev/room-clocks`, `/dev/profile-menu`, `/dev/tools-preview`.
- **Visuals (standing directive):** all GAUNTLET UI, current and new, must
  conform to the **VIEWPORT design system** documented in
  `docs/GAUNTLET-DESIGN.md`. Tokens and the re-skin layer live in
  `src/lib/gauntlet/viewport/viewport.css` (scoped to `.gt-root`, the
  `/gauntlet` layout wrapper); ambient components (volumetric background, CAD
  cursor, feature-tree nav, trademark footer, entrance choreography) mount
  once in `src/routes/gauntlet/+layout.svelte` so every page inherits them.
  The background is a **volumetric CAD space** (`ViewportBackground.svelte`:
  a real three.js scene, floating hero machined parts cycling with fades,
  fog depth falloff, drifting particulate, mouse parallax, soft focus); the
  old scrolling isometric grid is **retired, never reintroduce it**. The
  FeatureManager tree rail is **hidden by default** behind its edge tab (a
  per-browser choice); do not make it visible by default. Speedrun level
  tiles carry cached isometric 3D thumbnails (`PartThumb.svelte` +
  `part-thumbs.ts`: rendered once per browser from the level's STL, cached
  in IndexedDB by `model_path` + style version, signed URL only on miss,
  wireframe-glyph placeholder when a level has no model). The dev-only
  harness `/dev/visuals` (404 in production, no auth/Supabase) mounts the
  background, StlViewer, and thumbnail pipeline with a generated sample STL
  for browser verification.
  Read tokens and reuse the viewport components rather than writing one-off
  styles. `--crimson` is reserved for live/rec/error states only, never a
  general accent. Modeling modes are green, knowledge modes cyan. Everything
  animated is gated behind `prefers-reduced-motion`. SOLIDWORKS branding is
  nominative text only: never the logo, a lookalike, or its red-on-white
  scheme; the Dassault Systemes disclaimer footer stays on every page. The
  VIEWPORT layer is visual/interaction only, it never touches data flow,
  auth, scoring, or room timing. The older `.gauntlet` block in `src/app.css`
  remains but is re-themed by the scoped token overrides; new styles go in
  the viewport system, not there.

## FRC Training track

The Team 5669 FRC training track at `/frc`. Signed-in tier, any role; the
whole track is open access and **pathway is identity, never a gate**, nothing
in the track may wall off content by pathway. Structure, theme, the first
domain's unit content, a real per-user progression backbone, and the first
auto-gate (MDM-1's server-authoritative knowledge quiz) are live; the remaining
gate engines (the other units' quizzes / GAUNTLET) are still deferred.

- **Registry:** `src/lib/frc/track.ts` (plain data, client-safe, like
  `curriculum.ts`): `FRC_TEAM`, the seven domains (Foundation, CAD and
  Mechanical Design with its sixteen units, Mechanisms and Prototyping,
  Programming and Controls, Strategy and Scouting, Drive Team, Capstone), the
  grouped reference shelf (`FRC_REFERENCES`), and the progression RULES kept in
  this one place: each unit's stable `id` (e.g. `MDM-1`) and `prerequisite`
  (the sequential unlock chain), the pure `unitState(unit, completedSet)`
  (locked until its prerequisite is complete, available once it is / for the
  first unit, complete when its own id is in the set), and the rank ladder
  (`FRC_RANKS` thresholds + `rankForCount` / `completedCadCount` / `frcRank`:
  Rookie 0, Technician 3, Builder 6, Engineer 10 completed CAD units, tune the
  thresholds here). A domain may declare `contentSet: 'mdm'` to mark that its
  units resolve to real per-unit pages.
- **Progression backbone (0039, locked down in 0041):** per-user unit
  completion in `frc_user_progress` (`(user_id, unit_id)` PK + `completed_at`),
  keyed by the registry unit ids. Students and teachers keep the 0039 SELECT
  policies (own rows / all rows via `is_teacher()`); **direct client writes are
  revoked entirely** (0041 drops the old insert/delete policies and revokes
  `insert, update, delete` from `authenticated`), so a student has no write
  path of their own, full stop. `src/lib/frc/progression.ts` is the client
  seam: `markUnitComplete(supabase, userId, unitId)` / `clearUnitComplete` are
  now THIN CALLERS of the `frc_mark_complete` / `frc_unmark_complete` SECURITY
  DEFINER RPCs (0041), and those RPCs enforce `is_teacher()` INSIDE the
  function body regardless of whose id is passed — so these two functions are
  the teacher-override seam only; calling them as a student (even for your own
  id) returns `{"error":"forbidden"}` and writes nothing. `loadUserProgress` /
  `loadProgressForUsers` still read directly (fail-soft to empty /
  `ready:false` if a migration is unapplied, like the pathway migration).
  `/frc/+layout.server.ts` loads the student's completed set + rank once for
  every /frc page; `FrcRankBadge.svelte` shows the rank on the track view hero
  (`size=lg`) and beside the profile in the shell header (`size=sm`);
  `DomainLanding` takes the `completed` set and renders the real available /
  complete state (plus a "suggested later" hint, see "Open learning access"
  below).
- **Teacher completion override:** the dashboard (`/dashboard`) roster gains a
  per-student "FRC completion" disclosure (`FrcUnitOverride.svelte`, a
  presentation-only toggle grid driven by one callback so it is harness-
  testable) that marks/unmarks the CAD content units via markUnitComplete /
  clearUnitComplete + `invalidateAll`. UI gating (the dashboard route is
  teacher-only) is convenience; the real authority is `is_teacher()` inside the
  RPCs themselves (0041). Fails soft with an "apply migration 0039" note when
  the table is absent.
- **Open learning access + teacher "view as student" (batch):** no unit is
  ever read-locked. `unitState()` (`track.ts`) still computes
  locked/available/complete, but it is DISPLAY/ORDERING ONLY now: a "locked"
  unit renders as a "Suggested later" badge with a "Suggested after &lt;prior
  unit&gt;" hint, never a non-link card, so `DomainLanding` links every
  content-backed unit regardless of prerequisite completion (nothing in
  `[unit]/+page.server.ts` ever gated reading either; the old block was
  discoverability only, in `DomainLanding`). Gates still record real
  completion for rank exactly as before. A teacher gets a "View as student"
  toggle in `FrcShell`'s header (visible only when the signed-in profile's
  role is `teacher`; the dev harness simulates it via a `teacherOverride` prop,
  mirroring the existing `rankCount` override pattern), backed by
  `FrcViewContext` (`track.ts`: `FRC_VIEW_CONTEXT_KEY`, `isTeacher` /
  `viewAsStudent` / `showOverride`) set once in `FrcShell` via Svelte context
  (so the toggle survives navigation between /frc pages, since the layout
  stays mounted) and read by any descendant page. When on, a banner reads
  "Previewing the track as a student sees it" and all teacher-only chrome
  hides. `DomainLanding` self-derives `showOverride` from that context (an
  explicit prop still overrides it, again the `rankCount` pattern) and, when
  true, renders a dark "Teacher tools · your account" panel above the CAD
  unit list: `FrcUnitOverride` reused in-track (not just the dashboard) so a
  teacher can mark/unmark their OWN completion to preview progress states
  without leaving the track; the real route wires it to
  `markUnitComplete`/`clearUnitComplete` against `claims.sub`. The quiz gate
  itself (`gate?.enabled`) was never role-gated, so it already worked for a
  teacher's own account; this batch only ensures `DomainLanding` never hides
  the path to it. The `/dev/frc` harness's "Simulate teacher" checkbox drives
  `FrcShell`'s `teacherOverride` prop end to end (real context, real toggle,
  fake completion handler) so this is verifiable without Supabase.
- **Knowledge-gate quiz (0040, MDM-1):** the first auto-gate, built
  SERVER-AUTHORITATIVE so the answer key never reaches the client. The item
  bank is a server-only module (`src/lib/server/frc/mdm-1-quiz-bank.json`, under
  `$lib/server` so SvelteKit never bundles it client-side; a pool larger than
  `testLength` with per-item options + answer index, plus `passPercent` 90).
  `src/lib/server/frc/quiz-engine.ts` holds the pure logic (select `testLength`
  at random, shuffle each item's options, split the correct index into a
  server-held `sealed` key, `gradeAttempt` as the CANONICAL grader mirrored by
  the SQL RPC, `cooldownState`, and objective-tag -> short topic-name mapping);
  `quiz-service.ts` orchestrates start/submit over a `QuizStore` interface.
  The `frc_quiz_attempts` table (0040) is the attempt LOG + in-flight state:
  the `sealed` key column has NO client SELECT grant, and grading runs inside
  the `frc_quiz_grade` SECURITY DEFINER RPC (mirrors `gradeAttempt`) so answers
  never leave the server; `frc_quiz_start` persists an attempt. RLS mirrors the
  pattern (student reads/inserts own via the definer RPCs, teachers read all).
  The unit endpoint `POST /frc/[domain]/[unit]/quiz` (start | submit) enforces
  the ESCALATING cooldown (schedule `FRC_QUIZ_COOLDOWNS_SEC` /
  `cooldownSecondsForFailStreak` in track.ts, tunable; a pass clears the streak)
  before issuing an attempt, serves only stems + shuffled options on start, and
  grades on submit; on a FAIL it returns only the missed TOPIC names + the
  cooldown remaining, never answers. **Completion recording (0041):** on a PASS,
  `frc_quiz_grade` records the completion ITSELF, inline, in the same SQL
  transaction as grading — it derives the unit id from the attempt row it just
  graded and the user id from `auth.uid()` (never a client-supplied parameter),
  so the only way a student reaches a `frc_user_progress` row is by actually
  passing the held answer key; it does not call `frc_mark_complete` (that RPC
  is teacher-only), it writes directly as its own SECURITY DEFINER owner. The
  SvelteKit endpoint's `onPass` hook is therefore a deliberate no-op.
  `FrcQuizGate.svelte` is the unit-page UI (Start -> questions -> submit ->
  pass/next-unlocked or fail/missed-topics/cooldown), FRC-themed; UnitPage shows
  it when the server load reports `gate.enabled` (only MDM-1; other units keep
  the description-only Gate). `+page.server.ts` computes the gate state
  (readiness, unit-complete, cooldown remaining) and fails soft to the
  description-only Gate if 0040 is unapplied.
- **Progress lockdown (0041):** closes the self-mark hole the 0039/0040 caveat
  flagged: a student could previously insert their own `frc_user_progress` row
  directly via PostgREST (the 0039 own-row write grant), bypassing every gate.
  0041 revokes that grant, drops the old student-write policies, adds the
  teacher-only `frc_mark_complete` / `frc_unmark_complete` RPCs described above,
  and recreates `frc_quiz_grade` to write completion inline. See the SQL file's
  header comment for the full before/after.
- **Unit content (CAD and Mechanical Design):** the ten authored units MDM-1
  through MDM-10 live in the repo-root seed `mdm-content-seed.md` (the single
  source of truth: plain `key: value` frontmatter + `## Brief`/`## Drill`/
  `## Gate`/`## Apply` sections, units split by `===`). `src/lib/frc/mdm-content.ts`
  parses it at build time via a `?raw` import (the established legacy-loader
  convention) into a typed `MdmUnit[]`; edit the markdown, never the parsed
  module. The parser adds LIGHT MARKDOWN to each Brief paragraph:
  `markupBriefParagraph` bolds a paragraph's opening sentence when it reads as
  a short label (8 words or fewer, empirically the line between the seed's
  short lead sentences like "Define the problem." and its longer intro/closing
  prose) and prefixes the "Worked example" paragraph with a `> ` blockquote
  marker; `src/lib/frc/inline-markup.ts` is the renderer (`renderInline` turns
  `**bold**` into `<strong>` and inline `[label](url)` spans into external
  links after escaping, matching the reference shelf's external-link handling
  exactly: opens in a new tab, `rel="noopener noreferrer"`;
  `isBlockquote`/`stripBlockquote` detect the blockquote marker), used by
  `UnitPage.svelte` to show the worked example as a distinct FRC-themed
  callout. A handful of Briefs (MDM-2, MDM-3, MDM-7, MDM-8, MDM-9) carry an
  inline `[label](url)` "see it" reference to a real vendor page, written
  directly into the seed prose (no separate token or component, unlike the
  `[[diagram:...]]` token). `drillAnswers` is an array aligned to `drill`
  (not a single consolidated string): `splitConsolidatedAnswers` splits a
  trailing "Answers: 1. ... 2. ..." block per question (all ten authored
  units, MDM-1 through MDM-10, have one). **Drill is active-retrieval
  practice, not a passive reveal** (`UnitPage.svelte`, client-side only, no
  persistence): each question is a typed attempt box ("Write your answer
  from memory") with a "Check answer" button disabled until the student has
  typed a non-empty response, so the model answer cannot be seen before an
  attempt; checking reveals the model answer in a distinct FRC-themed panel
  directly below the attempt, with "I had it" / "Review this" self-mark
  buttons. A "N of M checked" progress line sits above the question list. All
  of this is local `$state` (attempts/checked/marks arrays) reset by an
  `$effect` keyed off the `unit` prop reference (`MDM_UNITS` is a stable
  module-level array, so `unit` only changes reference on a real navigation
  to a different unit, which is exactly when the practice state should
  clear). A question with no parsed answer still shows the attempt box, and
  once checked shows a plain "Model answer not yet added" note instead of a
  fabricated answer. Gate stays description text only for units without a live gate:
  gate execution and progression are handled elsewhere (see the quiz-gate
  bullet above); Apply and prev/next nav are unchanged. Units MDM-11 through
  MDM-16 have no seed content yet and render as non-clickable
  "In development" placeholders on the domain page.
- **Brief concept diagrams:** a Brief paragraph that is exactly a
  `[[diagram:KEY|caption text]]` token (its own paragraph, blank lines on
  both sides in the seed) renders as a centered, captioned figure instead of
  prose. `parseDiagram` (`inline-markup.ts`) matches the token; the five SVGs
  live in `src/lib/frc/assets/diagrams/` and are imported the same way
  `FrcShell` imports the FRC logo PNGs (plain `import x from '...svg'`, so
  Vite serves them as fingerprinted/inlined production assets, never a raw
  file reference), collected into the `DIAGRAMS` key->asset map in
  `src/lib/frc/diagrams.ts`. `markupBriefParagraph` (`mdm-content.ts`) passes
  a diagram token through untouched (never bolded or mistaken for a "Worked
  example" lead); `UnitPage.svelte` checks `parseDiagram(p)` before the
  blockquote/plain-paragraph branches and looks the key up in `DIAGRAMS`,
  rendering nothing (not an error) for an unknown key. The figure is a capped
  max-width `.frc-card`-style frame (thin border, light shadow) with the SVG
  scaling responsively to full width inside it, and the caption below in the
  same muted italic note style as `.gate-note`. Five diagrams are seeded:
  `design-process-loop` (MDM-1), `orthographic-views` (MDM-2),
  `shaft-stackup` (MDM-8), `clearance-vs-tapped` (MDM-9), and
  `clearance-vs-interference` (MDM-10), each placed right after the unit's
  first Brief paragraph.
- **Routes:** `/frc` (track home, one card per domain + the student's rank),
  `/frc/[domain]` (reusable domain landing: every content-backed unit links
  regardless of state, complete/available/"suggested later" is a badge only;
  units without content read "In development"; unit-less domains show a
  "content in development" block; unknown slugs 404), `/frc/[domain]/[unit]`
  (the per-unit
  page; only `contentSet: 'mdm'` domains and unit numbers with authored content
  resolve, else 404), `/frc/references` (the shelf, external links only).
  `src/routes/frc/+layout.svelte` wraps everything in `FrcShell.svelte`
  (header + nav + footer); `+layout.server.ts` supplies the progression data.
- **Branding: the official FRC logo (not a derivative mark).** The RGB
  FIRST Robotics Competition logo is shown UNMODIFIED: horizontal
  (`src/lib/frc/assets/frc-logo-horizontal.png`) in the header, compact
  vertical (`frc-logo-vertical.png`) in the footer, both alongside Team 5669's
  own identity (never replacing it). Brand rules are honored: never recolor /
  distort / stretch / crop (`width:auto` preserves the intrinsic aspect), and
  each logo carries transparent clear space at least the height of its icon so
  nothing crowds it. The old geometric derivative mark (`FrcMark.svelte`) is
  REMOVED. Single triangle / circle / square outlines may still appear as a
  light per-card accent (the full FRC logo is on the page), but never
  recomposed into a FIRST-logo lookalike. The footer carries the exact
  trademark line: "FIRST and FIRST Robotics Competition are trademarks of For
  Inspiration and Recognition of Science and Technology (FIRST)."
- **Theme (the FRC derivative), scoped to the track only:**
  `src/lib/frc/frc-theme.css`, everything under `.frc-root` (the FrcShell
  wrapper), deliberately distinct from VIEWPORT: clean light surfaces, FIRST
  Blue `#0066B3` primary chrome, FIRST Red `#ED1C24` for action/emphasis used
  sparingly, near-black `#231F20` ink, gray `#9A989A` muted. Type is Roboto
  (`@fontsource/roboto`), headers Roboto Bold Italic. **IDEA green `#00FF41`
  appears ONLY for the achievement state** (complete unit cards and completion
  markers, used as filled markers with ink strokes on the light surfaces)
  **plus the "An IDEA program" footer mark** on the dark footer strip; never
  in primary chrome. The `.frc-root` block also neutralizes app-shell globals
  that would leak (the green `// ` h2 prefix, the green link-hover glow), and
  sits opaque at z-index 1 so the portal's `.bg-fx` scanlines never show
  through. New token names (`--frc-*`) on purpose: shared components mounted
  inside (ProfileMenu, VersionBadge) keep their global dark-theme tokens.
- **Footer changelog:** `src/lib/frc/ChangelogFooter.svelte` reuses the
  existing build-time git substrate (`virtual:site-versions`), so it
  auto-populates from commit history with no manual upkeep. It is an
  unobtrusive `<details>` disclosure ("Changelog") that opens a short capped
  list (8) of recent entries, each a date + commit summary, styled to the FRC
  theme.
- **Entry points:** the homepage launcher card (`portal-apps.ts`, Class
  group, `requiresAuth`); its icon is the official FIRST icon (emblem only, no
  wordmark; `frc-icon.png`) composited onto the dark VIEWPORT card unmodified
  (`width:auto` keeps the aspect, sized to the same height as every other
  app-icon so the card's form factor matches its neighbors; a faint FIRST-Blue
  underglow + hover border read as FRC without breaking the green/gold look,
  card size + layout unchanged). Also the `frc` app in `site-manifest.ts` (own
  version badge + changelog filter; also claims `mdm-content-seed.md`), and the
  `/frc` prefix in `authedPrefixes`.
- **Dev harness:** `/dev/frc` (404 in production, no auth / Supabase) mounts
  the real FrcShell with a view switcher. The Progression view is interactive:
  it simulates a student completing units in-memory (toggle grid + quick
  rank-threshold buttons), so the domain landing's unlock states, the rank
  badge, and the teacher-override component all update live without a DB. The
  Quiz-gate view mounts the real UnitPage + FrcQuizGate against a dev-only mock
  endpoint (`/dev/frc-quiz`, 404 in prod) that runs the REAL engine + service
  over an in-memory store with a short cooldown, so the full flow and the
  no-answer-key network contract are verifiable without a live DB. The Unit
  page view has its own MDM-1..10 picker, so the Brief markdown and the Drill
  retrieval-practice flow (attempt, check, model answer, self-mark, and the
  "not yet added" state on a question with no authored answer key) can be
  checked on any unit. Other views: track home,
  CAD domain, a placeholder domain, and the reference shelf.

## Version + changelog substrate

The site changelog AND every page's version are **auto-generated from git
history** and never hand-edited. `vite.config.ts` exposes a
`virtual:site-versions` module: at build / dev-server start it runs `git log
--name-only` over the **full history** and, using the route-to-path manifest in
`src/lib/site-manifest.ts` (the `APPS` list: gauntlet, vanguard, coins,
assignments, archive, dashboard, portal as catch-all), maps each commit to the
app(s) it touched and classifies a change type from its subject
(feature/fix/visual/content/docs/update).

- **Per-app versions:** `v1.N` where N is the count of commits touching that
  app's paths, so a version bumps automatically whenever a deploy includes
  commits for that app. `src/lib/VersionBadge.svelte` renders the chip
  (`<label> v1.N · <deploy short SHA> · <deploy date>`) on every SvelteKit page
  (homepage/archive footers, dashboard, auth error, the GAUNTLET layout,
  VANGUARD history). Endpoint-served legacy HTML (assignments, VANGUARD, coin
  entry) gets the same chip injected at serve time by
  `src/lib/version-badge.ts` (the established serve-time injection convention;
  legacy sources on disk stay untouched). Known gap: `static/coins/index.html`
  is served straight from `static/` (never through an endpoint), so it cannot
  show a badge without editing frozen legacy internals.
- **Homepage changelog:** newest-first over the full history, with filters by
  page/app, change type, and date range. Renders from `virtual:site-versions`.
- **Vercel:** set `VERCEL_DEEP_CLONE=true` in the project env so builds clone
  the full git history (otherwise versions derive from the shallow-clone
  depth; everything fails soft).

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
- **Interactive/visual verification:** when a task involves interactive or
  visual UI (custom viewers, canvas or three.js/3D, animations, drag/pan/zoom,
  pop-out/PiP, complex forms, or anything whose correctness is not visible to
  type-checking), you must (1) add or reuse a dev-guarded harness route that
  renders only when `dev` is true, returns 404 in production, and needs no auth
  or Supabase, mounting the component with representative sample data, and (2)
  verify every interaction and visual in a real browser via that harness before
  finishing. Report what you verified. svelte-check passing is necessary but not
  sufficient. Harness routes stay in the repo as regression tools.

## Scope guardrails

Phase 1 (done) was the **foundation**: Google login, profiles/roles backend,
and the public-vs-protected route split.

Phase 2 (done) was **carrying over legacy content** without rebuilding it: the
serving patterns above, with every assignment/reference HTML carried over, the
VANGUARD game and coin leaderboard available, the coin entry tool gated to
teachers, and the `/IDEA/` asset paths handled by the `static/IDEA/` mirror plus
the serve-time `.html` link rewrite. Do not modify legacy HTML internals (except
VANGUARD, which is now unfrozen, see the standing rule above).

Phase 3 (done) was the **public-first pivot**: the original IDEA index restored
as the public landing page `/`, assignments made public, optional sign-in, and
the first signed-in feature **VANGUARD cloud saves** (see the VANGUARD endpoint
section).

Phase 4 (done) reshaped the portal around the **2026-27 curriculum**: the
homepage is the student dashboard (the dashboard is teacher-only), students
self-select their class (`profiles.section_id`) and see it pinned, the
discontinued IDEA-113/208/303/403 courses moved to `/archive`, and the changelog
is auto-generated from git history. Per-user IDEA Coin login is still deferred:
the coin system lives entirely in Google Sheets / Apps Script, with no Supabase
coin backend yet. No coin economy logic in this repo. Do not modify legacy HTML
internals, with the standing exception of VANGUARD's
`src/lib/legacy/vanguard/index.html`, which is now the editable canonical game
source (surgical edits only, see "VANGUARD is unfrozen" above).

Phase 5 (current) is the **IDEA // GAUNTLET** foundation: the CAD skills dojo
shell, the full data model for all six modes, and the first mode (Drawing
Reading) end to end with server-side grading and a leaderboard view. See the
"IDEA // GAUNTLET" section above and `docs/GAUNTLET.md`. Out of scope for this
phase and deliberately deferred to later prompts: Speedrun, the SolidWorks VBA
macro, coin payouts, and the full authoring UI. The schema and shell anticipate
them; do not build them early.
