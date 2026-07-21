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
  NO leaderboard submit, NO telemetry, NO achievements, NO checkpoint (the
  unranked end + no-telemetry stance was superseded by the v204 ranked co-op
  boards, see below; achievements/checkpoint stay out); both
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
- **Co-op ranked boards + match telemetry (game v204, supersedes the Phase 1
  unranked/no-telemetry stance):** a QUALIFYING co-op match (the solo vetted
  threshold mirrored in `runQualifies`: sector 2+ OR 20+ kills) now submits
  exactly ONE team row to two NEW boards fully separate from the solo boards.
  **Mode-derivation invariant (the one thing that must never regress):** every
  ranked/telemetry mode value is derived by `coopModeString()` from `coopMode`
  ALONE ('coopnormal'/'coophardcore'), NEVER read from `gameMode` - hardcore
  co-op deliberately runs the literal `gameMode==='hardcore'` (single life /
  fire ramp), and submitting that raw would land team runs on the solo
  hardcore board. Flow: `showEnd` (the one place both clients pass; the guest
  enters via the 'end' broadcast) captures `endInfo` once (eligibility, the
  derived mode, score/sector/acc/time/kills/bosses, and both pilots'
  weapon/heavy from the index-aligned `players` array - already mirrored by
  `shipSnap`, no new sync fields) and, when eligible, shows the SOLO
  initials-entry flow (`curInitials`) on both clients. The guest broadcasts
  its initials over a new `name2` broadcast (provisional at end-screen open so
  an idle guest still ranks, final on its SUBMIT); the HOST alone submits
  (`submitEnd` -> `doCoopSubmit` -> `submitCoopToServer`): the existing
  action=submit params plus `mode`, `name2`, `p1w/p1h/p2w/p2h`, with a 6s
  wait-for-initials timeout falling back to 'P2'. Sub-threshold matches keep
  the old unranked end screen and submit nothing. The grace-expiry disconnect
  end (v202) routes an ELIGIBLE run through the same finishMatch/submission
  path with last-known state (sim frozen since graceStart, so it is exact);
  ineligible ones keep the old modal. Boards ride the existing pipeline
  (`boardMode` 'coopnormal'/'coophardcore', action=top&mode=..., two new
  board tabs on title + post-run): team rows render "NAME1 & NAME2", the
  click-detail adds P1/P2 and both loadouts (`wtype1/heavy1/wtype2/heavy2`),
  and `localBoard()` returns empty for co-op modes so the offline fallback
  never leaks solo local scores onto a co-op board. Post-submit the host sees
  an immediate local echo row; delayed refetches merge the backend rows in.
  A short `matchId` (room code + start timestamp, alphanumeric) is minted by
  the host at the lobby->match transition and rides the start/rsync payloads.
  BOTH clients send per-client co-op telemetry once per match end
  (`sendCoopTelemetry` via the shared `telemetryFieldList` builder that the
  solo beacon also uses, so the field lists can never drift): solo fields +
  matchId/role/mode/downedCount/revivedCount/disconnected/proximityPct/
  avgDistance. Per-ship downed/revived tallies hook the existing downed-state
  edges (host: playerHit set-point + revivePlayer; guest: the mirrored
  applyShip edges); proximity samples every 0.5s of play on each client;
  `disconnected` means the match went through the v202 paused-for-reconnect
  flow (graceStart host-side / rejoinMatch guest-side). The v204 per-client
  caveat (most counters were global sim tallies: host reported both ships
  combined, guest ~0) was closed by the v206 per-ship tally split, see below.
- **Co-op telemetry per-ship attribution + revive/reconnect counting (game
  v206, closes the v204 caveat):** the action stats each client's beacon
  reports (sf/sh/acc, pa/pry/ppr, ht, bmb, oh, lu) are now genuinely that
  pilot's own. Every counter gained a per-ship `pl.tally*` field
  (`tallyShotsFired/ShotsHit/ParryAtt/Parries/Perfect/Hits/Bombs/Overheats/
  LivesUsed/Meltdowns`, initialized in `makeShip`) incremented at the SAME
  sites as the match-wide `run*` globals - which stay untouched for their
  other consumers (death screen, achievements, refit gates) - so in solo
  tally === global by construction (browser-asserted) and the solo beacon is
  byte-identical (same param order, same values). Attribution rides the
  existing bullet `pi`: `firePrimary` already bulk-tags its spawns; the
  non-primary spawns that lacked it (rail slugs, drone shots, parry
  reflect/riposte, FLAK flechettes) now carry `pi`, and the two `shotsHit`
  collision sites credit `players[b.pi||0]`. **Transport:** the guest runs no
  combat sim, so its own tallies are counted host-side (relayed acts land on
  `players[1]` at the same sites) and STAMPED back over a new `ty` field on
  `shipSnap` (ordered by the shared `TALLY_KEYS` registry, one list for
  transmit + apply so the pair can never drift); `downedCount`/`revivedCount`
  ride the same stamp, replacing the v204 guest edge-detection - which is the
  revive-count fix: a 1up/CORE lives-rescue (`resetPlayer`, deliberately not
  a revive) now increments `revivedCount` on NEITHER client, while genuine
  `revivePlayer` channel revives count on both (browser-verified: dn=3/rv=2
  identical on both clients through a rescue). The guest's own beacon reads
  its stamped ship; `telemetryFieldList` reads `player` (the
  players[localIndex] alias) for both roles, so the HOST's beacon is now its
  own-ship-only too. **Reconnect:** ship tallies survive a guest drop for
  free (host ship objects persist; the v202 rsync's shipSnap restores them
  onto the rebuilt ships); the two genuinely guest-local accumulators
  (runDwell + the proximity samples) are cached device-local in
  `vgcoop_tallies` keyed by matchId (the `vgcoop_` non-synced prefix
  convention; written ~2s via the proxTick throttle + pagehide + guest
  partnerLost, restored in rejoinMatch, stale entries inert - no clearing
  needed), so a rejoined guest's final beacon covers the whole match
  (browser-verified: bmb=2 across a drop, whole-match dwell). Deliberately
  NOT per-ship (still match-wide/team-wide by design): sec/rt/k/bk/sc,
  ce/cs, btk (boss TTK), hwd (runHeavyUse), ps/maxStyle, and the refit-gate
  stats the v199 `rs` sync carries.
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
Supabase): a multi-part vehicle (originally a placeholder box car; see the
multi-part rig bullet below) driven by a cannon-es `RaycastVehicle`
(`cannon-es` is a runtime dependency; three.js is reused, not duplicated), a
smoothed chase camera, WASD/arrow + gamepad (standard mapping) input, Space
handbrake, and R reset. The `tuning` object (drive forces, aero drag,
speed-sensitive steering falloff, mass, gravity, suspension, tire friction,
track boundary response, camera) still drives the whole simulation from its
default values; the old on-screen live-editable tuning panel was REMOVED (see
the tuning-panel + in-race-garage removal bullet below), so hand-tuning feel
is now a code edit, not a live panel. Deliberately throwaway and iterative: it
validates
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
  centerline polyline + width; future kinds join the discriminated
  union), a `startFinish` gate, ORDERED `checkpoints` (directional gate
  lines: segment + required crossing heading, so backward crossings never
  count), and `boundaries` (polylines; the data says where the limits are,
  never how they are enforced). Two ADDITIVE fields since the first track:
  the ribbon's optional per-point `widths` array lets the corridor breathe
  within one lap (a wide combat pad, a narrow chokepoint; the runtime
  precomputes per-point `halfWidths` so the surface query, edges, and
  minimap all honor it, and constant-width tracks are untouched), and an
  optional `props` list carries presentation-only set dressing (lightTower /
  gantry / block / pad / berm, plus since the environment pass container /
  building / machine) that the harness renders generically and the
  runtime NEVER reads (props have no physics bodies, so they must sit
  outside the boundaries). Tracks were physically FLAT in v1; schema v2
  (Phase 8a, see the "Track schema v2" bullet below) added real per-point
  elevation and banking plus gameplay trigger zones, all additive — a v1
  track like this one is untouched. v2 also carries route BRANCHES
  (`surface.branches`) and alternative-gate GROUPS (`TrackGate.group`), both
  added in Phase 8b and both equally additive; see that bullet below.
  Reference track:
  `tracks/proving-ground-07.json` (Proving
  Ground 07, a decommissioned automotive proving ground at night: 794 m,
  six checkpoints; long test straight into a hard braking gate, a 20 m wide
  skid-pad sweep with multiple viable arcs, a funnel into the 10.5 m
  rail-yard double-switchback between container rows, a kinked back lane,
  then a bermed banked-oval sweeper home), generated by a scratch script,
  committed as data.
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
  hard collision. A flip-recovery watchdog in the same per-vehicle pipeline
  (player and AI alike) re-seats any chassis whose up vector stays below a
  threshold while nearly stationary for a tunable delay, upright at its
  current yaw with velocities zeroed (wheels off the ground = no force can
  right it, and the AI stuck-reverse cannot help); dials in the panel's
  "flip recovery" section, scripted via `__greenline.flip()`/`.upY()`.
- **Environment preset + prop kit (the environment pass).** All sky / light /
  fog / floodlight configuration the race scene uses comes from ONE
  swappable preset object: `src/lib/greenline/environment.ts` (plain data,
  no three imports) defines `EnvironmentPreset` (sky-dome gradient stops +
  two motivated horizon glows, hemisphere fill, key directionals, FogExp2
  color/density, a floodlight intensity multiplier) and the single populated
  preset `NIGHT_ENV`, matching the key art's dual-tone rig (cool primary key
  one side, dim warm counter the other). The scene setup in
  `GreenlineRace.svelte` reads the preset only (gradient sky dome canvas,
  fog, lights, lamp/cone/pool/halo intensities), so a future `dusk`/`storm`
  or day/night system is a data addition in `ENV_PRESETS` plus a way to pick
  one; the switching system deliberately does not exist yet. Props render
  through a shared PROP KIT in `GreenlineRace.svelte`: each prop type is
  authored once as a template of primitive parts, baked/merged
  (`BufferGeometryUtils.mergeGeometries`) into one geometry per material
  bucket (shared steel/dark/concrete/corrugated/silhouette/emissive
  materials), and drawn as ONE `InstancedMesh` per (template, bucket) across
  every placement (`frustumCulled = false`, since one mesh's instances span
  the whole yard) — so the fully dressed reference track stays a flat
  draw-call budget on the aging school desktops. The five original prop
  types are real structures now (high-mast tower with ladder/platform/four
  aimed heads + halo sprite, truss gantry with A-frame legs/catwalk/green
  marker dots per the key art, corrugated containers with corner castings,
  boxcar railcars on bogies, jersey-profile extruded barriers, textured
  banked berm with a merged cap rail), and three NEW prop kinds exist:
  `container` (ISO-proportioned stack, 1-3 high, 20/40 ft, per-unit worn
  tones via baked vertex colors), `building` (background silhouette masses,
  `warehouse` gable or `tower` slab, sparse lit windows, warm beacon, soft
  motivated glow sprite), and `machine` (`crane` = rubber-tyred gantry crane
  mid-lift, `loader` = parked wheel loader). Ground visuals (physics stays
  the flat plane): generated worn-asphalt canvas texture on the apron AND
  the ribbon (the ribbon gained per-vertex UVs along its length), the old
  green GridHelper is gone, braking zones ahead of every gate darken via
  vertex-color wear ramps, oil-stain decals sit near checkpoints, the skid
  pad bakes painted rings + tire scrub into one texture, and edge lines are
  cool worn white (steel palette, not green). All generated textures use a
  seeded RNG so the yard is identical run to run.
- **Minimap:** `src/lib/greenline/Minimap.svelte`, a top-down SVG of the
  boundaries, ribbon, gates (next checkpoint highlighted, start/finish gold)
  and a vehicle heading triangle fed by the physics loop (plus smaller amber
  markers for non-player vehicles).
- **Combat scaffold:** `src/lib/greenline/combat.ts` is pure, vehicle-agnostic
  logic (like the track runtime): `VehicleCombat` holds the three health pools
  (armor / chassis / mount, see the zoned-damage bullet below) plus
  disruption / oiled / down / eliminated state for ANY vehicle and PER-WEAPON
  cooldowns (`WeaponId = emp | oil | tether | ram`, `canUse`/`markUsed`), and
  `driveMods` turns combat state into engine/steer/traction scaling. **The
  RACE vs ELIMINATION zero-chassis branch lives in exactly one place,
  `VehicleCombat.applyDamage`:** RACE = temporary down window then full-heal
  (`tick` recovers, restoring all three pools), ELIMINATION = permanent
  removal. The harness runs the player and every AI through one identical
  per-vehicle pipeline (controls -> driveMods -> physics), shows a health bar
  + DISRUPTED/OILED/TETHERED/DOWN/ELIMINATED HUD and an overhead bar on AIs,
  and has a MODE select + every combat, weapon, and feedback number in the
  tuning panel.
- **Zoned three-pool damage (armor / chassis / mount).** WHERE a hit lands on
  the TARGET's own body decides which pool takes it: `classifyHitZone`
  (`combat.ts`) compares the attack's travel direction to the target's own
  heading, never the shooter's aim (a 120 degree nose arc = `front`, a 120
  degree tail arc = `rear`, the two remaining 60 degree wedges = `side`;
  `tryRam` reuses its frontality dots as the zone dots via `zoneFromDot`, EMP
  and tether classify at their hit point, oil deals no damage so it has no
  zone). Routing: front/side drain ARMOR first, rear drains the weapon MOUNT
  first, and overflow past an emptied (or already-empty) shield pool carries
  into CHASSIS in the SAME hit, never wasted. Chassis is the only "life":
  chassis zero is the sole down/elimination trigger, and resist multipliers
  (`resist.impactDamage` etc.) still scale the raw amount before routing --
  no new resist fields, the pool split itself is the new defensive dial. A
  dead mount takes the three FIRED tools (EMP / oil / tether) offline via
  `canUse` until the next full heal -- deliberately NOT the passive ram,
  which is chassis contact and, since `tryRam` requires `canUse` from BOTH
  sides, gating it would make a mount-dead vehicle ram-immune; ELIMINATION
  has no mid-round heal, so a dead mount stays dead for that life by design.
  `applyDamage` returns a `DamageResult` (outcome + zone + per-pool
  absorption + one-time `armorStripped` / `mountDisabled` / `chassisDepleted`
  edges) so the harness fires feedback off edges instead of polling pool
  state. The split is ARCHETYPE identity (`Archetype.pools` in `loadout.ts`,
  fractions of the total `maxHealth` budget; parts scale the total, never the
  shape): ARMOR 40/45/15 (deepest wall, ordinary mount), VELOCITY 20/65/15
  (token shields, mostly raw frame), HANDLING 30/55/15 (the neutral baseline,
  mirrored by `DEFAULT_POOL_SPLIT`), SYSTEMS 22/50/28 (the "hardened
  electronics" reading of the warlock: hardest mount to kill by rear shots,
  paid for with thin plating over a brittle frame). Visual payoff in the
  harness: armor plates visibly DETACH (nearest the hit first, so the
  battered side goes bare) as the AGGREGATE armor pool empties -- one pool
  per vehicle, deliberately not per-plate tracking -- exposing the hull; a
  dead mount chars dark, sits askew, and sputters cool-rim sparks; chassis
  keeps the existing scorch/crumple/smoke treatment; hit bursts anchor to the
  struck zone (the mount socket itself for rear hits). Two NEW pooled
  particle systems follow the spark/smoke cap discipline: low-poly DEBRIS
  chunks (scripted ballistics + one damped ground bounce, never physics
  bodies) on plate strips and heavy chassis bites, and TIRE DUST off the rear
  wheels under slip/launch/oil (a second puff pool from the same factory as
  the smoke pool, so dust emission can never evict a wreck's smoke column).
  HUD: the primary bar, nameplates, and standings all stay CHASSIS; compact
  ARM / MNT pips sit under the player bar, a dead mount reads as an amber
  WEAPON DOWN chip + OFFLINE weapon cells (RAM stays ARMED), and AI overhead
  bars gain a thin armor sliver + an amber weapons-offline dot. AI (`ai.ts`)
  stays deliberately zone-unaware. Debug hooks: `__greenline.damage(id, amt,
  zone?)`, `getPools(id)`, `setMode(m)`; `raceState` rigs carry
  armor/mount/mountDown (`hp` stays chassis so the stress runner reads on).
- **Four disruption tools** (HISTORICAL — three of these became equippable
  weapons in Phase 8g; see that bullet below. EMP / oil / tether now MUST be
  mounted to use, fire through the weapon slots, and no longer have their own
  F/E/Q keys. Only the passive **ram** remains a fixed always-on tool.)
  Consistent trigger/cooldown/HUD pattern, any
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
  the bodywork (scorch tint lerp, per-rig vertex-jitter hull crumple + armor
  plate rattle at 75/50/25% health restored on heal, hood smoke + embers,
  heavy wreck smoke),
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
  steering, mass, grip, suspension, grass drag), the `VehicleCombat` pool
  maxes (the total budget split per archetype, see the zoned-damage bullet) +
  `VehicleCombat.resist` carry the defense side (consumed inside the pure
  combat functions; `tryRam` deals per-side damage through each receiver's
  impact resistance), and `ctFor(rig)` threads the offense side (damage out,
  EMP range, tool cooldowns) as a per-shooter effective CombatTuning.
  `src/lib/greenline/Garage.svelte` is the presentation-only loadout screen
  (reached in the pre-race garage flow, never mid-race): archetype cards,
  per-slot part pickers with green/red/amber tradeoff chips, and a
  resolved-build summary (HULL, MASS in POUNDS, TOP SPEED in MPH, COOLDOWNS;
  physics stays SI, the mass/speed heroes convert at the display layer only),
  changes apply LIVE, everything is unlocked (the currency/unlock economy is a
  later, separate problem), and the player loadout persists per browser in
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
  the HUD; AI tunables (count, top speed, corner accel, aggression) live in
  the `tuning` defaults (the old live panel that edited them was removed).
- **The game is a reusable component now.** The whole ~2400-line integration
  (three.js scene, cannon-es physics, combat, AI, HUD, minimap,
  the `?glheadless=1` MessageChannel loop, and the `__greenline` console-drive
  API) was extracted verbatim from the dev harness into
  `src/lib/greenline/GreenlineRace.svelte` (the GAUNTLET shared-component
  convention), so both the dev harness and the real portal route mount the
  IDENTICAL systems. TWO props parameterize it: `loadout?` (the build to
  race; when omitted the component owns its loadout locally, seeded from /
  persisted to the `greenline_loadout` localStorage key, live-swappable only
  through the `__greenline` console API's `setArchetype`/`equip` since there is
  no in-race garage) and `onFinish(outcome)` (called ONCE when the player
  completes a RACE, with `{ finishPosition, totalTimeMs, bestLapMs, laps }` —
  total time is the finishing-lap crossing stamp minus the timing-start stamp).
  The `showDebug` prop was removed along with the tuning panel + in-race garage
  (see the removal bullet below). The dev harness `/dev/greenline-movement` is
  a thin wrapper that mounts the component with no loadout prop
  (localStorage-backed), unchanged in feel apart from those removals.
- **Headless AI-only stress-test hooks (data-only, backward compatible).** The
  `__greenline` debug object (only present under `?glheadless=1` / the dev
  harness) gained a few instrumentation methods for automated statistical
  testing, none of which touch normal gameplay: `enableAiPlayer(on)` attaches
  an `AiDriver` to the PLAYER rig so it races as a 4th AI (the drive + weapon
  branches key off `player.ai`, both no-ops for a normal no-AI player);
  `setFieldArchetypes(archs)` assigns archetypes across the whole field in rig
  order (a runner rotates them so every archetype visits every grid slot,
  cancelling start-position bias); `setLapTarget(n)` shortens races (the sim is
  real-time and cannot be fast-forwarded); `getTelemetry()` returns per-round
  weapon fire/hit + flip-recovery counters (`testStats`, reset by resetRound);
  `raceState()` returns a full per-rig snapshot (laps, checkpoint, finish
  position, exact total race time, best lap, upright-ness). The Rig gained
  `raceStartMs`/`finishAtMs` so every vehicle (not just the player) reports an
  exact total. All additive; solo/normal play is byte-identical.
- **Real portal route `/greenline` (signed-in tier, any role; RACE only).** The
  first player-facing home for the game, a flow state machine (no page reload
  between screens): title -> garage -> race -> results -> loop back to
  garage/title. Auth is the portal's existing model: `/greenline` is in
  `hooks.server.ts` `authedPrefixes`, so anonymous users are redirected to `/`
  (the standard signed-out handling); `+page.server.ts` loads only the user id
  now (the old `profiles.role`/`isTeacher` lookup existed solely to gate the
  in-game tuning panel, which is gone, so no role lookup remains). Everyone
  gets the same clean game. The mode is RACE-only in this flow (the `mode` flag
  lives under GreenlineRace and defaults to `race`; the old panel's mode row
  was the only switch and it was removed). The garage screen
  reuses `Garage.svelte` directly (two new backward-compatible display props,
  `note` / `closeLabel` / `onback` / `backLabel`, default to the dev-harness
  copy so the overlay is unchanged), loads the saved build via
  `loadUserLoadout` and saves edits via `saveUserLoadout`
  (`src/lib/greenline/persistence.ts`, 0049); the results screen
  (`src/lib/greenline/GreenlineResults.svelte`, presentational) submits the run
  via `submitRaceResult` and shows the track leaderboard via `loadLeaderboard`.
  Everything data-backed FAILS SOFT (0049 unapplied / offline): the garage and
  results still function, the saved build reads as the default, the submit is a
  no-op, and the board shows an "unavailable offline" note. The route is in the
  portal nav (the homepage launcher `greenline` card in `portal-apps.ts`, cta
  "Race", `requiresAuth` like GAUNTLET) and registered in `site-manifest.ts`
  (own version badge / changelog filter; `contains: ['greenline']`).
- **Dev harness `/dev/greenline-portal`** (404 in production, no auth /
  Supabase): mounts the REAL `GreenlineTitle`, the REAL `Garage` (with the
  route's own labels) and the REAL `GreenlineResults` (sample board + outcome,
  with mode toggles for the empty / loading / submitting / offline-error
  states) so the three presentational flow screens are browser-verifiable
  without a live backend; `?view=garage|results` preselects a view (headless
  screenshot support). The race itself is verified via
  `/dev/greenline-movement` (drive + finish through the `__greenline` API
  under `?glheadless=1`); the full signed-in data-backed loop runs only on
  `/greenline`.
