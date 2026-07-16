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
- **Production domain:** `ideabosco.com` is the **canonical** production domain.
  The Vercel default `idea-app-sage.vercel.app` is not canonical: `vercel.json`
  adds a platform-level 308 redirect from that host to the same path on
  `ideabosco.com` (host-matched, so it only fires for the vercel.app hostname).
  Any hardcoded absolute URL (OG tags, sitemap, robots) must use
  `https://ideabosco.com`, never the vercel.app host.

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
  visitors can collapse/compact for the session only, unsaved). The old "next
  live course" promo callout above the launcher is retired; the pinned FSP
  section (see "2026-27 curriculum" below) now sits in that spot instead.
  **Uniform card chrome
  (no per-card accent):** every launcher tile uses ONE shared design-system
  accent (brass/gold) via the `--acc*` CSS vars on `.app-card` in
  `AppLauncher.svelte`; there is deliberately no per-card `accent` field.
  Cards are differentiated by name, tagline, status badge, and section group,
  never by an arbitrary per-card color (the old `AppAccent` field + `.acc-*`
  classes were removed because a per-card color read as an unrelated identity
  hue on tools it did not belong to, e.g. violet on the teacher dashboard).
  `--crimson` stays reserved for status. Cards carry the machined
  `var(--bevel-raised)` and press on `:active`. FSP is NOT a launcher app: it
  is a regular class card in the course listing (see "2026-27 curriculum").
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

One var is read via `$env/dynamic/public` instead (runtime, so a missing value
never breaks the build and the page degrades gracefully):

- `PUBLIC_FSP_APPS_SCRIPT_URL` — the Apps Script endpoint the FSP tech-selection
  tool posts to (see "FSP tech selection" below).

See `.env.example`. **Never hardcode keys.** Never commit `.env`.

## 2026-27 curriculum

`src/lib/curriculum.ts` is the single source of truth for the live curriculum. It
is **plain data** (no `?raw`/`$lib/legacy` imports) so it is safe in the client
bundle.

- `SECTIONS`: every section. Sections of the same course are modeled separately
  (e.g. `eng1h-sophomore` vs `eng1h-senior`) so a student sees their own. Each has
  an `id`, `course`, `title`, `year` (1-4), `instructor`, `term`, `status`, and an
  optional `assignments` list (empty for the new courses until content exists).
  The **Freshman Summer Program** (`summer-2026`) is the `status: 'live'`
  section pinned atop the homepage (see below); its title/dates are
  placeholders to fill in.
- Helpers: `sectionsByYear()` (the curriculum grid), `summerProgram()` (the
  FSP section), `sectionById()`, `selfSelectOptions()` (the picker),
  `activeCourseCount()`.
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
- **Co-op Phase 1 (beta, game v188):** shared-field 2-player co-op over Supabase
  Realtime broadcast, no sign-in required (broadcast only, nothing persisted).
  The serve-time injection exposes `window.__ideaCoop` (public URL + anon key
  plus a lazy loader that pulls the supabase-js UMD from jsdelivr only when the
  player opens CO-OP) and `window.__ideaCoopName`. The title screen gains a
  CO-OP entry (a separate flow, not a mode value) opening a lobby overlay:
  create room (4-char code, `vgcoop:<CODE>` channel, distinct from the netcheck
  `coopnet:` namespace) or join by code, presence roster (P1 host = IDEA green,
  P2 guest = cyan, per the identity doctrine), host-only START. **Per-player
  refactor:** ship state lives in a `players` array (players[0] host,
  players[1] guest) with the old `player` variable kept as the ALIAS for
  `players[localIndex]`, so all local input/fire/upgrade code is unchanged; a
  solo run is a 1-element array with identical behavior (the hard invariant).
  Combat/draw/HUD paths that must see both ships were widened (contact +
  bullet + ring/hazard collisions, pods, kill attribution via bullet `pi`,
  enemy/boss aiming via `nearestPlayer()`, both ships drawn with identity
  colors); coins are a shared wallet on players[0]. **Host-authoritative:**
  the host runs the full sim (guest held-input applied to players[1], one-shot
  actions relayed as events) and broadcasts ~15Hz compact snapshots; the guest
  sends ~25Hz input heartbeats and renders snapshots. Match ends only when BOTH ships are out of
  lives; the end screen is the adapted game-over labeled CO-OP // UNRANKED with
  NO leaderboard submit, NO telemetry, NO achievements, NO checkpoint; both
  ships START on the clean baseline build (Phase 1 skipped REFIT entirely;
  superseded by the v199 co-op REFIT economy, see below). Partner/host
  disconnect shows a modal and ends the match cleanly. Difficulty was the
  unscaled solo curve (accepted Phase 1 gap, closed in v199).
  `?coopstub=1` (opt-in, like `?mockresume=1`) swaps the transport for a
  same-origin BroadcastChannel stub so the whole flow is regression-testable
  with two tabs/iframes and no live backend (it also exposes `__vgStub*`
  introspection/fault-injection helpers for scripted drives); the sibling
  `?vgheadless=1` flag pumps requestAnimationFrame off a MessageChannel so
  the game loop runs even in a hidden/headless tab.
- **Co-op Phase 2 (game v190): guest-side smoothing, render-only.** Fixes the
  steppy guest render accepted in Phase 1. Two techniques, both scoped to what
  the GUEST displays (host and solo behavior byte-identical): (1) own-ship
  POSITION prediction: the movement-integration block of `updateShip` is
  extracted verbatim into the side-effect-free `stepShipPosition(pl, ctrl, dt)`
  (updates only x/y/vx + arena clamp; `updateShip` calls it, a pure refactor),
  and `COOP.guestFrame` runs it every frame on the guest's own held input;
  snapshots reconcile in `applyShip` (error <= `PRED_SNAP_PX` 40px blends out
  ~12%/frame, larger or death/respawn snaps outright). (2) snapshot
  interpolation for everything host-owned: `applySnap` buffers prev->cur
  positions per entity (`bufPos`: partner ship, enemies by `_eid`, boss, with
  an `INTERP_JUMP_PX` 120px teleport guard so respawns/blinks snap, never
  glide) and per-frame `interpFrame` lerps by time-since-newest-snapshot over
  the measured snapshot interval, clamped to 1 (late packet = brief hold);
  bullets are ephemeral/unindexed so they extrapolate forward on their own
  broadcast vx/vy (capped `BULLET_EXTRAP_MAX` 0.25s) instead of cross-snapshot
  matching. Nothing but position is ever predicted: fire/parry/damage/score
  still come entirely from host snapshots, so the guest cannot diverge on
  anything that matters. Deferred to later phases: difficulty scaling and
  synced REFIT (both landed in v199), revive/down-states (landed in v200),
  co-op boards, reconnect.
- **Co-op Phase 2.5 (game v191): predicted action feedback + delay-buffered
  interpolation, guest-side only.** Two responsiveness fixes layered on Phase
  2 without moving any authority. (1) Predicted FEEDBACK, never outcome: the
  guest's fire press (physical key edge in `COOP.guestFrame`; the synthetic
  autofire hold has no press moment) and parry press (`tryParry`'s coop-guest
  branch) play the existing audio cue plus a cosmetic-only flash (muzzle
  particles / cyan ring + shake) instantly and locally. No projectile or parry
  state, no ammo/heat/cooldown, no score, and no snapshot-owned field is
  touched, so a host-rejected action costs one harmless extra cue and there is
  never anything to reconcile; the real resolution still arrives only via
  snapshot. Bomb/meltdown/weapon-switch were deliberately NOT given predicted
  cues (their success cues are loud or paired with explicit fail cues, so a
  misfire would read as a lie). (2) The guest renders the host-owned world
  (partner, enemies, boss, bullets, HUD) `RENDER_DELAY_MS` (90ms, a tunable
  constant beside the other COOP timing constants) in the past through a small
  rolling buffer of arrival-stamped snapshots (`snapBuf`; `applySnap` applies
  each buffered snapshot once the delayed render clock enters its bracket, and
  `interpFrame` lerps across the applied bracket), so in-order WebSocket
  jitter and queue-release bursts are absorbed by buffered history instead of
  the Phase 2 hold-then-jump; the guest's OWN predicted ship still reconciles
  against the NEWEST snapshot immediately (untouched by the delay), the
  `INTERP_JUMP_PX` teleport guard still applies, and a gap beyond the buffer's
  coverage briefly holds rather than extrapolating. The `?coopstub=1` stub
  gained in-order delivery fault injection (`__vgStubNetDelay`,
  `__vgStubNetJitter`, `__vgStubNetStall(ms)`) and a cosmetic-FX sampler
  (`__vgStubFx`) so both behaviors are regression-drivable with two tabs.
- **Co-op visual parity pass 1 (game v192): hazards, score feedback, boss
  phase drama, partner action cues.** Four render-only guest-side additions;
  the host sim, scoring, damage, and authority are untouched. (1) Environmental
  hazards: `buildSnap` gains compact `ho`/`hz`/`br` fields (holes with the
  fields their draw actually reads incl. the `core` spin clock and an encoded
  travel/active/implode state, hazard zones, boss barrier walls; `0` when
  empty, the `bo` convention) mirrored on the guest into
  `guestHoles`/`guestHazards`/`guestBarriers` maps keyed by host id (the
  guestEnemies pattern) that only feed the existing draw functions - no pull
  or damage runs guest-side; holes ride bufPos/lerpPos for smooth travel,
  spin their core locally at the host rate, and replay the host's one-shot
  arrival/implosion ring bursts on state-change edges. (2) Score feedback:
  the guest's world-snapshot apply pops ONE combined "+N" above the guest's
  own ship per snapshot in which the authoritative score increased (no
  per-event location exists, so kill sites are never guessed) and runs the
  existing `highestMilestoneCrossed`/`celebrateMilestone` against the solo
  `lastMilestone` tracker (reset by startGame in beginMatch; the guest is its
  only writer since it never runs addScore). (3) Boss phase-transition drama:
  the guest's boss apply edge-detects the transmitted phase against its own
  stored one BEFORE stamping and replays solo's exact flash / shake / rings /
  particles / name-plate / audio (minus the gameplay `b.tT` telegraph pause).
  (4) Partner action cues: `firePrimary`/`tryParry` bump per-ship
  `fireSeq`/`parrySeq` counters (inert in solo), `shipSnap` transmits them as
  `fq`/`pq`, and the guest's non-local `applyShip` replays the muzzle flash /
  parry ring once per detected counter step at the displayed partner
  position. Cosmetic timers solo's host-only update() owns (bossFlash,
  scoreFlash, boss flash/flicker/notch, hole spin) now also tick in
  guestFrame's cosmetics block. Stub drive injectors added: `__vgStubHole`,
  `__vgStubHazard`, `__vgStubBarrier`, `__vgStubScore`, `__vgStubBossNow`,
  `__vgStubBossHp`. Known gaps deferred to pass 2: FLAK cloud visuals and
  enemy telegraph/state fidelity.
