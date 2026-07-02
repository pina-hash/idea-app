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
- **Signed-in tier (any role):** the **GAUNTLET** CAD skills dojo at
  `/gauntlet` is open to any authenticated user, student or teacher. This is a
  second gated tier: `hooks.server.ts` redirects anonymous users off
  `/gauntlet*` (the guard now covers a list of authed prefixes, not just
  `/dashboard`), but no role is required to enter. Its teacher-only authoring
  page (`/gauntlet/author`) is gated in that page's load, the same way the
  dashboard is. See the "IDEA // GAUNTLET" section below.
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
- True mid-run resume is intentionally NOT supported: a live run lives only in
  the game's in-memory state and uses non-deterministic RNG, so only between-run
  progression syncs.

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
- **Speedrun formalization + 3D preview** (`0015`): formalizes the Speedrun
  challenge record and adds a three.js part preview. Governing principle: the
  drawing (PNG) and the 3D model (STL) are pure-geometry artifacts with no
  identity/metadata; everything else is site data. New site-data fields live in
  the existing `prompt`/`answer` JSONB (no new columns): `slug` (stable, url-safe,
  a partial unique index enforces it for Speedrun), `tier` (T1 to T4, distinct
  from the 1 to 5 `difficulty`), `par_time` (seconds), plus the two Storage
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
  STLLoader viewer (orbit controls, neutral material, auto-fit to the bounding
  box, shape only, no measurement/download) and replaces the isometric view that
  used to live on the drawing. `three` is a runtime dependency, imported
  dynamically (browser-only, SSR-safe). The macro/reveal/token/leaderboard flow is
  unchanged; reveal-on-start still gates the dimensioned drawing.
- **Speedrun unit system + demo cleanup** (`0018`, `0019`): Speedrun challenges
  now carry a per-challenge `unit_system` (`IPS` or `MMGS`, site data in
  `prompt`, like `tier`/`slug`/`par_time`) so a challenge's density, target
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
- **Visuals (standing directive):** all GAUNTLET UI, current and new, must
  conform to the **VIEWPORT design system** documented in
  `docs/GAUNTLET-DESIGN.md`. Tokens and the re-skin layer live in
  `src/lib/gauntlet/viewport/viewport.css` (scoped to `.gt-root`, the
  `/gauntlet` layout wrapper); ambient components (canvas background, CAD
  cursor, feature-tree nav, trademark footer, entrance choreography) mount
  once in `src/routes/gauntlet/+layout.svelte` so every page inherits them.
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