- **GREENLINE brand layer (the visual identity, deliberately NOT the portal's
  IDEA green).** The locked art direction lives in the repo-root reference
  `Greenline Art Direction Reference.html` (direction "1A / IMPACT": floodlit
  rig-yard night, chrome prototype machines frozen mid-collision, amber spark
  shower, ONE green signature thread); read it before any GREENLINE visual
  work. `src/lib/greenline/brand/` implements it: `brand.css` (tokens scoped
  under `.glb`: night base `#04060a`, chrome/steel material with the
  chrome-gradient recipe whose dark band pins to 51%, signature green
  `#2ae57e` + UI green `#8fffc4`, amber impact `#ffb02e`), `brand.ts` (the
  side-effect import: tokens + fonts `@fontsource/archivo-black` and
  `@fontsource/saira-condensed`; Saira has no true italic, the browser
  synthesizes it), `GreenlineWordmark.svelte` (Archivo Black, skew -7deg,
  chrome gradient clipped to text, RGB-split ghost layers), `KeyArtScene.svelte`
  (the master key art ported as LIVE CODE: a fixed 1280x720 stage of
  positioned/clipped divs + an SVG spark shower + vignette + film grain that
  cover-scales to its container; only motion is a slow ember drift, gated
  behind `prefers-reduced-motion`), and `GreenlineTitle.svelte` (the title
  screen: scene + responsive wordmark overlay + full-bleed signature line +
  "ENGINEERED TO COLLIDE." + START, Enter also starts). Color doctrine, per
  the reference: chrome/steel is the dominant language; GREEN is surgical
  (wordmark line, the SELECTED build in the garage, the player's own
  standings/leaderboard row, weapon READY, best-lap value, next minimap gate,
  the player minimap marker); AMBER is reserved for impact (low hull,
  DOWN/ELIMINATED plates, low-hp standings, the P1 win flourish on results) —
  never ambient. Type: Archivo Black = wordmark/hero voice only, Saira
  Condensed = labels/decals/taglines, Share Tech Mono = fast-ticking numerics
  (stable digit widths). The race HUD in `GreenlineRace.svelte` is a
  broadcast-style overlay (top-left speed/hull/status/weapon cluster,
  top-center timing strip + event flash feed, standings tower, recolored
  steel `Minimap.svelte`) built legibility-first: solid dark plates, hairline
  steel borders, NO blur/glow over the moving scene. The speed readout shows
  MPH (physics stays SI; converted at display). The old debug m/s sub-line and
  the whole teacher/dev tuning panel were removed (see the removal bullet).
  Garage/results/title all share the
  `.glb` tokens; the four archetype cards carry distinct line-art silhouette
  glyphs (slab / dart / apex line / antenna) so builds read apart before any
  stat is read.
- **Multi-part vehicle rigs (the Crossout-direction foundation).** Every
  vehicle in `GreenlineRace.svelte` composes four NAMED parts instead of one
  fused mesh: `Rig.parts` holds `chassis` (base hull + canopy), `armor`
  (plating), and `mount` (empty weapon-mount socket) as attachment Groups
  under carGroup, each at its own local transform, plus the physics-driven
  `wheels` (world-space meshes, so scene-level). This exists so the future
  garage customization, live preview, and per-part damage systems can swap a
  part's geometry/material or map a hit point to its nearest named part
  without touching the rest of the rig; physics is deliberately still ONE
  cannon-es chassis body. Part geometry proportions derive from the resolved
  archetype, echoing the garage glyphs (ARMOR slab under separate bolted
  plates, VELOCITY low dart with tail fin, HANDLING compact with flared
  fenders, SYSTEMS angular with the antenna mast on its mount), and
  archetype visuals rebuild live on a garage swap (`buildRigVisual`).
  Materials follow the brand: chrome/steel PBR whose reflections come from
  the brand's chrome-gradient recipe baked into a tiny PMREM env map applied
  to VEHICLE materials only; body tones are all chrome-ramp tokens; the
  signature green thread appears on the PLAYER's machine only (the AI field
  carries the same thread in dim cool-rim, so archetypes read by silhouette,
  never hue); amber is only impact state (hit flash, DOWN tint, low-hull
  overhead bar). Damage feedback rides the split: the scorch tint chars the
  per-rig hull material, the crumple jitters the per-rig hull clone's
  vertices AND rattles the shared-geometry armor plates via per-mesh
  transform jitter, restored exactly on heal. Geometries/materials are
  shared per archetype across rigs (only the hull clone + tint material are
  per-rig).
- **Shared rig-visual builder + equipped-part visuals
  (`src/lib/greenline/rig-visual.ts`).** The bodywork builder is extracted out
  of `GreenlineRace.svelte` into one shared module: the brand palette (`GL`),
  the chrome-IBL recipe, the shared vehicle materials, the four archetype part
  sets, and the chassis-frame constants (`COM_DROP` / `WHEEL_RADIUS` /
  `WHEEL_CONNECTIONS`) all live there, and
  `createRigVisuals(THREE, renderer).build(target, loadout)` is the ONE
  builder both the race scene and the garage preview call, so the preview is
  by construction the on-track machine and the two can never drift (three.js
  stays dynamically imported; the module imports three TYPES only, taking the
  loaded module at runtime). The builder reads the FULL resolved loadout, not
  just the archetype: every equipped part shows on the vehicle, mapped onto
  the named part groups. `plating` -> the armor group (composite = thickened
  matte-laminate plates, reactive = a bolted tube exo-cage placed in the armor
  group ON PURPOSE so it visibly strips apart as the armor pool drains,
  stripped = plates removed, bare hull, the signature thread relocating to a
  deck spine when the removed plates carried it); `drivetrain` -> chassis
  greebles (overbored = hood scoop + twin raked exhaust stacks, slipstream =
  gloss aero fairing + flush side skirts, hotintake = open intake trumpet with
  a glowing throat + visible pipe plumbing); `tires` -> the wheel meshes
  (slick = wider glossy smooth, terrain = faceted knobby lugs, hardwall = wide
  matte with a center reinforcement hoop as the wheel's one child mesh);
  `systems` -> mount-group hardware that rides (and tilts with) the socket
  (capacitor = cell bank with glowing caps + coil, faraday = wireframe mesh
  dome + rim ring, targeting = sensor dish + lens + scope barrel). Variants
  place off per-archetype ANCHORS (hood / rear deck / tail / deck height /
  hull dims), so every part layers onto every archetype from one recipe, no
  per-combination special cases. Geometry discipline unchanged: composed node
  lists and geometries are cached and shared (unit primitives scaled per
  node); only the deformable hull is cloned per vehicle. A rig rebuilds
  exactly when `visualKeyFor(loadout)` changes (`Rig.visualKey`, superseding
  the archetype-only `visualArch` check), so a live part swap rebuilds like an
  archetype swap always has.
- **Garage 3D preview (`src/lib/greenline/GaragePreview.svelte`).** The
  garage's visual half: an isolated three.js viewport (own small scene,
  camera, and renderer, NOT the race world) showing the resolved build on a
  dark pedestal ringed by the green signature line, lit by a compact dual-tone
  key/counter/rim rig with the race's hemisphere fill and a one-stop brighter
  display exposure (SAME materials as the race; a Linear tone-mapping exposure
  is the only brightener that does not fork the material recipe, since metals
  take almost nothing from diffuse fill). OrbitControls per the StlViewer
  pattern: drag to orbit, wheel/pinch zoom, distance and polar clamps so the
  camera can never enter the model or sink under the floor, slow auto-orbit
  until first interaction, off under `prefers-reduced-motion`. It rebuilds
  live off the shared builder whenever the archetype or any part changes.
  `Garage.svelte` mounts it beside the archetype cards (`preview` prop,
  default true) for the pre-race garage flow. (The garage is now only ever the
  pre-race screen; the old race-embedded G-key garage overlay, which passed
  `preview={false}`, was removed.) Browser-verified in
  `/dev/greenline-portal?view=garage` (all sixteen parts, archetype swaps,
  orbit/zoom clamps) and on track via `/dev/greenline-movement`.
- **Performance target:** the school's desktop computers, roughly 6-8 years
  old (a real but aging GPU budget, not tablets or Chromebooks): moderate
  per-part polycounts, geometries and materials reused across instances (up
  to 7 simultaneous multi-part vehicles, so draw calls are the budget to
  watch), no dynamic per-light shadows; standard directional + hemisphere
  lighting plus the one-time vehicle env map is the lighting ceiling.
- **Soundtrack (`src/lib/greenline/GreenlineMusic.svelte`).** Music is wired to
  the `/greenline` route's screen state machine by ONE controller mounted once
  in `+page.svelte` OUTSIDE the `{#if}` chain (so audio survives every screen
  change without remount), taking `screen` + `finishPosition` props. Mapping:
  title -> a menu track, garage -> a workshop track, race -> a random race
  track picked at race start, results -> `winner.mp3` if `finishPosition === 1`
  else `loser.mp3`; all loop (a track that outlasts a race cleanly restarts,
  no crossfade-to-self). Screen changes CROSSFADE (~350ms two-channel over
  plain `HTMLAudioElement`s, never a hard cut/pop). Autoplay: the first play()
  is attempted on mount and, if the browser blocks it, retried once on the
  first pointer/key event (armed listeners), so the title is never silent
  forever. A **session mute toggle** (module-level `sessionMuted` so it
  survives remounts within the SPA session but NOT a reload) is a fixed
  bottom-right `.glb`-styled dark-plate/hairline-steel button (bottom-right is
  the one free HUD corner: speed top-left, timing top-center, standings/tuning
  top-right, minimap bottom-left, controls bottom-center); toggling ramps the
  active track's volume. This is a small purpose-built controller, NOT a reuse
  of VANGUARD's audio (that lives inline in the legacy HTML monolith, coupled
  to its own music-lane/sector logic, not an extractable module). **Assets:**
  `static/greenline/audio/` (following VANGUARD's `static/<game>/audio/`
  convention), holding two menu (`menu-1/2`), two workshop (`workshop-1/2`),
  five race (`race-1..5`), plus `winner.mp3` / `loser.mp3` — the menu/workshop
  pools rotate, race is random, so the pool counts are read from the arrays in
  the component, not hardcoded elsewhere. Music only: no SFX/engine/weapon
  audio exists yet. Dev harness: `/dev/greenline-portal` mounts the controller
  with a title/garage/race/results view switcher + a win/lose toggle, so
  per-screen track selection, crossfade, and the mute button are
  browser-verifiable (via network + DOM, since `new Audio()` elements are
  off-DOM) without auth.