- **Co-op visual parity pass 2 (game v195): enemy telegraph fidelity + FLAK
  clouds.** Closes both pass-1 gaps with the same transmit-compactly /
  mirror-render-only pattern. (1) Enemy telegraphs: `buildSnap`'s enemy rows
  gain state (index into the `ESTL` enum, the `FKL` pattern), aim angle, buff
  glow, and a packed static kind (mutator elite 0-3 | anchor +4), plus the
  FOREMAN lock telegraph (`lockT`/`lockX`/`lockY`) as three trailing slots
  only while a lock is charging; the guest stamps them onto its shadow objects
  (`stampEnemyTele`, replacing the pass-1 hardcoded `guestEnemyDefaults`
  values) so the SAME draw code renders real behavior poses, aim tilt, buff
  auras, elite mutator rings, the anchor halo/field/tethers (`buffR` fixed 150
  from the sole anchor spawn site), and the foreman lock line. `barrageGlow`
  is deliberately NOT transmitted (no draw reads it; it only feeds `e.tell`,
  already in the snapshot) and `spin` is NOT transmitted (it only scales the
  core clock; the guest advances `core` locally at the base 1.1 rad/s between
  snapshot restamps, the holes-core pattern). The fleet-level converge
  set-piece telegraph stays host-only (it reads the untransmitted `fleet`
  object, a known remaining gap). (2) FLAK clouds: a compact `fc` snapshot
  field (`[id,x,y,r,t,life]`, cap 12, `0` when empty) mirrors into the
  id-keyed `guestFlak` map repopulating `flakClouds` for the existing draw;
  guest shadows carry `dps:0`, `updateFlakClouds` never runs guest-side
  (damage stays host-authoritative), and the fade clock ticks locally in the
  cosmetics block. Stub additions: the `__vgStubTele` sampler plus
  `__vgStubForeman` / `__vgStubVector` / `__vgStubMut` / `__vgStubAnchor` /
  `__vgStubBuffAll` / `__vgStubFlak` injectors.
