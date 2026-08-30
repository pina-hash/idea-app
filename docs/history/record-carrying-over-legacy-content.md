---
title: "Carrying over legacy content"
date: 2026-06-20
branches: []
migrations: ["0002", "0032", "0037"]
subsystems: ["Legacy content & VANGUARD"]
record_order: 19
---

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
   directly and never reach the hook): `/IDEA` -> `/` and `/IDEA/coins` ->
   `/coins/index.html`. There was a third, `/IDEA/entry/` -> `/coin-entry`; it
   went with the retired Sheets entry tool, so that old link now 404s.
   **KEYED WITHOUT THE TRAILING SLASH SINCE `0107`, and that is the whole
   reason they work.** They were keyed `'/IDEA/'` and `'/IDEA/coins/'` from
   Phase 2 until then and **had never once fired**: SvelteKit normalizes
   `/IDEA/` to `/IDEA` and issues its own redirect before any hook runs, so
   the with-slash keys could not match and both links 404'd
   (`/IDEA/` -> `/IDEA` -> 404; `/IDEA/coins/` -> `/coins/` -> `/coins` ->
   404, measured). The handler strips a trailing slash itself so either
   spelling works, and the targets carry the explicit `index.html` because the
   Vite dev server does not resolve a bare directory to it.

When adding more legacy HTML, check its references against this: mirrored icons
(absolute or bare) resolve, `.html` cross-links get rewritten, the three base
paths redirect; anything else (per-page assets, for instance) does not and
should be flagged.

### Role-gated endpoint pattern (specific role required)

A variant of the gated pattern that also checks the user's role. The role lives
in `profiles`, not the JWT, so the endpoint looks it up via `locals.supabase`.

- Example: `src/routes/fsp/frc-interest/admin/+page.server.ts` gates the FRC
  interest roster to teachers only. Signed out -> `/`; signed in non-teacher ->
  `/`; teacher -> the page. `/dashboard` is the other instance of the same
  lookup. (The original example was the legacy coin entry tool's endpoint,
  retired in Phase 4 and archived under
  `docs/coin-economy/archive/legacy-system/`.)
- A link to a role-gated surface renders only for the right role, but the
  server-side check is the real guard (UI gating is convenience, not
  security).