- **Tuning panel + in-race garage removed; player-facing units are US
  customary.** Two chrome removals and a display-unit pass, all display-layer
  only (the SI physics, `tuning` defaults, and `cannon-es` calibration are
  untouched):
  - The live-editable **tuning panel** in `GreenlineRace.svelte` is gone
    (with it: the `resetTuning`/`copyTuning` helpers and the `.gl-panel*` /
    `.gl-section` / `.gl-actions` CSS). The `tuning` object keeps driving the
    sim from its defaults; hand-tuning feel is now a code edit. Its mode row
    was the only mode switch, so RACE is the only reachable mode everywhere
    (the `mode` state stays `'race'`, still settable via the `__greenline`
    console API's `setMode`).
  - **In-race garage removed:** the G-key overlay (`garageOpen`, its keydown
    handler, the `<Garage>` render, the `Garage` import, and the "G GARAGE"
    controls hint) is gone. The garage is reachable ONLY through the portal
    title -> garage -> race -> results flow now, in every build including the
    dev harness (a real pit-stop mechanic, a track location rather than a menu,
    is a future idea, deliberately not built). Live build swaps in the race
    still work through the `__greenline` console API (`setArchetype`/`equip`),
    which is why `selectArchetype`/`equipPart`/`persistLoadout` stay.
  - **`showDebug` prop removed** from `GreenlineRace` (its only remaining job
    after the two removals was the debug m/s sub-line, also removed). Both
    callers dropped it: `/greenline/+page.svelte` no longer passes it and its
    `+page.server.ts` no longer looks up `profiles.role`/`isTeacher` (that
    lookup existed only for the panel); `/dev/greenline-movement` mounts the
    component bare.
  - **Units:** the HUD speed reads **MPH** (`speedMph`, `rawSpeed * 2.236936`),
    and the Garage resolved-build heroes read **MASS in lb**
    (`baselineMass * chassisMass * 2.2046226`) and **TOP SPEED in mph**
    (`* 2.236936`). Converted at the point of display only; nothing in the
    simulation or the balance sheet changed. Verified in
    `/dev/greenline-movement` (panel absent, G opens nothing, HUD mph matches
    physics velocity) and `/dev/greenline-portal?view=garage` (lb + mph
    heroes).
- **Garage foundation + settings shell (Phase 2a).** Four additive changes to
  the pre-race flow, all layered on the existing loadout/persistence model.
  - **Named loadout slots (up to 5), migration `0050`.** 0049's single
    `greenline_loadouts` row stays the ACTIVE/working build the race reads (its
    fail-soft path is untouched); it gains a nullable `active_slot` pointer, and
    the new `greenline_loadout_slots` table (PK `(user_id, slot)`, `slot` in
    [0,5)) holds named builds. Same owner-scoped self-write RLS as
    greenline_loadouts, plus a DELETE grant (slots are removable). Persistence
    seam (`persistence.ts`): `loadUserSlots` / `loadActiveSlot` / `saveSlot` /
    `deleteSlot`, and `saveUserLoadout` gains an optional `activeSlot` arg
    (upsert writes only the columns it is given, so omitting it preserves the
    pointer). All fail soft like `loadUserLoadout`. Doctrine: ONE shared working
    build, up to five NAMED snapshots; LOAD copies a slot into the working build
    and marks it active, SAVE overwrites a slot with the current build, editing
    the working build (archetype/part swap) sets `active_slot = null`
    ("unsaved"). The garage stays storage-agnostic (`Garage.svelte` takes
    `slots` / `activeSlot` + `onSaveSlot` / `onLoadSlot` / `onDeleteSlot`
    callbacks, the Minimap convention); `/greenline/+page.svelte` owns the
    Supabase I/O (optimistic local update so slots work in-session even
    pre-migration). Delete is a two-step inline confirm (the gauntlet-room
    pattern). Empty slots render distinctly (dashed frame, "SAVE HERE") from the
    stock default build.
  - **Settings overlay (`GreenlineSettings.svelte`).** A MODAL, not a screen in
    the title/garage/race/results machine; opened from a gear on the title
    (`GreenlineTitle` gained `onSettings` + an `enableShortcut` prop the parent
    sets false while the modal is open, so Enter-to-start never fires from
    underneath) and the garage header (`onSettings`). Sections: CONTROLS
    (read-only key legend this pass — a remap UI drops into the same row layout
    next prompt), AUDIO (music-only), and a clearly-labelled CAMERA placeholder
    (Phase 9). Escape closes; the overlay swallows keydowns. Rendered on top by
    `+page.svelte` (and the dev harness).
  - **Music settings (`audio-settings.svelte.ts`, a reactive localStorage store)
    replace the old binary session mute.** Persisted across a real reload:
    continuous `volume` (0..1 gain multiplying the existing `MASTER` 0.55
    ceiling), a quick `muted` toggle (the floating button + a settings toggle;
    raising the slider off zero auto-clears mute and PERSISTS that), and
    per-category track `pins` (menu/workshop/race) with a `SHUFFLE` default that
    keeps today's rotation/random behavior. `MUSIC_TRACKS` lives in this ONE
    module (pool counts read from it, not hardcoded). `GreenlineMusic` reworked:
    the screen effect wraps selection in `untrack` so volume/mute/pin changes
    never reroll a random race track; a volume/mute effect ramps the live track;
    a pin effect crossfades to a newly-pinned CONCRETE track for the current
    screen at once (switching to shuffle does not interrupt). Crossfade
    mechanism unchanged. No SFX bus yet (later phase); the store is shaped so an
    `sfx` sibling drops in without a redesign.
  - **Garage stats redesign + part icons.** The resolved-build display leans on
    the existing `describeStats` / `describeEffects` (no new stats model): four
    headline hero tiles (HULL / TOP SPEED / MASS / COOLDOWNS) each with a real
    signed delta from the neutral baseline and a tone, then the REST of the
    deltas split into GAINS / TRADEOFFS / CHARACTER columns (the five
    hero-covered keys filtered out). Every one of the 16 parts gets a distinct
    inline stroke-SVG icon (the AppLauncher `appIcon` convention, chrome/green
    themed) in the part picker.
  - **Verified** end to end in `/dev/greenline-portal` (no auth/Supabase, the
    slots run on an in-memory store): slot save/load/delete + active-slot
    tracking survive a reload, settings open from title AND garage without
    breaking Enter-start (suppressed while open, works when closed), the volume
    slider + mute + track pin persist to localStorage and drive playback (pin
    fetched the pinned track live), and the 16 icons + redesigned stats render.
    WebGL (`GaragePreview`) hangs pane screenshots, so DOM/network/console were
    the verification surface (per the WebGL-harness memory note).
- **Remappable controls (Phase 2b), keyboard + gamepad.**
  `src/lib/greenline/control-settings.svelte.ts` (the audio-settings pattern:
  module-level `$state` + localStorage) is the action registry AND binding
  store: nine actions (accelerate, brake, steerLeft, steerRight, handbrake,
  resetRound, fire, oil, tether), each `held` (sampled per frame) or `edge`
  (once per press), with ONE keyboard binding and at most ONE gamepad binding
  (`button` index, or `axis` + direction; two half-axis steer actions
  reproduce the old signed stick-X read exactly, dead zone 0.12 preserved).
  Defaults are the historical scheme (W/S/A/D/Space/R/F/E/Q; pad standard
  mapping RT/LT/LS-X/A/RB/X/LB, resetRound ships unbound on pad); the old
  hardcoded arrow-key ALTERNATES are gone, one binding per action per device.
  Invariants: bindings on a device stay unique (a corrupt stored map falls
  back to defaults wholesale), keyboard stays total (swaps exchange, never
  drop), pad bindings may be null (a swap into an unbound action moves the
  binding). `GreenlineRace.svelte` resolves EVERY input through the store:
  the fixed `TRACKED` set is gone (keydown resolves `actionForKey`, any BOUND
  key gets `preventDefault`, held actions track by code, edge actions fire
  from keydown or the generalized pad edge scan; pad reads go through
  `padBindingValue`/`padBindingHeld`), and the HUD controls hint derives from
  the live bindings. The settings overlay CONTROLS section is the rebind UI:
  click a Key/Pad cell to arm capture (next keydown, or next pad button press
  / axis push past threshold judged against an arm-time baseline snapshot so
  a held trigger or drifted stick can never bind itself; Esc cancels; a
  code-less keydown is ignored), a same-device conflict opens an explicit
  SWAP / CANCEL prompt (never silent overwrite; key vs pad never conflicts),
  each row has a reset-to-default (which auto-swaps with whatever holds the
  default, keeping uniqueness), and RESET ALL restores the whole scheme. The
  "Shockwave ram" row stays non-interactive (nose contact, not a binding).
  Verified in `/dev/greenline-portal` + `/dev/greenline-movement?glheadless=1`
  (rebind drives the car under the new key only, swap/cancel/reset/persist
  across reload, pad paths via a `navigator.getGamepads` fake; no physical
  gamepad in the environment).
- **Web Audio engine + spatial audio + music unification (Phase 2C),
  `src/lib/greenline/audio-engine.ts`.** ONE shared `AudioContext` singleton
  (`audioEngine`) with a bus graph: `music`, `weapons`, `impacts`, `ui`,
  `ambient`, each a `GainNode` feeding a master `GainNode` feeding
  `destination`. This pass is pure INFRASTRUCTURE (no real SFX content yet;
  later phases trigger it) plus the migration of the existing music crossfade
  onto the graph. Deliberately NO `engine` (vehicle-motor) bus and NO
  looping-source management here — RPM-mapped engine loops are Phase 8. The
  context is created suspended (autoplay policy) and its `resume()` is
  coordinated with GreenlineMusic's existing first-gesture arm (`armGesture`),
  ONE resume path for both music and SFX. Degrades gracefully: if Web Audio is
  unavailable every method is a safe no-op and music falls back to plain
  `HTMLAudioElement` playback (the element is never routed through a dead
  graph).
  - **Pooled one-shot voices** for the four SFX buses (`playBuffer` is the real
    call other phases target; `playTone` is the dev/test oscillator path).
    Global cap 24; per-bus soft caps weapons 8 / impacts 8 / ui 4 / ambient 4.
    The soft caps SUM to the global cap, so per-bus stealing (steal the oldest,
    ties to the quietest, on the same bus) is the effective limiter and the
    global cap is a defensive ceiling. Every voice supports positional pan (a
    `{x,y,z}` via a cheap equalpower `PannerNode`, `rolloffFactor 0` = pan only,
    no distance attenuation for v1) and per-trigger pitch jitter (a random rate
    in a caller-supplied `[min,max]`, default none). Rate is applied through
    `playbackRate` for buffer sources; oscillator test tones have none, so the
    same pitch change is realized by scaling `frequency` around the nominal
    (`applyRate`).
  - **Manual Doppler** (browsers don't reliably auto-Doppler via `PannerNode`):
    `setListener(pos, vel)` + per-voice pos/vel feed a per-frame `update()`
    (driven by an internal rAF-or-timeout ticker while any positional voice is
    live, and also callable by a future game loop — idempotent) that computes
    relative radial velocity and nudges the voice rate, clamped to
    `[0.94, 1.06]` so it reads as physical, never cartoonish. Approaching raises
    pitch, receding lowers it, perpendicular velocity yields no shift.
  - **Music migration:** in `GreenlineMusic.crossfadeTo`, each newly-created
    `Audio(src)` is wrapped ONCE (ever) in a `MediaElementAudioSourceNode` via
    `audioEngine.connectMusicElement` and routed through the `music` bus. The
    element's own `.volume` (the existing `rampTo` crossfade) and the music bus
    gain multiply, so the crossfade / pin / mute / volume behavior is unchanged
    from a player's perspective. The music bus sits at unity and only moves for
    ducking. All the existing GreenlineMusic logic (`rampTo`, the three
    `$effect`s, `armGesture`, the mute/volume UI) is untouched apart from the
    resume-coordination and one added `$effect` that pushes `sfxGain()` into the
    engine (GreenlineMusic is the one always-mounted audio surface).
  - **Ducking:** `duckMusicBus(amountDb, attackMs, releaseMs)` ramps the music
    bus down and back to unity, for future impact/explosion phases (Phase 4/6)
    to call. Nothing calls it in normal play yet.
  - **Settings:** `sfxSettings` (0..1 gain, persisted to
    `greenline_sfx_volume`, reactive) is a sibling of the music volume in
    `audio-settings.svelte.ts`; `sfxGain()` / `setSfxVolume()` mirror the music
    shape (no separate SFX mute for now). The settings overlay AUDIO section
    gains an independent "Effects volume" slider beside the music controls;
    music and SFX are separately adjustable, and `setSfxVolume` applies the
    level to all four SFX bus gains (audio-clock ramp, rAF-independent).
  - **Verification** (`/dev/greenline-portal`, no auth/Supabase): the harness
    exposes `window.__greenlineAudio` (engine + `tone`/`stress`/`pan`/`doppler`/
    `duck`/`snapshot`/`detail`) and an "audio (dev)" bar, since there is no real
    content to trigger from play. Browser-verified: bus routing + soft-cap
    stealing (12 fired → 8 kept), pitch jitter (distinct in-range rates),
    positional pan (`panX` tracks emitter x L→R), Doppler (1.06 approaching /
    1.00 perpendicular / 0.94 receding), music-bus duck (1 → ~0.25 → 1), the
    SFX slider driving the four bus gains while music stays independent, the
    music migration carrying real signal through element →
    MediaElementSourceNode → music bus → master (analyser RMS on master), and
    context resume-on-gesture from all four screens (title/garage/race/results).
    Note: `requestAnimationFrame` does not tick in the automated harness tab, so
    the rAF-driven `rampTo` volume fade is not observable there (a pre-existing
    property of the unchanged crossfade code, not this change); everything
    audio-clock-driven verifies normally.
- **Equippable weapons: dual mount slots + capacity budget (Phase 4a), proven
  with Autocannon and Homing Rocket.** A second weapon system PARALLEL to the
  four fixed disruption tools (`WeaponId`/`lastUseMs`/`AiWeapon` untouched):
  `Loadout.parts` gains `weaponPrimary` / `weaponSecondary` (weapon ids from
  the new `WEAPONS` catalog in combat.ts; secondary may be the `WEAPON_NONE`
  sentinel, stock = Autocannon / none). The catalog (`WeaponDef`: id, name,
  shortName, category over all six planned families, `mountCost` 1-3,
  cooldown, per-category param block) is the balance sheet; only kinetic +
  guided have fire logic this pass, Phase 4b adds the other eight entries.
  **Mount capacity** is a FLAT budget, not a neutral=1 multiplier:
  `Archetype.mountCapacityBase` (SYSTEMS 5, ARMOR/HANDLING 4, VELOCITY 2,
  lowered from the planned 3 because with only costs 1+2 shipped a floor of 3
  made every budget unreachable; at 2 the missile genuinely carries one
  weapon). Validation (total cost <= capacity, no duplicate weapon) lives in
  ONE place, loadout.ts (`weaponLoadoutIssue` / `sanitizeLoadoutWeapons` /
  `normalizeStoredLoadout`, the latter now shared by parseLoadout AND
  persistence.ts): the garage UI blocks invalid picks up front with the
  reason shown (capacity pip bar, disabled cards: "over budget — needs N, M
  free" / "already equipped as ..."), an archetype swap that shrinks capacity
  sheds the secondary, and `applyLoadoutToRig` re-sanitizes so console equips
  can never reach the sim invalid. **Slot cooldowns** key on the SLOT
  (`VehicleCombat.lastSlotUseMs` / `canUseSlot` / `markSlotUsed`), never the
  weapon id; a dead mount takes both equip slots offline exactly like the
  fired tools (the weapon meshes sit in the mount group with the per-rig
  charring mount material, so they visibly deactivate with the pool).
  **Autocannon** = `tryFireKinetic`, the tryFire shape (forward cone,
  hit-scan, zone-routed applyDamage) with no disruption, rapid/weak/cheap.
  **Homing Rocket** = two stages: a passive continuous LOCK per shooter slot
  (`WeaponLock` / `updateWeaponLock`, ticked per rig per frame while the slot
  is ready; the nearest target in the forward cone accrues dwell, leaving the
  cone clears it outright and re-entry restarts from zero, the counterplay)
  and a real multi-frame PROJECTILE launched only off a complete lock
  (`tryLaunchGuided` / `updateProjectiles`, a race-level array in the
  OilSlick world-object pattern: steers toward the target each frame, hits
  via the same classifyHitZone/applyDamage pair, expires on lifetime/target
  loss; a no-lock press spends nothing). Controls: two new remappable edge
  actions `fireWeaponPrimary` / `fireWeaponSecondary` (defaults Z / X
  keyboard, B / Y pad) in the standard registry, so the settings rebind UI
  picked them up with zero UI changes. HUD: per-slot weapon cells (READY /
  cooldown / OFFLINE / LOCK n% / LOCKED) beside the four tool cells (grid
  now 3-wide), a LOCKING/LOCKED status chip, and a world-space lock ring on
  the player's target that tightens with the dwell (cool-rim acquiring,
  green locked). AI: every AI build cycles a weapon fit alongside its
  archetype (`AI_WEAPONS`, incl. a rocket-primary build) and
  `AiDriver.wantsWeaponFire` / `scheduleSlotUse` reuse the wantsFire
  restraint pattern; guided launches additionally require the harness-side
  complete lock. SFX are PLACEHOLDER synthesized tones on the Phase 2C
  audio-engine buses (positions ride through, so the later real-asset swap
  is content-only). rig-visual's `visualKeyFor` now includes both weapon
  slots and each weapon has a simple distinguishable mesh recipe (barrel gun
  / boxy tube launcher, plus a generic hardpoint stub for future catalog
  ids); `__greenline` gains `fireWeapon` / `getWeapons` / `getLocks` /
  `getProjectiles`, and telemetry counts autocannon/rocket fire+hits.
- **Four more weapons (Phase 4b-i): Railgun, Shotgun Burst, Cluster Missile,
  Caltrops, on the 4a framework.** Additive over the shapes 4a established; no
  new structural inventions except the two noted.
  - **Railgun** (kinetic, `mountCost` 3, cd 2.2s) and **Shotgun Burst**
    (kinetic, `mountCost` 1, cd 0.8s) reuse `KineticWeaponParams` /
    `tryFireKinetic` UNCHANGED. Railgun = heavy precision (`damage` 42, `range`
    62, `coneDeg` 6 — a needle cone at long reach); Shotgun = close spread
    (`damage` 22, `range` 16, `coneDeg` 64 — the short range IS the falloff, so
    no distance-attenuation field was added). Both zone-route through
    `applyDamage` exactly like the Autocannon; only per-weapon telemetry keys
    (`railgun`/`shotgun`) and muzzle/hit FX intensity differ in the harness.
  - **Cluster Missile** (guided, `mountCost` 3, cd 6s) reuses the full
    lock -> `tryLaunchGuided` -> `updateProjectiles` pipeline, adding ONE new
    sub-behavior: `GuidedWeaponParams` gained optional
    `splashRadius`/`splashDamageFraction` (Cluster 9 / 0.5; Homing Rocket
    leaves them UNDEFINED and stays strictly single-target, zero behavior
    change). On a direct hit `updateProjectiles` also applies the reduced
    fraction to every OTHER live vehicle within `splashRadius` of the impact
    point (never the locked target, never the owner), returned as
    `ProjectileHit.splash: SplashHit[]` (always `[]` for the rocket). The
    projectile carries the two splash fields from the def.
  - **Caltrops** (NEW `area` category + `AreaWeaponParams`, `mountCost` 1, cd
    5s): a persistent ground hazard, the OilSlick world-object pattern
    (`CaltropField`, race-level array owned by the harness, `createdMs`/
    `expiresMs`) but DELIBERATELY NOT single-consumption — it triggers
    repeatedly, against multiple vehicles or the same vehicle again, over its
    14s life. `tryDeployCaltrops` bakes build-scaled `damage` at deploy (the
    Projectile.damage convention) and uses `canUseSlot`/`markSlotUsed` (it is
    an equipped weapon, not a fixed tool); `updateCaltropFields` deals small
    direct puncture damage (10, zone-routed), NOT a traction/slip effect
    (that stays oil's job), with a per-vehicle `retriggerImmunitySec` (1.5s)
    window keyed in `field.nextHitMs` so a stalled car is not shredded in
    place, plus the owner `armSec` (0.9s) immunity mirroring `OIL_ARM_SEC`.
  - **Capacity fits** (budgets unchanged: ARMOR/HANDLING 4, VELOCITY 2,
    SYSTEMS 5): 3+3 is unreachable on every chassis (a hard dual-heavy ceiling),
    VELOCITY (2) cannot mount any cost-3 weapon at all. Validation is the same
    `weaponLoadoutIssue`/`sanitizeLoadoutWeapons` (no new validation code); the
    garage picker surfaces the four cards automatically (`WEAPONS.map`).
  - **AI**: `AiDriver.wantsAreaDrop` (NEW, the `wantsOil` drop-behind logic,
    slot-keyed) decides area weapons since they have no forward aim cone;
    kinetic/guided still use `wantsWeaponFire`. `AI_WEAPONS` now cycles
    armor=railgun+shotgun, velocity=auto+shotgun, handling=cluster+caltrops,
    systems=railgun+rocket, so the field exercises the whole catalog.
  - Placeholder synthesized SFX per weapon on the Phase 2C buses (rail/shot/
    cluster/caltrops fire+hit; cluster reuses the existing lock cue). Each new
    weapon has a distinguishable mount-socket mesh in `rig-visual.ts`
    (long twin-rail barrel / squat quad-barrel / 2x2 launcher pod / rear
    dropper hopper); the part-clipping cleanup across all 10 is Phase 4c, NOT
    touched here. `__greenline` gains `getCaltrops`; telemetry adds
    railgun/shotgun/cluster/caltrops fire+hit and `clusterSplash` hit counters.
- **The last four weapons (Phase 4b-ii): Auto-Turret, Energy Shield, Radar
  Jammer, Deployable Blades — the locked 10 complete.** Four genuinely new
  mechanics on the same `WeaponDef` framework; each reuses an existing
  precedent so the novelty is contained.
  - **Radar Jammer** (`defensive`, PASSIVE, `mountCost` 1, `cooldownSec` 0).
    No trigger, no fire logic: always active while equipped in EITHER slot,
    even with a dead mount. `applyLoadoutToRig` sets the wielder's
    `VehicleCombat.jammerLockMul` (0.35 from `JammerWeaponParams.lockRateMul`;
    1 = none), which `updateWeaponLock` multiplies into the per-frame lock
    accrual against THAT target (both the continue and re-acquire branches via
    one `accrual(t)` helper) — so an enemy needs ~2.75x as long to lock the
    jammer's wielder. Threaded through the TARGET's combat state (the `resist`
    convention), not a new function. Verified: attacker lock rate 0.41/s vs
    1.12/s unequipped (ratio 0.36).
  - **Energy Shield** (`defensive`, ACTIVE, `mountCost` 3, `cooldownSec` 9,
    `shield: { absorb 70, durationSec 4 }`). The fire action calls
    `tryActivateShield`; the soak lives inside `applyDamage` (a pool that eats
    incoming damage from ANY source BEFORE the zone split, overflow continuing
    to armor/chassis/mount), so every damage path is covered by one code path.
    Emptying the pool BREAKS it (window ends at once, `DamageResult.shieldBroke`
    edge → the "SHIELD DOWN" HUD moment + `shieldBreak` telemetry); timeout ends
    it quietly. `DamageResult` gained `shield`/`shieldBroke`. Verified: 30
    soaked fully (pools untouched), then 50 → absorbs 40, breaks, 10 overflows
    to pools, break event fires once. The two `defensive` shapes are split as
    two sub-blocks on `WeaponDef` (`shield?` / `jammer?`), distinguished by
    presence — the one-block-per-def convention, since `WeaponCategory` puts
    both under `defensive`.
  - **Auto-Turret** (`turret`, `mountCost` 2, `cooldownSec` 1.1, `turret:
    { damage 10, range 30, blindArcDeg 90 }`). No trigger, no aim, no AI
    decision: `updateTurret` is ticked every frame for EVERY vehicle (player
    and AI alike) in its own harness loop; when off cooldown it hit-scans the
    nearest valid target in the full 360deg ring EXCEPT a forward blind arc
    (the gun sits on the rear mount `mountPos` -x, so the chassis occludes it
    toward the front — a target within `blindArcDeg/2` of dead-ahead is
    skipped). Holds fire (spends no cooldown) with no target. Verified for
    BOTH player and AI: engages behind/beside, blocked dead-ahead.
  - **Deployable Blades** (`melee`, ACTIVE/toggled, `mountCost` 2,
    `cooldownSec` 8, `melee: { damage 14, durationSec 3.5,
    retriggerImmunitySec 0.6 }`). The fire action calls `tryDeployBlades`
    (a timer, `bladesUntilMs`, NOT a resource meter); while active,
    `tryBladeStrike` deals damage on ANY contact — a NEW function alongside
    `tryRam` that leans on the SAME collision-contact queue (`pendingRams`,
    both directions per pair) but with NONE of ram's gating (no frontality, no
    closing-speed threshold), at lower per-hit damage. A per-victim retrigger
    window (`bladeHitMs`, the Caltrops pattern) stops a grinding scrape from
    machine-gunning. Verified: 14 damage on a 6 m/s glancing off-axis touch
    that triggered NO ram (control with blades off = 0 damage), and 14 < ram's
    20 on the same geometry sped up.
  - **AI**: `AiDriver.wantsShield` (panic button — pop when chassis < 55% AND a
    rival is near, deliberately NOT gated on `isDisrupted`) and `wantsBlades`
    (toggle when a rival is within ~10m); the harness weapon-decision loop
    branches to them by category and SKIPS turret/jammer (auto/passive, no
    decision). Verified: ai-3 deploys its shield when hurt, ai-1 deploys blades
    when a rival closes, the turret auto-fires for AIs. `AI_WEAPONS` now fits
    the default 3-AI field to show every 4b-ii weapon: armor = turret+blades,
    velocity = jammer+shotgun, handling = shield+caltrops (systems = the heavy
    kinetic+guided pair).
  - **HUD**: a `SHIELD n%` status chip + the absorb `shieldPct`; the slot cells
    read `ACTIVE` (shield/blades deployed, cyan), `ON` (passive jammer, dim), or
    the usual cooldown/READY. **SFX**: turret fire/hit, shield up/break, blade
    deploy/hit, and the jammer's distinct CONTINUOUS low hum (re-emitted on an
    interval while the PLAYER carries one, since it is passive — no fire/impact
    pair). Each weapon has a distinguishable mount mesh in `rig-visual.ts`
    (ringed turret drum + barrel / emitter ring + core / masted dish / hub +
    swept blade fins); the part-clipping cleanup across all 10 is still Phase
    4c. `__greenline` gains `getDefense` (shield pool + windows + jammerMul);
    telemetry adds turret/shield/blades fire+hit and `shieldBreak`.
- **Player-chosen weapon sockets + the all-10 weapon-mesh redesign (Phase 4c,
  closes the clipping problem).** Every archetype now declares NAMED mount
  hardpoints instead of the single `mountPos`: `Archetype.sockets` in
  loadout.ts owns WHICH exist (ARMOR / HANDLING / SYSTEMS: nose + roof + rear;
  VELOCITY: nose + rear only, the dart's canopy IS its spine), rig-visual.ts
  owns WHERE they sit (per-hull `SocketSpec` transforms + pedestal heights,
  tuned against real geometry in the browser). Each of the 10 weapons declares
  `WeaponDef.compatibleSockets` in preference order (first = auto-assign
  default): Caltrops is rear-only (hard mechanical constraint, it drops
  behind), Shotgun Burst nose-only (bumper breacher), kinetics nose/roof,
  guided + turret roof/rear, blades nose/rear, shield + jammer all three.
  Sockets are PLACEMENT ONLY: no fire cone, drop point, or balance number
  reads them. **The choice lives in `Loadout.weaponSockets`** (partial map per
  weapon slot; missing = auto), resolved by `resolveWeaponSockets` — explicit
  pick wins while legal, both slots are enumerated JOINTLY (an auto-assigned
  primary never squats on the secondary's only socket), and the two slots can
  NEVER share a socket: the garage blocks an occupied pick (disabled chip with
  the holder named) and blocks weapon cards whose pair has no assignment
  ("both weapons need the same mount socket" — e.g. twin forward guns on the
  two-socket dart, the one deliberately lost pairing);
  `sanitizeLoadoutWeapons` sheds the secondary for non-UI paths and drops
  stale picks (archetype swap, weapon change) back to auto. **Storage needs NO
  migration:** picks ride INSIDE the existing `parts` jsonb via
  `partsForStorage` on all three paths (0049 working build, 0050 named slots,
  localStorage), `normalizeStoredLoadout` reads them back out, and every
  pre-4c build (no socket data) loads unchanged and auto-assigns — verified
  through the real parse path. build() gives the rig's mount group one
  sub-group per socket (empty hardpoints still show their collar disc);
  dead-mount charring/tilt/sputter now applies PER SOCKET (the tilt re-asserts
  across rebuilds; sputter sparks pick a random hardpoint). All 10 weapons got
  bespoke socket-local meshes replacing the 4a/4b silhouettes (the old
  secondary side-wing hack is gone — each weapon sits centered on its own
  socket), incl. the Energy Shield reinterpreted as an emitter nub whose
  translucent bubble wraps the whole vehicle while the absorb pool is up (a
  per-rig field mesh in the race, hidden on break/timeout). Verified in the
  browser via an automated AABB clip matrix over the live GaragePreview scene
  (160 single-weapon + 226 valid dual-weapon builds x crowding bodywork
  configs, zero real overlaps after socket repositioning; tapered-hull AABB
  phantoms excluded by span) plus claude-in-chrome screenshots; the garage
  picker, conflict blocks, and old-format loads were driven end to end in
  `/dev/greenline-portal` (new `__glGarage` console hook) and
  `/dev/greenline-movement` (`__greenline.setSocket` / `getSockets`).
- **Drift-charged abilities: a second loadout system parallel to weapons
  (Phase 5a),** `src/lib/greenline/abilities.ts`. `AbilityDef` / `ABILITIES`
  is a NEW catalog deliberately separate from `WeaponDef` (abilities are not
  weapons — no mount cost, own two slots, a shared meter instead of ammo), and
  `VehicleAbilities` is the per-vehicle state (the shared drift meter both
  slots draw from, per-slot cooldowns, the nitro/grip effect windows). It
  imports only the `VehicleCombat` TYPE from combat.ts (Overcharge Repair
  writes its pools — the shared source of truth, never duplicated); combat.ts
  never imports abilities. loadout.ts imports the catalog/ids for validation
  exactly as it imports the weapon ids. No cycles.
  - **Two slots + inverted capacity.** `Loadout.parts` gains
    `abilityPrimary` / `abilitySecondary` (secondary may be `ABILITY_NONE`,
    stock = Nitro Boost / none), same no-duplicate rule as weapons. A new
    `Archetype.abilityCapacityBase` is the MIRROR IMAGE of `mountCapacityBase`:
    VELOCITY 5, ARMOR/HANDLING 4, SYSTEMS 2 (the missile leans on abilities,
    the warlock on weapons). Validation follows the exact weapon shape —
    `abilityCapacityFor` / `abilitySlotCost` / `abilityCostUsed` /
    `abilityLoadoutIssue` / `sanitizeLoadoutAbilities`, plus a combined
    `sanitizeLoadout(l)` (weapons THEN abilities) that every enforcement layer
    now calls (garage edit, archetype-swap, `applyLoadoutToRig`,
    `normalizeStoredLoadout`). Ability slots ride inside the existing `parts`
    jsonb (partsForStorage / normalizeStoredLoadout handle them), so
    persistence needed no migration and pre-5a builds load + auto-stock.
  - **The shared meter (drift detection).** No prior drift signal existed;
    `driftIntensity(lateralSpeed, forwardSpeed, handbrake)` (pure) reads
    sideways slip — velocity perpendicular to heading — and the harness charges
    `VehicleAbilities.meter` per frame per vehicle. Tuned to the grippy
    RaycastVehicle (MEASURED in the harness): a clean straight sits near
    ~0.2 m/s lateral so it banks NOTHING, a committed corner runs ~0.9-1.5, a
    handbrake slide spikes past FULL. Constants
    (`DRIFT_MIN_LATERAL` 0.6, `DRIFT_FULL_LATERAL` 3.0, `METER_CHARGE_PER_SEC`
    2.2) live in abilities.ts. The meter BANKS (no passive decay). Both slots
    draw from the ONE per-vehicle meter (a spend by either empties it for
    both). HUD: a green DRIFT meter bar + per-slot ability cells
    (READY / ACTIVE / CHARGE / cooldown), same visual language as weapon cells.
  - **The five abilities** (activation via `tryActivateAbility`, the
    tryLaunchGuided pattern — the pure layer returns intent, the harness
    applies physics): **Nitro Boost** (cost 2, meter 0.5) = a temporary
    `engineForce` x1.8 for 2.2s; **Jump/Hop** (cost 1, meter 0.35) = a
    vertical impulse (1400 N*s; the harness wakes the body first, since
    cannon-es ignores an impulse on a sleeping body — low value on the flat
    track by design, infrastructure for Phase 8's ramps); **Emergency Flip**
    (cost 1, meter 0.3) = forces the flip-recovery re-seat immediately, but
    ONLY while genuinely flipped (up axis below `flipUpY`) — triggered upright
    it is a costless no-op, the Homing Rocket "no lock, no launch" rule;
    **Overcharge Repair** (cost 2, meter 0.6) = an instant heal via the NEW
    `VehicleCombat.repair(amount)` (distributes 45 across armor/chassis/mount,
    most-depleted-first, reviving a dead mount it reaches); **Grip Surge**
    (cost 1, meter 0.35) = a temporary `frictionSlip` x1.5 for 3s. Nitro/grip
    read their multiplier into the physics pipeline each frame
    (`nitroMulNow`/`gripMulNow`); the meter cost is the gate (cooldowns are 0).
  - **Wiring.** Two new remappable `ControlAction`s
    `useAbilityPrimary` / `useAbilitySecondary` (defaults C / V keyboard,
    D-pad up/down pad); the settings CONTROLS rebind UI picked them up with
    zero UI changes (it renders the registry). Garage: an Abilities section
    mirroring the weapons section (capacity pips + two slot pickers + 5
    distinct icons), routed through the SAME `onequip` callback since ability
    slots are `PartSlot` values (no new prop). AI (`ai.ts`): each build cycles
    an ability fit (`AI_ABILITIES`: armor repair+flip, velocity nitro+grip,
    handling grip+repair, systems nitro) and `wantsRepair` (hurt) /
    `wantsNitro` (rival near) / `wantsGrip` (in a corner) / flip (upside-down,
    harness-checked) fire it with the same restraint scheduler as weapons; jump
    is never AI-used (no ramps yet). Placeholder synthesized SFX per ability on
    the Phase 2C buses. `__greenline` gains `useAbility` / `getAbilities` /
    `getMeter` / `setMeter` / `setAbility`; telemetry counts nitro/jump/flip/
    repair/grip.
  - **Verified** (`/dev/greenline-movement?glheadless=1` +
    `/dev/greenline-portal`, via `__greenline` / `__glGarage` — WebGL pane
    screenshots hang, so DOM/console/physics reads): the meter charges from
    cornering (0 -> 0.3+) and stays flat cruising a straight at 15 m/s; nitro
    raises pinned-throttle top speed 16.6 -> 22.3 m/s (=sqrt(1.8)); jump adds
    +7.78 m/s vertical (=1400/mass); grip multiplies wheel frictionSlip 5 ->
    7.5; repair distributes 42 across the pools most-depleted-first and revives
    the mount; Emergency Flip is a no-op upright (no spend) and rights + spends
    while flipped; the inverted budget sheds a 4-cost pair on SYSTEMS (cap 2)
    while VELOCITY (cap 5) keeps it; the AI equips and fires nitro/grip/repair/
    flip each off its own per-vehicle meter; and the two actions remap through
    the settings UI (C -> B live, B fires the ability, C stops).
- **Structural connectors + deeper destruction (Phase 6a, cars only).** Two
  additive layers extending the existing rig-visual + damage systems (no new
  particle system, no new material convention).
  - **Connectors bridge the part-group seams** so a vehicle reads as assembled,
    not four floating pieces. `rig-visual.ts` gains a `connector` VisualNode
    field + two generators wired into `compose()`: MOUNT connectors (per
    hardpoint: two weld tabs just under the collar plane at y<0 where no weapon
    reaches, plus three pedestal-flanking struts + a foot on clearly RAISED
    sockets, base >= 0.15) live in the socket sub-groups on the per-rig
    `mount` material; ARMOR connectors (one inner bracket per real plate present
    after the plating variant) live in the armor group on the per-rig `hull`
    material. The CRITICAL invariant: connectors share the SAME per-rig material
    OBJECT the damage system already mutates (`mountConnector.material ===
    rig.mountMat`, `armorConnector.material === rig.bodyMat`, both
    browser-asserted), so a connector under a failing pool degrades WITH it —
    mount struts char + tilt + buckle-and-drop when the mount dies
    (`setMountDead` droops them), armor brackets strip WITH the plates
    (`syncArmorPlates` now reconciles plates and brackets as SEPARATE sets by
    the same armor fraction, so brackets never skew the plate count). Each
    failure spits its own distinct debris/spark category on the SHARED pools
    (never a new pool) + a snap cue. Stripping a build (`plating-stripped`) has
    no plates so no armor brackets; a socket swap rebuilds them like any part.
    Storage/clip: connectors deliberately interpenetrate the two groups they
    join (the bridge), so `userData.connector` marks them for the clip check to
    skip; browser-verified 0 connector-vs-weapon overlaps across all four
    archetypes with heavy dual-weapon fits.
  - **Compounding crumple** replaces the old snap-to-stage hull deform. `Rig`
    gains `dentAccum` (per-vertex accumulated deformation); every chassis bite
    (`addCrumple` in `afterDamage`, struck-side-biased, clamped to
    `CRUMPLE_MAX` 0.34) DEEPENS it, so the live hull = `dentBase + dentAccum`
    (`writeHull`) and a car battered across a race looks progressively worse
    instead of capping at one state (browser-verified mesh deviation grows
    monotonically 0.71 -> 1.67 over successive hits on a surviving rig). The
    stage (0..3) now drives only the plate-rattle + damage-smoke tiers.
    Heal/reset (`restoreRigCondition`, round reset) zeroes `dentAccum` so the
    bodywork comes back whole.
  - **Tiered damage SFX** (`damageSfx`, the weaponSfx placeholder-tone
    convention on the Phase 2C buses): five DISTINCT tones so severity reads by
    ear — light `scuff`, heavy `crunch`, sharp metallic `connector-snap`,
    `armor-strip`, deep `mount-kill` — one matched sound per hit (pool-kill >
    strip > crunch > scuff), never one generic hit.
  - Debug: `__greenline.getDamageVis(id)` returns the crumple magnitude, plate/
    connector visibility, and the material-object wiring booleans for structural
    verification. Solo/normal play byte-identical for non-damage frames; the
    debris/spark pools stay ring-buffer-capped (48 / 1000) through connector
    failures (browser-verified 48/48, never exceeded).
- **Preset cosmetic customization (Phase 6b, cars only): color, pattern, car
  number.** A purely visual livery layer — no stat, no physics, no gate.
  - **Data (`loadout.ts`):** an OPTIONAL `Loadout.cosmetics` (`Cosmetics =
    {color?, pattern?, number?}`), the 4c weaponSockets precedent exactly — it
    rides INSIDE the existing `parts` jsonb via `partsForStorage` (no migration;
    a pre-6b client ignores the extra key, a pre-6b row loads with no override),
    and `normalizeStoredLoadout` reads it back from the explicit arg
    (localStorage, top-level) OR the embedded `parts.cosmetics` (DB rows) — the
    same dual-source read weaponSockets uses. `normalizeCosmetics` drops unknown
    color/pattern ids, the 'none' pattern, and out-of-range numbers, returning
    `undefined` when nothing valid survives, so an all-default livery is stored
    as absence (round-trips byte-identical). `COSMETIC_COLORS` (10-swatch curated
    palette, independent of archetype) + `COSMETIC_PATTERNS` (none / center
    stripe / twin / wedge / checker) are plain client-safe registries. Threaded
    through ALL persistence paths: localStorage (`serializeLoadout`/`parseLoadout`
    carry it top-level), the working Supabase build + the 5 named slots (both via
    `partsForStorage`), and the slot SNAPSHOTS in both the real route and the dev
    harness (which construct `{archetype,parts,weaponSockets,cosmetics}` by hand
    — the one place the field had to be added explicitly).
  - **Color (`rig-visual.ts`):** `cosmeticColorHex(l.cosmetics?.color)` overrides
    the archetype `tone` in `compose()`, so the LIVERY color becomes `hullMat`'s
    color AND `rig.baseColor` — the damage-scorch lerp reads FROM the custom base,
    verified to darken sensibly toward charcoal from any palette color (crimson
    72→`0xb23b3b`, 56→`0xa43637`, 21→`0x7f2b2b`).
  - **Pattern** rides a runtime canvas texture on a DEDICATED bodyMesh decal
    material (base color + pattern; plates keep the plain hull mat so it never
    tiles across every plate). Its `.color` is a WHITE-based scorch MULTIPLIER
    over the full-color map (`white.lerp(charcoal)` on the neutral branch, the
    state tints on hit/down/oiled/out), tinted alongside `bodyMat` each frame so
    the textured body still chars with damage.
  - **Car number** (the FUNCTIONAL element — tells cars apart on the board / in a
    race) is NOT on the body canvas: a single square canvas stretches to each box
    face's aspect (up to 3.8:1 on the flanks) and the canopy hides the top, both
    of which smear a number illegibly (verified failure). Instead it rides
    dedicated UPRIGHT, UNLIT decal quads (`makeNumberTexture`: a bright glyph on a
    high-contrast rounded plate, transparent elsewhere) on both flanks
    (left un-mirrored via `scale.x = -1`) + the tail, placed off the archetype
    anchors — browser-verified legible in the garage AND at race chase-cam
    distance. The quads ride the chassis group (cleared on rebuild); their
    material/texture + the pattern decal are returned as `cosmeticDisposables`
    the caller disposes on the next rebuild so a live swap never leaks.
    Deliberate tradeoff: the number quads are unlit (constant brightness) so they
    stay legible in the murky race night and do NOT scorch with damage — a
    racing number reads even on a battered car.
  - **Garage UI (`Garage.svelte`):** a LIVERY panel (color swatches incl. an "A"
    archetype-default, pattern picker, 0-99 number input clamped/validated) via a
    new `oncosmetic` callback, live-updating `GaragePreview` through
    `visualKeyFor` (now keyed on cosmetics) exactly like every other garage edit.
    `GreenlineRace` gains `setCosmetic` + `__greenline.setCosmetic`/`getLivery`
    for the console API + headless verification.
  - Verified in `/dev/greenline-portal` + `/dev/greenline-movement` (structural
    via `getLivery` + pure-function round-trips; visual via claude-in-chrome):
    color threads to the scorch base, pattern + number render in garage AND
    in-race with the number legible at chase-cam distance, two named slots hold
    two independent looks through the storage round-trip, and a pre-6b save with
    no cosmetics loads with the archetype default (no error). `svelte-check`
    clean.
- **Custom decal upload + teacher moderation (Phase 6c, migration `0051`).** A
  student uploads ONE free-form image (PNG/JPG, up to 1 MiB and 1024px;
  client checks in `src/lib/greenline/decals.ts`, size + mime ALSO enforced
  server-side by the bucket row) as a custom livery decal, gated behind
  teacher approval.
  - **Data model (`0051_greenline_decals.sql`, apply manually after 0050):**
    `greenline_decals` (PK `user_id`, one decal per user) holds `path` (the
    storage object), `status` (`pending | approved | needs_revision`),
    `reviewer_feedback`, and submitted/reviewed stamps. Students
    read/insert/update/delete their OWN row, and every student write is
    forced to `pending` (WITH CHECK) at ANY current status — deliberately
    unlike the FRC gate's no-resubmit-after-approval rule, because replacing
    an APPROVED decal's image must re-enter moderation (approve-once-then-
    swap-the-image would otherwise bypass the gate). The TEACHER decision is
    written ONLY by the `greenline_decal_review(p_user_id, p_action,
    p_feedback)` SECURITY DEFINER RPC (`is_teacher()` enforced inside;
    feedback text required for `needs_revision`); there is NO teacher-RLS
    row-update policy, per the cross-user staff-write convention. Approve or
    request-revision, never a blunt reject: a needs_revision decal stays
    visible to its owner with the feedback attached.
  - **Storage:** private bucket `greenline-decals` with `file_size_limit` +
    `allowed_mime_types` on the bucket row. Every upload goes to a FRESH
    random path in the user's own `<uid>/` folder and there is deliberately
    NO storage update policy (objects are immutable in place); moving the
    row's `path` is what forces it back to pending. Read policy: own folder
    OR `is_teacher()` OR an APPROVED row matching the object path (the table
    grants any signed-in user SELECT on approved rows, which is also what
    makes that policy's EXISTS subquery work under RLS).
  - **Visibility-gate finding:** NO current surface renders another player's
    vehicle or livery at all (the track leaderboard is name/archetype TEXT +
    times, races are vs AI, there is no replay/spectator), so the gate is
    enforced at the source: an unapproved image is unreadable by non-owners,
    while the uploader's own use (garage preview, own races) works
    immediately at any status via owner-read. Any future surface that shows
    another player's car inherits the gate for free.
  - **Rendering:** `Cosmetics.decal` (loadout.ts) stores the storage PATH,
    never image data (`normalizeCosmetics` drops data: URLs / whitespace /
    overlong strings), and rides the parts jsonb like every 6b field, so the
    loadout tables needed no migration. `rig-visual.ts` owns a module-level
    decal-image registry (`registerDecalImage(ref, url)` + cache +
    `decalImageState`): `/greenline` registers a signed URL, the dev harness
    a data: URL. `makeCosmeticTexture` composites the image
    (aspect-preserving contain, async repaint + `needsUpdate` on load,
    `crossOrigin='anonymous'` so the canvas never taints against real signed
    URLs) onto the SAME UV-mapped body canvas the 6b pattern uses —
    deliberately NOT the number's dedicated quads (a picture tolerates the
    per-face stretch; the glyph did not). A decal-only build (no pattern)
    now also gets the bodyDecalMat; the scorch-tint path is unchanged. The
    canvas doubles to 512 when a decal is present.
  - **Surfaces:** the Garage livery panel gains a Custom decal group
    (upload/replace/remove, status chip + teacher feedback, Show-on-car
    toggle riding the existing `oncosmetic`), all presentation-only props;
    `/greenline` wires it to the decals seam + registry, auto-equipping a
    fresh upload (fail-soft: control hidden pre-0051). `/dashboard` gains a
    GREENLINE Decal Reviews queue (`src/lib/greenline/DecalReviewQueue.svelte`,
    mirroring FrcReviewQueue; pending images signed server-side in
    `+page.server.ts`; apply-migration note pre-0051) whose both actions call
    the review RPC. `__greenline` gains `registerDecalImage`, and `getLivery`
    reports `customDecal` / `customDecalImage`.
  - **Verified** in `/dev/greenline-portal` (in-memory store driving the REAL
    `validateDecalFile`, Garage decal UI, and DecalReviewQueue: upload ->
    pending -> usable by the uploader immediately -> approve -> replace
    forces re-pending -> revision round-trip with feedback -> resubmit ->
    remove; wrong-format / oversized-bytes / oversized-dimensions each
    rejected with a clear reason) and `/dev/greenline-movement?glheadless=1`
    (decal-only, pattern+decal, and unequip via `getLivery`), plus a
    claude-in-chrome screenshot of the decal rendered on the hull in the
    garage preview. `svelte-check` clean, 0 errors.
- **Track schema v2: elevation, banking, trigger zones + real 3D track
  physics (Phase 8a).** The first non-flat collision geometry the track
  system has ever had, proven on a compact segment before 8b authors real
  content against it. All additive: every v1 track parses and behaves
  byte-identically.
  - **Schema (`track-schema.ts`, `schemaVersion: 1 | 2`):** `RibbonSurface`
    gains optional per-point `elevations` (world-unit centerline y) and
    `banking` (roll degrees about the direction of travel; POSITIVE raises
    the runtime's `leftEdge` side, the driver's right, so a right-hand turn
    banks with negative values), both the exact `widths` convention (parallel
    array, missing = flat). Gameplay `TrackData.zones` is a NEW top-level
    discriminated union deliberately separate from `props` (which stay
    presentation-only, never runtime-read): `boost` (radius circle;
    `strength` engine multiplier + `durationSec`) and `hazard` with a `kind`
    field that grows like the WeaponDef catalog (v2 ships `oil`, the
    deployed-slick traction cut as permanent track furniture). parseTrack
    validates all three (unknown hazard kinds fail loudly at load).
  - **Runtime (`track-runtime.ts`):** `buildRuntime` sweeps a real 3D cross-
    section (`leftEdge3`/`rightEdge3`, elevation + bank rotation about the
    tangent; the 2D `leftEdge`/`rightEdge` are now its exact x/z projection)
    and exposes `elevations`/`bankingRad`/`hasRelief`/`zones`. `surfaceYAt`
    is the local surface-height query (nearest-segment interpolation +
    bank-tilted lateral offset, clamped to the edge; warm-index convention,
    fast-path 0 on flat tracks); `zoneEntries` is the pure per-vehicle
    zone-occupancy/entry-edge check. `surfaceState` (the top-down
    on-ribbon/boundary question) is deliberately untouched.
  - **Physics (`GreenlineRace.svelte`):** a track with `hasRelief` gets a
    static `CANNON.Trimesh` built from the SAME `leftEdge3`/`rightEdge3`
    sweep the visual ribbon renders (one geometry, physics and visuals can
    never drift), triangles wound normals-UP because `world.rayTest` skips
    backfaces; the RaycastVehicle wheel rays follow slopes and banking
    natively (browser-measured: ride height ~0.85 constant up a 5 m climb,
    chassis roll upY ~0.951 = cos 18deg on the banked berm). The flat plane
    stays as the y-0 catch/run-off surface; flat tracks build NO trimesh
    (plane-only, pre-8a identical, verified). cannon-es has no Box-vs-Trimesh
    narrowphase, so the chassis never contacts the ribbon (wheels are the
    only ground interface): a flipped car on an elevated span falls THROUGH
    to the plane, which is handled, see fall recovery. Spawn/reset/teleport/
    flip re-seat heights all go through `seatY` = SPAWN_Y + `surfaceYAt`.
    IMPORTANT authoring constraint: the catch plane sits at y 0, so a banked
    section must build its berm UP (raise the centerline so the LOW edge
    stays at or above 0, e.g. by hw*sin(bank)) or the plane swallows the low
    half and flattens the bank (found live: wheels ray-hit whichever surface
    is higher).
  - **Fall recovery (the flip-watchdog pattern):** a chassis more than
    `fallRecoverDrop` (2.5 m, sized under relief-proof-01's 3.7 m berm wall)
    below the local surface for `fallRecoverDelaySec` (1.2 s) re-seats on the
    nearest centerline point, upright along the track, velocities zeroed,
    lap-tracker prev position synced so the teleport never crosses a gate.
    Deliberately Lakitu-style: it also recovers a car lingering on the ground
    BESIDE an elevated span (no drivable route back exists). Never fires on
    flat tracks (`hasRelief` gate).
  - **Zones in the harness:** per-rig occupancy arrays + a 1.5 s per-zone
    rearm window; boost = mass-scaled forward impulse (+5 m/s) plus a timed
    engineForce multiplier window (stacks with Nitro, same term), hazard oil
    = `combat.applyOiled` (resist-scaled like a real slick). Zone triggers
    are countdown-locked like weapons. Visuals: chevroned signature-green pad
    (rotated to travel direction) and a permanent violet-rimmed slick, both
    placed at `surfaceYAt` height with a gentle opacity pulse. Gate panes/
    posts and oil-stain decals also sit at local surface height now.
  - **Ribbon winding fix (latent since the first ribbon mesh):** the visual
    ribbon's triangles wound face-DOWN, so FrontSide culling hid the darker
    asphalt corridor + braking-zone wear ramps on every track (the "road"
    seen in all prior screenshots was the apron plane underneath); an
    elevated span would have been see-through. Rebuilt winding face-up as
    part of the elevation pass; Proving Ground 07 now shows its authored
    corridor for the first time, driving behavior untouched.
  - **Proof segment `tracks/relief-proof-01.json`** (schemaVersion 2,
    generated by a scratch script with built-in sanity checks: boundary
    orientation, grid-area flatness, min-edge-above-plane, grade limits): a
    306 m stadium loop; flat start straight with a boost pad and an oil patch
    on the corner entry, an 18-degree banked berm turn (berm built up so the
    low edge kisses y 0, outer wall 3.7 m), a climb to a 5 m elevated
    straight (~12% peak grade), and a descending turn home. Browser-verified
    end to end (headless `?glheadless=1&track=relief` + claude-in-chrome
    visuals): AI field laps it (~20-24 s laps), boost measurably kicks a
    coasting car 11.06 -> 15.79 m/s, the oil patch applies the slick state,
    driving off the 5 m edge falls ballistically to the catch plane and
    recovers to the centerline in 1.2 s, an elevated flip falls through and
    recovers on top, and Proving Ground 07 is structurally untouched (no
    trimesh body, surfaceY 0, zero zones, same spawn heights, normal racing).
  - **Harness/API:** `GreenlineRace` gains an optional `track` prop (a
    parseTrack result, read once at init; omitted = Proving Ground 07, so
    /greenline is unchanged); `/dev/greenline-movement?track=relief` mounts
    the proof segment (and the page now actually 404s in production — the
    guard load was missing). `__greenline` adds `surfaceY(x, z)` and
    `getZones(rigId)`; `raceState` rigs carry `y`; telemetry adds `falls` and
    `zone: { boost, hazard }`.
- **Ignition Credits economy + unlock gating + creative mode (Phase 7,
  migration `0052`).** "IC" is the GREENLINE-only currency (Ignition Credits),
  named in the spirit of IDEA Coin but fully separate from it — the no-coin-
  economy scope guardrail is untouched. `src/lib/greenline/economy.ts` is the
  pure client-side balance sheet (currency naming, price tiers, the 39-item
  unlockable catalog, `itemPrice`, `sanitizeLoadoutOwnership`, the award
  mirror); `0052_greenline_economy.sql` (apply manually after 0051) is the
  AUTHORITY — the SQL price list + award constants govern, the economy.ts
  copies are display-only, keep both in sync in the same change.
  - **Earning is server-side only, inside the result transaction.**
    `greenline_submit_race_result` was dropped + recreated (returns jsonb:
    id + award breakdown + balance): it computes placement pay (P1 120 /
    P2 90 / P3 70 / any finish 50) plus a personal-best bonus (+40 when this
    run's best lap beats the player's prior best ranked lap on the track; a
    first recorded lap counts) and credits `greenline_wallets` inline. There
    is deliberately NO standalone credit RPC. A light throttle zeroes the
    award (still logging the run) when another result landed within 30s — a
    real race takes minutes, so this only catches replayed submits. The
    client seam (`submitRaceResult` in persistence.ts) passes `p_creative`,
    parses the jsonb, and falls back to the legacy 7-arg call on a pre-0052
    backend — EXCEPT a creative run, which is never submitted through the
    legacy function (it would rank) and reads as an offline no-op instead.
  - **Creative mode** (`creative.svelte.ts`, localStorage
    `greenline_creative_mode`, OFF by default; toggled in the settings
    overlay's new GAMEPLAY section) bypasses unlock checks entirely, building
    AND racing. The flag is captured at race start and rides the submit;
    server-side it zeroes the award AND stores the row as mode `'creative'`,
    so the leaderboard RPC (mode = 'race') never ranks it — one flag, both
    consequences, one server-side branch. Turning creative OFF runs
    `sanitizeLoadoutOwnership` over the working build (a route `$effect`):
    unowned gear falls back to the starter kit and the gated build persists
    (the settings copy says so); named slots are untouched.
  - **Unlocks + pricing.** `greenline_wallets` (balance CHECK >= 0,
    lifetime_earned) + `greenline_unlocks` (`(user_id, item_id)` PK,
    price_paid audit trail): owner-SELECT only, definer-write only. Purchase
    is the `greenline_purchase_item` RPC, atomic by a wallet row lock
    (`SELECT ... FOR UPDATE`): concurrent double-submits serialize, the
    second returns `already_unlocked` uncharged; refusals are structured
    returns (already_unlocked / insufficient_funds / unknown_item), never
    exceptions. Tiers: starter kit FREE (stock parts, Autocannon, Nitro
    Boost, empty slots, ALL archetypes — the gate is on what's built within
    one, never the foundation choice — default livery, the car number
    (identification is never paywalled), and the decal, which stays
    moderation-gated not priced); bodywork parts flat 250 (all sidegrades by
    doctrine); weapons by mountCost 1/2/3 -> 300/600/1000; abilities by
    slotCost 1/2 -> 300/600; livery colors 100, patterns 150. Full catalog
    ~11.8k IC at 50-160 IC per race: first cosmetic in 1-2 races, first part
    in 3-4, a heavy weapon is a save-up goal.
  - **Garage UI:** presentation-only props (`wallet`, `unlocked`, `creative`,
    `onPurchase`, `purchasing`, `purchaseError`). A locked card renders as a
    non-selectable div showing "LOCKED · N IC" with a two-step
    UNLOCK -> CONFIRM action (accidental-spend guard; the server lock is the
    real double-submit guard); insufficient balance disables purchase with
    "need N more IC". Locked swatches/patterns carry a padlock/price and arm
    a confirm strip under their group. Header shows the IC balance chip, or
    "CREATIVE · ALL UNLOCKED". **Fail-soft rule:** `unlocked === undefined`
    hides the economy UI entirely and the route applies NO gating when 0052
    is unapplied/offline (`loadUnlocks().ready` false) — the pre-economy
    behavior, never lock-everything. `GreenlineResults` shows the payout
    strip (+N IC, placement/PB breakdown, wallet) or "CREATIVE RUN · no IC
    earned · not ranked".
  - **Verified** in `/dev/greenline-portal` (in-memory wallet/unlocks driving
    the REAL Garage lock UI, the REAL ownership effect + creative store, and
    the award mirror via `__glEconomy` + sim-finish dev buttons: lock display
    with correct tier prices, two-step purchase 800->500 IC, a concurrent
    double-fire charging once, already-owned repurchase free, insufficient
    blocked with reason, cosmetic confirm-strip flow, P1+PB=+160 / P2=+90 /
    P4=+50, a creative P1 earning 0 with the creative strip, the creative-off
    toggle stripping unowned gear, a day-one reset leaving the full starter
    build usable at 0 IC, and economy-off = zero gating) and
    `/dev/greenline-movement?glheadless=1` (race sim + livery unaffected).
    `svelte-check` clean, 0 errors.
- **Terminal Nine + route branching (Phase 8b).** The first full-scale
  circuit, and the first track with an alternate route. Both the schema
  additions and the runtime generalization are ADDITIVE: every pre-8b track
  builds exactly one path, one route, and identity checkpoint steps, so
  Proving Ground 07 and relief-proof-01 behave as they always did (verified,
  not assumed).
  - **Checkpoint groups (the lap-logic change).** `TrackGate` gains an
    optional `group`. Gates sharing a group id are ALTERNATIVES for one
    sequence position; members must be CONTIGUOUS in the `checkpoints` array
    (parseTrack rejects a reopened group). `buildRuntime` derives
    `checkpointSteps` (parallel to `checkpoints`) plus `stepCount` by walking
    the array and starting a new step whenever the group id changes.
    **`LapTracker.nextCheckpoint` now counts STEPS, not array indices** — the
    only semantic change — and `update()` matches on
    `rt.checkpointSteps[cpIndex] === this.nextCheckpoint` instead of an exact
    index, completing a lap at `stepCount`. Ungrouped tracks get
    `steps = [0,1,2,...]` and `stepCount === checkpoints.length`, which makes
    every comparison identical to the old one. **The
    take-one-alternative-only rule needs no extra guard:** the step counter
    only moves forward, so a sibling gate crossed afterwards maps to an
    already-passed step and falls into the existing out-of-order branch.
    `takenByStep[]` records WHICH alternative was credited (cleared at every
    lap boundary), and the `checkpoint` event carries both `index` (the gate)
    and `step` (the position it satisfied).
  - **Multi-path ribbons.** `RibbonSurface.branches` holds OPEN `RibbonBranch`
    spurs (own width/widths/elevations/banking, plus `joinStart`/`joinEnd`
    main-centerline indices). `buildRuntime` builds `paths[]` — `[0]` is the
    main line and **the existing top-level runtime fields are aliases of
    `paths[0]`**, which is what keeps every old consumer working. A branch is
    REAL road: its own swept visual mesh, its own physics Trimesh, and
    `surfaceState` reports on-ribbon on it. `surfaceState`/`surfaceYAt` gained
    an optional `warmPath` and return the nearest `path`; rigs carry
    `warmPath` alongside `warmIdx` so the warm-started search resumes on the
    path the car is actually on. Non-warm paths are bbox-culled, so a car on
    the far side of the circuit never pays for the branch scan.
  - **AI routes.** `buildRuntime` also splices `routes[]` — complete closed
    lap polylines, `[0]` pure main and one per branch. `AiDriver` follows a
    ROUTE rather than the centerline, so branch-following needed no
    path-handoff logic in the driver, only different points. On a
    single-route track the driver still uses the caller's `warmIdx` on the
    unchanged code path; only branched tracks use its own internal warm
    index. `chooseRoute(aggression)` runs once per lap (bolder drivers gamble
    on the shortcut more often); real route tactics are Phase 9.
  - **The track** (`tracks/terminal-nine.json`, generated by a scratch script
    with built-in sanity checks, committed as data): **2498 m** main lap,
    **2390 m** via the shortcut, 625 centerline points at 4 m. A 380 m
    dispatch straight widened to 26-29 m for the 12-car grid, a 5% climb onto
    a 13.5 m container gantry deck, a kicker to 16.5 m and a cliff off the
    deck edge (**measured 1.29 s airtime, 4.2 m clearance** at 52 m/s), the
    10.5 m rail-yard chokepoint between container rows (the weapon corridor,
    per Proving Ground 07's doctrine), a 17-degree banked salt-bin sweeper,
    and the fuel-depot split. 8 checkpoints (two of them the grouped pair),
    7 zones, 52 props.
  - **The shortcut** (`loading-dock`): 332 m against 440 m of main line, so
    108 m shorter, but 9.5 m wide pinching to 7.7 m against the main line's
    18 m, with two oil hazards on it. The routes run 80 m apart at their
    widest and the gap between them is filled by a `depot-block` boundary
    island (the existing inner-loop convention), so there is no cut across —
    verified by sampling the whole gap, every point blocked.
  - **Boost pads reward committed lines, not just power:** the climb-apex pad
    sits 5.5 m off-centre on the inside kerb and is verifiably MISSED on a
    centerline run and collected on the committed line; others sit on the
    kicker run-in and high on the banking. One pad on the main-line detour is
    deliberate compensation for going the long way.
  - **Two authoring rules learned here, both now enforced by the generator's
    own checks:**
    1. **Run-off margin must shrink where the track is raised.** The 9 m
       boundary offset that is correct on a flat yard is thin air beside a
       13.5 m deck: cars dropped off the edge and fall-recovered before the
       soft wall ever engaged (measured 55 recoveries in one 12-car race;
       1.6 m margin on the deck cut it to ~18).
    2. **No ungrouped checkpoint may sit inside the stretch a branch
       bypasses.** This shipped once (cp5 at s=1740, inside the 1600-2040
       bypass): every shortcut car drove the branch perfectly and then had
       its dock gate rejected, so no shortcut lap could ever complete. The
       check that catches it was verified by reintroducing the bug.
  - **Verified** in `/dev/greenline-movement?track=terminal-nine` plus 31
    direct assertions against the compiled runtime (`LapTracker` group
    behavior: laps via each route, both alternatives crossed, neither taken,
    partial-then-clean recovery, mixed routes across consecutive laps, and
    ungrouped regressions for both existing tracks). In-game: a forced 6/6
    route split produced **6 route-0 crossings crediting the main gate and 6
    route-1 crossings crediting the dock gate**, 11 of 12 cars completing
    laps; branch driving traced end to end (main -> path 1 for all 84 points
    at full pace -> rejoin); banking measured at upY 0.956 = cos 17deg;
    6 of 7 zones firing on a centerline run with the 7th collected on its
    committed line; all four 8c weather presets applying and reverting on
    this track (its first test on a track other than the one they were built
    against). Regression: Proving Ground 07 reads 1 path / 1 route /
    identity steps / 5 physics bodies / surfaceY 0 with all 4 cars lapping
    and 0 falls; relief-proof-01 reads 1 path / 1 route / 6 bodies / 5 m max
    elevation / 18deg bank with 21-29 s laps, matching its documented
    behavior. `svelte-check` clean, 0 errors.
- **Air Correction, the sixth ability + airborne detection (Phase 8d).** One
  more entry on the mature `ABILITIES` catalog, plus the first airborne-state
  primitive the project has had.
  - **Airborne detection.** A vehicle is airborne when ALL FOUR wheels are
    clear of the ground, held for `AIRBORNE_MIN_SEC` (0.12 s). Zero contacts
    rather than a majority means a kerb strike, a crest, or one wheel
    unloading over a bump can never read as flight; the short dwell filters
    single-frame ray misses on rough ground. Against Terminal Nine's ~1.29 s
    deck jump that dwell is ~9% of a real jump but longer than any bump
    survives. Per-rig state: `wheelContacts`, `airborneSec`, `groundedSec`.
  - **CANNON-ES TRAP (measured, cost a debugging pass):** `wheelInfo.isInContact`
    is NOT readable from game code. `updateWheelTransformWorld` sets it FALSE
    on entry, and the per-frame `vehicle.updateWheelTransform(i)` call that
    syncs the wheel MESHES runs after the step — so by the time anything looks,
    all four wheels read false even for a car sitting still on the ground
    (verified: 4 wheels "not in contact" at a steady 55 m/s). Use
    `vehicle.numWheelsOnGround`, which `updateFriction` recomputes each step
    from `raycastResult.body` and nothing clobbers afterwards. Sibling of the
    static-AABB raycast trap already documented in the movement prototype.
  - **The ability.** `AbilityCategory` gains a 6th value `aircontrol` and
    `AirControlParams` (`rollTorque` 260 N*m, `pitchTorque` 900 N*m,
    `durationSec` 3). Unlike Jump's one-shot impulse this is ONGOING control:
    every frame the window is open AND the vehicle is airborne, the driver's
    own steer input torques about the chassis FORWARD axis (roll) and
    throttle/brake about the RIGHT axis (pitch). The two torques are
    deliberately asymmetric because the chassis roll inertia (~53 kg*m^2) is
    far below pitch (~226), so equal torques would feel nothing alike. No new
    bindings: it reads the same control values the grounded car uses.
  - **Ends on landing, not on the timer.** `durationSec` is only a CEILING;
    the harness calls `endAirControl()` once the wheels have been down for
    `GROUNDED_END_SEC` (0.06 s). The dwell is deliberately tiny — the
    requirement is not lingering, and 60 ms is imperceptible — but it stops a
    single-frame wheel graze mid-flight from cancelling the ability outright.
    Leaving the window open on the ground would also be a hidden way to torque
    a grounded car.
  - **Triggering grounded is a costless no-op** (`reason: 'not-airborne'`),
    exactly the Emergency Flip / Homing Rocket no-lock rule: nothing spent, one
    line of feedback.
  - **No special-casing anywhere else:** slotCost 1 / meterCost 0.3 flow
    through the existing ability-capacity budget, the HUD ability cell, the
    Phase 7 economy (auto-priced 300 IC from slotCost), and the garage picker
    unchanged. AI: `wantsAirControl(isAirborne)` — the harness owns the
    airborne flag and the meter gate, so the heuristic is just "am I flying".
    The velocity AI fit is now nitro + air-correction.
  - **Verified** in `/dev/greenline-movement?track=terminal-nine` off the real
    deck jump: grounded activation fired false, spent 0 meter, opened no
    window; airborne activation with counter-steer arrested and reversed the
    roll, landing at **upY 0.966 (near level) against a 0.448 baseline** on the
    identical jump, with the opposite steer amplifying it to 75.7deg — i.e. the
    torque genuinely tracks player input rather than being a fixed nudge; the
    window closed **177 ms after touchdown** having held 1.72 s of its 3 s cap,
    so landing ended it, not the timer; and an 8-car AI race logged **17 Air
    Correction activations**. `svelte-check` clean, 0 errors.
  - **Observation, pre-existing and NOT changed here:** the drift meter charges
    from lateral speed without checking ground contact, so a vehicle in flight
    banks meter. It barely matters for this ability (one activation covers a
    whole jump) but it is worth knowing before any future airborne-charged
    mechanic.

- **Weather presets, speed retune, larger grid (Phase 8c).** Three tuning
  changes on existing registries; no new system.
  - **Weather is atmosphere, never time of day.** `ENV_PRESETS`
    (`environment.ts`) grows from one preset to four, ALL of them night
    presets: `night` (the untouched key-art clear night), `fog`, `rain`,
    `storm`. The floodlit rig-yard night is locked brand identity
    (KeyArtScene, "1A / IMPACT"), so a dusk/daylight preset that would compete
    with it is deliberately absent — weather varies fog depth, precipitation,
    and how far the floods throw, not the hour. `EnvironmentPreset` gained
    `label`/`note` (the selector copy) plus optional `precip` (count, speed,
    color, opacity, streak length) and `lightning` (gap range, intensity).
    Thick air makes a beam READ brighter, so `floodIntensity` goes ABOVE 1 for
    fog (1.45) and storm (1.3).
  - **Applied LIVE, not at mount.** `weather.svelte.ts` is the reactive
    localStorage store (the `creative.svelte.ts` / audio-settings pattern);
    `GreenlineRace` holds an `applyEnvironment(env)` hook assigned in onMount
    (the `applyPlayerLoadout` convention) that re-points `ENV` and pushes the
    preset into scene.background, the FogExp2, the hemisphere light, the
    rebuilt key directionals, the repainted sky canvas, and the flood
    materials. Flood materials are rescaled from a REGISTERED BASE value
    (`floodScalables`), never multiplied in place, so repeated swaps never
    compound. Rain is ONE `LineSegments` draw call: a camera-following box of
    streaks that wraps toroidally, allocated once at the largest preset's
    count with `setDrawRange` shrinking it for lighter presets, so switching
    weather never reallocates mid-race. Storm lightning is one directional
    light pulsed on a double-strobe decay.
  - **Weather NEVER touches gameplay** — no grip, drag, damage, AI target, or
    timing value. A stormy lap is the same lap as a clear one and still ranks.
    Selector lives in the settings overlay's WEATHER section; the choice
    persists across a reload.
  - **Top speed retuned ~1.7x: engine 2300 -> 2900, drag 1.8 -> 0.68.** Top
    speed is DERIVED (`v = sqrt(engineForce / aeroDrag)`), so the ~1.7x
    ceiling took a ~4.5x lift in the RATIO, not in either number. The lift is
    mostly on the DRAG side, which is how real top-speed cars get there
    (drag-limited, not power-limited) and keeps launch feel near what was
    already tuned (standing accel 12.8 -> 16.1 m/s^2, not 4x).
    **`chassisMass` is deliberately UNCHANGED at 180:** terminal speed is
    mass-independent here (drag is a force), so mass buys nothing for the
    goal, while moving it would silently re-tune the jump impulse, ram
    knockback, and tether pull all measured against 180 kg. `GARAGE_BASELINE`
    is kept in lock-step. Knock-on, intended: lifting off no longer scrubs
    speed the way 1.8 drag did, so coasting stays fast and the brake pedal
    matters.
  - **Camera scales with speed** (`camSpeedRef` 60, `camDistanceGain` 4.5,
    `camHeightGain` 1): linear in speed, clamped, so a stock car reaches full
    pull-back at its own top end. The gain is modest because the camera was
    never as fixed as it looked — the `camStiffness` lerp chases a moving
    target and settles a further ~v/camStiffness behind it (~12 m at 60 m/s).
    Measured effective distance ~16 m at the OLD 35 m/s ceiling -> ~26 m at
    the new one.
  - **Grid cap 6 -> 11 AI (12 cars), one `MAX_AI` constant** replacing both
    hardcoded `Math.min(6, ...)` sites. NOT 16: measured mean frame CPU rose
    1.82 ms (4 cars) -> 3.32 ms (12 cars), sub-linear at ~0.19 ms per extra
    vehicle, but that is a DEV machine, not the 6-8 year old school desktops
    the project targets. 16 stays a stretch goal contingent on a cheaper rig
    (instanced bodywork / shared hull), not a default — raise `MAX_AI` only
    behind the same measurement.
  - **Debug/instrumentation added:** `__greenline.setWeather` / `getWeather`
    (drives the REAL store, so a scripted drive exercises the settings path
    end to end), `camInfo`, `setAiCount` / `maxAi`, and `perf` / `perfReset`
    (rolling mean/median/p95/worst frame CPU ms, budget %, draw calls,
    triangles). `perf` measures MAIN-THREAD cost only; GPU work is async and
    excluded.
  - **Verified** in `/dev/greenline-movement?glheadless=1` (rAF is frozen in
    an automated tab, so frame cost is measured by the in-loop `perf` counter,
    not rAF deltas): all four presets apply and revert with no compounding,
    storm lightning fires at its configured intensity, weather survives a
    reload; a seamless treadmill dyno (pure position translation preserving y,
    orientation, and velocity — teleport-based resets unloaded the suspension
    and corrupted the runs) measured neutral 62.7 m/s (140 mph) and a VELOCITY
    build with the slipstream part 83.4 m/s (186.6 mph), both ~98% of the
    predicted terminal, validating the model that puts a drafting VELOCITY
    build at 200+; an 85 m/s (190 mph) perpendicular wall impact decelerated
    smoothly, stayed upright, and produced no NaN and no tunneling; a full
    12-car race ran ~8000 frames with every weapon class firing, 7 rams, 1
    recovered flip, 0 falls, all 12 upright and finite. Visual confirmation of
    the four presets and the settings selector via claude-in-chrome (WebGL
    screenshots hang the preview pane).
- **Track selection, pause menu, feedback, telemetry, creative default
  (Phase 8e + 8f).** Five changes that make what already exists usable and
  measurable during active playtesting.
  - **Track catalog + selector.** `src/lib/greenline/tracks.ts` is the ONE
    list of races (the curriculum.ts convention: plain data, lazy `parseTrack`
    cached per id, unknown ids fall back to the default rather than throwing).
    Adding a track is one import plus one entry; nothing else hardcodes a
    track. `track-selection.svelte.ts` is the reactive localStorage store (the
    creative/weather pattern) holding the choice. **Deliberately NOT part of
    the loadout:** a track is where you race, not what you race, so it must
    never ride the build slots (loading a saved build would otherwise silently
    move you to another circuit) and it needs no migration. **The picker lives
    in the GARAGE**, above the build, since that is where every other pre-race
    choice already is; `Garage.svelte` takes `tracks`/`trackId`/`ontrack`
    (presentation only, the Minimap convention) and hides the section when
    given fewer than two. All three tracks are selectable, with
    `relief-proof-01` LABELLED `TEST` rather than hidden — a player who picks
    the physics proof segment should know that is what they chose. **Tracks
    are never economy-gated:** the whole field races the same circuit, so
    paywalling one would fragment the leaderboards instead of giving anyone
    something to earn. The route captures `raceTrackId` at race start (the
    `raceCreative` convention) so the result, the award, the board read, and
    the telemetry all agree on which track was raced.
  - **In-race pause menu, and the game clock it required.** THE CLOCK WAS THE
    WHOLE PROBLEM, and this is the part to understand before touching it:
    every time-based thing in `GreenlineRace` (lap timing, weapon and ability
    cooldowns, boost windows, revive channels, the start countdown, FX
    lifetimes) is an absolute `performance.now()` stamp, so merely skipping
    the sim would leave real time running underneath and, on resume, the
    current lap would gain the paused duration while every cooldown in flight
    silently expired. So the sim now runs on its OWN clock: `gameNow()` is
    real time minus time spent paused, and it is genuinely FROZEN while paused
    rather than offset. Every sim-side clock read goes through it; only the
    frame-cost instrumentation and the headless pump's throttle still read the
    real clock (they measure wall time, and a pause must not distort them).
    The world is never stepped while paused, so nothing drifts or settles
    behind the menu, and held keys are cleared on pause so a throttle held as
    the menu opens cannot stick with no keyup ever arriving. Escape is
    deliberately NOT rebindable (it is the universal modal key, as in
    GreenlineSettings) and steps back one layer per press: feedback box →
    pause menu → race. `onQuit` / `onFeedback` are OPTIONAL props — the dev
    harness has no screen to quit to, and the parent owns the feedback UI.
  - **`inputBlocked`, a real fix and not belt-and-braces.** Both
    `GreenlineRace` and any host overlay listen on `window`, and the race's
    listener is registered FIRST (it mounted first), so `stopPropagation` in
    the overlay cannot help — the race sees the key regardless. Found in the
    browser: a real Escape press from the feedback textarea closed the box AND
    unpaused, skipping a step and throwing the player back on track
    mid-sentence. The host now passes `inputBlocked` while any modal is open
    (the `GreenlineTitle` `enableShortcut` convention), and the race's
    typing guard was widened from input/select to include TEXTAREA and
    contenteditable. Note the near-miss: dispatching the same Escape from a
    `div` passed, and only targeting the genuinely focused textarea exposed
    it — test the real input path, not a convenient one.
  - **Shared feedback box** — see the section below. GREENLINE wires it on all
    four screens (title, garage, race via the pause menu, results).
  - **Telemetry MVP (`0054`), extending the EXISTING result path.**
    `greenline_submit_race_result` already owns the trusted write (server
    stamped attribution, award math, the creative branch), so the new fields
    ride it as extra columns and extra DEFAULTED parameters: there is no
    second "log telemetry" RPC to keep in sync, and no way to log a run that
    did not also go through the award/ranking rules. Added: both weapon slots,
    both ability slots, an EXPLICIT `creative` boolean (it was previously only
    inferable from `mode = 'creative'`), and `route`. Empty equipment slots
    normalize to NULL, so "no secondary weapon" reads as absence rather than a
    weapon named 'none'. The old 8-arg signature is DROPPED, not left in place:
    with defaulted parameters an 8-arg call would be ambiguous between the two
    overloads and PostgREST would refuse it. `submitRaceResult` now falls back
    through THREE backend generations (0054 → 0052 → 0049), stepping down only
    on a missing-function error so a real error is never masked as a version
    mismatch; a CREATIVE run still refuses the 0049 shape entirely rather than
    rank an unlocked-everything run. **Route is coarse ON PURPOSE and says so
    in its own doc comment:** it records the last alternate branch the vehicle
    was on at any point, not a per-lap series, which answers "did this driver
    use the shortcut" — the design question Terminal Nine's split actually
    poses. It is derived from the `warmPath` the surface query already
    maintains, so it costs one comparison per frame and nothing in the sim
    reads it back. MVP scope deliberately; `gauntlet_run_events` is the model
    if a full event stream is ever wanted.
  - **Creative mode now defaults ON.** A DEFAULT change and nothing more: the
    wallet, price list, unlock ledger, purchase RPC, and every bit of the
    garage's lock UI are fully intact, and turning creative off in settings
    restores the complete Phase 7 economy (re-gating the build to what is
    actually owned on the way out). During active playtesting the point is
    getting the whole catalog in front of testers immediately; making them
    grind first would only measure the grind. `DEFAULT_CREATIVE` in
    `creative.svelte.ts` is the one line to flip back. The stored value is
    read as an explicit '1'/'0' rather than a presence check, so a tester who
    already turned it OFF keeps it off across the change.
  - **Migrations `0053_app_feedback.sql` and
    `0054_greenline_race_telemetry.sql` must be applied manually**, in order,
    after 0052. Both fail soft unapplied (feedback surfaces the error in
    place; the result submit drops to the older RPC shape).
  - **Verified** in `/dev/greenline-portal` and
    `/dev/greenline-movement`: all three tracks render in the picker with the
    TEST tag on the proof segment, selecting one persists to localStorage and
    the REAL sim mounts on it (Terminal Nine loaded with `paths 2 / routes 2 /
    branches [loading-dock]`); the pause menu froze physics (position
    identical across 4 real seconds) and, decisively, the lap clock read
    0:35.63 before the pause and 0:35.63 after it, advancing only 0.30s on
    resume instead of gaining 4.2s, with `pausedAccumMs` 4201 and `gameNow`
    stable while held; RESTART ROUND reset timing/route and closed the menu;
    Escape stepped feedback → pause → race one layer per press after the
    `inputBlocked` fix (and reproduced the bug before it); typing driving keys
    into the feedback textarea moved nothing; feedback submitted mid-race
    carried `context: 'race'`; QUIT TO GARAGE unmounted the race cleanly (no
    `__greenline` leak); a full AI-driven race finished P1 with `route main`
    on the single-route track and flowed to results; the route field flipped
    to `loading-dock` on the branch and correctly STAYED there after
    rejoining the main line; the telemetry payload built the exact 13
    parameters and the 3-tier fallback stepped 13 → 8 → 7 with the creative
    run stopping short of the legacy call; and creative read ON with no stored
    preference while an explicit OFF persisted as '0'. `svelte-check` clean, 0
    errors. NOTE for future harness work: the portal harness does NOT pump
    rAF in an automated tab — append `?glheadless=1` (it is read from the URL,
    so it works on any route, not just the movement harness) or the sim
    silently never ticks and every physics assertion passes vacuously.

- **EMP / Oil Slick / Grappling Hook are equipment now (Phase 8g), so the
  roster is 13 weapons.** The three formerly always-on fixed tools were folded
  into the equippable `WeaponDef` catalog; a build must MOUNT one to use it at
  all, and every vehicle without it genuinely cannot (browser-verified: the
  default autocannon build returns false from all three fire paths). **Ram is
  the ONE tool that stays fixed and universal** — it is a consequence of a
  nose-first collision, not a mounted system, so it has no card, cost, socket,
  or category, and `WeaponId` shrank to the single member `'ram'` (its
  per-vehicle anti-machine-gun cooldown is the only reason that keyed record
  still exists). New in `combat.ts`: two categories `disruption` (the EMP —
  kinetic-shaped but ALSO applies the disruption state + spin kick, which is
  why it is not just a kinetic entry) and `tether` (the hook), plus the Oil
  Slick as an `area`-category def carrying an `oil` block instead of an `area`
  one (the shield/jammer distinguished-by-which-block convention; a new
  category was unnecessary). The three fire functions (`tryFire`,
  `tryDeployOil`, `tryTether`) are now slot-gated `(shooter, slot, def, ...,
  opts)` calls exactly like every other weapon, reading their numbers off the
  def and scaling through `WeaponFireOpts` (damage × damageDealt, cooldown ×
  weaponCooldown, and a new `rangeScale` × empRange for the EMP's reach).
  Every landed value is VERBATIM the old `COMBAT_DEFAULTS` number, so an
  equipped one behaves identically (verified: neutral EMP total 35, SYSTEMS
  EMP 39 = 35×1.1, hook 12). **What stayed in `CombatTuning`** (the shared vs.
  weapon-owned rule, load-bearing): `oilSlipSec` / `oilTractionCut` (a track
  `hazard: oil` zone applies the same state through `applyOiled`, so the
  duration/traction cannot live on a weapon nobody equipped) and the disrupt
  engine/steer cuts + spinKick (what disruption DOES, whatever caused it); the
  EMP/oil/tether ranges, cones, cooldowns, and slick/tether geometry moved onto
  their defs. `OilSlick` and `ActiveTether` gained a `weaponId` so the harness
  resolves radius / force / slack / break off the def (the `CaltropField`
  convention). **Mount costs landed: EMP 2, Oil 1, Hook 2** — utility/control
  tools priced under the flashy heavy hitters (rationale in each def's comment;
  the spec left costs to judgment). Consequences worth knowing: Oil is rear-only
  and so shares a socket family with Caltrops (the two can never co-exist on one
  build); the Hook prefers roof, so on the two-socket VELOCITY dart it contests
  the one nose point with a nose weapon. **Controls: the dedicated F/E/Q (and
  the pad RB/X/LB) actions are RETIRED** — `ControlAction` dropped
  `'fire'/'oil'/'tether'`, so those fire through the two weapon-slot actions
  now and the settings remap UI no longer lists them (a genuine muscle-memory
  change, verified absent from the CONTROLS section). The HUD's four fixed
  tool cells collapsed to one: RAM. AI needed real re-fitting — `AI_WEAPONS`
  grew to eight fits (two archetype passes) covering all 13 weapons, the
  default 3-AI field deliberately showcasing the new three (armor emp+turret,
  velocity oil+shotgun, handling hook+caltrops); the dead `wantsFire` /
  `wantsOil` / `wantsTether` methods were removed and `wantsWeaponFire` /
  `wantsAreaDrop` widened to read the disruption/tether/oil param blocks, so
  the one equipped-weapon decision loop chooses among all 13. Garage COMBAT
  tab and economy (colors auto-priced off mountCost) needed ZERO wiring — both
  iterate the catalog. **Migration `0055_greenline_phase8g_weapon_prices.sql`
  (apply after 0054):** teaches the server `greenline_item_price` the three new
  prices (EMP 600, Oil 300, Hook 600); the client mirror auto-prices them via
  `weaponById` + `WEAPON_PRICE_BY_MOUNT_COST` with no code change. Only
  reachable when creative mode is off. Verified end to end in
  `/dev/greenline-movement?glheadless=1` (equip → fire → damage/slick/latch,
  the not-equipped refusal, an 8-fit field, a full 9-car race with every
  class firing, 0 flips, no console errors) and `/dev/greenline-portal`
  (all 13 in COMBAT, F/E/Q gone from the remap UI). `svelte-check` clean, 0
  new errors.

- **Garage reorganization (Phase 8h): real side-by-side + four tabs.** The
  garage had accumulated across eight phases into one long vertical scroll
  (a narrow `minmax(19rem, 24rem)` preview inset beside archetype cards, with
  livery, weapons, abilities, bodywork, stats, and slots stacked below it).
  This pass is an ORGANIZING change only: every picker, budget rule, block
  reason, socket constraint, and purchase action is the SAME markup and the
  SAME callbacks, moved.
  - **Layout.** `.gg-panel` is now a fixed-height flex column
    (`min(94vh, 58rem)`) rather than a `max-height` box that scrolled as one
    page — a definite height is what lets the body divide it. `.gg-body` is a
    two-column grid: LEFT is the vehicle (`GaragePreview` growing to fill) plus
    the resolved-build readout; RIGHT is the tab bar and one tab panel. The
    preview measures 430px wide at a 1280 viewport and 638px at 1600 (against
    304-384px before), via a `min-width: 1500px` bump that only spends
    genuinely spare room — the preview is capped below that so it can never
    starve the pickers into scrolling.
  - **Four tabs** (`GarageTab`): BUILD (archetype + the four bodywork slots),
    COMBAT (both weapon slots with their socket pickers + both ability slots),
    LIVERY (color / pattern / number / decal), GARAGE (the five named build
    slots + the track selector, moved here from "above the build" where 8e/8f
    left it — saved builds and track are both "what am I taking out", as
    against building the vehicle). A tab renders only when the host passed it
    something (`availableTabs`), and `activeTab` falls back if the selected one
    stops existing. **Settings deliberately stays its own overlay, not a fifth
    tab:** it is app-wide preference (audio, controls, weather), not
    vehicle-building.
  - **Locked items stay CONTEXTUAL**, per the phase brief: a locked weapon
    shows in COMBAT with its price and two-step UNLOCK -> CONFIRM inline, a
    locked color in LIVERY with its purchase strip. There is deliberately no
    separate shop tab divorced from where the equivalent owned item lives.
  - **The stats readout moved OUT of the flow and under the preview**, where it
    is visible from every tab: it is the readout for whatever the tabs are
    editing, and it was previously buried below a screen of controls. Its
    explanatory paragraph is hidden in that column (it earns its space once,
    then becomes noise) and the hero tiles are pinned to a 2x2, since auto-fit
    landed on three across and orphaned the fourth.
  - **Density, and the one real information tradeoff.** To fit COMBAT's ~11
    weapons x 2 slots plus 7 abilities x 2 without scrolling, part rows in a
    tab are dense: name and chips share a line, and the BLURB is hidden,
    reachable as a `title` tooltip and shown inline for the EQUIPPED item only.
    Every chip that changes a decision (cost, cooldown, block reason, lock
    price) stays visible always. A LOCKED row additionally drops its secondary
    stat chip (cooldown / meter cost), since what it costs to BUY outranks how
    it behaves when you cannot use it yet. Picker grids are column-COUNT driven
    (`repeat(4, ...)`, `repeat(2, ...)`) rather than `auto-fit`, which silently
    collapsed to one or two columns in the narrower right pane and was the
    single biggest cause of the overflow.
  - **Scroll behavior, measured rather than asserted.** At a 1280x720 viewport
    all four tabs fit with ZERO overflow in the shipped default (creative mode
    on, everything unlocked). With the FULL economy locked — every weapon,
    ability, and part carrying a price chip and a buy button — COMBAT is the
    one tab that still scrolls below roughly a 950px viewport height (131px
    over at 720, 20px at 900, 0 at 950); the other three fit everywhere. That
    is inherent: ~28 locked rows each carry two affordances an owned row does
    not. A `max-height: 820px` block reclaims chrome (tab hint line, panel
    padding) rather than content, and below 1000px width the columns stack and
    the panel scrolls as one, which is the honest fallback.
  - **Verified** in `/dev/greenline-portal` by driving the REAL component, each
    interaction checked rather than assumed: mount-capacity pips updating
    (1/5 -> 3/5), over-budget blocking with its reason ("over budget — needs 3,
    2 free"), no-duplicate blocking ("already equipped as primary"), the
    inverted ability budget refusing every candidate at 2/2, socket
    compatibility + mutual conflict (NOSE disabled in the secondary as "held by
    the primary weapon" and vice versa) and a socket MOVE persisting
    (nose -> roof); the purchase flow end to end (unaffordable item renders with
    no UNLOCK button and "need 200 more IC", affordable one goes
    UNLOCK -> CONFIRM -> 800 -> 500 IC -> div becomes button -> equips, capacity
    and socket updating); all five save slots (save with a name, LOAD restoring
    archetype AND weapon across an archetype change, two-step delete back to
    empty); the track selector still driving a real race from its new tab
    (selected Terminal Nine -> `trackInfo()` reports terminal-nine with its
    branch); and the decal flow in LIVERY (real upload through
    `validateDecalFile` -> PENDING REVIEW chip + thumbnail + actions, then a
    teacher revision -> REVISION REQUESTED + feedback + "Upload new image").
    Visual confirmation of all four tabs via claude-in-chrome (WebGL hangs
    preview-pane screenshots). `svelte-check` clean, 0 errors.

- **Drift-feel rework + camera system + Terminal Nine default (Phase 9a).**
  Three changes: the cold-start track, the handbrake drift model, and a real
  camera-view system. All in `GreenlineRace.svelte` unless noted.
  - **Terminal Nine is the default track.** `DEFAULT_TRACK_ID` in `tracks.ts`
    (which seeds the `track-selection` store the `/greenline` route reads) is
    now `terminal-nine`; a fresh session with no stored selection loads the
    flagship circuit, not Proving Ground 07 (which stays selectable). The dev
    movement harness's own no-`?track` fallback (GreenlineRace line ~480,
    hardcoded proving-ground) is unrelated and unchanged — the "fresh session"
    default is the store.
  - **Handbrake drift is gradual, not an instant binary cut.** The old model
    cut REAR grip instantly to 0.65 the frame the key went down and restored it
    the frame it came up — a sharp snap sideways and an equally sharp hook-back.
    Grip now fades in/out over a per-rig `Rig.hbEngage` scalar (0..1) that eases
    toward the held state via two rates: `handbrakeEngageRate` 9 (~360ms in,
    faster — the tail breaks with intent) and `handbrakeReleaseRate` 4.5 (~480ms
    out, slower — grip returns gently so exiting a drift settles the car instead
    of snapping straight). The rear-axle grip fraction (`handbrakeGrip`) was
    DEEPENED 0.65 -> 0.4: lower rear friction both steps the tail out further AND
    scrubs less forward momentum (a low-grip locked wheel slides rather than
    braking hard), so the car CARRIES the slide instead of stopping dead. The
    rear lock brake (handbrakeForce, unchanged 50) also ramps by `hbEngage`
    (`max(brake, hb*e)` so it never reduces regular braking). `hbEngage` is
    added to the Rig interface / makeRig init / resetRound clear.
    - **Front wheels stay at FULL grip (the reconsidered front-wheel
      behaviour).** `handbrakeFrontGrip` exists as a tunable but is set to 1.0.
      A front cut was tried (0.82) and MEASURED to be wrong: with the nose
      unable to bite, a high-speed handbrake produced ZERO lateral slip — the
      car just understeers/plows straight while decelerating. A handbrake drift
      needs the front to grip and rotate the car while the LOCKED rear steps
      out, so the front stays planted and the rear alone slides. The field is
      kept (not the front multiply dropped) so the choice is explicit/tunable.
    - **Drift-meter thresholds RE-MEASURED, unchanged.** Phase 5a's
      `DRIFT_MIN_LATERAL` 0.6 / `DRIFT_FULL_LATERAL` 3.0 / `METER_CHARGE_PER_SEC`
      2.2 (abilities.ts) were measured against the OLD feel; re-measured against
      the new feel they still hold and were left as-is. Reasoning + measurement:
      the rework touches ONLY handbrake grip, never clean-cornering grip, so the
      straight (~0 lateral) and clean-corner (~1.8 lateral) regimes the
      thresholds were tuned to are identical; a committed handbrake slide still
      spikes to ~3.0-3.46 lateral (reaches/exceeds DRIFT_FULL_LATERAL), and the
      `driftIntensity` handbrake floor (0.5 above 4 m/s) still guarantees charge.
      A clean donut filled the meter 0.5 -> 0.836 in ~0.3s. No abilities.ts change.
  - **Camera system: three views, mouse free-look, look-back.** The Phase 8c
    speed-scaled pull-back + smoothing lerp is UNCHANGED and still governs the
    follow; the new pieces layer on top and never change the follow
    distance/smoothing.
    - **Three cyclable views** (`CAMERA_VIEWS`, cycle order Close -> Standard ->
      Far, default Standard): distance/height multipliers over the tuned follow
      (Close 0.68/0.82, Standard 1/1, Far 1.5/1.35). Measured settled distances
      ~6.3 / ~9.2 / ~12.9. New edge `ControlAction` `cycleCamera` (KeyF / pad RB,
      freed by Phase 8g).
    - **Mouse-drag free-look:** dragging over the track orbits the camera around
      the car (`panYaw` radians clamped to `camPanYawMax` 1.25, `panPitch` height
      offset clamped to `camPanPitchMax` 4), the look target blending toward the
      car as the orbit grows so flanks are actually visible; eases back to
      neutral (`camPanRecenter` 5) once the drag ends. NOT a rebindable action —
      it reads the pointer directly (pointerdown/move/up/cancel/leave on `stage`,
      cleaned up on teardown, ignored while paused/`inputBlocked`).
    - **Look-back glance:** a held `ControlAction` `lookBack` (KeyQ / pad LB).
      `lookBackF` eases 0..1 (`camLookBackRate` 11); the camera swings from
      behind (lb 0) to in front looking back over the tail (lb 1), the forward
      offset flipping `dist*(-1+2*lb)` and the look target flipping `6*(1-2*lb)`,
      with `camLookBackArch` (3) lifting the camera at the mid-swing so it arcs
      OVER the car instead of clipping through. Measured: eases 0->1 smoothly,
      height peaks ~4.95 mid-swing then settles.
    - Controls: two new registry entries (`control-settings.svelte.ts`) in a new
      `camera` group; the settings overlay renders a "Camera" section (the two
      rebind rows + a static "Free-look · drag mouse" note). The HUD controls
      hint shows `F CAMERA (<VIEW>) · Q LOOK BACK`, the view name live.
    - Debug (`__greenline`): `cycleCamera` / `setCameraView(i)` / `lookBack(on)`
      / `setPan(yaw,pitch)` / `releasePan`, `camInfo()` extended with
      view/lookBack/pan, and `driftInfo()` (hbEngage + lateral m/s + meter) for
      re-measuring thresholds headlessly.
  - **Verified** in `/dev/greenline-movement?glheadless=1` (synthetic-key drives
    via `__greenline`, since the automated tab doesn't tick rAF): the three views
    read distinct distances and cycle F/RB; look-back eases 0->1 and arcs up then
    settles; free-look holds a clamped orbit and recenters on release; the
    handbrake `hbEngage` ramps 0.28->1 (~360ms) and back (~480ms) rather than
    snapping; a clean high-speed slide reaches lat 3.46 (a real drift, not a
    plow) and the meter charges; a full 7-car race runs stable (all upright, all
    weapon/ability classes firing, 0 falls, no console errors) with camera
    cycling/look-back/pan exercised under motion and speed-scaling intact; a
    fresh `trackEntry(null)` resolves terminal-nine. Settings Camera group + the
    free-look note verified in `/dev/greenline-portal`. `svelte-check` clean, 0
    errors, no new warnings. NOTE: the combat down-state zeros a rig's controls,
    so drift measurements must keep the player off other cars (donuts near spawn
    / let the AI drive away first) or the readings are vacuous.

- **Qualifying-based grid placement (Phase 9b).** The starting grid is no longer
  "player always on pole"; slots are assigned by qualifying lap time (fastest =
  pole), across the player AND the AI field, so the player can genuinely start
  off pole — or last.
  - **`slotPose(k)` (the PHYSICAL grid layout — pole, then staggered rows of two
    at `GRID_LATERAL`/`GRID_ROW_STEP_PTS` spacing) is UNCHANGED.** Only the
    mapping of rigs to slots changed. The old hardcoded `k === 0 -> player`
    special case is gone.
  - **Player qualifying = real leaderboard data.** `Rig.qualMs` holds the
    qualifying time. The player's is a new `playerQualifyingMs` prop on
    `GreenlineRace`, read by `/greenline/+page.svelte` from the EXISTING
    `loadLeaderboard` (best_lap_ms per user per track — the same board the
    results screen shows): a `$effect` keyed on the selected track finds the
    caller's own row's `best_lap_ms`, `startRace` freezes it into
    `raceQualifyingMs`, and the race remounts per run so the time is read fresh.
    **No recorded time on the track -> `null` -> `NO_QUAL_MS` sentinel -> BACK of
    the grid** (real motorsport convention; a concrete incentive to set a time).
    The read fails soft (loadLeaderboard returns `[]` -> null -> back), and a
    player outside the queried top-100 also reads as no-time (accepted for now).
  - **AI qualifying = simulated.** AI has no persistent history, so each AI gets
    a plausible simulated time generated once at build (`simulatedAiQualMs`):
    `lapLenM / GRID_AI_LAP_SPEED` (lap length summed from the centerline, so long
    circuits get long times) times a per-archetype tendency (`AI_QUAL_ARCH_MUL`:
    velocity 0.96 quickest, armor 1.04 slowest) times +/-4% per-car jitter.
    **`GRID_AI_LAP_SPEED = 30` m/s** is an assumed competent BEST-LAP average
    (Terminal Nine ~2498m -> ~83s, Proving Ground ~794m -> ~26s), deliberately
    NOT derived from the AI's current on-track pace. **FLAG (revisit at 9d):**
    AI top speed is still the mismatched ~17 m/s that 9d will retune, so a
    measured baseline would bake in a number about to change — once 9d lands,
    sanity-check `GRID_AI_LAP_SPEED` against AI's real measured lap times and
    align it. Simulated times are fixed for a rig's lifetime (regenerated only
    when the field is rebuilt, e.g. AI count changes), so the grid is stable
    across resets rather than reshuffling every round.
  - **`assignGrid()`** sorts player + AI by `qualMs` ascending via the shared
    `gridOrder()` (exact ties break deterministically: player first, then id, so
    the grid never depends on sort stability), assigns `slotPose(slot)` in order,
    and re-seats each body (position/quaternion/velocity/warmIdx and the
    prevX/prevZ trackers, so the grid teleport never registers a phantom gate
    crossing). Called at init (after `buildAis`) and at the top of `resetRound`
    (which re-reads the player's time from the prop and re-derives). In
    `resetRound` the existing per-rig seat loop then re-applies from the same
    `.spawn`, idempotently.
  - **Judgment calls / tradeoffs:** (1) the AI baseline speed constant is a
    forward-looking estimate, not a measurement — flagged above; (2) own-best is
    read from the top-100 board rather than a dedicated own-row query (uses the
    existing seam per the spec, fine at GREENLINE's board size); (3) the dev
    harness passes no prop, so `resetRound` re-reads it as null and a
    `setPlayerQualifying`-injected time does not survive a reset there (a harness
    quirk, not a product bug — in `/greenline` the prop is the source of truth).
  - **Debug (`__greenline`):** `setPlayerQualifying(ms|null)` injects a player
    time (the harness has no leaderboard) and re-derives; `gridInfo()` returns
    the grid ordered by slot with each rig's qual time + seated pose.
  - **Verified** in `/dev/greenline-movement?glheadless=1`: a fast player time
    (70000) takes pole (slot 0 at the exact pole position); a mid time (82000,
    between the AI times) lands mid-grid (slot 2); no time (null) starts last;
    the physical layout is provably unchanged (slot -> position identical before
    and after a re-sort, `layoutUnchangedAfterResort: true`); a full 7-car field
    launches from the qualifying grid with min seat distance 5.99m (spacing
    intact), 0 falls, no phantom laps, and a race runs to completion with a
    proper finish order. `svelte-check` clean, 0 errors, no new warnings.

- **Pit-stop system + physical pit lanes (Phase 9c).** A pit lane is structurally
  a BRANCH like 8b's shortcut (`paths[]` + a grouped-checkpoint alternative,
  reused exactly, not reinvented) — the difference is framing: a deliberate slow
  repair detour, not a risk/reward speed gain.
  - **`'pit'` TrackZone (schema v2, `track-schema.ts`).** A third
    discriminated-union member beside `boost`/`hazard`. Unlike those (which fire
    ONCE on entry), the pit zone rewards a genuine STOP: continuous, not
    entry-edge. `repairPerSec` (default 50) + `stopSpeed` (default 2.5 m/s),
    both validated in `parseTrack`.
  - **Stop-gated, dwell-scaled repair (harness).** After the per-frame
    `zoneEntries` refresh (which updates `rig.zoneInside` for all zones), a
    separate block heals any vehicle whose planar speed `<= stopSpeed` while
    inside a pit zone: `rig.combat.repair(repairPerSec * dt)` per frame (the
    EXISTING Phase 5a `VehicleCombat.repair()` — the real call path, most-
    depleted pool first), reconciling plates + a revived mount quietly, with a
    throttled green pulse for the player. Amount scales with dwell because it is
    applied per frame; the pool caps clamp a long stop to a full heal.
    **Healing curve landed on: 50 health/sec, capped at max.** A ~0.5s splash
    heals ~25 (LESS than Overcharge Repair's fixed 45); ~0.9s matches it; ~2s
    tops a light ~90-pool build off; a heavy ~160-pool build wants ~3s. So the
    pit heals FAR more completely than the ability, paid for in the detour +
    stop TIME (not a meter) — the 5a ability was explicitly the smaller "field"
    version. Constants `PIT_REPAIR_PER_SEC` / `PIT_STOP_SPEED` in
    `GreenlineRace.svelte`.
  - **Real pit-lane geometry for BOTH tracks, additive.** Authored by a scratch
    script (committed as data): each pit lane is a branch offset OUTWARD from a
    flat straight (Proving Ground's start straight idx 4-30; Terminal Nine's
    dispatch straight idx 20-82 — both flat, so no 8a elevation/banking
    interaction), with a smootherstep diverge/rejoin so it connects to the main
    line at both ends. Kept apart from the main line by a `pit-wall` boundary
    ISLAND filling the gap (the 8b depot-block convention) plus an OUTER-boundary
    bulge around the lane (the aligned outer loop is pushed out past the pit,
    smoothly returning at the ends). A NEW grouped checkpoint pair (a main-line
    gate + a pit-lane gate, same group, step 0 of the lap) makes a pit lap
    lawful via the 8b group mechanism — deliberately a NEW step rather than
    grouping an existing corner checkpoint, so every existing checkpoint is
    untouched and the pit sits on the best (widest, flattest) straight. The pit
    repair ZONE sits at the lane's fully-offset midpoint. Terminal Nine keeps
    its `loading-dock` shortcut AND gains the pit lane (two independent
    branches, two independent groups); Proving Ground bumps schemaVersion 1->2
    (needed for branches/zones) but stays flat (`hasRelief` false, plane-only
    physics unchanged).
  - **AI: simple usage only (real strategy is 9d).** `TrackRuntime.pitRoutes`
    marks routes whose branch id starts with `pit`. The harness per-lap decision
    forces the pit route when `chassis/maxChassis < PIT_AI_HEALTH_FRAC` (0.5)
    via `AiDriver.setRoute`; otherwise it falls back to `chooseRoute`, which was
    refined to EXCLUDE pit routes from its random risk/reward pick (a healthy car
    never gambles onto a slow repair detour; on a pit-only-alternative track like
    Proving Ground that leaves the main line). **Deferred to 9d (flagged):** a
    hurt AI takes the pit LANE but does not yet STOP in the box, so it currently
    gets the detour without the heal — stopping/timing strategy is explicitly
    9d's job.
  - **Verified** in `/dev/greenline-movement?track=<each>`: both tracks parse +
    build (pit path, `pitRoutes`, steps, pit zone, `pit-wall` boundary); the REAL
    `LapTracker` completes a lap via main, via the pit lane, and (Terminal Nine)
    via the existing shortcut, with partial-then-clean recovery; stopping in the
    box heals (~50/s, capped) while driving THROUGH heals 0 (moving 0 vs stopped
    +32 over ~0.6s, on both tracks' zones), confirming `repair()` is the path; a
    hurt AI switches `main -> pit-lane`, healthy AIs never pick pit (chooseRoute
    picks only [0] on PG, [0,1] on TN); full 7-car live races on BOTH tracks run
    all-upright with 0 falls and existing routes lapping (ai-4 finished a PG lap;
    the TN shortcut + boosts/hazards untouched). `svelte-check` clean, 0 errors.

- **Downforce system + AERO part slot (Phase 9-fix-a).** Before this there was
  ZERO downforce model, which is why the nose lifted at speed — a MISSING
  system, not a tuning issue on top of an existing one.
  - **Real v^2 downforce, not a grip trick.** In `GreenlineRace.svelte`'s
    per-vehicle pipeline, right after the aero-drag force, a downward force
    `F = aeroDownforce * v^2` (DEFAULTS.aeroDownforce 0.42, scaled by the build
    stat `bs.aeroDown`) is applied to the chassis. It COMPRESSES the suspension,
    which raises the wheel normal load cannon-es already uses to bound tire
    friction — so grip follows from physics the same way 8a's trimesh work did,
    NOT a `frictionSlip` multiplier. Universal: the baseline is applied to EVERY
    vehicle (aeroDown = 1), so a stock car is stable unmodified. Magnitudes:
    ~1776 N at 65 m/s (~0.7 * weight, weight = 180*14 = 2520 N), ~3035 N at
    85 m/s, ~95 N at 15 m/s — decisive in the 60-85 band, negligible at low
    speed (as real aero is), so low-speed handling is untouched by construction.
  - **FRONT/REAR SPLIT was needed and is the crux.** The reported symptom is
    FRONT lift, which is a PITCH problem: drive force enters at the rear contact
    patches while the COM sits above them, so acceleration pitches the nose UP
    (worse under Nitro, engine ~2x). A uniform COM downforce adds grip but no
    pitch moment, so it can't correct that. The force is split FRONT-BIASED
    (`downforceFrontBias` 0.62) and applied at the front/rear axle offsets
    (`downforceArm` 1.25 m, the wheelbase half via WHEEL_CONNECTIONS +/-1.25),
    producing a nose-DOWN moment that GROWS with v^2 — matched exactly to where
    lift appears. Only the application point's HORIZONTAL offset makes pitch
    torque for a purely-vertical force, so `fwdWorld * arm` is the correct
    front(+)/rear(-) point. Zeroed while FULLY airborne (numWheelsOnGround 0)
    so ramp jumps and Air Correction are untouched; a wheelie (rears down)
    keeps it, which is exactly when the nose needs pushing back.
  - **AERO PartSlot (5th bodywork slot).** `PartSlot` gains `'aero'`
    (loadout.ts): stock/default `aero-stock` is invisible bodywork carrying the
    baseline (empty effects, aeroDown = 1); the three trade parts sit on a
    monotone downforce-vs-drag frontier so NO part dominates another (the
    sidegrade doctrine): `aero-splitter` (aeroDown 1.35, drag 1.1),
    `aero-wing` (1.8 / 1.25), `aero-lowdrag` (0.55 / 0.85). `StatKey` gains
    `aeroDown` (STAT_KEYS / STAT_META label "downforce", so it resolves through
    the build multiplier and renders as a garage chip). McMurtry-tier vacuum
    downforce is deliberately NOT built. The slot flows through everything
    generically: `PART_SLOTS` + `STOCK_PARTS` (pre-9-fix-a stored builds default
    to aero-stock, no migration), economy.ts (STARTER_ITEMS / BODY_SLOTS /
    itemPrice all derive from PARTS + PART_SLOTS, so the parts auto-price at the
    flat 250), Garage BUILD tab (iterates PART_SLOTS), `visualKeyFor` (a live
    aero swap rebuilds), and `rig-visual.ts` `aeroNodes` (bespoke chassis-group
    meshes: rear wing on end plates, front splitter + dive planes, low tail
    cone; aero-stock is invisible). 4 new garage part icons.
  - **Server price migration `0056_greenline_aero_part_prices.sql`** (apply
    after 0055): teaches `greenline_item_price` the three aero parts at 250
    (aero-stock is the free starter, absent). Only reachable when creative mode
    is off; economy.ts auto-prices the client mirror with no code change.
  - **Debug hooks (`__greenline`, verification only):** `hold({thr,steer,brk,
    hbk})` forces the human player's controls; `setDownforce(coef|null)`
    overrides the baseline for an A/B against the pre-fix zero; `dyno(on)` pins
    the player in place after each step (velocity/orientation/suspension
    intact) so it reaches true terminal on a FLAT track without a feature
    cutting the run — the only way to measure the sustained 60-85 band, since
    both tracks route a full-throttle car off a cliff / into a braking gate and
    AI top speed is still the ~26 m/s Phase 9b gap; `downforceInfo(id)` returns
    the applied force, nose pitch (+ = up = lifting), and per-wheel ground
    contact + suspension load.
  - **Verified** in `/dev/greenline-movement?glheadless=1` via the flat-ground
    dyno at the 60-85 band: at terminal 62.5 m/s downforce ON, the front wheel
    load is 1332 N and nose pitch 2.36deg with all 4 wheels down (front load
    GREW from 62 N under launch to 1332 N as downforce built to 1638 N);
    downforce OFF (the pre-fix state) pins the front at 264 N (~21% load) with
    the nose STUCK at 3.14deg across the whole 52-63 m/s range — the front on
    the verge of lift. Low speed is identical ON/OFF (62 N front at 3 m/s). The
    four aero parts trace a clean tradeoff frontier: terminal speed 54.8 (wing)
    -> 60.6 (stock) -> 64.5 m/s (lowdrag) against front load 1748 -> 1268 ->
    888 N, none dominating; even lowdrag's 888 N front is well above the broken
    264 N, so it is a sidegrade not a regression. A full 8-car Terminal Nine
    race with downforce active for every vehicle ran 0 NaN / 0 falls / 0 flips,
    all upright. Garage renders the AERO slot + 4 parts + the "downforce" stat
    chip + splitter/wing tradeoff chips. `svelte-check` clean, 0 errors, no new
    warnings.

- **Race-start integrity + player-chosen grid size (Phase 9-fix-b).** Two
  changes: weapons/abilities arm per vehicle on POSITION rather than on the
  countdown clock, and the player can finally choose how big the field is.
  - **Arming is PER VEHICLE and positional.** The old gate was one shared
    `preLaunch = now < raceStartAtMs`, so the whole field unlocked on the SAME
    FRAME at GO, with every car still sitting on its slot: a tightly packed grid
    was armed before anyone had moved. Arming now asks a question about the
    individual car, and the signal it asks is one the lap system ALREADY
    maintained: `LapTracker.timing`, set by the `timing-started` event on that
    vehicle's FIRST start/finish crossing. Nothing new is tracked and nothing is
    inferred from speed or a timer — every grid slot sits behind the line
    (`slotPose` steps rows BACK from the start anchor), so crossing it is exactly
    "this car has left the grid and is racing", and the staggered rows arm in the
    order they actually launch. `weaponsArmed(rig, now)` (beside the countdown
    constants) is the one predicate; the tick computes it once per frame into an
    `armed[]` array parallel to `all`, and EVERY combat path reads it: the
    player's queued fire/ability presses (discarded while disarmed, so a held
    trigger buys nothing), guided-lock acquisition (nobody rolls off the grid
    with a lock already banked), the AI weapon and ability decision loops, and
    the self-firing Auto-Turret.
    - `LAUNCH_ARM_DIST_M` (100 m straight-line from this round's grid seat) is a
      SAFETY NET, not the mechanism: it sits far past what any car covers before
      reaching the line on the current tracks (pole crosses within ~12-32 m, the
      back of a full grid within ~80 m), and exists only so a track authored with
      its spawn PAST the start line could not withhold weapons for a whole lap.
      Measured: the player armed at 43-62 m, i.e. on the crossing, never the
      fallback.
    - `preLaunch` (the shared time gate) STAYS for what it was always right for:
      the control lock, draft detection, trigger zones, and drift-meter charge.
      The `RAM_GRACE_SEC` window is also unchanged and still time-based — ram is
      nose-first contact above a closing-speed threshold, so it already cannot
      trigger on a stationary grid.
    - HUD: a steel `WEAPONS SAFE / CROSS THE LINE` chip (deliberately not amber,
      which is impact-only), and weapon/ability cells read `SAFE` dimmed instead
      of a `READY` that would not actually fire. RAM keeps reading ARMED, since
      it is the one fixed always-on tool.
  - **Grid size is a real player choice.** `DEFAULTS.aiCount` (3) used to be the
    only thing deciding a real race's field, with no UI anywhere.
    `grid-selection.svelte.ts` is the reactive localStorage store (the
    track-selection pattern) and now also owns `GRID_MAX_AI` (11, a 12-car grid),
    which GreenlineRace's own `MAX_AI` reads — so the picker can never offer a
    field the sim will not build. Like the track, it is deliberately NOT part of
    the loadout (loading a saved build must not change who you race) and NOT
    economy-gated (field size is a difficulty/feel choice, not a reward).
    `Garage.svelte` gains a presentation-only `aiCount` / `onAiCount` pair and a
    GRID SIZE picker in the GARAGE tab under the track, labelled by TOTAL cars
    (2..12) since that is what a driver thinks in. `GreenlineRace` gains an
    `aiCount` prop read ONCE at init to SEED `tuning.aiCount` before the field is
    built (so `__greenline.setAiCount` still owns it afterwards for scripted
    drives); `/greenline` captures the choice at race start into `raceAiCount`,
    exactly as it captures the track and the creative flag.
  - **Verified** in `/dev/greenline-portal` + `/dev/greenline-movement`
    (`/greenline` itself needs a signed-in session, which the placeholder local
    `.env` cannot provide; the movement harness therefore reads the SAME store
    the garage writes, mirroring the real route's wiring, so the whole
    picker -> store -> prop -> field path is drivable without auth). Arming:
    a real countdown captured frame by frame shows `fieldArmed 0` AT GO and for
    2.5 s after it, then a staggered ramp (1 armed at +2.5 s, 2 at +3.4 s, 7 at
    +4.3 s, 11 at +5.2 s) as the pack crosses; a player spamming the real
    Z/X/C/V keys through the countdown and past GO produced 0 weapon fires and 0
    ability uses while its 12-car grid sat 6 m apart; the player armed exactly on
    `timing: true`, the SAFE chip cleared, cells went SAFE -> READY, and one real
    KeyZ press then put its own slot on cooldown (0.0s -> 0.2s). Grid size:
    picking 8 cars in the REAL garage stored 7 AI, survived a reload, and
    launched a race with exactly `player + ai-1..ai-7`; picking the max launched
    12 cars with 12 seated grid slots. `svelte-check` clean, 0 errors, 0 new
    warnings.

- **Elevation-aware scenery, floodlight beams, and a chassis floor (Phase
  9-fix-c).** Three reported bugs, three genuinely separate root causes.
  - **Scenery was pinned to y 0 (the barrier/guardrail bug, and more).** Every
    prop instance was composed at `iv.set(t.x, 0, t.z)` and the berm strip
    lofted between two hardcoded heights, which is only the truth on a flat
    yard. On Terminal Nine that put the deck gantry 13.5 m under the deck it
    spans, the outer-boundary chain-link fence 13.5 m below the road it lines,
    and the banked sweeper's berm buried to its cap rail. Scenery now stands on
    its own ground: `surfaceProbe(rt, x, z)` (NEW in track-runtime.ts, a
    build-time full-scan returning surface height PLUS how far the point lies
    beyond the ribbon edge) states the fact, and `propGroundY` in the harness
    applies the policy. **The policy is two grounds, chosen by a hard
    threshold:** the world has the flat apron at y 0 and the ribbon where it
    rises, so a prop within `PROP_TRACKSIDE_M` (20) of the ribbon edge rides
    the ribbon's local surface and anything further out stays on the apron.
    Deliberately NOT a blend — a half-lifted prop floats, which never reads as
    correct — and the margin is sized off real placements (furthest authored
    trackside prop 16 m, nearest yard machinery 22 m). The berm reads elevation
    per point for BOTH its inner and outer edge, and its cap-rail segments are
    now PITCHED between their two ends (Euler XYZ composes as RY * RZ, so an
    +x-aligned box tilts in its own vertical plane then yaws) instead of
    stair-stepping. Flat tracks are untouched by construction: `surfaceProbe`
    returns 0 when `hasRelief` is false, verified on Proving Ground 07 (226
    prop instances, every one still at y 0; the only non-zero group is its 67
    fence posts at their unchanged 1.3).
  - **Floodlight beams were inverted, on EVERY track.** The working hypothesis
    was that this was elevated-placement-only; it was not. `ConeGeometry`'s
    apex is its +y end, and the beams were tilted `-0.5` about z, which swung
    the apex OUT into the air and the wide base back UNDER the mast, below
    ground: measured before the fix, the cone's top vertex sat at local
    (11.85, 25.12) while the lamp lens it should hang from is at (1.14,
    26.88), with the pool glowing 9 m away and nothing joining them. Flat
    Proving Ground 07 shows it just as plainly as Terminal Nine (screenshot
    verified: beams flaring UPWARD and outward, missing their own lamp heads).
    The beam is now DERIVED from its two real endpoints, the lamp lens and the
    pool, so cone and pool can never disagree again: length `hypot(dx, dy)`,
    centre at their midpoint, tilt `+atan2(dx, dy)`. The pool stays on the
    tower's own ground plane, which is correct because every ground query
    beyond the ribbon edge clamps to that edge's height, so a trackside tower
    and the patch it lights read the same surface (checked for all 12 Terminal
    Nine towers); a tower authored close enough that its pool falls on banked
    ribbon would need per-instance beam geometry, which nothing needs today.
  - **Elevated-floor clipping: 9-fix-a helped a lot but did not fix it, and
    the mechanism is not only "fully airborne".** A RaycastVehicle touches the
    track ONLY through its four wheel rays and cannon-es has no
    Box-vs-Trimesh narrowphase, so a chassis whose wheels cannot reach the
    deck has literally nothing holding it up. MEASURED on the 13.5 m deck: a
    car rolled onto its ROOF falls the full 13.5 m in ~1.4 s (deterministic,
    not a rare tunnel — and the flip watchdog's 2 s delay can never fire in
    time), and a landing above ~15-20 m/s vertical punches straight through
    because the impact blows past the suspension travel and puts the ray
    origins under the surface. The downforce A/B (same scripted lap, floor fix
    off in both) shows 9-fix-a's real contribution: WITHOUT downforce, 31.8%
    of frames airborne, the car ends 14.56 m below the surface, 2 fall
    recoveries; WITH it, 13.4% airborne, never below the surface, 0 falls. So
    it removed the ordinary-driving symptom without touching the cause. The
    cause is now covered by a **chassis floor**: per vehicle per frame, when
    the ribbon is more than `CHASSIS_FLOOR_MIN_RISE` (0.5 m) above the catch
    plane AND the vehicle is over the ribbon corridor AND its chassis AABB's
    lower bound (the exact lowest vertex of the oriented box, so inverted /
    rolled / pitched cars need no special case) is under the surface by less
    than `chassisFloorBand` (2.5 m), the body is stood back on the surface and
    downward velocity is killed. **All three gates earn their place:** below
    the rise threshold the y-0 plane already does this with a real
    narrowphase, and doing it twice nudged every hard landing on ordinary
    ground (measured 119 of 127 near-floor frames on a clean lap were flat;
    adding the gate took a clean Terminal Nine run from 91 catches to 3); and
    the band matters because a car BESIDE or far UNDER an elevated span reads
    that same clamped surface height and would otherwise be flung 13 m into
    the air. The band is deliberately the SAME value as `fallRecoverDrop`,
    which splits the two watchdogs with no gap and no overlap: penetrating the
    floor is the floor's job, anything deeper has genuinely fallen off and is
    the fall watchdog's. This SUPERSEDES the 8a note that an elevated flip
    falls through and recovers on top; it now stays on top and is righted
    there. Driving off an edge is unchanged (off the corridor, no clamp, fall
    recovery as before).
  - **Debug:** `__greenline.setFloorBand(m)` (0 restores the pre-fix
    fall-through, the `setDownforce` A/B convention) and a `floorCatches`
    counter in `getTelemetry()` — normal driving never trips it, so a non-zero
    count on a clean lap is the signal that something is scraping.
  - **Verified** in `/dev/greenline-movement` on all three tracks, headless
    (`?glheadless=1`) for physics and via claude-in-chrome for the visuals.
    Before/after screenshots at the same camera on the Terminal Nine deck and
    the banked sweeper (tower down on the apron with an upside-down beam and a
    guardrail slicing dead-straight through the banked road, versus a tower
    standing on the deck lighting it and a rail that climbs with the track),
    plus the Proving Ground 07 flat-track beam pair. Structurally: tower
    instances at [0 x9, 7.99, 13.5, 8.17] matching the three beside elevated
    track, the deck gantry at 13.5, fence posts spanning 1.3 -> 17.8 over 42
    levels with its rail line 2.55 -> 19.05, berm strip 0.05 -> 12.78, cone
    apex now exactly on the lamp lens. Physics: roof / side / nose-down on the
    deck all stay on it (band 0 reproduces the 13.03 m fall), 16 m and 40 m
    drops onto the deck stay (16 m fell through before), a full-throttle
    scripted lap over the climb, deck, kicker and cliff jump reaches 75.1 m/s
    with 0 falls and 3 floor catches, relief-proof-01 laps with its edge-fall
    recovery intact, and Proving Ground 07 laps with 0 floor catches (the
    block never runs on a flat track) and 5 physics bodies as before.
    `svelte-check` clean, 0 errors, 0 new warnings.

- **Combat balance pass + handbrake yaw authority (Phase 9-fix-d).** Two
  unrelated problems. Both were diagnosed by MEASURING first, and in both cases
  the measurement contradicted the obvious guess.
  - **The damage economy had never been audited as a whole.** The roster grew
    from 2 weapons (Autocannon 8, Homing Rocket 30) to 13 across four separate
    sessions, each adding plausible numbers, while `COMBAT_DEFAULTS.maxHealth`
    sat at 100 the entire time. MEASURED baseline (terminal-nine, 8 cars,
    all-AI, default fits, 175s): **34 downs, 1.46 downs per car per minute** —
    a car destroyed every ~41 seconds — with 4 of 8 weapon mounts permanently
    destroyed inside a single lap. Two Railgun hits (42 + 42) killed a neutral
    HANDLING build (armor 27 + chassis 49 = 76) inside one 2.2s cooldown.
  - **Durability: 100 -> 260**, sized off the anchor weapon rather than picked.
    The Autocannon (cost 1, 20 nominal DPS) is the one damage value the pass
    deliberately did NOT move; 260 is what takes a neutral 0.9x HANDLING build
    from **3.8s to 8.4s of UNBROKEN cone contact** to destroy. That figure is
    against 168, not the full 234: a single attacker only ever chews through
    ONE shield pool plus the chassis (front 61 + 107, rear 66 + 107) because
    the opposite shield is never touched — the whole budget is only consumed by
    fire from several directions, which is exactly what a pack does. Real cone
    uptime in a race is far below 1, so a pass costs real health without ending
    the race.
    - **Raising durability is PARTLY SELF-DEFEATING, which is worth knowing
      before tuning this again.** Cars that live longer spend more time alive
      and shooting instead of sitting in a down window, so measured field-wide
      damage throughput ROSE from 2.23 to 3.9 per car per second across the
      same race when health went 100 -> 220. Steady-state downs track roughly
      `damage_rate / pool`, so each increment buys less than its ratio
      suggests. Do not try to fix a lethality problem with durability alone.
  - **The pool split was reshaped, and the mount share was sized from data.**
    New instrumentation (`getTelemetry().hitZone` / `.pool` / `.damageTaken` /
    `.downs`, all tallied in the universal `afterDamage` funnel so every one of
    the 13 weapons plus ram, caltrops and splash is covered with no per-source
    wiring) measured where damage ACTUALLY lands over a full race:
    **front 36% / side 13% / REAR 51%** — the rear alone eats more than the
    whole front and side combined, because in a race you spend most of your
    time being chased. The mount was carrying 15% of the budget against 51% of
    the fire, and its depletion is the sticky consequence (weapons offline
    until a full heal, which in RACE mode only comes from being DOWNED). It now
    sits level with armor. Every archetype identity ORDERING is preserved —
    ARMOR keeps the deepest plating, SYSTEMS by far the hardest mount to kill,
    VELOCITY the highest raw-frame share — only the shape moved:
    ARMOR 40/45/15 -> 35/40/25, VELOCITY 20/65/15 -> 17/58/25,
    HANDLING (and `DEFAULT_POOL_SPLIT`) 30/55/15 -> 26/46/28,
    SYSTEMS 22/50/28 -> 19/43/38. Resolved (armor/chassis/mount):
    **HANDLING 61/107/66 = 234** (the NEUTRAL BUILD every weapon number is
    balanced against), ARMOR 146/166/104 = 416, VELOCITY 31/105/46 = 182,
    SYSTEMS 42/95/84 = 221.
    - **The counterplay for a dead mount existed but never fired, and that was
      its own bug.** Both recovery paths — a Phase 9c pit-lane stop and the
      Overcharge Repair ability, which run `repair()` and revive a dead mount —
      keyed their AI heuristics on the CHASSIS fraction alone, so a car whose
      guns had been shot off would sit on a full meter and drive past a repair
      box it had no rule to enter. `AiDriver.wantsRepair` and the pit decision
      in `GreenlineRace` now both treat `mountDown` as its own reason. Measured
      effect: dead mounts went from accumulating monotonically to oscillating
      and recovering (4 -> 1 within 20s as repairs fired).
    - **Second-order effect worth knowing:** frequent downs used to full-heal
      the field constantly, so making cars survive longer makes dead mounts (and
      stripped armor) ACCUMULATE instead of being reset — pool size alone can
      only change when, not whether.
  - **Two rules now govern every damage value in `WEAPONS`,** and a new entry
    has to satisfy both. (1) NOMINAL DPS (damage / cooldownSec) is the balance
    currency, measured against the 234-point neutral build; mount COST buys
    reach, reliability or a control payload, NOT simply more DPS. (2) NO SINGLE
    HIT DELETES A POOL on a neutral build (armor 61, mount 66) — every per-hit
    value is at or under 40. Effective DPS is nominal times cone uptime, so the
    nominal numbers are deliberately spread to land the EFFECTIVE band flat.
    Landed values: Autocannon 8/0.4s (anchor, unchanged); **Shotgun Burst
    22/0.8s -> 18/1.0s** (27.5 -> 18 DPS: the clearest violation on the board,
    a cost-1 gun with the highest sustained DPS in the game AND the easiest
    64deg cone to land — it still wins the brawl on uptime); **Railgun 42/2.2s
    -> 40/2.0s** (level DPS with the cost-1 anchor on purpose — cost 3 buys
    62m of REACH and per-shot burst, not a bigger number per second);
    **EMP Burst 35 dmg / 1.5s / 2.5s disruption -> 22 / 1.8s / 1.4s** (23.3 ->
    12.2 DPS: at cost 2 it out-damaged every cost-3 weapon AND carried the
    hardest control effect, and a 2.5s lock on a 1.5s cooldown meant a single
    carrier could hold a rival disrupted forever — the cooldown now outlasts
    the effect); **Cluster Missile 26/6s -> 28/5s**; **Homing Rocket cd 5 ->
    4.5s**; **Auto-Turret 10 -> 11**; **Blades 14 -> 16**; **Caltrops 10 ->
    12**; **Energy Shield absorb 70 -> 140**; Grappling Hook unchanged (12, the
    "barely scratches them" control tool).
    - Rule 2 is deliberately scoped to the NEUTRAL build, not claimed
      universally. On the lightest chassis (VELOCITY, armor 31 / mount 46) the
      heavy end — Railgun 40, a maximum-violence ram at 41.6, and the guided
      pair at 30 / 28 against its 31 armor — does clear the front shield in one
      hit. That is **the deliberate exception**: it is the documented identity
      of the archetype whose own role text says nearly every hit bleeds real
      life. Building out of glass is a choice with consequences; the baseline
      is what has to be safe from one-shot deletion.
  - **Ram (the one free, universal, always-equipped damage source) 30 -> 26**,
    putting its speed-scaled peak at 41.6 instead of 48 — still the hardest
    single impact bar the Railgun, now under every neutral pool. `ramStunSec`
    1.1 -> 0.8 (a ram already knocks both cars apart physically).
  - **Disruption itself was softened**: `disruptEngineCut` 0.25 -> 0.55,
    `disruptSteerCut` 0.35 -> 0.60. At a quarter engine and a third steering a
    disrupted car could neither escape the 30m EMP cone nor steer out of it, so
    the first hit bought every follow-up for free — the report was as much a
    control-lock problem as a damage one.
  - **Constants whose RELATIONSHIP to the budget is documented were scaled with
    it**, not left behind: Overcharge Repair 45 -> 115 (still ~half a neutral
    build), `PIT_REPAIR_PER_SEC` 50 -> 125 (keeps 9c's documented ~2s light /
    ~3s heavy full-heal dwell), and `GARAGE_BASELINE.health` 100 -> 260 (a
    hardcoded mirror of `COMBAT_DEFAULTS.maxHealth` that the garage HULL hero
    reads — it must move in lock-step or the garage lies).
  - **Handbrake: the low-speed spin was a YAW-AUTHORITY problem, not the 9a
    grip curve, and it is not actually worse at low speed.** MEASURED yaw-rate
    sweep (single tap, both handbrake and steering released at the end of the
    tap): peak yaw 37 deg/s at 4 m/s, 182 at 14, 217 at 18, **408 deg/s at
    22 m/s**, and a 250ms tap turned the car **150deg at 22 m/s and 199deg at
    30 m/s** — the reported "full 180 from one tap", reproduced exactly. The
    spike GROWS with speed; what makes it read as a low-speed problem is that
    around 20-25 m/s (45-55 mph, genuinely "low" in a 146 mph game) the car has
    grip enough to convert the whole tap into rotation but too little momentum
    to keep travelling, so it pirouettes on the spot instead of carving an arc.
    - Mechanism: cutting rear grip removes the only thing damping rotation,
      while the FRONT keeps full grip (`frictionSlip` 5) at a very large
      steering angle (`steerSpeedFalloff` is only 0.04, so the wheels are still
      turned ~30deg at 22 m/s and ~49deg at walking pace). The front generates
      far more yaw torque than the slid rear can resist, and nothing bounded
      the result. 9a's `hbEngage` ramp fixed HOW GRIP ARRIVES and is working;
      it never addressed how fast the car could be made to rotate.
    - Fix: while the handbrake is engaged, bleed only the yaw rate ABOVE a
      drift-shaped ceiling — `handbrakeYawMax` 1.4 rad/s (80 deg/s, a ~16m arc
      at 22 m/s) with `handbrakeYawDamp` 45 (1/s) on the EXCESS. It mirrors the
      `pitchDamp` anti-wheelie term directly above it, which deliberately left
      yaw alone; this is the scoped exception and applies ONLY while engaged.
      Both values were SWEPT in the harness (four pairs x two entry speeds),
      not guessed: the first attempt at damp 8 barely dented the spin because
      the front drives yaw up at ~24 rad/s^2, putting the equilibrium at
      5.6 rad/s. Scaling the term by `hbEngage` means the flick still spikes
      sharply to ~2.9 rad/s in the first moments and is then caught, so it
      reads as the rear axle biting back rather than as a hard clamp.
    - Result, measured on the shipped constants: a 250ms tap turns the car
      **51 / 49 / 52 deg at 14 / 22 / 30 m/s**, against **84 / 150 / 199 deg**
      before. The spin is now essentially FLAT across the speed range instead
      of exploding with it, which is the real quality signal — a tap does the
      same predictable thing however fast you are going.
    - Holding it still rotates you: **90 deg at 22 m/s and 105 deg over a 1.8s
      hold**, so a full 180 costs roughly 3s of deliberate holding rather than
      one twitch. 9a's committed drift is untouched and if anything better —
      lateral slip reaches 4.3-4.9 m/s (well above `DRIFT_FULL_LATERAL` 3.0),
      the meter charges 0.5-0.73 from a single tap and **fills completely** on
      a held drift.
    - Debug: `__greenline.setHandbrakeYaw(max, damp)`; **damp 0 restores the
      pre-fix unbounded spike exactly**, the `setDownforce` / `setFloorBand`
      A/B convention.
  - **Verified** in `/dev/greenline-movement?glheadless=1`, same 8-car all-AI
    terminal-nine race as the baseline.
    - **Single races vary wildly with pileup luck** (observed 0.22-1.05
      downs/car/min on the SAME build), so the headline is a repeated-trial
      mean, and the primary metric is **damage absorbed per down** — far lower
      variance than downs-per-minute, because both its numerator and
      denominator scale with how intense the racing happened to be, which
      isolates survivability from engagement intensity.
    - **Damage absorbed before being destroyed: 92 -> 407, a 4.4x increase**
      (3 x 60s trials: 439 / 328 / 453). Down rate over the same trials:
      **1.46 -> 0.71 per car per minute (2.1x)**. The two multipliers differ
      for the documented alive-time reason: field-wide damage throughput more
      than doubled (2.23 -> 4.7 per car per second) precisely BECAUSE cars now
      survive to keep shooting, so halving the down rate required each car to
      absorb 4.4x more punishment.
    - Per-weapon TTK against the neutral build (front hits, unbroken fire):
      Autocannon 3.8 -> 8.4s, Shotgun Burst 2.8 -> 9.3s, Railgun **2.2 ->
      8.4s**, EMP Burst 3.0 -> 13.8s. The two-shot Railgun kill and the
      three-shot EMP kill are both gone.
    - Per-archetype pools verified against the design table through the real
      `splitPools`; per-hit weapon damage verified landing at exactly its
      catalog value through the real fire path (42/35/22/8 pre-fix). Handbrake
      A/B driven through `setHandbrakeYaw` at four entry speeds, plus a
      four-config parameter sweep. `svelte-check` clean, 0 errors, 0 new
      warnings.
    - **Known residual, and it is 9d's:** the remaining lethality is dominated
      by AI firing with near-perfect cone uptime — the health budget was sized
      for realistic player uptime, and 7 AI in a pack all achieving nominal DPS
      simultaneously is the stress case. That is AI firing discipline, which is
      exactly what the AI overhaul addresses; it was deliberately not
      compensated for here by over-inflating health.

- **AI speed derived from each vehicle's own build (Phase 9d-i).** The AI drove
  to `AI_DEFAULTS.topSpeed = 17` m/s, a FLAT constant, while the player's
  derived ceiling climbed past 60 across four phases of physics retuning. The
  fix is not a bigger constant: an absolute shared speed is deleted from the
  design, and every driving target is now resolved per vehicle from the same
  physics the car obeys.
  - **Two types where there was one.** `AiSkill` is the FIELD-WIDE driver skill
    (`AI_DEFAULTS`), and it deliberately has no `topSpeed` at all — speed is a
    `speedFrac` (default **1**: flat out, the corner sweep is the only limit,
    since an AI should not self-handicap against a player in the same car).
    `AiTuning` is the RESOLVED per-vehicle target set, built ONLY by the new
    pure `aiTuningFor(spec, skill)`. `topSpeed` is
    `sqrt(engineForce / aeroDrag)` — the identical formula the player's car
    reaches and the garage TOP SPEED hero displays, so one change now moves all
    three together. Verified equal for all four archetypes:
    **velocity 78.3 / handling 63.65 / armor 62.84 / systems 61.13 m/s**, each
    matching `physicsTopSpeed` exactly.
  - **Three more constants were sized for 17 m/s and had to go with it.**
    (1) The braking sweep planned with CONSTANT deceleration over a fixed
    26-point window; it now integrates `a0 + k*v^2` in closed form (aero is the
    dominant term at speed — a car at 63 m/s sheds ~12 m/s^2 to drag alone) and
    derives its horizon from the vehicle's own stopping distance. `brakeAccel`
    4.5 -> **14**, against a MEASURED ~25 m/s^2 of purely mechanical braking.
    (2) The hold band around the allowed speed was a flat 0.8 m/s = 1% at
    63 m/s, so a fast car stuttered between full brakes and full throttle; it is
    proportional now. (3) The off-ribbon REJOIN target was a fixed 8 m = 0.13 s
    at 60 m/s, so any brief excursion answered with near-full lock and spun the
    car; both steering distances are in metres now, converted to points after.
  - **`cornerAccel` 7 -> 12, the one value that could not be derived.** MEASURED
    lateral capability is 28.7 m/s^2 at 12 m/s rising to ~72 at 54 m/s, so grip
    is NOT the constraint — the centerline-following LINE is. Swept solo:
    10 -> 106.7 s clean, 13 -> 85.2 s, 16 -> 77.0 s, 18 -> DNF off the deck.
    Raising it does not buy safety either (a full-field run at 9 was WORSE than
    12 on both progress and falls), which is what identifies the residual below
    as line quality rather than corner budget.
  - **Traction cap: the VELOCITY build cannot be driven flat out, by anyone.**
    Full throttle from rest, dead straight, ZERO steering input, held 10 s:
    ARMOR 2.25 m/s of lateral slip, HANDLING 2.67, SYSTEMS 2.78 — and VELOCITY
    **31.4 m/s and a full 180 deg spin**, ending stationary. It is a pre-existing
    VEHICLE trait (a human holding the same key gets the same spin) that only
    became reachable once the AI drove fast enough to meet it. So the AI
    feathers: commanded throttle is capped at
    `(tractionAccel + dragDecel*v^2) / driveAccel`. Two properties make it safe
    to apply unconditionally — it can never cost a vehicle its top speed (at
    terminal, drag consumes the whole drive force, so the cap passed 1 long
    before; VELOCITY is back to full throttle above ~44 m/s), and it is a no-op
    for the three archetypes whose tires already take their power (caps compute
    to 1.30 / 1.22 / 1.05 at rest, all clamped to 1). `tractionAccel` 15.5 is
    exactly the line the measurements draw. This took VELOCITY from a DNF to
    the **fastest** archetype.
  - **Measured lap times, Terminal Nine (2494 m), solo clean laps** against the
    pre-9d-i baseline: velocity **76.5 s** (was 132.3), systems **78.7 s** (was
    152.4), armor **80.9 s** (was 153.7 / 156.0), handling **77.7 to 84.6 s**
    (was 161.2 / 170.8). Peak speeds reached 75.7 / 59.4 / 61.3 / 61.8 m/s, each
    within ~3% of its own derived ceiling, and the ORDERING matches what a
    player feels from the same builds. Proving Ground 07 (794 m, flat) runs
    32.7 to 42.3 s laps.
  - **Prior AI systems confirmed unaffected** (they all sit on this loop): a
    12-car-scale field still fires weapons, spends abilities, collects boost and
    hazard zones, rams, gambles onto the `loading-dock` shortcut, and diverts to
    the pit lane when hurt — all observed live. `GRID_AI_LAP_SPEED` (9b's
    flagged estimate) was CHECKED here and left at 30: measured Terminal Nine
    averages are 29.5 to 32.6 m/s, so the estimate was right.
  - **Known residual, and it is 9d-ii/iii's.** On a FLAT track the driving loop
    is clean (Proving Ground: 0 falls, 0 floor scrapes across an 8-car race). On
    Terminal Nine an 8-car pack at ~60 m/s produces roughly 19 falls / 21 flips
    per 3 minutes against 4 / 11 at the old speed, and a positional histogram
    puts the hotspot squarely on the **elevated deck-edge kicker** (the jump was
    authored around 52 m/s and cars now arrive above 60) plus the standing
    start, where eight cars pure-pursue the identical centerline. Both are
    racing-line and traffic-awareness problems, not speed-capability ones, and
    were deliberately not papered over by handicapping the field back down.
  - Debug: `__greenline.aiSpeedInfo()` prints every rig's `physicsTopSpeed`
    beside its `aiTopSpeed` (a divergence between those two columns IS the
    staleness this replaced) plus corner/drag/traction terms and the
    standing-start throttle cap; `setAiSkill({speedFrac, cornerAccel})` A/Bs the
    skill knobs, and `speedFrac: 0.2603` reproduces the pre-9d-i flat 17 m/s
    exactly on every build (`17 / sqrt(2900/0.68)`).

## Shared feedback box

`src/lib/feedback/` is the app-AGNOSTIC in-app feedback / suggestion box.
GREENLINE is the first consumer and VANGUARD is the intended second; nothing
in the component or the seam knows what a race, a lap, or a wave is.

- **`FeedbackBox.svelte`** is presentation only (the Minimap / Garage
  convention: state in via props, intent out via callbacks) and never touches
  Supabase itself, so a dev harness mounts it against an in-memory store
  unchanged. Props: `app` (which app), `context` (which screen), `meta`
  (free-form context attached to the row), `submit` (does the write, resolves
  `{ error }`), `onClose`, plus optional `title` / `note`. It owns the form,
  the four kinds (bug / idea / praise / other — kept short on purpose, more
  categories means more time choosing and less writing), validation, the
  in-flight state, the thank-you, and a "send another" reset. A FAILED submit
  keeps the player's text rather than discarding it.
- **Theming is via `--fb-*` custom properties** declared on the scrim with
  neutral dark defaults, so a host overrides them from outside
  (`.glb .fb-scrim { --fb-accent: ... }`) instead of the component growing a
  per-app branch. No game-specific copy, color, or font is baked in.
- **Escape closes it and keydowns are swallowed** while open, matching
  GreenlineSettings; Ctrl/Cmd+Enter sends (a bare Enter stays a newline, since
  this is prose). A host that runs a keyboard-driven game underneath must ALSO
  block its own key handling while the box is open — see `inputBlocked` in the
  GREENLINE section for why `stopPropagation` cannot do this on its own.
- **`feedback.ts`** is the data seam (`submitFeedback`, `feedbackIssue`,
  `FEEDBACK_KINDS`, `FEEDBACK_MAX_LEN`). A feedback row is a comment about
  YOURSELF, so there is nothing to forge and NO RPC is needed: the insert is a
  direct RLS-scoped write whose WITH CHECK pins `user_id` to `auth.uid()` (the
  fsp_item_opens doctrine, not the gauntlet_submit one).
- **Table `app_feedback` (`0053`, apply manually after 0052):** ONE table with
  an `app` discriminator rather than one per game, so "what are players telling
  us this week" is one query instead of a union that grows with every surface.
  APPEND-ONLY — no update or delete grant at all; correcting yourself means
  sending a second note, which is also a truer record than a silently edited
  one. Reads are own-rows plus `is_teacher()` for everything. `meta` is
  client-reported context (build, track, screen): a debugging aid, never
  authoritative. No admin UI ships with it yet; the table is the deliverable.
- **VANGUARD is deliberately NOT wired yet** (its own task): it would mount the
  same component with `app="vanguard"`, its own `--fb-*` palette, and a submit
  that calls the same `submitFeedback`.

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
identically to every other section card, with material rows that use
the optional `Assignment.href` to link directly to the FSP tools:
`FSP Presentations` (no href, see `FspPresentationsPanel` below), `Course Info`
(no href, see `FspCourseInfoPanel` below), `Live Q&A` -> `/fsp/ask`,
`SolidWorks Add-In` -> `/fsp/class`. It is no longer a `portal-apps.ts` launcher
app (that entry was removed), and the old role-routing hub page
`/fsp/+page.svelte` was DELETED — `/fsp/day1`, `/fsp/live`, `/fsp/ask`, and
`/fsp/class` are intact and reached directly (bare `/fsp` no longer resolves).
**Teachers get a fifth item, `Live Question Feed` -> `/fsp/live`**, appended
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
  - **`FSP Presentations` opens a panel, not a page.** The row has no `href`
    (`curriculum.ts`); `FspHomeSection` special-cases its slug
    (`fsp-presentations`) so the click is intercepted (`preventDefault`, the
    `open-state` first-open callback still fires) and it mounts
    `src/lib/fsp/FspPresentationsPanel.svelte` instead of navigating. That
    component is a green-on-black modal (styled like `FspStudentPreview`) with
    three tabs (Day 1/2/3), each embedding that day's Google Slides deck via
    the public `/embed?start=false&loop=false&delayms=3000` URL (no auth, no
    per-day route — distinct from the Claude Design archive viewers at
    `/fsp/day1` / `/fsp/day2`, which are untouched). A tab's iframe mounts only
    on first view (lazy) and stays mounted after that (tab-switch just
    toggles CSS visibility, so switching back never re-loads it). Because a
    blocked Google Slides share can render an in-frame "you need access" page
    WITHOUT ever firing the iframe's `error` event, failure can't be reliably
    detected: a plain "Open in Google Slides ↗" link is therefore always shown
    under every tab's iframe, never gated behind error detection, so the deck
    is always reachable even if the embed is silently broken.
  - **`Course Info` is the same panel pattern with static text, no embed.** The
    row (slug `fsp-course-info`, also no `href`) opens
    `src/lib/fsp/FspCourseInfoPanel.svelte` — identical modal chrome and tab
    mechanics to `FspPresentationsPanel` (same `--green`/`--gold`/`--cyan`/
    `--line` tokens from the design-system layer `app.css` imports), but each
    tab is plain `Course[]` data (title, italic tagline, body paragraph,
    bullet list) rendered directly, so there is no lazy-mount, load-status, or
    fallback-link machinery — nothing external to fail. `FspHomeSection`
    generalizes the panel-slug dispatch to a `PANEL_OPENERS` map
    (`slug -> () => void`) rather than a single hardcoded slug, so a third
    panel-opening row is a one-line addition. Tabs: IDEA114 (Engineering
    Foundations), IDEA209H (Engineering I Honors), IDEA210H (Engineering
    Applications Honors) — course-overview copy for prospective FSP students,
    unrelated to the live `curriculum.ts` section data.
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
    the JWT email domain). This one row is the session `/fsp/ask` tags every
    submission with (unchanged submission flow). **Six fixed session slots**
    still exist as values, one per FSP day/session: `Day1-A`, `Day1-B`,
    `Day2-A`, `Day2-B`, `Day3-A`, `Day3-B` (two sessions per day); the column
    stays free-form text. `/fsp/live` no longer exposes these as a picker or
    groups the feed by them (see `/fsp/live` below) — they now exist purely as
    the tag every question still carries and the sweep target for Clear Feed.
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
  redesigned for projection (a widescreen panel + feed layout, panel stacking
  above the feed on narrow viewports). In-page sign-in + staff domain gate, a
  full-screen toggle, and:
  - **ONE chronological feed, no session grouping.** The earlier six-preset
    session picker (`Day1-A` through `Day3-B`) is gone from the display: every
    unanswered question renders together, newest-first, regardless of which
    session it was submitted under. This is display-only — the data model and
    submission flow are unchanged (`/fsp/ask` still tags every question with
    `fsp_config.active_session`; see the `fsp_config` bullet above). **Clear
    Feed** still uses the only RPC that exists, the per-session
    `clear_fsp_session(session_id)` (no "clear all" RPC was added, to avoid a
    migration), so it loops over the six known session ids and calls the RPC
    for each, soft-clearing the whole (now ungrouped) feed in one click.
  - **QR code:** a static `api.qrserver.com` generated PNG (dark green-on-black
    to match the palette) linking to `https://ideabosco.com/fsp/ask`, labelled
    "ideabosco.com/fsp/ask" underneath, docked at the bottom of the panel so
    students can scan it straight off the projected display.
  - **Feed:** each card shows the question, the submitter (or "Anonymous" when
    `is_anonymous` or a null `submitter_name`), and a relative timestamp;
    newest-at-top, animated in, generous padding sized for reading from across
    a room.
  The **feed itself** (Realtime subscription with no session filter, loading
  every unanswered row newest-first, question cards, soft-clear UPDATE
  removing a card, `prefers-reduced-motion`) is factored into
  `src/lib/fsp/FspLiveFeed.svelte`, still shared with the dead-code
  `FspDeck.svelte` and the dev harnesses; the page keeps only the chrome (auth
  gate, QR, a **Student View** control, count via a bound prop, full-screen
  toggle). The component's `select()` includes `is_anonymous` /
  `submitter_name`, and takes a `variant` (`console` on this page, `slide` for
  the now-unused deck-embed path kept alive only by dead code / harnesses) and
  `sampleQuestions` for the no-Supabase harness path (the earlier `session`
  filter prop was removed along with the grouping).
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