- **Co-op generic cue replay (game v197): event-driven audio/visual parity,
  the systemic fix for the one-cue-at-a-time parity chase.** Every one-shot
  audio/visual cue that fires inside the host-only simulation also queues a
  compact typed row (host-side `COOP.ev*` helpers, no-ops in solo and on the
  guest) that rides the next snapshot as the `ev` field (`0` when empty, the
  ho/hz/br/fc convention; cap 10 rows per snapshot with a significance
  priority on overflow; the buffer is consumed per snapshot so an event rides
  exactly once). ONE guest dispatcher (`applyEvents`, run first in
  `applyWorldSnap`) replays the SAME cue code solo runs, render/audio-only
  (writes nothing but Audio_ plus parts/shards/rings/pops/shake/hitStop/
  bossFlash/warpT): enemy deaths (faction kill sound, explosion, faction
  death layer, elite/anchor flourishes; a kill event retires its guestEnemies
  id so the v192 vanished-id sweep never double-explodes, and that sweep
  stays the silent fallback for cap-dropped kills), bullet-impact sparks
  (3 per interval), player shield-hit/shield-break/armor-hit cues, parry
  SUCCESS (activation was already predicted in v191), pickups (coin/core/
  shield/1up/powerup), bombs, boss touchdown and death finale, and a deduped
  audio-only SFX class (enemy fire, boss attack whines/blasts/wubs/thumps,
  fleet set-piece telegraph audio: one instance of each sound per snapshot,
  mirroring the sample layer's own 50ms throttle). Alongside it, dedicated
  replays off already-transmitted state edges (no bandwidth): style rank-up
  cue, boss arrival warn + `boss:<fk>` music lane, boss dying-edge drama +
  ELIMINATED card + a render-only death rumble in guestFrame's cosmetics
  block, the music lane restore on boss removal, and the sector lane on
  sector change. Stub drive additions: `__vgStubKill`, `__vgStubPod`,
  `__vgStubBombNow`, `__vgStubEv` (sent/applied counters; a full stub match
  verified sent == applied exactly, once-only delivery). The gaps known at
  v197 (sustained loops, untransmitted boss sweep/scan state, `deathSlow`,
  the SYSTEM HALT overlay, and untransmitted field pods) were all closed in
  v203 (see the audio/visual parity close-out bullet below).
- **Co-op REFIT economy + two-ship difficulty (game v199):** REFIT now runs in
  co-op instead of being skipped (the Phase 1 "REFIT SKIPPED" auto-chain is
  gone). Doctrine: ONE shared wallet (`players[0].coins`, the existing
  convention), INDIVIDUAL builds (a purchase applies to the buying pilot's own
  ship), host arbitrates. At a sector clear the host runs the normal
  `openRefit()` and broadcasts a `refit` event; the guest opens the SAME solo
  shop UI (`buildRefit`/`renderShopGrid`/`refitItems` read the global `player`,
  which on the guest IS the guest ship - no shadow shop). `buildRefit` is
  wallet-aware via `walletShip()` (players[0]; solo identical). Host purchases
  run the solo path directly; guest purchases ride the existing sendAct channel
  as `rbuy` requests (item index + name + the guest's own `runDwell` for
  keystone gates) that the host validates against the wallet at processing time
  (first-come-first-served = concurrent-spend arbitration), applying to
  `players[1]` with `player` temporarily pointed at it, then answers with a
  `res` carrying ok/reject reason + a full sync. Because `shipSnap` never
  carried `up`/`ks`/`hks`/`modules`, every refit message syncs them plus a
  `shipSnap`, and the guest reruns `applyUpgrades` so its movement prediction
  honors ENGINE buys; match-wide gate stats (runBosses/runHits/... /maxStyle)
  are synced too. Guest UX: one request in flight, "PURCHASE REQUESTED" status,
  4s timeout ("NO RESPONSE"), reject reasons shown ("INSUFFICIENT FUNDS"), the
  buy/buy_fail cues on resolution. Flow control: LAUNCH becomes READY UP
  (`refitLaunchRequested()`; Enter and the button both route through it); the
  match resumes ONLY when both pilots are ready (`rrdy`), the host then
  broadcasts `launch` and runs `launchFromRefit()`. Self-healing: an 800ms host
  heartbeat re-sends wallet/ready/build state (guest re-asserts `rrdy` off it),
  and a snapshot arriving while the guest is still in refit (host only
  snapshots in play) is a launch fallback; `partnerLost`/`leave` clear the
  session. `beginMatch` now seeds the partner ship's `ks`/`hks`/`modules`
  baseline (makeShip lacks them; module buys would crash host-side otherwise).
  Difficulty: co-op-only dials beside BAL (`COOP_ENEMY_HP_MUL` 1.35 in
  `enemyHpMul()`, `COOP_BOSS_HP_MUL` 1.5 in `spawnBoss`, `COOP_ALIVE_BONUS` +3
  on the wave spawner's alive threshold), every use gated on `coopMatch`, so
  solo/hardcore curves are byte-identical; conservative starting points meant
  for playtest tuning. The playfield never grows (Pillar 4). Stub addition:
  `__vgStubEval` (game-scope eval for scripted drives; the game's top-level
  lets are closure-scoped and unreachable from the console otherwise). Still
  deferred: reconnect, co-op boards, telemetry (revive/down-states landed in
  v200, see below). Known accepted quirks: match-wide (not per-ship) module
  gate stats, and keystone dwell validated from the request's self-reported
  `runDwell` (unranked co-op, host still owns the wallet).
- **Co-op revive/down-states (game v200, NORMAL co-op only):** a ship that
  runs out of lives in co-op goes DOWNED (`pl.downed`, layered ON TOP of the
  existing `pl.dead` so every dead-gate - movement, firing, damage, enemy
  aim, pod pickup - applies unchanged) instead of permanently out; the
  per-life respawn (`respawn`/`lives>=0`) is untouched. A living teammate
  holding within `COOP_REVIVE_RADIUS` (70px) for `COOP_REVIVE_TIME` (2.0s;
  the host-side channel `updateReviveChannel` runs only in update()'s sim,
  so the guest never executes it) revives the wreck IN PLACE at
  `COOP_REVIVE_HULL_PCT` (0.45) of max armor with NO lives restored: a
  revived ship that loses its hull goes straight back down (exposure
  preserves danger) and can be revived again, in either direction (the
  guest can revive the host). Channel progress decays at 2x while nobody is
  in range, so rapid in-and-out banks nothing but a one-frame dropout is not
  a hard reset. Dials sit beside the other co-op constants.
  `alivePlayersLeft()` now counts "still in the fight"
  (`!downed && (lives>=0 || !dead)`), so the run ends exactly when nobody is
  left standing to attempt a revive (both downed at once); solo semantics
  byte-identical. `resetPlayer(false)` clears `downed`/`reviveT`, so a
  lives-granted respawn (1up / CORE extra life) cleanly rescues a downed
  ship. Sync rides `shipSnap` (`dn`/`rv`), deliberately NOT a new
  hazard-style entity map: ships are already position-tracked snapshot
  entities. `drawDownedWreck` (dim split hull in the ship's identity color,
  blinking crimson distress beacon, dashed revive-radius ring, gold channel
  arc + percent) renders from those same fields on both clients, and the
  guest replays the revive cue off the snapshot's downed->flying edge in
  `applyShip`. HARDCORE has no revive by explicit gate (`gameMode!=='hardcore'`
  at both the down-point and the channel call site); hardcore co-op is not a
  reachable mode today (co-op always runs `gameMode='coop'`), so the gate is
  future-proofing, verified synthetically. Solo and hardcore-solo
  death/respawn/game-over paths are unchanged.
- **Co-op guest reconnect grace (game v202, GUEST drops only):** a guest whose
  presence drops mid-match no longer ends the match instantly. The host
  FREEZES the sim (`COOP.graceFrame()` early-returns `update()`, placed
  BEFORE the state gate so the countdown ticks even if the host was paused
  when the drop hit; a frozen match means the unattended guest ship can never
  die, or permadie in hardcore co-op, and the resync target stays
  deterministic) and holds the room open for `COOP_RECONNECT_GRACE_S` (30s,
  beside the other co-op dials), showing a countdown on the existing coopMsg
  modal ("PARTNER DISCONNECTED ... ENDING IN Ns" with the room code, button
  relabeled END MATCH NOW; the modal now swallows keydowns while visible so
  Enter/Escape cannot reach the game underneath). The room CODE is the
  reconnect identity (a reload mints a fresh presence id, so possession of
  the code, already the join credential with a one-guest cap, is the only
  stable match): a guest rejoining the same code gets a FULL `rsync`
  broadcast (the v199 refit sync payload - wallet, own ship snap, build
  up/ks/hks/modules, run stats - plus mode, sector counters, score/style/
  mult, run clock, and the partner's ship snap; sent 3x since broadcast has
  no ack, the guest's lobby-phase guard no-ops repeats), enters through the
  normal `beginMatch()` and stamps the authoritative state over it
  (`lastMilestone` via `highestMilestoneAtOrBelow`, the run-resume pattern,
  so old milestones never re-celebrate); the world itself rebuilds from the
  normal snapshot stream on resume. Rejoin aids: the co-op lobby prefills
  the last room code (in-memory for the same tab, plus the device-local
  `vgcoop_last` localStorage hint for a reopened tab - deliberately NOT
  `vanguard_`-prefixed so the cloud-save prefs sweep never syncs an
  ephemeral room code). A DELIBERATE quit (toTitle -> `COOP.leave()`) now
  broadcasts `bye` so the partner still ends immediately instead of sitting
  out the grace window; expiry falls through to `partnerLost` exactly as an
  immediate drop used to, and the guest's connection-lost modal gains a
  rejoin hint. Explicitly out of scope: HOST drops (the host is the sole
  simulator; no migration/handoff, the match still ends immediately,
  unchanged) and guest drops while the host sits in REFIT (immediate end as
  before; resyncing a live REFIT session is deferred). Solo never enters any
  of this (`graceFrame` is called only when `coopMatch`).
- **Co-op audio/visual parity close-out (game v203):** closes the four gaps
  documented since v197, all render/audio-only, established patterns reused.
  (1) SUSTAINED LOOPS: the guest ticks the SAME two loop gates the host's sim
  runs, per frame in guestFrame's cosmetics block - `heavyLoopSfx` driven by
  a per-ship want derived from snapshot-synced ship state (beamActive/heavy/
  waveT/dead/downed all already rode `shipSnap`, so NO new transmission; one
  combined call per frame, own ship wins the slot, so two ships never
  flip-flop the loop layer; no prediction - beam validity is host-side, the
  loop keys off synced state ~1 snapshot late) and `bossBeamLoopSfx(boss)`
  off newly-transmitted sweep/scan state. The guest's refit-open handler
  stops all loops (its gates stop ticking in refit). (2) BOSS CARVING BEAMS:
  `bo` gains `sw`/`sn` (0 unless a sweep/scan is live AND the boss is not
  dying, so death silences the guest exactly like the host's stopAllLoops):
  telegraph state sends start/span/dir (the preview derives from the already-
  sent `tl`), live state sends angle + angular velocity, which the guest
  advances locally between restamps (the holes-core pattern; scan clamps to
  the host's pivot bounds). Damage/hazard spawns from the beam stay
  host-side. (3) FIELD PODS: `po` snapshot field (cap 16, only what drawPod
  reads: type via the existing PODK enum, color string like `eb` rows,
  radius, pwr-buff/core-faction in one trailing slot) mirrored into the
  id-keyed `guestPods` map repopulating `pods` (the guestEnemies pattern,
  bufPos/lerpPos smoothing since pods drift/chase); bob/spin tick locally;
  NO pickup logic guest-side - a collected pod vanishes from the list and its
  cue was already riding EV_PICKUP. (4) DEATH SLOW-MO: `deathSlow` is now set
  guest-side at every host trigger, off transmitted edges: EV_BOMB 0.25,
  boss dying edge 0.7, EV_BFIN 0.5, and full-wipe 1.1 via the
  `alivePlayersLeft()` predicate over freshly-stamped ships (edge-tracked in
  `guestAlivePrev`). frame() already scales update dt by 0.4 while it drains,
  which on the guest slows own-ship prediction exactly as the host slows its
  sim of the same ship; world entities stay snapshot-true. (5) SYSTEM HALT:
  the guest's `station` is created by the EV_BFIN replay (the same moment
  finishBoss creates it host-side), ticked by `updateStation` in guestFrame's
  cosmetics, self-healed by an `hl` flag on the v199 refit-open payload
  (broadcast is lossy; today every refit is post-boss - refit only opens from
  the bossSpoils drain - so `hl` is 1 in practice, but it stays honest if a
  non-boss refit path ever lands), and departs in `refitGuestLaunch`
  mirroring `launchFromRefit`. Solo/hardcore byte-identical: every addition
  is inside guest-only code paths or 0-when-idle snapshot fields.
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

## GREENLINE (prototype)

GREENLINE is a 3D combat racing game in its earliest exploration phase. The
only artifact so far is the movement + track prototype at
`/dev/greenline-movement` (dev-only harness, 404 in production, no auth or
Supabase): a placeholder box car driven by a cannon-es `RaycastVehicle`
(`cannon-es` is a runtime dependency; three.js is reused, not duplicated), a
smoothed chase camera, WASD/arrow + gamepad (standard mapping) input, Space
handbrake, R reset, and an on-screen live tuning panel (drive forces, aero
drag, speed-sensitive steering falloff, mass, gravity, suspension, tire
friction, track boundary response, camera) so driving feel can be hand-tuned
without a redeploy. Deliberately throwaway and iterative: it validates
driving and lap feel before any combat or art gets built, and will be rebuilt
as the design solidifies. One hard-won cannon-es lesson lives as a code
comment in the route: a body's cached world AABB is computed while its
quaternion is still identity and static bodies never refresh it, and raycasts
(unlike contacts) are AABB-culled, so a rotated ground plane must call
`updateAABB()` after its quaternion is set or the wheel rays only find ground
on one side of the world.
- **Track format (v1):** `src/lib/greenline/track-schema.ts` is the schema
  (types + `parseTrack` validation) every future track uses; a track is ONE
  plain-JSON file (`src/lib/greenline/tracks/*.json`, plain JSON import like
  the FRC drill banks). World units are meters on the ground plane (x/z,
  y up); headings are degrees, 0 = +x, positive counterclockwise
  (`atan2(-dz, dx)`). A track = `spawn`, a `surface` (v1: `ribbon` =
  centerline polyline + constant width; future kinds join the discriminated
  union), a `startFinish` gate, ORDERED `checkpoints` (directional gate
  lines: segment + required crossing heading, so backward crossings never
  count), and `boundaries` (polylines; the data says where the limits are,
  never how they are enforced). Reference track: `tracks/test-loop.json`
  (653 m closed loop, five checkpoints, turns from a 16 m hairpin to a
  near-straight sweeper), generated by a scratch script, committed as data.
- **Track runtime:** `src/lib/greenline/track-runtime.ts` is pure logic (no
  three/cannon/Svelte): gate-crossing math (segment vs segment with sub-frame
  interpolation, so fast cars cannot tunnel), the `LapTracker` state machine
  (timing starts at the first start/finish crossing; a lap counts only after
  every checkpoint in order, then the line; out-of-order/skipped crossings
  are rejected and reported), and `surfaceState` (warm-started
  nearest-centerline query + boundary containment returning violation depth
  and push direction). The harness turns those FACTS into forgiving forces
  in one swappable block: extra drag off the ribbon, a capped spring +
  outward damper past a boundary (soft walls, tunable from the panel), never
  hard collision.
- **Minimap:** `src/lib/greenline/Minimap.svelte`, a top-down SVG of the
  boundaries, ribbon, gates (next checkpoint highlighted, start/finish gold)
  and a vehicle heading triangle fed by the physics loop (plus smaller amber
  markers for non-player vehicles).
- **Combat scaffold:** `src/lib/greenline/combat.ts` is pure, vehicle-agnostic
  logic (like the track runtime): `VehicleCombat` holds health / disruption /
  oiled / down / eliminated state for ANY vehicle plus PER-WEAPON cooldowns
  (`WeaponId = emp | oil | tether | ram`, `canUse`/`markUsed`), and `driveMods`
  turns combat state into engine/steer/traction scaling. **The RACE vs
  ELIMINATION zero-health branch lives in exactly one place,
  `VehicleCombat.applyDamage`:** RACE = temporary down window then full-heal
  (`tick` recovers), ELIMINATION = permanent removal. The harness runs the
  player and every AI through one identical per-vehicle pipeline (controls ->
  driveMods -> physics), shows a health bar + DISRUPTED/OILED/TETHERED/DOWN/
  ELIMINATED HUD and an overhead bar on AIs, and has a MODE select + every
  combat, weapon, and feedback number in the tuning panel.
- **Four disruption tools,** consistent trigger/cooldown/HUD pattern, any
  vehicle can use any tool (loadouts come later): the forward **EMP burst**
  (`tryFire`, F / RB: cone + damage + disruption + spin kick), the **oil
  slick** (`tryDeployOil`/`updateOilSlicks`, E / X: dropped behind, a ground
  trigger volume consumed by the FIRST vehicle through it, cutting tire
  frictionSlip for a few seconds; owner immune only during a short arm
  window), the **tether** (`tryTether`/`tetherStatus`, Q / LB: latches the
  nearest vehicle ahead in range/cone, one-time latch damage, then the harness
  pulls the target toward the shooter for the hold duration, force tapering
  inside a slack radius so pairs never orbit-slam, plus a 25% reaction drag on
  the shooter), and the passive **shockwave ram** (`tryRam`: nose-first
  chassis contact above a closing-speed threshold damages + briefly stuns
  BOTH and the harness blasts them apart with horizontal + pop-up impulses;
  contacts queue from cannon collide events and are evaluated on PRE-step
  velocities because the solver has already eaten the closing speed by the
  time the event fires). AI decides tool use in `ai.ts` (`wantsFire`,
  `wantsOil` when a rival is close behind, `wantsTether` for targets beyond
  EMP reach, shared per-weapon restraint scheduling).
- **Combat feedback layer** (all in the harness, presentation only):
  trauma-model screen shake (shake = trauma^2, distance-scaled for off-player
  events), an additive spark Points pool + a sprite smoke pool (dark smoke
  and oil drips need normal blending to read), escalating damage states on
  the placeholder mesh (scorch tint lerp, per-rig vertex-jitter crumple at
  75/50/25% health restored on heal, hood smoke + embers, heavy wreck smoke),
  and a distinct landing moment per tool: glossy black puddle with an
  additive violet rim, visible gold tether cable + pulsing hook, cyan stun
  crackle ring + spark arcs while disrupted, amber shockwave rings on rams,
  and a knockout explosion on every down/elimination. `?glheadless=1` (the
  VANGUARD `?vgheadless` pattern) pumps the loop off a MessageChannel so
  scripted `__greenline` console drives (fire/oil/tether/damage/capture) run
  in a hidden tab.
- **Loadouts (archetypes + parts):** `src/lib/greenline/loadout.ts` is the
  pure balance sheet (the curriculum.ts convention): every effect is a
  MULTIPLIER over the harness tuning-panel baseline (neutral 1), a build =
  one archetype x one part per slot, resolved by `resolveLoadout`. The four
  archetypes are the big identity (ARMOR juggernaut 1.6x hull / 1.35x mass /
  0.75x ram damage in; VELOCITY missile 0.8x drag / 0.7x hull; HANDLING
  scalpel 1.2x grip / steering held at speed; SYSTEMS warlock 0.8x cooldowns
  / 0.65x stun taken / weak hull), and the 4 slots x (stock + 3) parts each
  trade explicitly -- NO strict upgrades (slicks grip harder but take 1.4x
  oil duration, all-terrain treads halve grass drag but dull on-track grip,
  hot intake adds power but lengthens stuns taken, reactive cage shrugs rams
  at the cost of hull). Mass is deliberately dual-natured: heavy builds
  physically resist tether yanks / ram knockback / spin-outs (impulse over
  mass) and pay in acceleration and cornering. Wiring: per-rig
  `rig.buildStats` multiplies the physics pipeline (engine, brakes, drag,
  steering, mass, grip, suspension, grass drag), `VehicleCombat.maxHealth` +
  `VehicleCombat.resist` carry the defense side (consumed inside the pure
  combat functions; `tryRam` deals per-side damage through each receiver's
  impact resistance), and `ctFor(rig)` threads the offense side (damage out,
  EMP range, tool cooldowns) as a per-shooter effective CombatTuning.
  `src/lib/greenline/Garage.svelte` (G key in the harness) is the
  presentation-only loadout screen: archetype cards, per-slot part pickers
  with green/red/amber tradeoff chips, and a resolved-build summary; changes
  apply LIVE, everything is unlocked (the currency/unlock economy is a later,
  separate problem), and the player loadout persists per browser in
  localStorage (`greenline_loadout`). AI rigs cycle the four archetypes
  (stock parts) and their DRIVER targets scale with the build (allowed speed
  ~ sqrt(engine/drag), corner budget ~ grip), so rounds have felt variety;
  standings rows carry a 3-letter archetype tag. A `pitchDamp` anti-wheelie
  dial (local pitch-rate damping, yaw untouched) keeps light builds from
  backflipping under full throttle.
- **AI opponents:** `src/lib/greenline/ai.ts` (pure, like combat/runtime): one
  `AiDriver` per vehicle. The racing line is DERIVED from the track data (no
  hand-authored path): centerline pure-pursuit with speed-scaled lookahead,
  per-point curvature -> corner speeds, and a braking-distance sweep over
  upcoming points for brake-early behavior; off-ribbon it aims at the nearest
  centerline point to rejoin, and a stuck timer backs it out of walls.
  `wantsFire` decides weapon use with restraint (aggression scales usable
  range and a post-cooldown delay; a disrupted AI never fires); shots route
  through the harness's shared fire path. The harness (superseding the
  scripted dummy) runs the player plus N AI rigs (default 3, up to 6, count
  applies on round reset) each with its OWN LapTracker, health, and combat
  state, spawned on a staggered grid behind the start line. RACE resolves by
  finishing order (banner with the player's position, standings row FIN Pn);
  ELIMINATION by last vehicle running (checked after every elimination). A
  live standings list (laps > checkpoints > distance to next gate) sits in
  the HUD; AI tunables (count, top speed, corner accel, aggression) are in
  the panel's ai section.

## FRC Training track

The Team 5669 FRC training track at `/frc`. Signed-in tier, any role; the
whole track is open access and **pathway is identity, never a gate**, nothing
in the track may wall off content by pathway. Structure, theme, two domains'
unit content (CAD and Mechanical Design's sixteen units, Foundation's F1), a
real per-user progression backbone, and the knowledge-quiz auto-gate are live;
the remaining gate engines (GAUNTLET) and the rest of Foundation's units are
still deferred.

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
  thresholds here). A domain may declare `contentSet: 'mdm'` or
  `'foundation'` to mark that its units resolve to real per-unit pages (each
  content set is its own authored seed + parsed unit list; see the Foundation
  bullet below for how a second content set was added without introducing any
  cross-domain coupling).
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
- **Knowledge-gate quiz (0040; MDM-1, 2, 3, 9, 10):** the auto-gate, built
  SERVER-AUTHORITATIVE so the answer key never reaches the client. It serves a
  PER-UNIT item bank: MDM-1 from `src/lib/server/frc/mdm-1-quiz-bank.json`, and
  MDM-2 / MDM-3 / MDM-9 / MDM-10 from the `banks` map in
  `src/lib/server/frc/mdm-quiz-banks.json` (both under `$lib/server`, so
  SvelteKit never bundles them client-side; each bank is a pool larger than its
  `testLength` with per-item options + answer index, plus its own `passPercent`,
  90 across the board; MDM-1 draws 10 questions, the others 6).
  `src/lib/server/frc/quiz-engine.ts` holds the pure logic: `getQuizBank(unitId)`
  resolves the unit's bank (MDM-1 + the shared map spread into one `BANKS`
  record), then `pickAttempt` selects that bank's `testLength` items at random,
  shuffles each item's options, splits the correct index into a server-held
  `sealed` key, `gradeAttempt` is the CANONICAL grader mirrored by the SQL RPC,
  `cooldownState` derives the cooldown, and `missedTopics(tags, objectives)`
  names missed objectives (MDM-1's curated `TOPIC_NAMES` first, then the serving
  bank's own `objectives` descriptions, so the naming stays co-located with each
  bank). `quiz-service.ts` orchestrates start/submit over a `QuizStore`
  interface, keyed by unit id throughout. The `frc_quiz_attempts` table (0040)
  is ALREADY per-unit (each row carries `unit_id`, `sealed`, `pass_percent`), so
  no migration change was needed to add units: `frc_quiz_start(p_unit_id,
  p_sealed, p_pass_percent)` persists the attempt, and `frc_quiz_grade` reads the
  unit/key/threshold off the attempt row it grades. The `sealed` key column has
  NO client SELECT grant, and grading runs inside the `frc_quiz_grade` SECURITY
  DEFINER RPC (mirrors `gradeAttempt`) so answers never leave the server. RLS
  mirrors the pattern (student reads/inserts own via the definer RPCs, teachers
  read all). The unit endpoint `POST /frc/[domain]/[unit]/quiz` (start | submit)
  takes the unit from the route (`params.unit` -> `getQuizBank`), enforces the
  ESCALATING cooldown (schedule `FRC_QUIZ_COOLDOWNS_SEC` /
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
  pass/next-unlocked or fail/missed-topics/cooldown), FRC-themed; it needs no
  unit id of its own because the endpoint URL encodes the unit. UnitPage shows
  it when the server load reports `gate.enabled` — true for any unit with a bank
  (MDM-1, 2, 3, 9, 10); the modeling-gate units (MDM-4 through MDM-8) have no
  bank, so `getQuizBank` returns undefined and they keep the description-only
  Gate. The unit seed metadata sets `gate: quiz` for MDM-1/2/3/9/10 (display
  label only; the real enable is `getQuizBank`). `+page.server.ts` computes the
  gate state from that unit's bank (readiness, unit-complete, cooldown
  remaining) and fails soft to the description-only Gate if 0040 is unapplied.
  The dev mock endpoint `/dev/frc-quiz` takes `?unit=` (default MDM-1) so the
  `/dev/frc` harness can exercise every quiz unit's bank without a live DB.
- **Progress lockdown (0041):** closes the self-mark hole the 0039/0040 caveat
  flagged: a student could previously insert their own `frc_user_progress` row
  directly via PostgREST (the 0039 own-row write grant), bypassing every gate.
  0041 revokes that grant, drops the old student-write policies, adds the
  teacher-only `frc_mark_complete` / `frc_unmark_complete` RPCs described above,
  and recreates `frc_quiz_grade` to write completion inline. See the SQL file's
  header comment for the full before/after.
- **Modeling-gate submissions + review queue (0042; MDM-4 through MDM-8):** the
  auto-gate for the five MODELING units (the counterpart to the knowledge quiz
  gate). A student submits a link to their pack-and-go / model plus notes; a
  teacher reviews it on the dashboard and, on approval, completes the unit
  through the EXISTING `frc_mark_complete` RPC. **The table never writes
  completion itself** (no trigger, no completion RPC): approval completion is a
  separate teacher call to `frc_mark_complete`, the single completion-write
  path. `frc_gate_submissions` is keyed `(user_id, unit_id)` with `link`,
  `notes`, `status` (`submitted` | `approved` | `needs_revision`),
  `reviewer_feedback`, and submitted/reviewed timestamps. Personal-data RLS on
  the own-row pattern (0039/0040): a student reads + writes their OWN row, but
  the INSERT/UPDATE `with check` pins their `status` to `'submitted'` (so a
  student can never self-approve) and the UPDATE `using` requires
  `status <> 'approved'` (so they may resubmit only while not yet approved);
  teachers read all and update status + feedback. `src/lib/frc/gate-submissions.ts`
  is the client seam (`loadSubmission`, `loadPendingSubmissions`, `submitGate`
  as an RLS-guarded upsert, `approveSubmission` = `markUnitComplete` THEN row
  update, `requestRevision`), all fail-soft (`ready:false` if 0042 is
  unapplied). The unit page's `+page.server.ts` computes a `modelGate` (own
  submission + unit-complete) for any unit whose gate is `gauntlet:*` and which
  has no quiz bank; `FrcModelGate.svelte` renders the submit form / awaiting /
  needs-revision (with mentor feedback + resubmit) / approved-complete states,
  with an apply-migration note when `ready` is false. `FrcQuizGate` and the five
  quiz gates (MDM-1/2/3/9/10) are unchanged. The dashboard shows the pending
  queue (`FrcReviewQueue.svelte`, presentation + callbacks like
  `FrcUnitOverride`): student, unit, link, notes, submitted time, with Approve
  (→ `frc_mark_complete` + next unlocks) and Request-revision (feedback)
  actions; the per-student completion override stays as the manual fallback
  (and the sole path when 0042 is unapplied). The `/dev/frc` harness "Model
  gate" view drives the whole submit → review → approve/revision loop over an
  in-memory store (student panel + teacher queue on one page), with a
  "migration applied" toggle for the fail-soft note. **Migration 0042 must be
  applied manually in Supabase** (after 0039/0040/0041).
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
  practice, not a passive reveal** (`FrcDrillPhase.svelte`, client-side only,
  no persistence): each question is a typed attempt box ("Write your answer
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
  fabricated answer. This is now the FALLBACK drill for units with no
  interactive drill bank (MDM-4 through MDM-8; see the interactive-drill
  bullet below for MDM-1/2/3/9/10). Units MDM-11 through MDM-16 have no seed
  content yet and render as non-clickable "In development" placeholders on
  the domain page.
- **Foundation domain, all five units (F1-F5) live:** the second content set,
  proving the whole system (content model, phase machinery, both bank maps,
  the unit route) generalizes to more than one domain with NO cross-domain
  coupling introduced. `foundation-content.ts` parses the repo-root
  `foundation-content-seed.md` with the EXACT SAME `parseSeed` parser as the
  CAD content (exported from `mdm-content.ts` for reuse), into `FOUNDATION_UNITS`
  (F1 "Welcome to FRC", F2 "How a Season Runs", F3 "Safety in the Shop", F4
  "The Engineering Design Process", F5 "The Engineering Notebook", `===`-
  separated in one seed exactly like the CAD units) plus
  `foundationUnitByNumber` / `foundationUnitById`. Each unit's quiz bank lives
  under its own key (`F1` through `F5`) in the shared server
  `mdm-quiz-banks.json` (the filename predates F1; it is not MDM-exclusive)
  and its interactive drill bank under the same key in the shared client
  `mdm-drill-banks.json`, so `getQuizBank`/`getDrillBank` resolve every
  Foundation unit exactly like any MDM knowledge unit, and each runs the
  identical four-phase flow (interactive scored drill gates a server-graded
  quiz at 90 percent, which unlocks Apply). The registry (`track.ts`) gives
  Foundation `contentSet: 'foundation'` and five units with a sequential
  suggested-order chain (F2 after F1, ... F5 after F4), same convention as
  CAD; this was already generalized when F1 landed (the `FOUNDATION_UNIT_TITLES.map`
  already produced the right prerequisite chain for all five), so adding
  F2-F5's content needed NO registry code change, only the seed + bank data.
  Two call sites that used to hardcode `contentSet === 'mdm'` were generalized
  to resolve by domain: `DomainLanding`'s `hasContent()` (now checks `mdm` or
  `foundation`) and the unit route's `[domain]/[unit]/+page.server.ts` (a
  small `CONTENT_SETS` map from `contentSet` to `{ units, byNumber }`, so
  `prev`/`next` stay scoped within the resolved domain's own unit list — no
  cross-domain prerequisite or navigation was added). `FrcQuizGate`'s "all
  cleared" copy was generalized from "All CAD units cleared" to "All units in
  this domain cleared" since it is a shared component now genuinely reached
  from two domains. The `/dev/frc` harness's "Quiz gate" view keys its picker
  on unit id (not a bare number, since e.g. F1 and MDM-1 both have `n: 1`) and
  resolves the right domain/unit list per id, so every Foundation unit's full
  flow is verifiable without Supabase; the "Placeholder domain" view points at
  `mechanisms-prototyping` (still genuinely empty) since Foundation itself no
  longer has any placeholder units.
- **Interactive scored drill (MDM-1, 2, 3, 9, 10):** the repo-root
  `mdm-drill-banks.json` (a `banks` map keyed by unit id, parallel to but
  distinct from the server-only quiz banks) holds `order` (arrange a shuffled
  sequence), `match` (pair a shuffled right column to the left column), and
  `pick` (scenario multiple choice with feedback) items, plus a
  `readinessPass` percent. `src/lib/frc/drill-banks.ts` imports it directly
  (a plain JSON import, no `?raw`; unlike the quiz banks this content is
  MEANT to be visible client-side — it is coached practice, not a graded
  gate) and exposes `getDrillBank(unitId)` + a `shuffled()` Fisher-Yates
  helper; `UnitPage.svelte` picks `FrcInteractiveDrill.svelte` over
  `FrcDrillPhase.svelte` for any unit `getDrillBank` resolves. Every item type
  supports check -> see right/wrong -> retry (editing invalidates the last
  check, so re-checking is the retry, no separate button): `order` shows the
  sequence shuffled with up/down move controls per row, highlighting each row
  correct/incorrect on check; `match` shows the right column shuffled as a
  `<select>` per left row, highlighting each pairing on check; `pick` reveals
  correct/incorrect AND the authored `feedback` text the instant an option is
  selected, and also highlights the true correct option once any pick is
  made. Readiness is scored on FIRST-TRY correctness ONLY: each item's
  `firstTryCorrect` locks in on its first check/selection in the run and
  retries afterward never raise it, they only help the student learn. Once
  every item has been attempted, a readiness percent shows; at or above
  `readinessPass` a "Continue to quiz" unlocks the Quiz phase (there is
  deliberately no "continue anyway" bypass for these five units, unlike
  `FrcDrillPhase`'s write-from-memory drill); below it, the Quiz stays locked
  and the student gets "Review the Brief" (goes back, does not unlock) and
  "Redo the drill" (`resetDrill`, reshuffles order/match content and clears
  all scoring for a fresh run). All state is local `$state`, client-side and
  per-mount, reset by an `$effect` keyed on `unit.id`/`bank` — no schema, no
  persistence, no server.
- **Unit page: four sequential, gated phases (Brief, Drill, Quiz, Apply).**
  `UnitPage.svelte` no longer shows every section at once; `FrcPhaseStepper.svelte`
  renders the four phases as done / current / locked and is the only way to
  move between them (a locked phase's button is disabled; an unlocked one can
  always be reopened to review — reopening a phase remounts its component
  fresh, since each phase is a separate `{#if}` branch, so a unit's own Drill
  or Quiz progress does not survive navigating away and back within the same
  visit; this is a pre-existing property of the phase system, not specific to
  either drill). Brief -> Drill is the STUDENT'S OWN CHOICE, never a graded
  gate: Brief ends with a "Continue to drills" button. Drill -> Quiz is
  either that same free choice (`FrcDrillPhase`'s self-marked readiness
  summary, MDM-4 through MDM-8) or an earned unlock (`FrcInteractiveDrill`'s
  scored readiness gate, MDM-1/2/3/9/10; see above). The Quiz phase is the
  Gate section alone, no Brief/Drill visible: FrcQuizGate for the five
  knowledge units, FrcModelGate for the five modeling units, unchanged
  grading/review/completion. Apply is locked (a padlock card, "Pass the quiz
  to unlock Apply") until the gate clears; a cleared unit's Apply then reads
  its normal content. State: `manualUnlock` (the student's own advance
  through Brief/Drill/Quiz) and `currentPhase` (which screen is open) are
  local `$state`, both client-side and per-mount — `unlockedThrough` is `3`
  the moment `gate.unitComplete` or `modelGate.unitComplete` is true,
  REACTIVELY (so the Apply tab lights up the instant a pass/approval lands),
  but `currentPhase` deliberately does NOT auto-jump to Apply on that same
  live transition, so the student stays on the Quiz screen to see
  FrcQuizGate's "Passed" or FrcModelGate's "Approved" result and opens Apply
  themselves. It DOES jump straight to Apply on a fresh mount of an
  already-cleared unit (a `$effect` keyed on `unit.id` alone, reading
  `gate`/`modelGate` through Svelte's `untrack` so a live pass/approval within
  the same mount can never re-trigger it), so revisiting a finished unit never
  makes the student re-click through phases already done.
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

## FSP tech selection

`/fsp-tech-selection` is a **schoolwide** (not IDEA-branded) live tech-ranking
tool for incoming freshmen during the Freshman Summer Program (FSP), reached
COLD from a QR code (no prior idea-app visit assumed). It is the one place that
deliberately breaks the app's IDEA-green / Orbitron aesthetic: neutral Bosco
Tech navy/gold with a standard system-sans stack, all scoped under `.fsp-root`
(opaque, `z-index:1`, so the root `.bg-fx` scanlines never show through, like
`.frc-root`). Theme tokens live in `src/lib/fsp/fsp-theme.css`.

- **Not Supabase.** This tool writes DIRECTLY to a Google Apps Script web app;
  it touches no Supabase table. The endpoint URL is `PUBLIC_FSP_APPS_SCRIPT_URL`,
  read at RUNTIME via `$env/dynamic/public` so an unset placeholder never breaks
  the build (the picker still works, it just shows "saving is not configured
  yet"). Contract the deployed Apps Script must honor is documented at the top of
  `src/lib/fsp/client.ts`: GET `?email=` returns the student's current row for
  prefill; POST (JSON body, `text/plain` to stay a CORS simple request) UPSERTS
  keyed on email. **Only current state is kept, no history**; a returning student
  over FSP days 1-3 overwrites their own row.
- **Auth reuses the existing Google OAuth flow**, restricted to `@boscotech.net`
  (a client-side domain check plus a Google `hd` hint; wrong-domain accounts get
  a "switch account" screen). Sign-in returns to `/fsp-tech-selection`
  (`/auth/callback` honors `next`). No new auth system.
- **The registry** `src/lib/fsp/techs.ts` (plain data, client-safe) lists the six
  pathways as ranking options, reusing the `$lib/pathways` identity colors + icons
  for the chips while the chrome stays neutral.
- **The tool UI + save orchestration** is `src/lib/fsp/FspTechSelection.svelte`
  (factored out so the harness mounts the exact same component): name/ID fields
  gate the picker (Last Name, First Name, and "Student ID (if known)", which may
  be blank); a tap-to-rank picker builds an ordered list of EXACTLY 4 of 6 with a
  hard **no-duplicate** guard (a chosen chip shows its rank and the remaining
  chips disable once 4 are picked) and free remove/reorder; on every change to a
  complete selection it **debounces ~800ms** then saves. Saving is
  **last-write-wins** (state read fresh each attempt, a mid-flight edit coalesces
  into one more run) with **retry + exponential backoff** (5 attempts, capped 8s),
  a persistent **saving / saved / error** indicator (never a silent failure; an
  exhausted save shows a Retry and keeps slow-retrying while the page is open),
  and a `sendBeacon` flush on page hide as a durability net. A native
  `<form action>` + `<noscript>` plain-select fallback posts the same fields so
  the page still functions with JS disabled.
- **`/fsp-tech-selection/preview`** is a STATIC, no-auth demo of the staff
  tracking sheet (Google Sheets-style: toolbar, frozen header with sort arrows,
  six color-coded tech columns, sample rows, a 1st-choice tally). It touches no
  real data and never calls the Apps Script endpoint. Linked from the top of the
  tool as "See how staff view this". The sample rows/layout are a faithful
  stand-in; swap in the exact standalone mockup HTML when ready.
- **Dev harness** `/dev/fsp-tech-selection` (404 in production, no auth /
  network) mounts the REAL `FspTechSelection` with a mock signed-in student and
  an injected fake save endpoint (toggle latency, "always fail", or "queue N
  failures"), plus an on-screen endpoint log, so the ranking interaction, the
  duplicate guard, the debounce collapsing, and the error/retry/backoff are
  browser-verifiable end to end without OAuth or the live sheet.
- **FSP Pawn Build Wizard (SolidWorks add-in, `tools/fsp-pawn-addin/`):** a
  second .NET Framework 4.8 SOLIDWORKS COM add-in (own GUID, task pane "PAWN
  BUILD"), structurally mirroring the GAUNTLET add-in (C# 5 sources so the
  no-VS `build.ps1` framework-csc path works; framework MSBuild also builds
  it; four interops referenced, `swcommands` added because the Revolve
  RunCommand id lives there, not in `swconst`). It replaces the FSP 13-step
  paper guide with a five-phase wizard for freshmen with no CAD experience:
  Phase 0 BUILDS the starting part itself (no classroom template file) via
  `NewDocument`/`NewPart`, sets it to IPS with a SINGLE
  `swUnitSystem = swUnitSystem_IPS` call (setting `swUnitsLinear` as well flips
  the system to "Custom", verified against live SOLIDWORKS), sketches a Y-axis
  construction centerline on the front plane, renames that sketch feature to
  `Pawn_Profile`, and saves it as `[name]_pawnN.sldprt` into an `IDEA_FSP`
  Desktop folder it creates if missing (OneDrive-redirected Desktop honored);
  then one-click open of the `Pawn_Profile` sketch, a 2 s closed-loop poll
  (`ISketch.GetSketchContours`, which returns only closed contours) gating the
  REVOLVE button, auto-launched Revolved Boss/Base with the construction
  centerline pre-selected and a 1 s feature-count poll detecting completion,
  then auto-save + STEP AP214 export + a pre-filled Gmail compose to the
  teacher. AP214 is forced via the `swStepAP` system preference (the shipped
  interops have no `IExportStepData`). Classroom values (teacher email,
  subject/body, folder/sketch names) are constants at the top of
  `PawnWizardPanel.cs`, each overridable WITHOUT a recompile by a
  `pawn-wizard-config.txt` dropped next to the DLL. Not part of the SvelteKit
  build; install/registration (self-elevating `register.bat` around 64-bit
  RegAsm) is in its `README-install.md`.

## FRC Team 5669 interest form

`/fsp/frc-interest` is a standalone, **public, unauthenticated** intake form
for FRC Team 5669 (distinct from the `/frc` training track above and from
`/fsp-pulse`'s FRC-interest question): full name, email, optional phone,
optional parent/guardian email, a multi-select interest-area chip picker
(Mechanical & Build, Electrical & Wiring, Programming & Controls, CAD &
Design, Business & Outreach, Drive Team, Not sure yet), and an optional
prior-experience text field. Reached cold from a QR code like the other FSP
tools, so it needs no sign-in: prospective freshmen and parents scanning it
will not have Bosco Tech accounts.

- **Genuinely anonymous INSERT, the one exception to the "no direct client
  write" convention.** `fsp_frc_interest` (`0046_fsp_frc_interest.sql`,
  `parent_email` added in `0047_fsp_frc_interest_parent_email.sql`) grants
  `insert` to `anon, authenticated` under an `with check (true)` RLS policy,
  no RPC: unlike every other FSP/GAUNTLET/FRC table, there is no grading,
  ranking, or session to forge here, so the anon insert itself is the safe
  write path. Reads are teacher-only (`is_teacher()`, no anon/authenticated
  `select` grant beyond that RLS-scoped policy). No update/delete grant at
  all (v1 is submit + read only). `src/lib/fsp/frc-interest.ts` is the client
  seam (`submitFrcInterest`, `loadFrcInterestSubmissions`, the latter failing
  soft to `ready:false` pre-migration, the `frc/gate-submissions.ts`
  convention).
- **If the visitor already has a session, the email field pre-fills (never
  locks)** from `claims.email`; every other field starts blank. No other
  auto-population.
- **Styled after `/fsp/ask`**, not the neutral `.fsp-root` navy/gold theme:
  IDEA green on near-black, mobile-first single card, since this pair
  (Supabase-backed, QR-reached, no-login) is the closer structural precedent.
  The form is `src/lib/fsp/FrcInterestForm.svelte` (takes a `submit` callback,
  the `FspTechSelection`/`FspPulse` convention, so the dev harness mounts the
  identical component against a fake endpoint), wired to the real insert by
  `src/routes/fsp/frc-interest/+page.svelte`.
- **`/fsp/frc-interest/admin`** is the teacher-only roster:
  `+page.server.ts` gates the same way `/coin-entry` and `/dashboard` do
  (role lives in `profiles`, looked up server-side; signed out or non-teacher
  redirects to `/`). The table itself is `src/lib/fsp/FrcInterestAdmin.svelte`
  (sortable by submission date, defaults newest-first, no edit/delete for
  v1), shared with the dev harness the same way.
- **Neither route is in `authedPrefixes`** (`hooks.server.ts`): the base form
  must stay reachable signed-out, and the admin roster gates itself in its own
  `+page.server.ts`, exactly like `/coin-entry`.
- **Dev harness `/dev/fsp-frc-interest`** (404 in production, no auth /
  Supabase): mounts the real `FrcInterestForm` (signed-out vs. signed-in
  email-prefill entry states, a fake logged submit endpoint) and the real
  `FrcInterestAdmin` (sample rows, plus the pre-migration "not ready" state)
  side by side.
- **Migrations `0046_fsp_frc_interest.sql` and
  `0047_fsp_frc_interest_parent_email.sql` must be applied manually** in the
  Supabase SQL editor, in order, after `0045`.

## FSP Pulse Check

`/fsp-pulse` is a **separate, later tool from `/fsp-tech-selection` above**.
The earlier tool's specific proposal (a 4-of-6 ranking framed as tech
selection) was rejected; `/fsp-pulse` is NOT a revival of it and never uses the
"Tech Selection" name or framing. It is a **non-binding interest pulse**: a
snapshot to help staff plan FSP outreach and support, with **no bearing on
official pathway assignment** (said explicitly in-component, both as a
prominent banner above the form and a short reminder near the save status).
`/fsp-tech-selection` and its `$lib/fsp/*` code are untouched and unlinked (no
longer referenced from `/fsp`); do not delete them, they just have no more
entry points.

- **Forked, not shared**, into its own `src/lib/fsp-pulse/` directory (own
  `client.ts`, `FspPulse.svelte`), except the six-pathway data, which is
  re-exported from `$lib/fsp/techs.ts` (`src/lib/fsp-pulse/techs.ts`) rather
  than duplicated. Reuses `$lib/fsp/fsp-theme.css` (the neutral Bosco Tech
  navy/gold theme) as-is.
- **Two differences from the original tool's ranking:** all **six** pathways
  are rankable (`MAX_PICKS = FSP_TECHS.length`, was capped at 4), and ranking
  is only one of two independent questions now.
- **FRC interest, a second independent question.** A single-select segmented
  control (Yes / Maybe / Not sure yet / No) stored as `frcInterest` in the same
  payload. **Neither question gates the other**: autosave fires once a name is
  entered AND at least one of (a pathway is picked, FRC interest is answered)
  is true, so a student who only answers the FRC question (no ranking at all)
  still saves, and vice versa. See `hasAnswered` in `FspPulse.svelte`.
- **Not Supabase, separate Apps Script deployment.** Writes directly to
  `PUBLIC_FSP_PULSE_APPS_SCRIPT_URL` (its own env var, read at RUNTIME via
  `$env/dynamic/public`, distinct from `PUBLIC_FSP_APPS_SCRIPT_URL`). Same
  upsert-by-email, current-state-only contract as the original tool, documented
  at the top of `src/lib/fsp-pulse/client.ts`; GET/POST payloads additionally
  carry `frcInterest`.
- **Auth** mirrors the original tool exactly: reuses Google OAuth restricted to
  `@boscotech.net`, with the same prototype-phase `@boscotech.edu` allowance
  (must revert before real FSP use, per the on-page banner).
- **`/fsp-pulse/preview`** is the same static, no-auth Sheets-style staff demo
  pattern, extended with an FRC Interest column (leftmost data column,
  color-coded Yes/Maybe/Not sure yet/No) and six ranked-choice columns instead
  of four.
- **Dev harness** `/dev/fsp-pulse` (404 in production, no auth/network) mounts
  the real `FspPulse` with a mock signed-in student and an injected fake save
  endpoint, following the same pattern as `/dev/fsp-tech-selection`, plus entry
  states for an FRC-only partial save.
- **`/fsp/class`** (the FSP class-materials page) links to this tool under a
  "Pulse Check" divider, card id "Pathway Pulse".

## FSP as a regular class card (the `/fsp` hub is retired)

FSP is surfaced as a **standard class card pinned to the top of the
homepage**, not a special hub or a launcher app. The `summer-2026` section
(`curriculum.ts`) renders via `summerProgram()` in its own "Incoming Freshman"
band between the hero stats and the APPS block (`src/routes/+page.svelte`,
replacing the old "next live course" promo callout there), formatted
identically to every other section card, with three material rows that use
the optional `Assignment.href` to link directly to the FSP tools:
`Day 1 Presentation` -> `/fsp/day1`, `Live Q&A` -> `/fsp/ask`,
`SolidWorks Add-In` -> `/fsp/class`. It is no longer a `portal-apps.ts` launcher
app (that entry was removed), and the old role-routing hub page
`/fsp/+page.svelte` was DELETED — `/fsp/day1`, `/fsp/live`, `/fsp/ask`, and
`/fsp/class` are intact and reached directly (bare `/fsp` no longer resolves).
**Teachers get a fourth item, `Live Question Feed` -> `/fsp/live`**, appended
client-side in `+page.svelte` (added to the FSP item list gated on the existing
`isTeacher` derived value), never written into `curriculum.ts` itself since that
file is plain client-safe data with no role awareness; students never see the
item.

- **FSP section is its own component, not the shared `sectionCard` snippet.**
  The pinned FSP card renders through `src/lib/fsp/FspHomeSection.svelte`
  (factored out so `/dev/fsp-home` mounts the exact same component, the
  FspTechSelection/FrcInterestForm convention); every OTHER course still uses the
  homepage's local `sectionCard` snippet (which no longer carries the FSP-only
  icon glyphs — those moved into the component). The component takes the FSP
  `Section`, the full ordered item list (section assignments + the FRC interest
  form + the teacher-only Live Question Feed + a Course Archive row linking to
  `/archive`), `signedIn`, an `openedSet`, and an `onOpen(slug)` callback; it is
  rendering-only, the page owns the open-state and the write. Enhancements over
  the flat list (all styled in `app.css` under `.legacy-index .fsp-home-card`,
  colors only from existing tokens):
  - **Single flat list, no section headers.** Items render in one list kept in a
    sensible fixed `ORDER` (presentations, the two live items adjacent, tools,
    the form, then the archive row last); any slug not in `ORDER` sorts to the
    end (stable) so nothing is dropped. (An earlier labeled-group-divider version
    was removed as bulk.)
  - **Inline-SVG icon glyphs** (32-40px tinted/bordered square) per row by kind:
    deck (presentations), pulse (live), plugin (add-in), book (rulebook),
    clipboard (form), archive (course archive). The pulse-kind badge tints
    `--crimson`; the rest `--green`.
  - **HUD corner brackets** (four two-sided L marks) in `--acc` (aliased to
    `--gold`, the same brass accent AppLauncher's `.app-card` uses; no new color).
  - **Lit machined-panel surface** (no texture layer). The card's own background
    is a soft brass top-glow (`--acc`, near the brackets) over a vertical
    `--bg2 -> --bg1 -> --bg0` sheen that darkens toward the base, with the header
    bar made transparent so the whole panel reads as ONE edge-lit surface, plus a
    faint `--acc`-tinted border. Two earlier backdrops (a CAD graph-paper grid,
    then a mint-dot particulate field) were both removed for clashing with the
    site's scanline/particle background; there is no separate backdrop element.
  - **Live pulse** (`.live-pulse`): a pulsing `--crimson` dot on the two Live
    items only (matching their crimson icon badge, the reserved LIVE/REC color;
    the wave/pulse indicator is semantically a live state). Static rows get none;
    freezes under `prefers-reduced-motion` (solid dot stays).
  - **Opened progress dots** (`.open-progress`): signed-in only; a hollow `--gear`
    ring until the item is opened, then a filled `--green` check.
- **Open-state tracking (`0048_fsp_item_opens.sql`, apply manually after 0047):**
  per-student first-open state for each of the FSP items, persisted so
  progress follows a student across devices (the tour-state intent from 0045).
  `fsp_item_opens` is keyed `(user_id, item_id)` where `item_id` is the item's
  curriculum slug (text, not a FK). This is a self-write, not a staff cross-user
  write, so it uses direct RLS-scoped policies, NO RPC: a student reads and
  inserts only their own rows (`auth.uid() = user_id`), and there is deliberately
  NO update/delete grant (first-open is permanent). `src/lib/fsp/item-opens.ts`
  is the client seam (`loadItemOpens` reads the set; `markItemOpened` is an
  insert-only upsert with `ignoreDuplicates`, so a repeat open is a silent
  no-op), fail-soft to empty/ignored before the migration is applied.
  `+page.server.ts` loads the signed-in student's opened set; `+page.svelte`
  overlays this session's optimistic first-opens and fires `markItemOpened` on
  the OPEN click (first-open only) while the link still navigates. The dev
  harness `/dev/fsp-home` (404 in production, no auth/Supabase) mounts the real
  `FspHomeSection` with the open-state stubbed as local component state.
- **`/fsp/class`** still hosts the pawn/dogtag add-in download, install steps,
  project cards, 3-day overview, and the Pulse Check link (the former `/fsp`
  class page). Its header now links back to `/` (Home) since the hub is gone.
  The curriculum `summer-2026` section's `href` also points at `/fsp/class`
  (used by the empty-state "View class hub" link on the pinned homepage card).

## FSP live Q&A

`/fsp/ask` + `/fsp/live` are the FSP live audience Q&A: students submit
questions from their phones and Mr. Pina runs the feed on a projected display.

**Presentation workflow (current):** Mr. Pina runs the slide deck itself
directly from **Claude Design** (an external tool, not this portal) during a
live session, then switches to `/fsp/live` — opened as a **separate window** —
for the Q&A segment. `/fsp/live` and the deck are no longer wired together: the
former slide-13 embed (Phase 2's postMessage bridge into the deck) is gone (see
"FSP Day 1 deck" below, now an archive viewer). Always open `/fsp/live` in its
own window/tab when running an FSP session; it is a standalone display, not an
overlay.

Unlike `/fsp-tech-selection` (neutral navy/gold, Apps Script), this pair is
**Supabase-backed** and uses the **IDEA green `#00FF41` on near-black
`#0a0a0a`** aesthetic (Rajdhani + Share Tech Mono), scoped under its own opaque
root so the shell `.bg-fx` never shows through.

- **Data model (`0043_fsp_qa.sql` + `0044_fsp_qa_anon.sql`, apply manually, in
  order):**
  - `fsp_questions` (`id`, `question`, `session_id`, `created_at`, `answered`,
    `is_anonymous`, `submitter_name`). Signed-in users READ all rows (RLS
    `using (true)`); there is **no direct write grant**. The ONLY insert path is
    the SECURITY DEFINER RPC `submit_fsp_question(p_question, p_session_id,
    p_is_anonymous default false, p_submitter_name default null)` (returns the
    new id, stamps `created_at`/`answered=false` server-side), granted to
    `authenticated`, so a client can never forge those or target another
    session by raw insert. `p_is_anonymous = true` forces `submitter_name` to
    `null` server-side regardless of what the client passes; `false` stores
    `p_submitter_name` as given. Every pre-0044 row backfills to
    `is_anonymous = false` / `submitter_name = null` (unattributed, matching
    what those rows meant before the column existed).
  - `fsp_config` (`key` PK, `value`), seeded `active_session = 'Day1-A'`. All
    authenticated users read; only `@boscotech.edu` (staff) may UPDATE (RLS on
    the JWT email domain). This one row is the session the ask picker submits to
    and the live feed filters on. **Six fixed session slots** are used in
    practice, one per FSP day/session: `Day1-A`, `Day1-B`, `Day2-A`, `Day2-B`,
    `Day3-A`, `Day3-B` (two sessions per day); these are UI presets on
    `/fsp/live`; the column itself stays free-form text.
  - Soft clear is the staff-only SECURITY DEFINER RPC
    `clear_fsp_session(p_session_id)` (gated to `@boscotech.edu`): sets
    `answered = true` on that session's unanswered rows (never deletes) and
    returns the count. Keeps `fsp_questions` with no client update grant.
  - `fsp_questions` is added to the `supabase_realtime` publication so the live
    feed gets INSERT (new question) and UPDATE (soft clear) events; RLS still
    applies to the stream.
- **`/fsp/ask` (any Bosco Tech account, `@boscotech.net` or `@boscotech.edu`):**
  mobile-first. In-page Google sign-in gate (no hooks redirect, like
  `/fsp-tech-selection`, since it is reached cold from a QR code) + client
  domain check against both domains (no `hd` OAuth hint, since it must not pin
  the picker to a single domain); a teacher signing in from their own account
  can submit a question too. A single textarea, a
  lightweight **"Submit anonymously" toggle** below it (default unchecked, a
  plain checkbox line, not a callout box), and submit. Unchecked shows a
  read-only "Asking as `<name>`" line (`user_metadata.full_name` from the auth
  session, falling back to `email`) and that name is sent as
  `p_submitter_name`; checked hides the name line and sends
  `p_is_anonymous = true` (with `p_submitter_name` omitted — the RPC would null
  it anyway). Submit reads the current `active_session` fresh from `fsp_config`
  then calls `submit_fsp_question`. On success the form is replaced (no reload)
  by "Your question was submitted. You earned 1 IDEA Coin." with an "Ask
  another question" button that restores the form. (Coins are still
  display-only; no coin economy exists in this repo, see the scope
  guardrails.)
- **`/fsp/live` (staff, `@boscotech.edu`):** the standalone Q&A display,
  redesigned for projection (a widescreen session panel + feed layout, session
  panel stacking above the feed on narrow viewports). In-page sign-in + staff
  domain gate, a full-screen toggle, and:
  - **Session panel:** six preset buttons (`Day1-A` through `Day3-B`, see
    above) replace the old free-text session input; clicking one writes that
    value to `fsp_config.active_session` (same RLS-gated write path as before)
    and the currently-active preset is highlighted. The active session name is
    shown large above the panel. **Clear Feed** (renamed from "Clear Session")
    still calls `clear_fsp_session(session_id)` on the CURRENT session only, a
    manual soft-delete for edge cases (e.g. clearing chatter without switching
    slots); switching presets itself does not delete anything, it just points
    the feed at a session_id that starts empty until new questions arrive for
    it, which reads as "cleared" on screen.
  - **QR code:** a static `api.qrserver.com` generated PNG (dark green-on-black
    to match the palette) linking to `https://ideabosco.com/fsp/ask`, labelled
    "ideabosco.com/fsp/ask" underneath, docked at the bottom of the session
    panel so students can scan it straight off the projected display.
  - **Feed:** each card shows the question, the submitter (or "Anonymous" when
    `is_anonymous` or a null `submitter_name`), and a relative timestamp;
    newest-at-top, animated in, generous padding sized for reading from across
    a room.
  The **feed itself** (Realtime subscription filtered by the active session,
  loading unanswered rows newest-first, question cards, soft-clear UPDATE
  removing a card, `prefers-reduced-motion`) is factored into
  `src/lib/fsp/FspLiveFeed.svelte`, still shared with the dead-code
  `FspDeck.svelte` and the dev harnesses; the page keeps only the chrome (auth
  gate, session panel, QR, a **Student View** control, count via a bound prop,
  full-screen toggle). The component's `select()` now includes `is_anonymous` /
  `submitter_name`, and takes an optional `session` (undefined = self-resolve
  `active_session` from `fsp_config`), a `variant` (`console` on this page,
  `slide` for the now-unused deck-embed path kept alive only by dead code /
  harnesses), and `sampleQuestions` for the no-Supabase harness path.
  - **Student View** (staff-only surface, so no extra gate) opens
    `src/lib/fsp/FspStudentPreview.svelte`: a modal that shows `/fsp/ask` inside
    a ~390px mobile phone frame, so the presenter sees exactly what students see
    on their phones. X or Escape closes it (Escape only when not in native
    fullscreen). The SAME component is mounted on `/fsp/day1`.
- **Neither `/fsp/ask` nor `/fsp/live` is in `authedPrefixes`** (`hooks.server.ts`):
  auth is handled by the in-page gates, and the real boundary is RLS + the
  RPC/`fsp_config` grants, so anonymous/QR-cold visitors see a friendly sign-in
  rather than a bounce to `/`. (The `/fsp` prefix does not shadow
  `/fsp-tech-selection`, which is a sibling path, not `/fsp/...`.)
- **Dev harness `/dev/fsp-qa`** (404 in production): mounts the REAL `/fsp/ask`
  and `/fsp/live` in side-by-side iframes for the submit-appears-live check. This
  flow uses real auth + Realtime and is deliberately NOT mockable; verifying it
  needs 0043 + 0044 applied and both accounts signed in (same-origin cookies
  flow into the frames).

## FSP day decks (archive)

`/fsp/day1`, `/fsp/day2`, ... are **archive viewers** for each day's slides,
not live presentation controllers. Presentations run live from **Claude
Design** externally (see "FSP live Q&A" above); these routes just host the
exported deck for later review by staff or students. Shared host:
`src/lib/fsp/FspDayArchive.svelte` (`day`, `slidesSrc`, `data` props) — the
auth gate, iframe, presenter toolbar, and `F`-key fullscreen all live there
once, so `src/routes/fsp/day<n>/+page.svelte` is a two-line wrapper
(`<FspDayArchive day={2} slidesSrc="/fsp/day2/index.html" {data} />`). This
was factored out of the original `/fsp/day1` page when Day 2 landed; a future
Day 3 needs no new host logic, only its own slides + a wrapper page.

- **`FspDayArchive.svelte`** is open to **any authenticated Bosco Tech
  account** (`@boscotech.net` students or `@boscotech.edu` staff, not
  staff-only — students should be able to review the archive), gated
  **in-page** like the rest of `/fsp/*` (the host routes are NOT in
  `authedPrefixes`; signed-out sees a sign-in card, wrong-domain sees a
  switch-account card). When gated in it renders a full-viewport `<iframe
  src={slidesSrc} allow="fullscreen">` (the deck owns its own arrow / PageUp /
  PageDown / space keyboard nav, so a presentation clicker drives it natively;
  the iframe is focused on load so the clicker works immediately). A
  page-level **`F`** key toggles native fullscreen on the deck root. Neither
  deck broadcasts any postMessage to the host page — Q&A lives entirely on
  `/fsp/live`, opened separately.
  - **Toolbar** (floats bottom-center, minimal/dark, hidden the moment
    fullscreen is active via a `fullscreenchange` listener): **Present**
    fullscreens the deck **iframe directly** (`iframeEl.requestFullscreen()`), so
    every bit of page chrome — the toolbar included — falls away and only the
    slides fill the screen; Escape exits fullscreen natively and the toolbar
    returns. **Student View** opens the shared `FspStudentPreview` phone-frame
    modal of `/fsp/ask`. Distinct from the `F` key, which fullscreens the deck
    ROOT rather than the bare iframe.
- **Day 1 slides live at `static/fsp/day1-slides.html`** — the Claude Design
  **standalone export** ("IDEA FSP Deck (standalone).html"), copied in as-is (a
  ~28MB self-contained bundle: a small "bundler" wrapper that unpacks a
  gzip+base64 asset manifest into blob URLs, then renders a React/Babel-standalone
  app whose `deck-stage` custom element is the slide player). Served straight
  from `static/` at `/fsp/day1-slides.html`, fully self-contained (no CDN,
  CSP-safe). **Do not rebuild or re-theme the slides**; if the source deck
  changes, re-export and re-copy the file.
- **Day 2 slides live at `static/fsp/day2/`** — pulled via the `claude_design`
  MCP directly from the **project's raw files** (`DesignSync`), not a
  standalone export: `index.html` (the `.dc.html` template, renamed) plus its
  sibling runtime (`deck-stage.js`, `ds-base.js`, `support.js`,
  `image-slot.js`), the bound design-system tree
  (`_ds/idea-design-system-<id>/`: `styles.css`, `_ds_bundle.js`, `tokens/*.css`
  — provides the `IDEADesignSystem_<id>.AnimatedLogo` / `.DeckFooter`
  components the deck imports), and the two binaries the deck actually
  references (`idea-gear.png` + `idea-logo-text.png`, reused byte-for-byte
  from `static/fsp/assets/` since they are the same shared IDEA emblem;
  `jarvis-ironman.jpg`, deck-specific). All copied in as-is, same "do not
  rebuild" rule as Day 1. **`.image-slots.state.json` is a stub `{}`,
  not the real sidecar:** `image-slot.js` fetches this file document-relative
  to persist per-slot pasted images, but the real state file embeds ~20
  base64-encoded photos and exceeds the MCP file-read tool's 256 KiB cap, so it
  cannot be pulled through that path. Every `<image-slot>` on Day 2 (arena,
  robot, per-pathway photos, facility shots, etc.) therefore renders its
  authored text placeholder instead of a real photo — a deliberate fail-soft
  degradation, not a bug. If real photos are added later, either re-run the
  DesignSync sync once the project's sidecar is small enough, or replace the
  stub with the real file fetched some other way (e.g. exporting through the
  Claude Design UI instead of the API). This gap does not apply to Day 1
  (its bundle already has every image baked in as blob URLs).
- **Superseded native rebuild:** `src/lib/fsp/FspDeck.svelte` +
  `src/lib/fsp/day1-slides.ts` were an earlier native-SvelteKit rebuild of the
  Day 1 deck (and, later, of its slide-13 live embed). They are no longer
  wired to any route and remain in the tree only as dead code; do not extend
  them.
- **Slide 12 QR** inside the Day 1 export points at the `/fsp/ask` submission
  page (the standalone deck embeds its own QR; the separate committed
  `static/fsp/fsp-ask-qr.svg` remains available for other uses).
- **Dev harnesses `/dev/fsp-day1` / `/dev/fsp-day2`** (404 in production, no
  auth / Supabase): each shows its hosted deck iframe with the real toolbar
  (Present + Student View), matching the real page now that it is an archive
  viewer with no live-feed overlay or postMessage bridge to simulate. Neither
  harness routes through `FspDayArchive` (they predate/bypass the auth gate on
  purpose); a future Day 3 harness should copy `/dev/fsp-day2` and swap
  `SLIDES_SRC`.

## First-time orientation tour

A reusable spotlight tour system plus the portal's first-time walkthrough.

- **Engine (generic, reuse it for future tours):**
  `src/lib/tour/SpotlightTour.svelte` renders any ordered `TourStep[]` (types
  in `src/lib/tour/tour.ts`; step content is always a plain config array, never
  hardcoded in the engine). Per step it dims the page and cuts a gold focus
  ring (the existing `--gold` token, the tour accent everywhere) around the
  target, with a callout: title, body, "N of M" counter, Back / Next (Done on
  the last step), Skip tour, and a close X. Steps whose target selector is
  missing or zero-size at launch are dropped, so one config serves signed-in
  and anonymous pages. Position recomputes on resize and capture-phase scroll
  via rAF-or-timeout, and the callout height is a synchronous DOM read, never
  a ResizeObserver binding (both per the DrawingViewer throttled-window rule:
  a background window stops ticking rAF). Keyboard: Esc closes, Enter /
  ArrowRight advance, ArrowLeft goes back. Narrow viewports (<=640px) stack
  the callout below the target at full width. scrollIntoView uses 'instant',
  never 'auto', under reduced motion (the site's global scroll-behavior:smooth
  would win otherwise). Page interaction is paused behind a click-catcher
  while open; scrolling still works.
- **Content:** `src/lib/tour/orientation.ts`, two phases in one continuous
  flow: `signin` (pre-auth, one step on the header Google control) and `home`
  (post-auth walk: hero, apps grid, courses section, closing with the
  VANGUARD, GAUNTLET, and IDEA Coin entry points; spotlights only, no
  navigation). Targets are stable `data-tour` attributes on the home page and
  the AppLauncher cards (an app pinned AND grouped matches twice;
  querySelector's first match, the pinned row, wins).
- **Trigger (`src/lib/tour/HomeTour.svelte`, mounted on `/` outside the page
  wrapper):** an anonymous visitor with no `idea_tour_seen` localStorage flag
  auto-gets phase A once; a signed-in user whose
  `profiles.tour_completed_at` (0045, nullable timestamptz) is STRICTLY null
  auto-gets phase B after render settle. Undefined (0045 unapplied) fails
  soft: no auto-launch, no write; `fetchUserProfile` degrades stepwise
  (full -> no-tour -> legacy select). If the first-login PathwayPicker owns
  the screen, the tour waits for its `PATHWAY_PICKER_DONE_EVENT` (dispatched
  on choose and on "Choose later"). ANY exit (finish, Skip, X, Esc) counts as
  seen: signed-in stamps `tour_completed_at = now()` through the existing
  "update own profile" policy (0045 adds NO policies or grants); anonymous
  sets the localStorage flag. The header's persistent "Take the tour" control
  replays the full tour anytime regardless of both flags.
- **Dev harness `/dev/tour`** (404 in production, no auth / Supabase): mounts
  the REAL home page with a mock session and a stub client whose writes show
  in an on-screen log. Modes: `anon` (phase A auto-launch), `student`
  (phase B auto-launch), `done` (no auto-launch, replay only), `picker`
  (pathway picker first, tour waits). Reset button clears every flag.

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
- **Wordmark + animated emblem:** the plain `IDEA` wordmark (green,
  `--glow-green`, no trailing period or accent dot) is the live-text mark; the
  **gear emblem lockup** is `src/lib/brand/AnimatedLogo.svelte`, the port of the
  design-system `AnimatedLogo` (`components/brand/AnimatedLogo.jsx`). It layers
  the isolated gear (`/IDEA/idea-gear.png`) behind the isolated text plate
  (`/IDEA/idea-logo-text.png`) at the emblem's exact geometry (2560x1204 canvas,
  gear 46.95% wide anchored top-left) and turns the gear slowly behind the
  plate. It is **prop-driven** (`width`, `spin`, `duration`, `srcText`,
  `srcGear`) so the same component is the animated hero mark and the static
  fallback (`spin={false}`); the spin is gated behind
  `prefers-reduced-motion: no-preference`, so it NEVER rotates for reduced-motion
  users. It stands in for the top-left `IDEA` wordmark in every portal header
  (landing `/`, `/archive`, `/dashboard`, `/fsp/class`, the GAUNTLET
  `IDEA // GAUNTLET` lockup) and the `/auth/error` hero. The `.logo-mark` helper
  (in `src/app.css`) frames the emblem inside the wordmark anchor. Dev harness:
  `/dev/animated-logo` (404 in production, no auth) renders the header/hero
  scales, the static fallback, and a fast-spin variant to eyeball the
  reduced-motion gate. The intentionally-off-brand scoped themes (FRC navy/red,
  FSP navy/gold) keep their own marks and do NOT use the IDEA emblem.
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
