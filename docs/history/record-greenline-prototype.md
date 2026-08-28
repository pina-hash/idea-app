---
title: "GREENLINE (prototype)"
date: 2026-07-06
branches: []
migrations: ["0017", "0025", "0049", "0050", "0051", "0052", "0054", "0055", "0056", "0057", "0059"]
subsystems: ["GREENLINE"]
record_order: 66
greenline_bundles:
  - "Track format (v1)"
  - "Track runtime"
  - "Environment preset + prop kit (the environment pass)"
  - "Minimap"
  - "Combat scaffold"
  - "Zoned three-pool damage (armor / chassis / mount)"
  - "Four disruption tools"
  - "Combat feedback layer"
  - "Loadouts (archetypes + parts)"
  - "AI opponents"
  - "The game is a reusable component now"
  - "Headless AI-only stress-test hooks (data-only, backward compatible)"
  - "Real portal route `/greenline` (signed-in tier, any role; RACE only)"
  - "Dev harness `/dev/greenline-portal`"
  - "GREENLINE brand layer (the visual identity, deliberately NOT the portal's IDEA green)"
  - "Multi-part vehicle rigs (the Crossout-direction foundation)"
  - "Shared rig-visual builder + equipped-part visuals (`src/lib/greenline/rig-visual.ts`)"
  - "Garage 3D preview (`src/lib/greenline/GaragePreview.svelte`)"
  - "Performance target"
  - "Soundtrack (`src/lib/greenline/GreenlineMusic.svelte`)"
  - "Tuning panel + in-race garage removed; player-facing units are US customary"
  - "Garage foundation + settings shell (Phase 2a)"
  - "Remappable controls (Phase 2b), keyboard + gamepad"
  - "Web Audio engine + spatial audio + music unification (Phase 2C), `src/lib/greenline/audio-engine.ts`"
  - "Equippable weapons: dual mount slots + capacity budget (Phase 4a), proven with Autocannon and Homing Rocket"
  - "Four more weapons (Phase 4b-i): Railgun, Shotgun Burst, Cluster Missile, Caltrops, on the 4a framework"
  - "Player-chosen weapon sockets + the all-10 weapon-mesh redesign (Phase 4c, closes the clipping problem)"
  - "Drift-charged abilities: a second loadout system parallel to weapons (Phase 5a)"
  - "Structural connectors + deeper destruction (Phase 6a, cars only)"
  - "Preset cosmetic customization (Phase 6b, cars only): color, pattern, car number"
  - "Custom decal upload + teacher moderation (Phase 6c, migration `0051`)"
  - "Track schema v2: elevation, banking, trigger zones + real 3D track physics (Phase 8a)"
  - "Ignition Credits economy + unlock gating + creative mode (Phase 7, migration `0052`)"
  - "Terminal Nine + route branching (Phase 8b)"
  - "Air Correction, the sixth ability + airborne detection (Phase 8d)"
  - "Weather presets, speed retune, larger grid (Phase 8c)"
  - "Track selection, pause menu, feedback, telemetry, creative default (Phase 8e + 8f)"
  - "EMP / Oil Slick / Grappling Hook are equipment now (Phase 8g), so the roster is 13 weapons"
  - "Garage reorganization (Phase 8h): real side-by-side + four tabs"
  - "Drift-feel rework + camera system + Terminal Nine default (Phase 9a)"
  - "Qualifying-based grid placement (Phase 9b)"
  - "Pit-stop system + physical pit lanes (Phase 9c)"
  - "Downforce system + AERO part slot (Phase 9-fix-a)"
  - "Race-start integrity + player-chosen grid size (Phase 9-fix-b)"
  - "Elevation-aware scenery, floodlight beams, and a chassis floor (Phase 9-fix-c)"
  - "Combat balance pass + handbrake yaw authority (Phase 9-fix-d)"
  - "AI speed derived from each vehicle's own build (Phase 9d-i)"
  - "Player traction limiting (Phase 9-fix-e), the VELOCITY spin-out fix"
  - "AI target prioritization (Phase 9d-ii-a)"
  - "Cross-slot coordination + weighted fit pools (Phase 9d-ii-b)"
  - "Informed branch strategy + real pit stops (Phase 9d-iii), the last stage of the AI overhaul"
  - "Track builder, stage 1 (dev tool): `/dev/greenline-track-builder`"
  - "Track builder, stage 2: zones, authored checkpoints, fork/merge pieces"
  - "Track builder: teacher-gated on the live site, plus one-click Test Drive"
  - "Piece-chain builder promoted to production + REVIEW-BEFORE-VISIBLE (migration `0059`)"
  - "Community tracks: publish / browse / rate / report + per-attempt telemetry (Bundle 4a, migration `0057`)"
  - "Community-track moderation + featuring = ranked eligibility (Bundle 4b, migration `0058`)"
  - "Track schema v3: piece-chain tracks + the corkscrew (`src/lib/greenline/track-pieces.ts`)"
  - "Corkscrew catch-plane arch: the 8a rule enforced in the generator (`corkscrewArchLift` in `track-pieces.ts`)"
  - "Piece-chain builder (dev tool): `/dev/greenline-piece-builder`"
  - "Piece-chain builder workflow rework"
  - "Direct-manipulation handles in the piece-builder 3D preview (straight + curve)"
  - "The preview camera owns the middle button; orbit pivots under the cursor; the road is clickable and draggable"
  - "Collapsed piece rows + rotational handles for the angle params"
  - "Every piece param is handle-driven now, plus a screen-nearest picker and jump fit bounds"
  - "Start-grid apron: `PieceChainSurface.startGridWidth`"
  - "Cursor-anchored wheel zoom + WASD free-fly in the piece-builder preview"
  - "Jump piece: independent takeoff + landing angles, real ramp mass, handles"
  - "Shared track visuals (`src/lib/greenline/track-visual.ts`) + the builder's live 3D preview"
  - "Real SFX content for categories 1-6 (`src/lib/greenline/sfx.ts`), replacing the placeholder tones"
  - "Real distance falloff, and a spatial/flat split declared in the roster"
  - "Self-crossing tracks (overpasses): detection, local boundary enforcement, overpass-aware deck structure"
---

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
  four race (`race-1`, `race-3`, `race-4`, `race-5` — race-2 was cut), plus
  `winner.mp3` / `loser.mp3` — the menu/workshop
  pools rotate, race is random, so the pool counts are read from the arrays in
  `MUSIC_TRACKS` (`audio-settings.svelte.ts`), not hardcoded elsewhere: dropping
  a track is deleting the file and its one array entry, and a stored pin naming
  a removed track fails the `includes()` check on load and falls back to
  SHUFFLE. Music only; SFX arrived later (see the real-SFX bullet below).
  Dev harness: `/dev/greenline-portal` mounts the controller
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

- **Player traction limiting (Phase 9-fix-e), the VELOCITY spin-out fix.** The
  AI has fed its commanded throttle through a traction cap since 9d-i; the
  human player's real input never did, so a VELOCITY build still spun itself
  180 deg off a standing start on a dead-straight road with zero steering.
  Same formula, ported to the player, and moved into the SHARED per-vehicle
  force path so both drivers of the same car now meet the same physical limit.
  - **One constant, two consumers.** `VEHICLE_TRACTION_ACCEL` (15.5 m/s^2 at
    neutral grip) is exported from `ai.ts` and read by BOTH `AI_DEFAULTS`
    .tractionAccel and `DEFAULTS.tractionAccel` in `GreenlineRace.svelte`. It
    lives in ai.ts only because that is where the measurements are documented;
    it is a VEHICLE trait, and the export exists so the two can never drift
    into a world where an AI feathers a car a player is still allowed to spin.
  - **VELOCITY's stats are NOT the bug and were not touched.** Its `effects`
    block carries no `frictionSlip` at all (baseline grip); the instability is
    entirely `engineForce: 1.15` over `chassisMass: 0.85` — 21.8 m/s^2 of drive
    against 15.5 of tire — and those two numbers ARE the archetype's identity.
    The car is not overtuned, it is a car that cannot be driven flat out off
    the line, and now both drivers know it.
  - **Two deliberate differences from the AI port**, and they are what make it
    read as physics rather than as a ceiling on the accelerator. (1) It scales
    the DRIVE FORCE, not the input: `throttle` and every held-key / gamepad /
    HUD consumer is untouched, so the pedal still works as hard as the driver
    pushes it and what changes is how much reaches the road. (2) It is EASED
    over a per-rig `Rig.tractionEase` factor (`tractionEngageRate` 8 in,
    `tractionReleaseRate` 4 out, mirroring the handbrake ramp), so a launch
    delivers everything asked for for the first ~120ms, loses it as the tires
    break away, and settles onto what they can hold. The factor multiplies
    DEMAND, so lifting off is always instant and only the grip loss is
    smoothed. The AI re-decides its throttle from a step function every frame
    and needs neither.
  - **Nitro and boost pads are deliberately EXCLUDED** from the cap (it is
    computed against the base drive force, not the `engineMax` those multiply).
    They are burst abilities with a meter cost and a launch feel tuned in Phase
    5a against this exact pipeline; limiting them here would silently re-tune
    an ability this pass has no business touching. Spending Nitro off the line
    can still light the tires up — a choice the driver made, not a car they
    cannot drive.
  - **Proven a no-op for the other three archetypes, structurally rather than
    statistically.** `tractionEase` is initialized to 1 and its target is a
    constant 1 whenever the cap exceeds demand, so the multiply is the
    IDENTITY. Browser-asserted `ease === 1` under strict equality (not "about
    1") with `tractionLimitedFrames === 0` through ARMOR / HANDLING / SYSTEMS
    standing starts AND a 90 s 8-car race — identical drive force, so lap times
    and launch behaviour cannot change. A 16-case sweep (4 archetypes x 4
    drivetrain parts) confirms no non-VELOCITY build in the catalog reaches its
    tire budget: drive 11.93 / 15.31 / 14.82 against 15.5 (SYSTEMS is the
    tightest at cap 1.05).
  - **The AI is never double-limited**, also proven rather than assumed: its
    commanded throttle is already at or below the same cap, so the target
    resolves to 1 and the player-side limiter finds nothing to do. The 90 s
    8-car race logged `tractionLimitedFrames: 0` with every rig at `ease === 1`,
    including two VELOCITY rigs whose `capAtRest` is 0.71. The two limiters
    compose to exactly one.
  - **Top speed provably untouched.** The cap rises with `v^2` and crosses 1 at
    42.1 m/s on VELOCITY, far below its 78.3 m/s drag-limited terminal.
    Measured on the treadmill dyno: 77.4 m/s limiter ON vs 77.7 OFF (0.4%,
    inside run-to-run noise), with `ease === 1` at the top end.
  - **Emergent, and a genuinely good property:** grippier tires visibly buy
    back authority. Slicks (grip 1.25) lift VELOCITY's rest cap 0.71 -> 0.89
    and drop the release speed 42.1 -> 26.1 m/s, so the parts system expresses
    the tradeoff on its own with no special-casing.
  - Debug: `__greenline.tractionInfo(rigId)` (drive vs tire budget, cap at rest
    and now, the live eased factor, the release speed) and `setTraction(accel |
    null)` — a large value such as 999 restores the pre-fix uncapped behaviour
    exactly, the `setDownforce` / `setFloorBand` A/B convention. Telemetry adds
    `tractionLimitedFrames`.
  - **Verified** in `/dev/greenline-movement`, on the REAL key-input path
    (dispatched `KeyW` keydown through the actual `actionForKey` handler, no
    `hold()` bypass) as well as headless: pre-fix VELOCITY reaches 173 deg of
    yaw and ends at `upY -1.00`, on its roof, 62 m from the grid; fixed, the
    identical input holds `upY` at exactly 1.00 for the whole run — it never
    lifts a wheel — covers 174 m, peaks at 104 mph, and clears checkpoints.
    Pedal linearity swept at rest: applied throttle tracks demand 1:1 through
    0.70 and saturates at ~0.72 above it, so there is no dead zone anywhere in
    the usable range and the knee sits exactly where the tires run out.
    Screenshots via claude-in-chrome (WebGL hangs preview-pane captures) show
    the before as spun sideways in the grass at 4 mph with the drift meter
    pegged, and the after as square on the racing surface at 30 mph.
    NOTE for future harness work: `setArchetype` / `equip` apply on the next
    frame, so a synchronous `tractionInfo()` read straight after one returns
    the PREVIOUS build's numbers — await a tick or the sweep silently reports
    one build four times.

- **AI target prioritization (Phase 9d-ii-a).** Every AI weapon heuristic used
  to return `true` on the FIRST valid candidate it walked past in the `others`
  array, and the guided LOCK acquired whichever target was NEAREST. So with
  three cars in the cone an AI engaged whichever rig index came first, and a
  two-second Railgun cooldown was spent on the same shot a 0.4 s Autocannon
  would have taken. Candidates are now SCORED and the best one engaged, gated
  by a worthiness threshold so a marginal shot is held rather than spent.
  Single-AI only: this is "which target in front of me is worth engaging",
  never cross-AI focus-fire, which is a separate and much larger problem.
  - **The scoring is not heuristic guesswork about geometry — it resolves what
    the shot would actually DO.** `applyDamage` routes front/side hits into
    ARMOR and rear hits into the MOUNT with overflow continuing into chassis in
    the same hit, and the zone is fixed by the target's own heading against the
    line of fire, so `scoreCandidate` (ai.ts) can compute exactly which pool
    absorbs this particular shot and how much reaches the only pool that ends a
    fight. Weights in `AI_TARGET_WEIGHTS`, read as a ranking rather than as
    physical units: `finish` 3 (this shot empties their chassis — dominant, the
    only factor that clears any threshold on its own), `vulnerable` 1.6 (how
    far into the chassis they already are), `through` 1.2 (fraction of the
    damage that reaches chassis rather than being soaked), `breakthrough` 0.7
    (this shot strips the armor / disables the mount), `aim` 0.8 and `close`
    0.5 (shot confidence), `redundantControl` -0.6 (an EMP re-stunning an
    already-disrupted car), `sweepExtra` 0.3 per extra body a cone catches.
  - **Two of the spec's "wasted shot" cases fall out structurally rather than
    needing their own rule.** An Energy Shield bubble drives `through` toward
    0, so a shielded car is deprioritized without a shield-specific branch. And
    `breakthrough` is zero on a pool that is already gone — there is no second
    disable to win on a destroyed mount — which is measurable: a dead-mount
    target and a stripped-armor target with identical geometry and chassis
    score EXACTLY equal (2.300 / 2.300, browser-asserted). Note the dead mount
    is still often the better target, and correctly so: with the mount at zero
    the whole shot flows into chassis, which is precisely the spec's own
    "if armor/chassis on a different target is more productive" test.
  - **`fireThreshold(def, aggression)` is what turns scoring into discipline.**
    Aggression lowers it (a bold driver takes worse shots) and the weapon's own
    COOLDOWN raises it, because the cooldown is what a shot actually costs:
    resolved at the default aggression 0.5 the ladder runs Autocannon 0.50,
    Shotgun 0.57, EMP 0.67, Railgun 0.69, Rocket / Cluster / Hook 0.90. So the
    autocannon plinks at whatever is in front of it while the railgun waits for
    something worth two seconds. This is a deliberate behavior CHANGE, not only
    a re-ordering: a healthy car at the cone edge at long range is now passed
    over, and the same geometry with a nearly-dead car is taken.
  - **The decision is scored against the target the weapon can actually pick,
    never the best one in the cone** — otherwise it would be a lie for the two
    weapons that cannot choose. `shotShape(def)`: kinetic + disruption cones
    damage EVERYTHING inside them, so the value is the best candidate plus
    `sweepExtra` per extra body (a burst raking three cars is genuinely worth
    more, and a single target below threshold plus two more clears it); the
    Grappling Hook latches the NEAREST, so the nearest is what is judged
    (browser-verified: a 3.29-scoring hurt car further down the cone does NOT
    justify a hook shot whose cable would grab the 0.47-scoring healthy car in
    front of it); a guided launch goes where the LOCK points, so
    `wantsWeaponFire` takes an optional `lockedTargetId` and the harness
    threads `rig.locks[slot].targetId` through.
  - **Guided lock selection is a SEPARATE path and needed its own change.**
    `updateWeaponLock` (combat.ts) gained an optional `prefer` ranker: omitted
    it is nearest-first exactly as before, which is what the PLAYER keeps (a
    predictable, learnable rule for a human aiming their own nose); the harness
    passes `AiDriver.lockPreference` only for rigs that have an `AiDriver`.
    Ordering applies to ACQUISITION only — the pre-existing sticky-current-
    target rule runs first, so a preference can never make a lock thrash, which
    matters because switching resets the 0.9 s dwell to zero.
  - **Left unscored, deliberately.** `wantsAreaDrop` (Caltrops / Oil) is not a
    target-selection problem: the field lands on the ground behind the AI and
    catches whoever drives through it, so first-match in the drop zone is the
    same answer as best-match. Same reasoning for `wantsShield` (self-
    preservation) and `wantsBlades` (contact proximity). The Auto-Turret picks
    nearest inside `updateTurret`, a shared player+AI auto-fire path with no AI
    decision at all, so it is out of scope too.
  - **Verified** in `/dev/greenline-movement?glheadless=1`, including a real
    A/B against HEAD (the working changes were stashed to a patch, the tree
    reverted, the baseline measured, then restored and the patch confirmed
    byte-identical). Decisive single-shot A/B on identical geometry and state:
    the same `updateWeaponLock` call locks **ai-1** (closer, 15.1 m, full
    health) with the default ranker and **ai-2** (28.2 m, armor stripped,
    chassis 24/105) with the AI preference — and live in-game the AI-driven
    player locked ai-2 on 306 of 306 samples and sent all 220 sampled
    projectiles at it, never once at the closer healthy car. Ranking assertions
    through the real functions: hurt-and-far 3.16 over healthy-and-near 0.70;
    unshielded 2.53 over equally-hurt-but-shielded 0.86; not-yet-disrupted 0.92
    over already-disrupted 0.34. Regressions held: one centered mid-range
    target fires (autocannon, railgun, and a locked rocket), zero targets /
    out-of-range / behind all hold. Race-level A/B, 8 cars, Proving Ground 07,
    same config: the mean chassis fraction of the car an AI had LOCKED was
    **0.725 against a 0.711 field average on HEAD** (health-blind, marginally
    healthier than average) and **0.624 against a 0.712 field average with the
    change** (systematically pointed at hurt cars), over 93 and 278 samples;
    damage per aimed shot 44.3 -> 51.8. Both races ran clean (0 falls, all
    upright, laps completed, every weapon class firing, no console errors).
    Debug: `__greenline.aiTargets(rigId, slot)` returns the scored best-first
    candidate list the decision reads plus that weapon's threshold.
    Observation, NOT claimed as caused: the new-build races logged more flips
    (7 in 105 s vs 1 in 82 s) — single-race variance on this metric is large
    and pile-ups are a driving/contact outcome, but it is worth watching in
    9d-ii-b. `svelte-check` clean, 0 errors, 0 new warnings.

- **Cross-slot coordination + weighted fit pools (Phase 9d-ii-b).** The two
  weapon slots each ran their own `wantsX` in a FIXED ORDER and the harness
  fired the first one that said yes, so `weaponPrimary` won every contested
  frame by nothing more than being checked first. Wrong twice over: it spent a
  2 s Railgun cooldown on a car the 0.4 s Autocannon in the other slot was
  about to kill, and it fired an EMP and a gun at the same rival as two
  unrelated coincidences rather than as a stun and the shot that stun bought.
  - **Intents, not booleans.** `AiDriver.weaponIntent` returns a `WeaponIntent`
    (the 9d-ii-a score of the shot the slot would REALLY take, the car it lands
    on, whether it kills, whether that car is already disrupted, and the
    effective cooldown); `wantsWeaponFire` is now a thin `!!weaponIntent(...)`
    wrapper, so 9d-ii-a's API and every one of its assertions are untouched.
    **No second scoring system exists** — the arbitration compares intents by
    the MARGIN over each weapon's own `fireThreshold`, which already encodes
    what that weapon's cooldown demands of it, so "is this shot worth it" is
    asked once and reused.
  - **`chooseWeaponIntent(a, b)` is the whole policy, in order:** (1) FINISH
    FIRST — a shot that empties the chassis outranks everything, and when BOTH
    would kill, the CHEAPER cooldown takes it (that IS the overkill deferral:
    the expensive gun is held for a target the cheap one cannot close); (2)
    CONTROL FIRST — same target, one control tool and one damage weapon, target
    not already disrupted, land the control effect; deliberately BELOW rule 1,
    because if you can kill it now a stun is a wasted cooldown; (3) BEST
    OPPORTUNITY — higher margin, ties to the shorter cooldown. Rule 3 is what
    keeps a Railgun off ordinary traffic with no special case: on a healthy car
    the Autocannon's margin is bigger, on a nearly-dead one the Railgun's is.
  - **The follow-up is a real signal, not a hope.** `markControlLanded` stamps
    a per-driver FOCUS (one target id + one expiry — the light cross-slot
    signal, not a synchronous rework of the tick), lasting the control effect's
    OWN duration floored at 1.2 s. `AI_TARGET_WEIGHTS.focus` (1, between
    `through` 1.2 and `vulnerable` 1.6, far under `finish` 3) then pulls BOTH
    the other slot's fire decision and the guided lock preference onto that car
    — a strong pull that a genuine kill elsewhere still beats. It is zero
    whenever no focus is live, which is why every 9d-ii-a score is unchanged.
    The intent's `targetId` IS the car the shot lands on (the hook takes the
    nearest, the EMP cone certainly catches its best candidate), so learning
    what was hit needed no plumbing through `performWeaponFire`.
  - **Judgment calls.** Arbitration runs only when BOTH slots produce AIMED
    intents; if either is an unaimed shape (area drop, blades, panic shield) the
    old slot order stands, because an oil slick landing behind you and a gun
    pointed ahead are not competing for the same opportunity — there is nothing
    to arbitrate. For the same reason the **Oil Slick is excluded from the
    control-first rule** even though it is a control tool: it is dropped behind
    with no known victim at the moment it is spent, so there is no car to follow
    up on. `isControlWeapon` is therefore EMP + Hook only. At most one weapon
    still fires per rig per frame, exactly as before; only WHICH one changed.
  - **Fit pools (the light half).** `AI_WEAPONS`/`AI_ABILITIES` were flat arrays
    indexed `(k-1) % 8`, which worked only because that list happened to cycle
    a/v/h/s in step with `AI_ARCHS` — an invisible invariant any added entry
    would silently break. They are now `AI_WEAPON_FITS`/`AI_ABILITY_FITS`, POOLS
    KEYED BY ARCHETYPE (23 weapon fits, 16 ability fits, up from 8 and 4),
    weighted-random per car in `aiLoadoutFor`, rolled ONCE at field-build time
    exactly like `simulatedAiQualMs` (Phase 9b) — so fits vary race to race and
    a `resetRound` re-runs the SAME field. Weights, not equal chances: the three
    Phase 8g weapons keep the heaviest weight in their archetype, so a small
    field still USUALLY showcases them — a deliberate downgrade from the old
    GUARANTEE, since randomization is the point and a guarantee is determinism
    wearing a different hat. Nothing here reads the track, the opponents, or the
    standings; it is variety in what shows up to race, not strategy.
  - **Verified** in `/dev/greenline-movement?glheadless=1`. Arbitration, driven
    through the real functions: healthy target -> Autocannon (margin 0.54) beats
    Railgun (0.47), the big gun held; badly hurt target the Autocannon cannot
    close -> Railgun wins with a KILL (margin 5.81); both would kill -> the
    0.4 s Autocannon takes it and the 2.0 s Railgun stands down; EMP beats
    Autocannon on an undisrupted shared target DESPITE a lower margin (0.34 vs
    0.54) — the sequencing rule overriding raw opportunity — and yields to the
    Autocannon the moment that shot is a kill; against an already-disrupted car
    the EMP does not even want to fire (9d-ii-a's `redundantControl` already
    handles it). **Slot-order independence**: the same weapon wins whichever
    slot holds it, in all three cases — the thing that was broken. **Live
    sequencing**, AI-driven and repeating in the sim: EMP fires -> focus set ->
    Autocannon fires inside that window, cycling every EMP cooldown; and the
    decisive redirect, hook + autocannon with two rivals that DISAGREE (a near
    healthy car the hook grabs, a far chassis-chewed car the autocannon
    prefers) — 16/16 clean split, `focus=none` aims the far car 12/12,
    `focus=ai-2` aims the hooked car 4/4. Focus arithmetic: exactly +1.000 on
    the focused car, top of the ranking during the window, EXACTLY back to
    baseline after it expires, and +1.000 on the guided lock preference too.
    **9d-ii-a unaffected**: every assertion reproduces to 3 decimals (3.157 /
    0.701, 2.535 / 0.858, 0.922 / 0.344, the 2.300 / 2.300 no-second-disable
    tie, all seven thresholds, and the hold/fire regressions). **Fits**: all 92
    authored weapon x ability combinations survive `sanitizeLoadout` untouched
    with legal distinct sockets; 7 field rebuilds gave 7 distinct fields (16
    weapon pairs, 11 ability pairs seen), and two `resetRound` calls left the
    field byte-identical. Debug: `__greenline.aiIntents(rigId)` (both intents,
    the arbitration's pick, the live focus) and `getFits()`. A full 8-car race
    ran clean: all upright, 0 falls, finite, every weapon class and all five
    AI-used abilities firing, 7 distinct rolled fits, laps completed, no console
    errors. **No perf cost**: 1.6 to 1.94 ms mean frame CPU at 8 cars against a
    1.89 ms HEAD baseline (same track, same field size), measured with the same
    revert-to-HEAD A/B as 9d-ii-a.
  - **HARNESS TRAP that cost a debugging pass, worth knowing before reading
    `__greenline.perf()` again:** its stats are a ROLLING ~240-frame (~4 s)
    window, so a reading taken during or straight after your own scripted
    instrumentation measures the instrumentation. Console-driven scenario
    pinning (teleport + health at 20-50 Hz) and `aiIntents` sampling across 7
    rigs read 16 to 29 ms mean and looked exactly like a regression; the same
    build on a quiet window reads 1.6. Stop every sampler, wait past the window,
    then read.

- **Informed branch strategy + real pit stops (Phase 9d-iii), the last stage of
  the AI overhaul.** Two things: the route gamble reads the driver's actual
  situation, and a car that takes the pit lane now genuinely STOPS in the box.
  - **Branch choice is the same weighted coin flip, differently weighted.** Not
    a new framework: still one probability and one `rand()` in `chooseRoute`,
    but `branchProbability(RouteChoice)` sets it from three real signals instead
    of aggression alone. `ROUTE_CHOICE`: base 0.12, aggression 0.35, race
    position 0.30, damage -0.45, clamped to [0.05, 0.85]. Health is CHASSIS
    fraction (the only pool that ends a race, and the same pool the pit trigger
    reads, so "hurt" means one thing); position is `positionFrac`, 0 leading to
    1 last. Calibrated so the FIELD-WIDE shortcut rate barely moves and only its
    DISTRIBUTION changes — a healthy mid-field car sits at 0.445 against the old
    flat 0.425 — while a car at the back is twice as likely to gamble as the
    leader (0.595 vs 0.295) and a half-chassis car is half as likely as a
    healthy one (0.220 vs 0.445). The 0.05 floor is deliberate: a beaten-up
    leader should almost never take the risky line, but never being able to is
    its own kind of predictable.
  - **Race position reuses the standings, it does not invent a second ranking.**
    The ordering function was hoisted out of the HUD standings block into
    `standingScore(rig)` (laps > checkpoints > distance to the next gate;
    finished cars hold their position, eliminated sink) and `racePositionFrac`
    counts how many cars outrank you. ONE function, two consumers, so "who is
    ahead" can never mean two different things. No artifact at the decision
    moment: every car decides at ITS OWN line crossing, so the lap it just
    banked is banked for whoever crossed earlier too.
  - **The pit stop is the genuinely new behaviour.** Phase 9c only ever
    RE-ROUTED a hurt car onto the pit lane; it then drove through the repair box
    at racing speed and healed nothing, because the box pays out only to a car
    that is stopped. `AiDriver` now owns a `PitPhase` state machine
    (`none | approach | stopping | held`) layered ON TOP of route following
    rather than beside it, and the layering is the design: **the box is fed into
    the existing braking-distance integral as a corner whose corner speed is
    ZERO**, so the approach brakes with exactly the same math that slows the car
    for a hairpin and there is no second speed controller to fight the first.
    Only the final hold short-circuits `drive()`. `startPitStop(routeIdx, now)`
    sets the route AND finds the box (nearest route point to the nearest pit
    zone); the aim point sits half a radius PAST the centre so a marginally
    short stop still comes to rest inside.
  - **Holding still needed the handbrake, and that is not a detail.** `brake` at
    a standstill is REVERSE in this harness (the S-key semantics), so a parked
    car holding the brake drives itself back out of the box — and if it had
    drifted even slightly backwards, out under power. `AiControls` gained an
    optional `handbrake` (false on every normal AI driving frame; the AI does
    not drift) and the held state uses it ALONE, with `brake` restricted to the
    `stopping` phase, which by construction means the car rolled in under power
    and is still moving forward.
  - **Resume, and three ways a stop can end.** Health: `PIT_AI_RESUME_FRAC` 0.9
    of TOTAL pools, checked in the harness right where the repair is applied so
    a car leaves on the frame it is fixed. Total rather than chassis because the
    two things worth stopping for are a chewed hull and a destroyed mount, and
    0.9 of the budget is unreachable with a dead mount on any archetype (the
    smallest mount share is 25%) — one number, no second clause. Time:
    `PIT_HOLD_MAX_SEC` 6 (a car that CANNOT heal rejoins instead of parking
    forever) and `PIT_COMMIT_MAX_SEC` 30 (a car that never arrives gives up),
    both owned by the driver since it owns the clock it is stopped against.
    Plus a fourth, geometric: if the box ends up more than half a lap ahead the
    car has driven past it, so the stop is abandoned rather than crawling a
    whole lap back — browser-observed firing correctly. `endPitStop` deliberately
    does NOT touch the route: the car is mid-lap on the pit lane and has to
    finish driving it to rejoin lawfully (the lane is a grouped-checkpoint
    alternative).
  - **Verified** in `/dev/greenline-movement?glheadless=1` on BOTH tracks.
    Branch choice, measured through the REAL `chooseRoute` against the real
    runtime, 4000 laps per cell: healthy leader 0.302, healthy last 0.598
    (2.0x), healthy mid 0.442, half-chassis mid 0.213 (half of healthy),
    quarter-chassis leader 0.055 (the floor) — every cell within sampling noise
    of its analytic probability, aggression still spanning 0.27 to 0.62, and the
    PIT lane never once gambled onto across 20,000 trials. The pit stop, traced
    live on Proving Ground 07: `route 0 -> 1 (PIT COMMITTED)` at total 0.120
    with a dead mount, `approach` at 42.4 m/s, `stopping` on entering the box at
    13.7, `held` at 0.13 m/s, healed while parked, resumed, and rejoined the
    main line on the next lap. **The heal is the box's, proven in isolation**:
    with the ability meter starved to zero every tick (so Overcharge Repair
    could not fire) a parked car healed monotonically across 18 consecutive
    samples at **123.5 health/sec against the configured 125**, 0.143 -> 0.915
    total, mount revived, then released the frame it crossed 0.9. The same trace
    on TERMINAL NINE, on a 416-point ARMOR build: `approach` at 31.5 m/s ->
    `stopping` at 16.7 -> `held` at 0.16 with a dead mount and total 0.101 ->
    **320.2 points restored over 2.60 s = 125.4 health/sec**, mount revived,
    released at 0.901, drove away. Speed reads 0.00 while held, so the handbrake
    hold is solid. The approach profile is clean rather than a slam: 32.8 m/s at
    28 m out, 18.6 at 8 m, 4.1 at 0.1 m from the box centre.
  - **Race regression, and a measurement trap worth recording.** Multi-second
    stationary periods DO occur in an 8-car pack on both tracks — but they are
    pre-existing (the AI stuck-detector and pack contact), not new. Same-config
    HEAD A/B: Terminal Nine HEAD's worst non-pit stall was **6250 ms at 84 s**
    against this build's **5750 ms at 138 s**; Proving Ground HEAD **8250 ms at
    61 s** against **9250 ms at 81 s**, with HEAD at 7/8 upright and this build
    at 8/8. Clean races on both tracks ran all-upright, all-finite, 0 falls on
    Proving Ground, laps progressing, no console errors. **The trap:** an early
    stress run that held three of eight cars pinned at 30% health for two
    minutes produced 5/8 upright and a 15 s stall — entirely an artifact of the
    test, not the feature (the field recovered to 8/8 as soon as the injection
    stopped). Do not read a deliberately-wrecked field as a regression signal.
  - **Accepted behaviour, not a bug:** a car whose lap decision fires while the
    box is already behind it commits, notices within a frame or two, and
    abandons — observed live on both tracks. It races on and pits properly at
    the next crossing rather than crawling backwards to a box it has passed.

- **Track builder, stage 1 (dev tool): `/dev/greenline-track-builder`.** An
  internal authoring tool that builds tracks from snap-together pieces and
  exports real schema-v2 `TrackData`. Dev-gated exactly like the other
  harnesses (404 in production, no auth, no Supabase). Lives in
  `src/lib/greenline/builder/`: `pieces.ts` (piece model + compiler, pure math
  — no three/cannon/Svelte, so it is scriptable from the console),
  `validate.ts` (serialization + validation report), `Builder2D.svelte`,
  `Builder3D.svelte`, `TrackBuilder.svelte`.
  - **Placement model, Trackmania-style.** A piece carries an ENTRY and an EXIT
    socket (position, heading, elevation, bank, width). Placing appends after
    the selected piece and its entry socket IS the previous piece's exit
    socket; the piece's own parameters (length / radius / turn angle /
    elevation delta / bank / width) decide where its exit lands. **There are no
    typed coordinates anywhere**, so the corridor is continuous BY
    CONSTRUCTION and editing an early piece re-derives everything downstream
    (browser-verified: widening one curve's radius moved every later exit and
    the loop still closed). Pieces: start/finish, straight, curve L/R at two
    radii, banked turn L/R, jump ramp, chicane L/R, and a `loop-close`
    connector whose geometry is DERIVED (a cubic Hermite from the current exit
    back to the track start, resampled to even spacing), so closing the loop
    survives edits to any earlier piece.
  - **The two documented authoring rules are enforced by the compiler, not
    left to the author.** (1) The Phase 8a banked-centerline raise: every
    sample's elevation is lifted to at least `halfWidth * sin(|bank|)` (+1 cm
    for the export's 2-dp rounding) so the low edge always clears the y=0
    catch plane. (2) The Terminal Nine run-off margin lesson: the generated
    boundary offset shrinks from the flat 9 m toward 1.8 m as the ribbon edge
    rises, wall-tight by deck height (3 m), so a car engages the soft wall
    instead of falling off a deck edge.
  - **Validation runs the game's REAL code paths, which is the whole promise:**
    a track that validates in the tool is provably LOADABLE, not merely
    plausibly shaped. The exported JSON STRING is parsed back through
    `parseTrack` (the exact load-time validator `tracks.ts` runs) and swept
    through `buildRuntime`, and the catch-plane check reads the resulting
    `leftEdge3`/`rightEdge3` — so the banked rule is verified against the same
    geometry the physics trimesh would collide with, never against the tool's
    own math. The remaining checks (grade, margins, closure, self-overlap) are
    advisory authoring lints, warnings not failures. A 2D crossing with real
    elevation difference is a legitimate flyover and passes.
  - **Surfaces.** The 2D top-down SVG canvas is the placement view (world
    meters ARE the SVG units; drag pan, cursor-anchored wheel zoom, click a
    piece to select, double-click refit) and draws the corridor from the
    runtime's own `leftEdge`/`rightEdge`. The live 3D panel (the GaragePreview
    convention: own scene/renderer/OrbitControls, dynamic browser-only imports,
    full disposal) builds its ribbon mesh straight from `leftEdge3`/
    `rightEdge3`, so **both views read one geometry and cannot drift**. A dim
    grid marks the y=0 catch plane so banked pieces are visibly ON it. The
    inspector tunes the selected piece numerically, live in both views.
  - **3D auto-frame is a real fit-to-bounds solve** (bounding sphere against
    the tighter of the two half-FOVs), NOT a fixed multiple of the track span:
    the multiple approach pushed the near corner of the circuit outside the
    frustum at this panel's aspect, which is how the selected piece could end
    up off-screen. A resize refits unless the user has taken the camera.
  - **Auto-placed gates sit BETWEEN samples, never on one.** A gate exactly on
    a centerline point is degenerate: a vehicle passing through that point
    meets the gate line at a motion-segment endpoint, and `crossesGate`
    accepts t at both 0 and 1, so the gate registers on two consecutive
    segments and the second is reported out-of-order. Laps still counted, but
    the spurious rejections are confusing; midpoint placement removed them
    (browser-verified 0 rejections on three different racing lines, against 6
    before).
  - **Export** serializes stable key order at 2 dp (the committed tracks'
    convention) with empty `zones`/`props` arrays. Copy or download, then drop
    the file into `tracks/` and add one import plus one entry in `tracks.ts`.
    The piece sequence persists per browser in `localStorage`
    (`greenline_track_builder_v1`), restored with its structural invariants
    re-imposed (one start/finish first, loop-close last).
  - **`window.__glBuilder`** (the `__greenline` convention) drives everything
    from the console — `addPiece` / `setParam` / `select` / `movePiece` /
    `removePiece` / `getCompiled` / `validateNow` / `exportJson` / `probe3d`.
    Since a WebGL canvas cannot be screenshotted through the preview pane (it
    hangs), `probe3d(cols, rows)` reads the REAL framebuffer back and returns
    pixel counts, a color histogram, and a coarse ASCII occupancy grid — that
    is the verification surface for the 3D panel.
  - **Verified** in the harness: an 8-piece circuit (straight, banked turn,
    jump, chicane, curves, loop-close; 872 m, 220 pts) exports and passes all
    nine checks; the banked turn's low edge sits at exactly y 0 with the rule
    and would sit at **-2.16 m without it** (measured A/B), and a 30° bank
    auto-raised to exactly the predicted 3.51 m; **439 of 440** points of the
    2D view's edge data projected through the 3D camera land on lit pixels in
    the real framebuffer (99.8%), proving the two views show the same track;
    the exported file drives a clean lap through the game's own `LapTracker`
    (`timing-started, checkpoint, checkpoint, lap`) with zero rejections; and
    the flat/open-track branch correctly omits the `elevations`/`banking`
    arrays and reads `hasRelief: false`. `svelte-check` clean, 0 errors.
- **Track builder, stage 2: zones, authored checkpoints, fork/merge pieces.**
  Closes everything stage 1 deferred. The socket model is GENERALIZED rather
  than special-cased, and the result is represented the way 8b already
  represents a split, so nothing new was invented beside the real system.
  - **Fork/merge as extra SOCKETS, not a new piece kind.** A piece takes one
    entry socket and returns its samples plus its exits; most return a single
    `exit`, so the chain stays linear. A FORK also returns a `branch` socket
    (one entry, two exits) which seeds a nested sub-chain; that sub-chain's
    terminating MERGE is a DERIVED connector back onto the main line (two
    entries, one exit), reusing the exact Hermite machinery `loop-close`
    already used — so a rejoin survives edits to any earlier piece, like loop
    closure does. The branch is stored NESTED on the fork
    (`PlacedPiece.branch`), which is what makes "delete the fork" unambiguously
    mean "delete its branch too" and lets the UI show the split as two visible
    sub-sequences (indented, blue-railed) instead of a flat list with a flag.
  - **It maps ONTO `surface.branches[]`, it does not reinterpret it.** The
    branch emits one `RibbonBranch` whose first and last points are EXACTLY
    `main[joinStart]` / `main[joinEnd]` — verified against Terminal Nine, whose
    two branches share both endpoints to 0.00 m. `buildRuntime` then produces
    `paths[]` and spliced lap `routes[]` with no builder-side help. Lane index
    and `runtime.paths` index are the same number by construction, which is
    what lets a piece on a branch find its own edges in both views.
  - **Zones are authored as an EXTENT along a piece, compiled to the circles
    the runtime reads.** `TrackZone` is strictly circular (`zoneEntries` is a
    top-down radius test), so an extent (pieceId + start/end fraction + radius)
    is laid down as a chain of circles spaced 2r (tangent), never overlapping,
    so a car is inside at most one at a time. Anchoring to a PIECE is what
    stops drift: retuning the piece moves the zone with it (browser-verified —
    extending a piece 80 -> 200 m moved its boost zone from x 114 to x 150,
    holding its authored fraction). **A PIT box is capped at ONE circle on
    purpose:** the harness heals per occupied pit zone per frame, so
    overlapping pit circles would multiply the repair rate.
  - **A branch carrying a pit box is named `pit-*`, and that is load-bearing.**
    `buildRuntime` fills `pitRoutes` from the branch id prefix ALONE
    (`p.id === 'branch:pit' || p.id.startsWith('branch:pit-')`), and the AI's
    `startPitStop` only ever diverts onto a route in that list — so a pit lane
    named `branch-2` would be invisible to the AI. The compiler names the lane
    from its zone, and a check reports the resulting `pitRoutes`. No runtime
    change was needed; this is an existing convention the builder must honor.
  - **Gate ordering is measured from the START/FINISH LINE, wrapping.** Sorting
    by raw arc length is wrong on a closed loop: a gate placed just before the
    line sorts first when a car actually reaches it last (found live). Branch
    gates map onto the point in the bypassed stretch their progress
    corresponds to, so a grouped alternative lands beside its main sibling, and
    a contiguity pass emits each group together as the schema requires. The
    stage-1 between-samples gate placement now applies to EVERY gate.
  - **The rule Terminal Nine learned the hard way is enforced:** an UNGROUPED
    checkpoint inside a stretch a branch bypasses is a FAIL, because a shortcut
    car can never cross it and that route's lap can never complete. A one-click
    SPLIT PAIR drops both halves already sharing a group.
  - **Boundaries for a split.** The enclosing loop is pushed out past the
    branch on the branch's side, then an ISLAND fills the lens between the two
    corridors (Terminal Nine's `depot-block` / `pit-wall` convention) — without
    it a driver just cuts across instead of committing to a route. Two things
    were wrong on the first attempt and are worth keeping in mind: the island
    must be CLIPPED to the run where a real gap exists (the corridors converge
    to nothing at both joins, so a full-span island folds through itself), and
    the enclosing push cannot be applied only at the branch's nearest main
    index — a boundary point moves along its OWN normal, so a diagonal branch
    is shadowed by a whole span of main indices and widening only the nearest
    few leaves a notch the branch pokes through (measured: 8 samples up to
    11.2 m inside the infield). Every main index within a 40 m tangential
    window is pushed, then a running max closes residual notches.
  - **Validation gained the checks a graph needs, all on real code paths.**
    Beyond stage 1's `parseTrack` / `buildRuntime` / catch-plane: branch join
    endpoints match to 0.000 m; every lane centerline is driven through the
    real `surfaceState` (0 wall violations, 0 off-ribbon) rather than trusting
    the polygon construction; the lens between branch and main is probed and
    must be REJECTED (100% blocked); zone circles must sit on drivable ribbon;
    and every lap ROUTE is driven through the real `LapTracker`. Rejections are
    split into `spurious` and `pre-start roll-up`, because a gate crossed
    between the spawn and the timing line is correctly `not-started` and is not
    a defect.
  - **Verified end to end** on a 1699 m circuit with BOTH a shortcut fork
    (357 m vs 452 m bypassed) and a pit-lane fork (240 m vs 192 m, deliberately
    longer), a banked turn, a jump, and all three zone kinds: all 18 checks
    pass, and **all three lap routes complete with 0 spurious rejections** and
    checkpoints in order across 4 sequence steps. The 3D preview builds 3 path
    meshes and **1157 of 1162** points of the 2D view's edge data project onto
    lit pixels in the real framebuffer (99.6%, per path 99.5 / 99.5 / 100).
    Zone discs confirmed by differential probe (boost 13 -> 31, hazard 16 -> 46
    px as radii grow, restoring exactly). Reintroducing the Terminal Nine bug
    is caught TWO independent ways: the dedicated rule FAILs, and route 1
    independently drops to 0 laps while routes 0 and 2 still complete. The full
    document survives a real reload byte-identically (same 87,575-byte export).
    Stage-1 regression intact: a linear circuit still compiles to 1 lane /
    1 path / 1 route, 872 m, 220 pts, with no `branches` key.
  - **Still deliberately NOT built:** props / scenery authoring, and nested
    forks (a branch may not contain another fork or a second merge).
- **Track builder: teacher-gated on the live site, plus one-click Test Drive.**
  (The teacher gate + hidden `/dev` location in this bullet are SUPERSEDED by
  the community-tracks bullet below: the builder now lives at
  `/greenline/builder`, open to any signed-in user and linked from the title
  screen. The Test Drive mechanics, the parked-track store, and the picker
  behavior described here are unchanged.)
  The builder is a real authoring tool, so it had to leave the dev-only tier
  without becoming discoverable.
  - **Access.** `/dev/greenline-track-builder` swapped its
    `if (!dev) error(404)` universal load for a `+page.server.ts` that reuses
    the portal's EXISTING role model — no new auth: the role comes from the
    Google sign-in email domain (`role_for_email`, @boscotech.edu -> teacher)
    and lives in `profiles`, so it is looked up server-side exactly like
    `/dashboard`. Everyone else gets a **404, deliberately
    not the redirect those two use**: 404 is what the path has always
    returned and tells a probing student nothing. The route stays unlinked
    from every nav surface. **`/dev` must NOT be added to `authedPrefixes`** —
    that would bounce anonymous visitors with a redirect instead of the 404
    and sweep in every other harness.
  - **The parked track is its own localStorage entry**
    (`greenline_custom_track`, `custom-track.svelte.ts`), extending the Phase
    8e split one level down: "which track" is already independent of "which
    build", and the authored track DATA is in turn independent of which track
    is selected. Selecting it is still just
    `setSelectedTrack(CUSTOM_TRACK_ID)`. `tracks.ts` owns the catalog slot
    (`custom-builder`) and resolves it through a **lazy** read + a
    `registerCustomTrack` hook (the `registerDecalImage` convention), so it has
    no module-evaluation-order dependency on the reactive store that writes it.
  - **Test Drive hands over the LIVE `compiled.track`**, not the export string
    — the export rounds every coordinate to 2 dp for committed files
    (browser-verified: a stored coordinate reads 27.39130434782609, not 27.39).
    It then writes the selection and navigates to `/greenline?race=1`, a
    one-shot auto-start that waits for the build to load. The race itself is
    reached through the completely unmodified path: same store, same
    `loadTrack`, same `GreenlineRace`. Nothing builder-specific enters the race.
  - **A builder run is UNRANKED**, reusing the existing creative flag rather
    than inventing a mode: a scratch track changes every time it is re-authored,
    so its times compare to nothing and its payout would be free IC from a
    trivially short loop.
  - **Picker.** The garage tile shows a `BUILDER` tag the same way
    `relief-proof-01` shows `TEST` (`TrackKind` gained `'custom'`; any
    non-`circuit` kind is labelled). The entry appears only while a track is
    parked. `/dev/greenline-portal` and `/dev/greenline-movement` both read
    `allTracks()` now, so `?track=custom-builder` races a parked track and the
    picker is verifiable without a signed-in session.
  - **Verified**: the shipped guard function driven directly with mocked
    `locals` — logged out / student / visitor / no-profile-row all 404, teacher
    renders — plus a live logged-out `curl` returning 404 while the other
    harnesses still serve 200. End to end with the guard temporarily bypassed
    (then restored and re-proven): the real TEST DRIVE button parked a track
    with a branch and a boost zone, set the selection, and navigated; the real
    race then mounted **that exact track** (name, 2 paths, `branch-1`, its zone
    circles, 4-car AI field) with real lap tracking (3 AI laps, 0 falls), and
    Terminal Nine afterwards still loaded its own 3 paths unaffected.
    **Not verifiable without the user's own login:** the live teacher-session
    render and the `?race=1` landing, since both need real Google OAuth.

- **Piece-chain builder promoted to production + REVIEW-BEFORE-VISIBLE
  (migration `0059`).** Two changes that ship together because the first
  requires the second.
  - **The route.** `/greenline/piece-builder` is the real portal home of the v3
    piece-chain builder, open to ANY signed-in user (no role gate; students are
    the intended authors). It carries no `+page.server.ts`: `/greenline` is in
    `authedPrefixes`, so it inherits the standard guard exactly like its sibling
    `/greenline/builder` — anonymous visitors 303 to `/` (verified by curl on
    all three greenline routes). `/dev/greenline-piece-builder` stays as the dev
    harness (plain dev-404, an in-memory publish fake). Entry point: a second
    **PIECE EDITOR** button beside TRACK EDITOR under START on the title screen
    (`GreenlineTitle`'s new optional `onPieceBuilder`; the two builders author
    different surface kinds, so they are separate doors, not modes of one tool).
    `PieceChainBuilder` gained `onPublish` (the ribbon `TrackBuilder`'s exact
    shape, so both builders feed ONE pipeline) and `playtestTarget`
    (`'portal'` → `setSelectedTrack` + `/greenline?race=1`, the ribbon builder's
    Test Drive path; `'harness'` → the dev movement harness, which 404s in
    production). The raw JSON export is untouched and stays the path for a track
    destined to be committed to `tracks/`.
  - **v3 compatibility: no mismatch, confirmed not assumed.** `greenline_tracks.
    data` is `jsonb`; `validatePublishTrack` runs the real `parseTrack` /
    `buildRuntime` / `surfaceState` / `LapTracker` (all version-agnostic) and
    already narrows its branch-join check to `surface.type === 'ribbon'` with a
    note that a v3 chain is closure-validated by the compiler; `lapLengthM` has
    a pieces branch. Browser-proven end to end: a 4-piece v3 chain exported from
    the builder passed the REAL `validatePublishTrack` (the exact function the
    publish endpoint gates on), stored with `schemaVersion 3` / `surface.type
    'pieces'`, and raced after approval. Only a stale "(schema v2)" comment in
    0057 was wrong.
  - **THE REAL MISMATCH, and why 0059 exists.** 0057 shipped
    publish-then-moderate: its RLS select was `not removed or author or
    teacher`, `greenline_track_list()` returned every non-removed row to every
    signed-in user, and `attempt_start` accepted any non-removed track — 0058's
    `featured` governs RANKED eligibility ONLY, never visibility. So wiring a
    student-facing builder into publish as-is would have made every submission
    instantly visible and playable school-wide. `0059_greenline_track_review.sql`
    (apply after 0058) makes the pipeline moderate-then-publish, EXTENDING the
    existing tables/panel/endpoint rather than forking them: a `status`
    (`pending` default / `approved` / `rejected`) plus `review_feedback` /
    `reviewed_at` / `reviewed_by`, and the gate applied at every path that could
    expose a track — the RLS select policy (**the actual boundary**, since the
    client plays a track by SELECTing its `data` straight from the table, so an
    unreadable row is an unplayable one), the list RPC, `attempt_start`, `rate`,
    `report`, `set_featured`, and the ranked `submit_race_result` gate. Defense
    in depth on purpose: the policy alone is the boundary, the rest are so a
    bypass of any one still fails closed. The publish endpoint inserts
    `status: 'pending'` EXPLICITLY (it runs with the service-role key, which
    bypasses RLS and the column default) and fails closed with a clear
    "apply 0059" 503 on a backend without the column.
  - **`greenline_track_review(id, action, feedback)`** is the teacher decision
    RPC, mirroring `greenline_decal_review` (0051): approve, or send back with a
    REQUIRED note; never deletes; revoking approval also revokes `featured`
    (ranked play is a superset of visible play). `is_teacher()` is enforced
    inside the function, so the route's 404 stays convenience. The moderation
    panel gained a status chip, an AWAITING-REVIEW-first default sort with a
    pending count, APPROVE / REQUEST CHANGES (inline note box, SEND BACK
    disabled until non-empty), and FEATURE disabled on anything unapproved.
    The garage tile shows an author their own submission's state (`IN REVIEW` /
    `CHANGES ASKED` + the teacher's note in the tooltip, amber not green).
  - **Backfill decision, deliberate and flagged:** existing rows are set to
    `approved`, because they were published under 0057's contract and are
    already publicly visible — approving them preserves the status quo exactly
    and makes nothing NEWLY visible, whereas resetting them would silently
    unpublish real student work. Everything submitted from 0059 forward is
    pending. The migration header carries the one-line
    `update public.greenline_tracks set status = 'pending';` for a teacher who
    would rather re-review the whole existing corpus.
  - **Verified** in `/dev/greenline-portal`, whose two-user in-memory store was
    extended to mirror the 0059 semantics (one `devVisibleTo` predicate gating
    BOTH the list and `syncRegistry`, so a track missing from the registry is
    genuinely unresolvable by `loadTrack`, not merely unlisted): submit as A →
    stored `pending`; **A sees + can play it, B sees nothing (`sectionPresent:
    false`, 0 listed) and `canPlay: false`**; teacher approves → B sees + can
    play; teacher sends back → B loses both again while A keeps it with the
    feedback attached. Gates: featuring refused while unapproved and
    auto-revoked on send-back, rating refused while unapproved, reject with
    blank feedback refused. The panel was driven through REAL clicks (approve →
    chip flips; REQUEST CHANGES → note box, SEND BACK disabled empty, enabled
    with text, note stored and shown). `svelte-check` clean, 0 errors.
  - **NOT verified, and it is the verification this change most wants:** the
    deployed two-account test on the live site, and whether 0057/0058 are even
    applied in production. The local `.env` is entirely placeholder
    (`example-ref`, no `SUPABASE_SERVICE_ROLE_KEY`) and there is no
    psql/docker/supabase/vercel CLI available, so the 0059 SQL has NOT been
    executed anywhere — it is review-verified only, per the repo's RPC
    convention. Apply 0059 and re-run the boundary with two real accounts
    before trusting it in front of students.

- **Community tracks: publish / browse / rate / report + per-attempt telemetry
  (Bundle 4a, migration `0057`).** Any signed-in player can publish a
  builder-authored track for everyone, and race anyone else's — unranked
  (featuring, which makes a community track ranked, is Bundle 4b).
  - **Builder opened + relocated.** The real route is `/greenline/builder`
    (thin wrapper over `TrackBuilder`), auth by the standard `/greenline`
    authed prefix, ANY role — the teacher-only 404 guard is retired. Entry
    point: a quieter **TRACK EDITOR** button under START on the GREENLINE
    title screen (`GreenlineTitle`'s optional `onBuilder`).
    `/dev/greenline-track-builder` stays as the dev harness (plain dev-404
    guard again) and wires an in-memory publish fake that runs the REAL
    `validatePublishTrack`, so the publish UI incl. real rejection copy is
    drivable without auth.
  - **Publish is a SvelteKit endpoint, deliberately NOT a client RPC.**
    `POST /api/greenline-track-publish` is the ONE write path into
    `greenline_tracks`, because authoritative validation is
    `validatePublishTrack` (`src/lib/greenline/builder/validate.ts`): the
    SAME real code paths the builder's own report FAILs on, applied to raw
    TrackData — `parseTrack`, `buildRuntime`, the catch-plane edge scan, the
    branch-join endpoint match, a real `surfaceState` drive down every path's
    centerline, and a real `LapTracker` drive of every lap route (the
    compiled-document lints stay builder-side advisories). A failing
    submission is rejected outright (400 + reasons), never stored. The
    endpoint also requires a session (401 first), a non-empty name (cap 60,
    mirrored by the SQL CHECK), caps the body at 1.5 MB and total centerline
    samples at 20k (hostile-payload ceilings), stamps `author_name`
    server-side from `profiles` (display_name -> full_name -> email local
    part; never client-submitted), computes `length_m` from the validated
    data, and inserts with the server-only `SUPABASE_SERVICE_ROLE_KEY` (see
    Environment). There is NO authenticated insert grant and NO publish RPC —
    either would be a validation bypass. The builder's PUBLISH button (an
    optional `onPublish` seam on `TrackBuilder`) is gated on its own report
    passing, purely as UX; the server re-validates regardless.
  - **Data model (0057, apply manually after 0056):** `greenline_tracks`
    (author snapshot + `data` jsonb + `length_m` + `featured` default false
    for 4b + soft `removed` + `report_count`), `greenline_track_reports`
    (PK `(track_id, reporter_id)` = one report per user per track),
    `greenline_track_ratings` (PK `(track_id, user_id)`, 1-5, upsert so a
    re-rate CHANGES the row), `greenline_track_attempts` (ONE ROW PER
    ATTEMPT: `completed`, `completion_time_ms`, `wall_violations`,
    `started_at`/`finished_at`; a never-finished row is an abandoned run,
    distinct from an explicit fail). Telemetry aggregates (avg rating,
    completion rate, unique racers, avg time, avg wall violations) are
    DERIVED at query time by the SECURITY DEFINER `greenline_track_list()`
    RPC (one round trip, board-safe columns + caller fields
    mine/my_rating/can_rate/reported) — never pre-aggregated counters
    (`report_count` is the one deliberate exception, bumped transactionally
    with a genuinely-new report). Reads: non-removed rows to any signed-in
    user (authors see their own removed rows, teachers all); ratings public
    to signed-in; reports/attempts own-rows + teachers. ALL writes are
    definer RPCs pinned to `auth.uid()`: `greenline_track_report`
    (idempotent), `greenline_track_remove` (author OR `is_teacher()`, soft —
    history/ratings/attempts/board rows all kept),
    `greenline_track_rate` (server-checks a COMPLETED attempt in the
    attempts table, never self-reported), `greenline_track_attempt_start` /
    `_finish` (called by the race flow itself at start and finish/quit; a
    second finish on the same row is a no-op).
  - **Catalog + race path.** Community catalog ids are `community:<uuid>`
    (the row uuid is the STABLE identity results/attempts key on; it
    survives data re-reads and renames). `tracks.ts` gains a community
    registry: `registerCommunityTracks` (placeholder entries from the browse
    list, no geometry), `attachCommunityTrackData` (lazy fetch on selection,
    validated through `parseTrack`, row name wins for display), `loadTrack`
    falls back to the default until attached — and `startRace` AWAITS the
    attach so a community race can never silently mount the fallback. The
    garage GARAGE tab lists community tiles under a "Community tracks ·
    unranked" divider (COMMUNITY tag, ★ average + rating count, finish rate,
    author byline, REPORT once -> REPORTED, two-step REMOVE on your own),
    all presentation-only props (`communityMeta` keyed by catalog id +
    `onReportTrack`/`onRemoveTrack`). Racing one runs the completely
    unmodified race path, forced through the existing creative/unranked
    submit branch (`creative: ... || isCommunityTrackId(raceTrackId)`), but
    STILL opens/closes a real attempt row so telemetry accumulates from
    unranked play; quitting closes it as not-completed with the wall count
    (browser-close leaves it unfinished = abandoned). The results screen
    shows "COMMUNITY TRACK · unranked · no IC earned" and a RATE THIS TRACK
    star row (`GreenlineResults` `rating`/`onRate`/`ratingStatus` props):
    disabled until the server has a completed attempt, upsert on re-click.
  - **Wall-violation telemetry** (`GreenlineRace`): the player's soft-wall
    contacts are counted as boundary-violation ENTRY edges with a 1 s re-arm
    (the push-out jitter never machine-guns the count), MOUNT-scoped so
    mid-race round restarts accumulate into the one attempt. Rides
    `RaceOutcome.wallViolations`, the pause-menu `onQuit(info)` payload
    (existing callers ignoring the arg are unchanged), and
    `__greenline.getTelemetry().wallViolations`.
  - **Client seam** `src/lib/greenline/community.ts` (the persistence.ts
    convention, all fail-soft): pre-0057 / offline the garage simply shows
    no community section, publish reports its error, attempts/ratings no-op.
  - **Verified** (0 svelte-check errors): the REAL validator rejects garbage
    JSON, wrong-shaped objects, and structurally-broken tracks with real
    parseTrack reasons, and the signed-out endpoint probe returns 401 before
    anything else; in `/dev/greenline-portal` (in-memory store mirroring the
    0057 semantics, driving the REAL Garage/Results/registry + a two-user
    switch): publish as A -> visible + selectable as B, corrupt publish
    stores nothing, rating BLOCKED before any completed attempt AND after a
    failed one, allowed after a completed one, re-rate upserts (count stays
    1), report dedupes (count 1 after two clicks, REPORTED ✓), B cannot
    remove A's track, A's two-step self-remove delists it while the raw
    store keeps history, and the live race view mounts the ATTACHED
    community geometry (not the fallback) through the unmodified race path;
    in `/dev/greenline-movement?glheadless=1`: the wall counter reads 0 ->
    1 on a real boundary breach, stays 1 through rapid in/out jitter, 2
    after a clean re-entry + second breach, and the official-track AI field
    still races normally (79-104 m / 4 s, checkpoints advancing). The
    builder publish flow was driven end to end in its harness (disabled on
    a failing report, success through the real validator on a valid
    circuit). **Not verifiable without live credentials:** the real 0057
    SQL against a live Supabase (applied manually per convention) and the
    signed-in publish round trip on `ideabosco.com` (needs the service key
    + Google OAuth).
  - **Observation, pre-existing and not touched here:** a plain 4-corner
    convex rectangle of curve pieces can fail the builder's own
    "drives clean (real surfaceState)" check (the generated infield
    boundary folds on such shapes); mixed-piece circuits (the stage-1
    recipe) pass all checks. Worth knowing before authoring test content.

- **Community-track moderation + featuring = ranked eligibility (Bundle 4b,
  migration `0058`).** Teachers curate what 4a publishes; featuring is what
  makes a community track ranked.
  - **Investigation result the design hangs on:** 0049 deliberately left
    `greenline_race_results.track_id` as FREE-FORM TEXT — no enum, CHECK, or
    FK — and `greenline_leaderboard(p_track_id)` aggregates any id it is
    asked about. So ranked eligibility needed NO results-table or board-RPC
    change: a featured track's stable ranked identity is its existing
    `community:<uuid>` catalog id (the row PK, immune to renames and data
    re-reads), and the only thing 4b had to build server-side is the
    ELIGIBILITY GATE.
  - **The gate (0058, apply manually after 0057):**
    `greenline_submit_race_result` is recreated with the SAME 0054 signature
    and byte-identical award math (verified by mechanical diff: the only
    delta is the gate block) plus a COMMUNITY GATE: a non-creative submit on
    a `community:%` track id ranks and pays ONLY while that row is featured
    and not removed; anything else (unfeatured, removed, unknown or
    malformed uuid) is DEMOTED to the existing creative branch — logged as
    mode 'creative', zero award — rather than rejected, so a run in progress
    when a teacher un-features still closes cleanly. Un-featuring therefore
    removes ranked eligibility server-side the moment it lands, while the
    track, its ratings, its attempts, and its EXISTING leaderboard rows are
    all untouched (nothing deletes history). Without this gate any client
    could submit ranked rows for an arbitrary community id — the client's
    featured check is presentation, never the boundary.
    `greenline_track_set_featured(p_track_id, p_featured)` is the
    promote/demote RPC, `is_teacher()` enforced INSIDE (the
    frc_mark_complete doctrine); featuring requires a live track,
    un-featuring is always allowed. Teacher removal needed nothing new:
    `greenline_track_remove` (0057) already honors `is_teacher()` — the
    moderation panel calls the SAME path an author's self-remove uses.
  - **Ranked client flow** (`/greenline/+page.svelte`): `startRace` snapshots
    `raceUnrankedCommunity` (community AND not featured); a FEATURED
    community run submits `creative: false` exactly like an official track —
    same leaderboard read, same qualifying-grid read, same IC payout — while
    unfeatured stays forced-unranked. The results screen additionally honors
    the server's answer (`lastAward.creative`), so a mid-race demotion shows
    as unranked rather than lying about a payout. Attempt telemetry and the
    rating row run identically for both. Garage: the community divider drops
    "unranked" (the FEATURED chip is the ranked flag, tooltip says so).
  - **Moderation panel:** `/greenline/moderation` — the guard is the EXACT
    retired builder teacher-gate pattern reused (profiles-role lookup
    server-side, 404 for any non-teacher; anonymous never reaches it, the
    `/greenline` authed prefix 303s them to `/` first). UI gating is
    convenience; the RPCs' internal `is_teacher()` is the boundary.
    `src/lib/greenline/TrackModerationPanel.svelte` (presentation +
    callbacks, the DecalReviewQueue convention) lists every published track
    with report count, ★ average + rating count, starts, finishes +
    completion rate, average completion time, unique racers, and average
    wall violations — all from the same `greenline_track_list` RPC players
    browse with, so teachers moderate by exactly the numbers players see.
    Default sort REPORTS DESC (problem tracks first; reported rows carry an
    amber edge tick), re-sortable by rating and completion rate (the
    featuring-decision views). Actions per row: FEATURE / UN-FEATURE and a
    two-step REMOVE. Discoverability: a "Community Track Moderation" card on
    `/dashboard` under GREENLINE Decal Reviews links to it.
  - **Verified** (0 svelte-check errors): sorting on the REAL panel over a
    3-track store (reports 2/1/0, rating 4.5/3/2, completion 100/50/33 —
    each sort ordered correctly); every displayed cell for a hand-checked
    track matched an INDEPENDENT recomputation from the raw attempt/rating
    rows (reports 2, ★2.0(1), 3 starts, 1 finish 33%, 1:04.96 avg = 64963
    ms, 1 racer, 2.3 avg walls); FEATURE flipped the panel chip to
    "FEATURED · RANKED", the garage tile to FEATURED + COMMUNITY, and the
    results screen to the RANKED branch (no unranked strip, rating row
    intact); UN-FEATURE restored the unranked strip while the track stayed
    listed with all 3 attempts + 2 ratings intact; the teacher REMOVE path
    delisted another user's track (soft, history kept); the shipped guard
    driven directly with mocked locals read 404 for logged-out / student /
    visitor / no-profile-row and rendered for teacher, and logged-out curl
    probes of /greenline/moderation and /greenline/builder both 303 to `/`
    (the authed prefix) while the dev harness stays 200 in dev; and the
    0054-vs-0058 diff confirms the award/PB/throttle/wallet code is
    byte-identical. **Not verifiable without live credentials:** the 0058
    SQL against live Supabase (the gate + is_teacher() enforcement are
    review-verified per the repo's RPC convention) and a real ranked lap +
    IC payout on ideabosco.com (needs migrations applied + Google OAuth) —
    the payout code path itself is provably the unchanged 0054 one.

- **Track schema v3: piece-chain tracks + the corkscrew
  (`src/lib/greenline/track-pieces.ts`).** A v3 track's surface is
  `type: 'pieces'`: an ordered chain of parametric `TrackPiece` segments
  (`straight` / `curve` / `bank` / `jump` / `corkscrew` / `freeform`) walked
  from a chain start pose, each piece computing a DETERMINISTIC closed-form
  exit pose (position, heading, pitch, bank) from entry + kind + params. The
  compiler turns the chain into exactly the per-point arrays the ribbon
  runtime has always swept (centerline / widths / elevations / banking), and
  `buildRuntime` now routes EVERY surface through `compileSurface` — so the
  visual mesh, the physics Trimesh, paths/routes, and the minimap remain ONE
  shared pipeline with no second geometry generator.
  - **Backward compatibility is the load-bearing contract (the 8a
    2D-projection / 8b paths[0]-aliasing principle):** a legacy ribbon IS a
    one-piece chain — a single verbatim `freeform` piece passed through with
    zero arithmetic (same point objects; the `??` width/elevation/banking
    defaults reproduced exactly) — so the old format is the trivial instance
    of the new model, never a parallel system. Verified byte-identical vs
    HEAD: the FULL runtime for all three committed tracks compared with exact
    `===` (10,044 / 4,403 / 34,875 numbers), plus a 14,641-point `surfaceYAt`
    grid and warm-started `surfaceState` along every path per track, all
    exact. Live: PG07 still plane-only (5 bodies, surfaceY 0 everywhere, 0
    floor catches, all cars lapping), Terminal Nine's 3 paths / pit route /
    8 zones intact with the banked sweeper reading upY 0.945 at the 17-deg
    samples (cos17 = 0.956 minus ~1 deg of suspension lean under cornering
    load) and climb ride height 0.846 (documented ~0.85).
  - **The corkscrew is what v3 unlocks:** bank and grade move together over
    the piece's own length through one shared profile — elevation climbs
    `rise * smootherstep` while bank swells to `peakBankDeg` in proportion to
    the spiral's ADDED grade (the same curve's normalized derivative), peaking
    mid-piece and returning to the entry bank at the exit. `turnDeg` 0 is a
    straight spiral; nonzero sweeps a plan arc of derived radius. The v2
    global banking array can sample that shape but cannot express the
    coupling as authored intent.
  - **Guardrails, deliberate:** `PIECE_BANK_MAX_DEG` 60 on every kind (well
    clear of 90 — the sweep degenerates there; this is explicitly NOT
    building toward loops, wallrides, or inversion, and there is no general
    6DOF rotation or vertical piece), `PIECE_PITCH_MAX_DEG` 25, a
    per-segment grade lint at 0.62 (the jump's drop face is `cliff`-marked
    and exempt, the Terminal Nine deck-edge pattern), the 8a catch-plane
    raise enforced IN THE COMPILER for parametric samples (elevation lifted
    to halfWidth * sin|bank| + 1 cm; NEVER applied to freeform — verbatim
    stays verbatim), joint continuity checks, and loop closure validated to
    tight tolerances (a v3 chain must close; ribbon wraps keep the legacy
    wrap-segment convention). Piece chains are LINEAR — no branches; route
    splits stay ribbon territory. `parseTrack`'s v3 branch validates
    structurally then compiles (WeakMap-cached per surface object, so parse,
    `buildRuntime`, and `lapLengthM` share one walk).
  - **Union fallout, contained:** `TrackSurface = RibbonSurface |
    PieceChainSurface`; `lapLengthM` gained a pieces branch (compiled
    length), GreenlineRace's two `surface.branches` reads narrow on type, and
    builder `validate.ts` guards its ribbon-only paths (`serializeTrack`
    exports ribbons only; branch-join checks are ribbon-scoped; the publish
    validator's runtime/lap/surface drives are generic and accept v3).
  - **Proof track `tracks/piece-proof-01.json`** (generated by a scratch
    script driving the REAL compiler/runtime with built-in checks: parse,
    runtime, LapTracker lap with 0 rejections, clean surfaceState drive,
    boundary orientation probes, edge-never-under-plane; committed as data,
    registered in `tracks.ts` as kind `test`): 596 m, 13 pieces — a climbing
    corkscrew (+5 m, peak 22 deg) onto a 5 m deck, a banked 16-deg corner
    entered and exited through `bank` pieces, a deck kicker jump, a
    descending corkscrew home, closure exact to 2e-14 m, max bank raise
    0.804 m on the corkscrews. Browser-verified in the headless harness: a
    single clean car ran 11 laps (best 21.1 s) with 0 flips and 7 floor
    catches all at the one concave raise spot; banked-corner upY 0.9619 vs
    cos16 = 0.9613 (n=360); corkscrew upY tracks cos(local bank) to a mean
    error of -0.0025 (n=91, local bank mean 21 deg); deck surfaceY exactly
    5.00; the raise is measurable in-game (descent floor 1.05 = the lift
    formula exactly); the jump gives 3.95 m of air; 0 NaN. A 4-car combat
    race also completes laps (falls/scrapes there are pack-combat noise, not
    geometry). The garage picker lists it with the TEST tag and the compiled
    0.60 km lap length. NOTE: the 0.804 m raise and the floor catches in this
    bullet are the PRE-FIX numbers; the corkscrew catch-plane arch below took
    the raise to 0.000 m (everything else about the track is unchanged).

- **Corkscrew catch-plane arch: the 8a rule enforced in the generator
  (`corkscrewArchLift` in `track-pieces.ts`).** A corkscrew banks hardest at
  mid-piece while its smootherstep climb is barely off the floor, so a spiral
  starting near y = 0 asks its low edge to sit UNDER the catch plane through
  the first third of the piece. The pointwise raise did clamp it — nothing was
  ever below the plane — but a clamp REPLACES a stretch of authored profile
  with the clearance curve and then hands back, which is the flagged
  piece-proof-01 hump: 0.804 m of raise and a genuine slope discontinuity at
  the rejoin. So the piece now raises its own base instead, by ONE scalar
  applied through a profile that is (a) zero at both joints — it rides
  `bankPulse`, the same curve that swells the bank — so the entry/exit
  elevation, the analytic exit pose, and every sample of every neighbouring
  piece are untouched, and (b) weighted to the piece's LOW END (`1 - climb
  progress`, derived from the piece's own natural min/max so it handles either
  rise sign, a flat spiral, and an entry grade), so the lift decays as the
  climb takes over instead of arching back over the high joint. `lift` is the
  SMALLEST scalar for which `natural + lift * shape` clears every sample, so a
  corkscrew that already sits clear gets exactly 0 and compiles
  byte-identically to before (browser/script-verified: start y = 1 and up are
  byte-identical, y = 0 is the only case that arches). Corkscrew-ONLY on
  purpose: it is the one kind that returns to its entry bank, which is what
  makes a self-contained arch possible; a `bank` piece ends banked, so its
  clearance is a joint-level obligation its neighbour shares and the pointwise
  raise stays the right tool there. The pointwise raise remains as the residual
  safety net for every other kind.
  - **Measured on piece-proof-01:** max bank raise **0.804 -> 0.000 m**; the
    corkscrew grade profile goes from `2.9 6.6 9.0 9.9 9.6 8.3 6.4 4.0 | 7.6
    13.3 | 12.6 ...` (a clamp-and-release W with 3 curvature sign flips, the
    4.0 -> 13.3 sag being the concave spot that caught the floor) to a single
    smooth peak `2.9 8.0 11.8 14.0 14.5 13.7 12.0 9.9 7.9 6.4 5.5 ...` with 1
    sign flip. Centerline x/z, banking, widths, lap length and closure are
    EXACT vs HEAD; only 32 elevation samples changed, every one inside a
    corkscrew, with both corkscrew joint elevations exact (0.000 / 5.000).
    Proving Ground 07, Terminal Nine and relief-proof-01 are exact across the
    full runtime (10,044 / 34,875 / 4,403 numbers compared with `===`).
    A/B driven in the headless harness as two verbatim ribbon tracks carrying
    the old and new profiles (identical centerline, so the elevation profile is
    the only variable), same 2-car config, ~3 min each: 0 floor catches, 1
    fall, 0 flips, all upright on BOTH, best laps 21.108 / 22.794 s vs 21.033 /
    22.766 s — the arch costs nothing on track.

- **Piece-chain builder (dev tool):
  `/dev/greenline-piece-builder`.** The v3 counterpart to the ribbon builder
  at `/dev/greenline-track-builder` — a separate tool for a separate surface
  kind, deliberately not a mode of the other one. Dev-guarded exactly like
  every other harness (404 in production, no auth, no Supabase). Lives in
  `src/lib/greenline/piece-builder/`: `chain-doc.ts` (the document, kind
  catalog, param specs, the TrackData export and the preview track),
  `PieceChainBuilder.svelte` (the UI) and `PiecePreview3D.svelte` (the live 3D
  view).
  - **It owns NO geometry math, and that is the load-bearing rule.** Every
    pose, measurement, and violation comes from the new `diagnoseChain` in
    `track-pieces.ts` — the same walk, the same generators, and the same
    guardrails `parseTrack` runs on a real track load — so the builder cannot
    tell an author something the game would disagree with. `compileChain`
    gained an optional issue SINK that switches the guardrails from THROW to
    COLLECT (attributing each violation to its piece and carrying on, so a
    whole chain's problems show at once); without a sink the behavior is
    byte-identical to before, which is what every track load relies on.
  - **Numbers per piece:** each row shows its computed exit pose
    (x, z, y, heading, pitch, bank) plus
    that piece's plan length, steepest grade, peak bank, LOWEST SWEPT EDGE Y
    (the number the y = 0 catch plane actually judges), and any corkscrew arch
    or residual raise it applied. Reorder (↑/↓) and remove re-derive everything
    downstream, since a piece's entry pose IS the previous piece's exit.
  - **Guardrails are checked as pieces are added, not at export**, and export
    is BLOCKED while any is broken (browser-verified: bank cap, pitch cap,
    grade lint, joint continuity, and loop closure each fire inline on the
    offending row and disable Copy/Download). A piece with out-of-range params
    is skipped by the walk and so has no diagnostic — its message is read from
    `diag.issues` by authored index so it still lands on its own row.
  - **Freeform is supported as what it is:** verbatim world geometry edited as
    raw JSON, seeded from the current exit pose so it connects on arrival.
  - **Export** writes the authored CHAIN as the v3 surface (the point of v3)
    while deriving spawn, gates and boundaries from the COMPILED geometry:
    gates sit BETWEEN samples (a gate on a centerline point double-reports as
    out-of-order — the ribbon builder's lesson), and the boundary offset
    shrinks from the flat 9 m toward wall-tight as the edge rises (Terminal
    Nine's run-off lesson). Copy or download, drop it in `tracks/`, add one
    import and one entry in `tracks.ts`. No server-side save this stage.
    The document persists per browser (`greenline_piece_builder_v1`), and
    `window.__glPieceBuilder` drives everything from the console.
  - **Verified** in the harness: real clicks build a chain and exit poses
    update live (a straight to (60, 0, 0) then a corkscrew to (130, 0, 5)
    reporting `arch 2.36 m`); typing 75 into a corkscrew's peak bank surfaces
    "corkscrew peakBankDeg must be within ±60" on that row and disables export;
    reorder moves the piece, keeps the selection, and re-derives both exits;
    remove updates the count; a 13-piece document survives a reload from
    localStorage still reading VALID. End to end: piece-proof-01's chain loaded
    into the builder reads VALID with closure 0.000 m, exported through the
    real Show JSON control, parsed by the real `parseTrack`, and its runtime
    geometry is IDENTICAL to the committed file (152 samples, every x/z/
    elevation/banking/halfWidth exact); a real `LapTracker` drive completes
    laps with 0 spurious rejections, 0 off-ribbon samples and 0 wall violations
    on both the centerline and a 4 m offset line; and the exported track
    parked as the custom track drove in the movement harness for 7 laps, best
    21.03 s, upright, matching the committed track's documented pace.

- **Piece-chain builder workflow rework.** Six changes to how the tool is
  DRIVEN. `compileChain`/`diagnoseChain` are untouched — the bank cap, pitch
  cap, grade lint and corkscrew arch all still decide exactly what they did,
  and export is still blocked while any guardrail is broken.
  - **Insert anywhere, and duplicate.** `addPiece(kind, at?)` takes an index;
    a row's `+` arms that position (the palette shows the target and a cancel),
    and the historical "after the selection, else the end" is what an unarmed
    palette still does. The new piece's defaults are seeded from the exit pose
    of whatever ends up IN FRONT of it (`at - 1`), never from the selection or
    the tail — that is what makes a mid-chain insert start where the road
    actually is, and everything downstream re-derives because each entry pose
    IS its predecessor's exit. `duplicatePiece` copies in place via a
    structural clone, so a freeform piece's arrays are not shared with the
    original.
  - **Drag to reorder**, native DnD initiated ONLY from a dedicated grip.
    Making the whole row draggable would hijack text selection inside the
    expanded param form. The grip is `aria-hidden` and the up/down buttons
    remain the keyboard path.
  - **Live edits, no commit step — this reverses the earlier commit-gated
    design.** Full recompute per edit was treated as a performance risk it
    never was at chain scale, and the cost was that an author typed a number
    and then had to do something ELSE before the road agreed. Two speeds now:
    `renderNow` for structural edits (add/insert/duplicate/remove/reorder) and
    a debounced `renderSoon` (180 ms) for typing. The document itself updates
    on every keystroke, so poses, measurements and guardrails are live
    throughout; only the 3D rebuild waits for the pause.
    - **The effect-subscription trap is avoided by NOT using an effect.**
      Reading state inside an `$effect` SUBSCRIBES to it, which is what made
      the previous version rebuild per keystroke. The counter is bumped from
      explicit calls in the handlers, so the set of things that trigger a
      redraw is the set of things that call those two functions. The preview
      keeps its half of the contract unchanged: `rev`/`selected` are its only
      reactive triggers, `doc`/`diag` are read under `untrack`.
    - Freeform JSON is the one concession: it is invalid for most of the time
      it is being typed, so a parse failure leaves the last GOOD geometry in
      place and only reports itself. Nothing commits until the text parses.
  - **Docked split pane.** The shell is a fixed `100vh` flex column; the EDITOR
    column scrolls on its own and the preview is docked beside it, so it never
    scrolls out of view however long the chain gets. `min-height: 0` on the
    grid row and the scrolling child is the load-bearing bit — a grid/flex item
    defaults to min-content, which would push the column to full height and
    hand the scrollbar back to the page. Below 1000px the shell gives up its
    fixed height and stacks, preview first. `.p3-stage` went from a clamped
    height to `flex: 1` with a `min-height` guard, so it fills a definite-height
    dock and still survives an auto-height parent.
  - **SolidWorks navigation**, because the author is in SolidWorks all day:
    MMB drag rotates, shift+MMB (as asked) AND ctrl+MMB (stock SolidWorks,
    where shift+MMB is zoom) both pan, wheel zooms, arrows nudge the view 15
    deg and shift+arrow 90. LEFT and RIGHT are deliberately UNBOUND for the
    CAMERA — they select and open the context menu in SolidWorks — and the left
    button now belongs to the direct-manipulation handles (see the handles
    bullet below). OrbitControls has no modifier-aware mapping, so the
    modifier is resolved into `mouseButtons.MIDDLE` from a CAPTURE-phase
    pointerdown, before OrbitControls' own handler reads it; middle-click
    default is prevented so Chrome does not open autoscroll. The nudge is
    spherical math on the camera, not an OrbitControls internal. **Focus is
    scoped to the CANVAS** (made focusable in JS rather than putting a
    tabindex on the wrapper): that is what keeps arrows pressed in a numeric
    param field stepping the number instead of swinging the camera.
  - **Playtest, no export/reimport.** Reuses the existing pieces end to end:
    `setCustomTrack` parks the live compiled `TrackData` (deliberately the live
    object, not the export string, which rounds to 2 dp for committed files) in
    the same one-slot custom-track store the ribbon builder's Test Drive uses,
    then navigates to the DEV movement harness at
    `?track=custom-builder&from=piece-builder`. The harness rather than
    `/greenline` because this is a dev tool and the portal route is behind
    auth. No second driving mode; the harness's `?track=` path is unmodified.
    `?from=` adds a one-click return link (the only harness change), and the
    chain is still exactly as left since the document lives in localStorage.
    Gated on a valid closed chain, because an invalid one cannot be raced.
  - **Verified** by building a real chain through the new workflow only:
    palette clicks built a base chain, a row `+` inserted a bank at index 1
    with the downstream pieces shifted intact, duplicate produced an adjacent
    copy proven INDEPENDENT (editing the copy left the original at 16 deg while
    the copy read 11), and a real drag from the grip to row 1 reordered
    `[straight,bank,bank,curve,straight,curve]` into
    `[straight,straight,bank,bank,curve,curve]` with the drop marker showing
    during the drag and clearing after. Live editing, the decisive one: typing
    `1`,`12`,`128` into a radius field with NO change/blur/Enter anywhere left
    the document reading 1, 12, 128 per keystroke while `renderRev` stayed put,
    then bumped EXACTLY ONCE after the pause — and a geometry signature of the
    rendered road proved the scene was byte-identical while only `doc` had
    changed (so the effect is genuinely not subscribed to it) and rebuilt only
    when the counter moved (1512 -> 2048 verts). Layout: with 15 pieces the
    editor scrolled 1395 px through 2048 px of content while the dock did not
    move by a pixel and the page itself never scrolled at all, canvas 545x547.
    Camera: plain MMB resolves ROTATE, shift and ctrl both resolve PAN, LEFT
    and RIGHT unbound, arrow nudges measured at exactly 15/15/90 deg with the
    orbit distance preserved, wheel zoomed 85.1 -> 75.3, real arrow keydowns on
    the focused canvas moved the camera while an arrow in a focused param field
    left it untouched. Playtest: a VALID 531.2 m circuit (closure 0.0000 on
    position, heading, elevation and bank) parked and drove in the harness —
    4 cars, 3 to 5 laps, best 18.5 to 19.8 s, 0 falls, 0 floor catches, all
    upright and finite — surviving a FULL page load (so it resolved from
    localStorage, not just the in-memory registration), and the return link
    came back to the builder with the chain intact and still VALID.
    `svelte-check` clean, 0 errors and no new warnings.
  - **HARNESS TRAP worth knowing:** a long `await`-loop inside a
    `javascript_tool` call KEEPS RUNNING after the call times out. A timed-out
    piece-adding loop silently appended ten more pieces while later checks ran,
    which read as chain corruption until the leftovers were identified. Keep
    scripted UI loops short, or verify the piece count before trusting a later
    measurement. Separately, the movement harness still needs `?glheadless=1`
    in an automated tab: the playtest link deliberately omits it (a real author
    has a visible window), so a scripted drive must add it or every car sits at
    speed 0.

- **Direct-manipulation handles in the piece-builder 3D preview (straight +
  curve).** The SELECTED piece carries grabbable shape handles in
  `PiecePreview3D`: shaping by feel beside the numeric fields' landing an
  exact number — both first-class, neither replacing the other.
  - **One mutation path, by construction.** A handle drag writes through
    `onparam`, which the parent wires STRAIGHT into the same `setParams` the
    numeric fields funnel into. So the field ticks live under a drag
    (browser-verified mid-drag: 60 -> 62 -> 63.5 in the doc, the input, and
    the on-canvas readout simultaneously), a typed value moves the handle on
    the debounced rebuild (typed radius 45 re-seated the handle at the
    analytic mid-arc position to full float precision), and there is no
    second way parameters change. Drag-written values snap to a coarse
    quantum (0.5 m lengths/radii, 1 deg sweep) so a shaped number still
    reads like a typed one.
  - **The framework (`piece-builder/handles.ts`, pure math — no three, no
    Svelte)**: `handlesForPiece(piece, entry, exit)` returns `PieceHandle`s
    positioned from diagnoseChain's own poses, each with a
    `beginDrag(ray) -> (ray) -> value` solver over world-space pointer rays.
    Every constraint is an EXACT locus from the generators' closed forms,
    captured at drag start (so mid-drag scene rebuilds never disturb it):
    straight `length` = ray-to-line along the entry heading through the exit
    (delta-based, so an off-center grab never jumps the value); curve
    `radius` = the mid-arc point's locus `E + R·u` (entry + turn fixed makes
    it a straight line; gain `1/|u|`); curve `turnDeg` (sweep, at the exit) =
    unwrapped angle about the fixed arc center, accumulator-clamped so a
    stop reverses immediately, and SIGN-PRESERVING — crossing zero would
    discontinuously flip the center to the entry's other side, so a drag
    tightens to ±`MIN_SWEEP_DEG` (2) but never flips; flipping direction is
    a typed edit. Ranges come from the same `KIND_SPECS` the inputs render.
    Bank / jump / corkscrew extend the same two solver shapes (axis / arc)
    in a fast-follow; freeform NEVER gets handles (verbatim geometry, not
    parametric).
  - **Mouse arbitration (the part that must not regress):** the handle
    pointerdown runs in the CAPTURE phase (the same capture-at-target
    guarantee the MMB modifier resolver already relies on) and on a hit sets
    `controls.enabled = false` for the drag — OrbitControls no-ops on its
    first line, so a handle drag can never fight the camera even though LEFT
    is unbound there anyway; release re-enables. Verified live:
    grab -> enabled false + drag active, release -> enabled true; MMB rotate /
    shift+ctrl MMB pan mapping, wheel zoom (through OrbitControls' own wheel
    handler) and arrow-nudge all intact outside a drag. Hit spheres are 1.6x
    the visible ball (26 px off = a miss, verified through the real
    raycast); handles render screen-constant (~9 px), depthTest off (a gizmo
    is never buried in the road), green ball = axis, octahedron = arc, mint
    hover + gold active tint, grab/grabbing cursor, and a live value chip
    (`p3-handle-status`).
  - **Console surface (`__glPreview3D`):** `handles()` (world + screen pos),
    `pickAt(x, y)` (the real hit test), `dragHandleBy(id, dx, dy)` (a whole
    drag through the real capture-phase pointer path with synthetic events;
    `setPointerCapture` is try/caught for exactly this), `dragActive`,
    `hoverHandle`, `controlsEnabled`.
  - **Verified in the browser end to end:** a stadium chain whose every
    shaped value landed by handle drags alone (straight 63.5 m; curve
    radius 40 via iterated drags; sweep dragged to the exact 2-deg floor —
    the sign clamp — then opened out to exactly 180), closed by
    duplicate+reorder to `[S, C180, S, C180]` (closure gap 1.6e-14 m,
    VALID), then PLAYTESTED through the real button: 4 cars, 8-10 laps each,
    best ~13.9 s, all upright, 0 falls, 0 floor catches. A deep-chain handle
    (piece 2, entry heading 180) dragged along its OWN reversed axis with
    piece 0 untouched and the broken-closure guardrail flagging live.
    Framebuffer read-back (the probe3d convention; WebGL screenshots hang
    the pane) shows the handle green at both projected positions against the
    background. Zero console errors. Not verified this session: a
    trusted-hardware-mouse MMB drag (claude-in-chrome was not connected);
    that path's code is unchanged and its mapping/wheel/nudge were driven
    through OrbitControls' own handlers. (That deferred check was run later
    with real OS-level input and found the pan gesture broken — see the
    camera-ownership bullet below.)

- **The preview camera owns the middle button; orbit pivots under the cursor;
  the road is clickable and draggable.** Four changes to how the piece-builder
  3D view is DRIVEN. The compiler, the guardrails, the shared `track-visual`
  mesh builders, and the handle solvers are all untouched.
  - **THE BUG, and it was the modifier gesture, not the plain one.** The old
    code resolved shift/ctrl into `controls.mouseButtons.MIDDLE` from a
    capture-phase listener and let OrbitControls act on the result — but
    OrbitControls applies its OWN modifier swap (a MIDDLE mapped to PAN with
    shift held is turned back into ROTATE). So the modifier was applied
    TWICE and shift/ctrl+MMB rotated: **pan was unreachable, on every track,
    always.** Plain MMB rotated correctly the whole time. Measured with real
    SendInput hardware input against the pre-fix build: plain MMB camera
    moved 298.8 / orbit target moved 0 (rotate), shift+MMB camera moved
    267.1 / target moved 0 (rotate again, should have panned). The earlier
    session's synthetic check could not have caught this — it called the
    resolver directly and never let OrbitControls' own swap run. The
    capture-at-target ordering that same session worried about is fine and
    was re-confirmed: capture listeners on the target DO precede bubble ones.
  - **Fix: OrbitControls is bound to NO mouse button** (`LEFT`/`MIDDLE`/
    `RIGHT` all null) and the middle button is driven by hand. This removes
    the double-swap class of bug outright rather than re-tuning around it,
    and it is also required for the pivot work below. OrbitControls is kept
    for what it is still exactly right for: wheel zoom, damping, and the
    `update()` that re-aims the camera at the target each frame.
  - **Orbit pivots on whatever is under the cursor** (SolidWorks), picked by
    raycast at drag start against the road and its deck structure, falling
    back to the ground plane, then the current target — so grabbing empty sky
    still rotates. `applyRotate` turns the camera AND the orbit target
    rigidly about that pivot, which is the whole trick: because the pair
    moves as one body, `lookAt(target)` still yields the right orientation
    and NOTHING jumps at drag start. (Simply moving `target` to the pivot
    would snap the pivot to the middle of the screen, which is why that is
    not what happens — and it is why this is not expressible through
    OrbitControls, whose `update()` always re-aims at `target`.) Rates match
    OrbitControls' own (2*PI per viewport height) so the gesture feels
    unchanged; the pitch component is dropped if it would tip past a pole or
    put the camera under the ground, so yaw always survives a steep drag. A
    small gold marker shows the pivot while a rotate lasts.
  - **Click a piece's road to select it, drag it onto another to reorder.**
    The main path's ribbon is ONE indexed mesh with two vertices per
    centerline sample, so a hit resolves to a piece with no extra
    bookkeeping — face vertex index / 2 is the sample, and every
    `PieceDiagnostic` already carries its `start`..`end` sample range. No
    picking proxy, no per-piece meshes. Selection writes the parent's OWN
    `selected` (new `onselect` prop), so picking in 3D and clicking a list
    row are ONE selection: the row expands to its edit form and the shape
    handles appear either way. Reorder (new `onreorder` prop) routes to the
    list's own `reorderPiece`, keeping its exact drop semantics — the dragged
    piece TAKES the position of what it lands on — so a mouse moving between
    the two surfaces never has to relearn what a drop means. The chain is
    deliberately NOT mutated mid-drag (stable aim, one structural edit per
    drag); a press that never travels past 5 px is a click, so a shaky select
    is still a select; a click on empty space clears the selection.
    Left-button priority is strict: handle, else road, else nothing.
  - **Surface feedback reuses the existing vertex-colour channel** rather
    than adding a mesh: the builder's own tones are snapshotted and restored
    before every repaint (idempotent, gate wear ramps survive), then the
    dragged piece dims and the drop target glows. Priority while a reorder is
    live is drag feedback > broken guardrail > selection > hover.
  - **Layout: the route's floated back link covered the builder's own status
    chip.** `.glpb-back` was `position: absolute` at the page's top right,
    landing on top of the chain status flag (measured 1035 px² of overlap at
    1280 wide, with `elementFromPoint` at the flag's centre returning the
    LINK — it was taking the clicks); PLAYTEST sits in the same corner just
    below. Fixed structurally rather than by picking offsets that happen to
    miss: `PieceChainBuilder` takes optional `backHref`/`backLabel` and
    renders the link as a real item in its header flex row, so the corner is
    ONE layout. A host page must NOT float its own chrome over this
    component. Verified zero overlap and all three controls visible AND
    topmost-at-their-own-centre at 1600 / 1280 / 1040 / 900 px.
  - **Console surface** gains `camDragBy` (a whole middle-drag through the
    real pointer path, reporting the resolved mode and pivot), `camDragMode`,
    `pickPieceAt`, `pieceScreen`, `clickPiece`, `dragPieceOnto`, `pieceDrag`,
    `hoverPiece`. `pressMiddle` is gone with the resolver it drove.
  - **Verified with REAL OS-level input** (SendInput into a genuinely visible
    Chrome window — see the harness note below), every gesture landing as a
    trusted event on the canvas: plain MMB rotates (camera and target move by
    DIFFERENT vectors, mismatch 412.6) and shift+MMB and ctrl+MMB pan
    (camera and target move by the IDENTICAL vector, mismatch exactly 0 —
    a rigid translation is the honest discriminator, since a pivot rotation
    legitimately moves the target too). Pivot: rotating with the cursor over
    piece 0 left that road point pinned at its pixel (moved 0.6 px) while the
    old scene-centre swung 164.3 px across the screen; repeating over piece 3
    inverted it exactly (piece 3 moved 0.2 px, piece 0 swung 345.1 px).
    Picking: a real click on piece 2's road selected row 2 and expanded its
    edit form; a real left-drag from piece 0's road onto piece 3's reordered
    `[straight,curve,straight,curve,straight]` to
    `[curve,straight,curve,straight,straight]` with the selection correctly
    following to its new index. Regressions held under real input: a
    left-drag starting ON a handle reshaped (numeric field ticking with it)
    and did NOT reorder, with all drag state cleaned up; a click on empty
    space cleared the selection; wheel zoom still works (280.1 -> 228.2).
    Mid-drag state and the vertex tints were checked in the buffers
    (dragged piece 0.35/0.4/0.5, drop target 1.6/3.2/2.0, selection
    preserved, and an exact restore on cancel), and all 7 piece kinds
    (incl. bank, corkscrew, closer) resolve from a raycast pick.
    `svelte-check` clean, 0 errors, no new warnings.
  - **HARNESS NOTE, worth knowing before the next real-input check:** the
    claude-in-chrome tab is a BACKGROUND tab (`visibilityState: 'hidden'`)
    that no OS window shows, so SendInput cannot reach it and its `computer`
    tool has no middle button. The way through is to have that tab
    `window.open` a popup — same origin, so the hidden tab can script it
    (`w.__glPreview3D`) while it is a real, visible, focusable OS window
    SendInput can drive. Popups need a user gesture, so the opener must be a
    button clicked via the `computer` tool. Also: in PowerShell,
    `$input.mi.dx = ...` silently writes to a COPY (nested value type) and
    sends nothing — build the whole MOUSEINPUT/KEYBDINPUT and assign it to
    `.mi`/`.ki` in one go.

- **Collapsed piece rows + rotational handles for the angle params.** Two
  changes: a long chain is scannable, and the params that ARE angles are
  draggable like the lengths and radii already were.
  - **One line per piece, detail only where it is being worked.** Every row
    used to render its exit pose (6 numbers) and its measured
    grade/bank/edge on top of the summary, whether or not anyone was looking
    at it. A row is now the grip, index, a per-kind ICON, the kind name, and
    a one-line summary of just the params that distinguish it; the exit pose
    and measurements moved inside the `selected === i` branch that already
    held the param fields. **Issues are the deliberate exception and still
    render on a collapsed row** — a broken piece has to be findable without
    opening it. Safe because `GRADE_LIMIT === PIECE_GRADE_MAX`: every
    measurement that could show a warn also fails as an issue, so nothing
    that was a violation became invisible. Measured on the SAME 16-piece
    chain via a stash-and-reload A/B against HEAD: the list went **1135 px ->
    583 px (48.6% shorter)** with one piece expanded, and 461 px with none;
    a collapsed row is **66 px -> 24 px**.
  - The toolbar moved from `position: absolute` into a shared flex line with
    the row (`.pb-headline`). At one line per piece an overlaid toolbar would
    sit on the summary it is meant to sit beside — the same class of mistake
    as the floated back link two bullets up. The summary is the only elastic
    item and ellipsizes, so the tools can never be pushed off.
  - `PIECE_ICONS` (chain-doc.ts, beside `KIND_SPECS`) is plain path data on a
    24x24 grid stroked with `currentColor` — the `pathways.ts` convention,
    data in the registry and the one `<svg>` at the render site. The glyph
    says what the piece does to the road (straight runs on, curve bends, bank
    rolls, jump breaks, corkscrew twists, closer completes the loop, freeform
    is plotted points) and it tints with the row: steel normally, green
    selected, amber broken.
  - **`angleHandle`, the rotational counterpart to `axisHandle`.** Same
    framework, same `PieceHandle` contract, same single mutation path through
    the parent's `setParams`, same capture-phase arbitration. A linear drag is
    wrong for an angle, so these solve a swing about an axis instead: the
    caller states two in-plane reference directions and the plane normal is
    `refU × refV`, so the sign follows from their order rather than from a
    separately-maintained axis. Delta-accumulating like the curve's sweep, and
    the ACCUMULATOR is clamped so a drag pushed past a stop reverses at once.
  - **Closed forms, each derived from the generator rather than fitted.**
    BANK `targetBankDeg`: `buildRuntime` sweeps the edge to
    `centre + halfWidth·(cos β·n + sin β·up)`, a circle in the vertical plane
    perpendicular to travel whose in-plane angle IS β — so grabbing the road's
    edge and swinging it reads the bank 1:1, and a bank piece's exit bank is
    the target, so the handle rides the exit cross-section. CORKSCREW
    `peakBankDeg`: `bankPulse(0.5) = 1`, so mid-piece bank IS the peak; same
    solve on the mid cross-section. CORKSCREW `turnDeg`: the plan is a
    fixed-LENGTH arc (radius is derived, `R = L/|a|`), so the exit rides no
    circle — summing the arc gives `exit = entry + L·sinc(a/2)·dirOf(h+A/2)`,
    i.e. the exit's BEARING about the entry moves at half the twist, so it is
    an angular solve at **gain 2**. Zero is legal and continuous there (a
    straight spiral), so unlike the curve's sweep there is no sign lock.
    Bank also gets the straight's exact `length` solve. `jump` and `closer`
    still have none; `freeform` never will.
  - **`HandleContext` (the compiled road, not the analytic pose).** An angle
    handle rides the EDGE, so it needs where the road actually is: the
    compiler lifts samples clear of the y=0 catch plane on a banked run and
    arches a corkscrew's base, and NEITHER raise appears in a piece's exit
    pose. Found in the browser — the first version put the bank handle 1.49 m
    under the road it was supposed to be grabbing. The 3D layer now supplies
    `halfWidthAt`/`centreAt` from the real runtime (`path.halfWidths`,
    `path.center` + `path.elevations` over the piece's own sample range),
    which also retires the curve radius handle's straight-line mid-height
    estimate. Verified: the handle lands **0.03-0.13 m** from the swept edge.
  - **`ANGLE_GUARD_FRAC` is a singularity guard, not a damper.** At the pivot
    an arbitrarily small movement sweeps an arbitrarily large angle, so a
    pointer inside 30% of the handle's own lever arm HOLDS the value. Outside
    it the mapping is untouched and exactly 1:1. Worth knowing: because the
    mapping is 1:1 with the geometry you can see, sensitivity is a function of
    ZOOM — measured 11 deg/px with a 700 m chain framed into 545 px (a 5 px
    lever arm) and **0.2-0.28 deg/px** at a piece-editing zoom (152 px lever
    arm), where a 5 px nudge moves the bank 1 deg. That is honest direct
    manipulation, and zooming in is the precision control; do not "fix" it
    with a damping factor, which would stop the handle following the cursor.
  - **Verified** in `/dev/greenline-piece-builder`, drags driven through the
    REAL capture-phase pointer path (`dragHandleBy`, the existing handle
    standard): mid-drag, bank reads doc 60 / field "60" / readout
    "bank 60 deg"; twist reads 23 / "23" / "twist 23 deg"; peak bank reads
    41 / "41" / "peak bank 41 deg" — each moving ONLY its own param. Typing
    re-seats: 35 into the bank field put the edge at exactly `6·cos 35` =
    4.915 lateral, -25 into peak bank moved the handle 8.61 -> 1.299 y. The
    closed forms were checked against the compiler's own output — corkscrew
    exit bearing predicted 105 vs actual 105 and chord 69.2031 vs 69.2031,
    and the compiled mid-piece cross-section reads a bank of exactly -25
    when `peakBankDeg` is -25, confirming `bankPulse(0.5) = 1`. A chain was
    then shaped by handle drags ALONE across all seven handles (straight
    length, bank length + angle, curve radius + sweep, corkscrew twist +
    peak bank — the twist crossing zero to -8, exercising the no-sign-lock
    property), closed with one CLOSE THE LOOP click to gap 0.000, read
    VALID, and PLAYTESTED: AI cars lap it at a 19.4 s best. Control, same
    harness and field: the committed `piece-proof-01` laps at its DOCUMENTED
    21.1 s best with 1 fall / 116 floor catches, so the authored track's
    higher counts trace to its own 1.86 m bank raise (proof-01's is 0.000),
    not to this change. Fixed along the way: a stale hover readout kept
    naming a handle the newly-selected piece did not have ("radius" over a
    corkscrew). `svelte-check` clean, 0 errors, 0 new warnings.

- **Every piece param is handle-driven now, plus a screen-nearest picker and
  jump fit bounds.** An audit of `KIND_SPECS` against `handlesForPiece` found
  ELEVEN params with no handle: straight `targetPitchDeg` + `width`, curve
  `width`, bank `width`, jump `length`/`kickHeight`/`width`, corkscrew
  `length`/`rise`/`width`, and closer `radius`. All eleven landed on the
  existing framework — exact closed-form solve, the same `setParams` mutation
  path, the same capture-phase camera arbitration — taking the total to 20.
  `freeform` stays handle-free: verbatim world geometry has no param to shape.
  - **The new closed forms.** STRAIGHT `targetPitchDeg`: the exit lands at
    `entry.y + L·(g0 + tan g1)/2`, affine in `tan g1`, so a vertical drag
    inverts to `tan p = tan p0 + 2·Δy/L` — the entry grade cancels out of the
    difference. CORKSCREW `length`: the chord form read the other way round,
    `exit = entry + L·sinc(a/2)·dirOf(h + A/2)` being a straight LINE in L
    along a fixed bearing, gain `1/sinc(a/2)`. CORKSCREW `rise`: the exit's
    vertical line at gain 1 (the arch never interferes — its profile is zero
    at both joints). JUMP `kickHeight`: with the takeoff fixed the kicker
    SCALES, so the lip slides along the ray from its own foot,
    `lip = entry + kh·(c·d, 1 + g0·c)`; solving the WHOLE locus rather than its
    vertical component is what stays well conditioned on a sloped entry, where
    a long kicker can cancel the climb and the vertical part vanishes.
    `width`: a piece's width param IS its exit width (the blend lands on it)
    and the swept edge is `centre + halfWidth·edgeDir`, so sliding the edge
    straight out reads the FULL width at gain 2, exact at any bank.
    CLOSER `radius`: no authored shape to grab, but the solve's own
    construction gives an exact anchor — every candidate word is built from the
    entry turning circles and the left one's centre is exactly
    `entry + R·leftOf(h)`, so its distance from the entry IS the param at gain
    1. It starts from what the compiler RESOLVED (the new
    `CompiledPiece.solvedRadiusM` / `PieceDiagnostic.solvedRadiusM`, threaded
    through `HandleContext`), because the auto radius's ladder stopping point
    depends on the whole chain and the handle layer cannot re-derive it.
  - **A fixed placement convention**, since a cross-section can now owe four
    handles at once: centreline = the plan extent (`length`), floating above it
    = the height param (offset ALONG that handle's own constraint line, so the
    spacing never changes what the drag solves), driver's-LEFT edge = `width`,
    driver's-RIGHT edge = that section's angle (`targetBankDeg`/`peakBankDeg`)
    or the plan angle that swings it (`turnDeg`). Curve `sweep` and corkscrew
    `twist` moved off the exit centre to the right edge for it; both moves are
    cosmetic, since an angle solve reads `pivot`/`planePoint` and never `pos`.
  - **THE PICKER WAS DEPTH-FIRST AND HAD TO STOP BEING** — the real bug of this
    pass, found in the browser. `pickHandle` took `hits[0]`, the raycast's
    DEPTH-nearest, so with overlapping hit spheres whichever handle floated
    closest to the eye won: the height handle, every time. Measured at a
    full-track framing, the straight's three handles sit 4-9 px apart and
    `pickAt` on the LENGTH handle's own centre returned `grade`, so a drag on
    length moved `targetPitchDeg` instead. Handles are overlay gizmos drawn
    with `depthTest: false`, so depth order is invisible to the author; the
    winner is now the candidate whose centre is nearest the pointer ON SCREEN
    (NDC distance with the aspect put back, or a wide canvas biases the pick
    vertically). Verified each handle picks itself even 2 px apart.
  - **Jump fit bounds (`jumpFitBounds`, beside `jumpGeometry` so the two cannot
    drift): the dead end a drag could otherwise reach.** The four jump params
    are COUPLED — every span eats the same run — so a drag can satisfy each
    individual spec range and still push the piece into `pieceIssue`'s
    does-not-fit state, where the compile walk SKIPS it: no geometry, no
    diagnostic, and no handles left to drag back out with, a corner only a
    typed value can escape. (Pre-existing for the `takeoffDeg` handle; the new
    `length` and `kickHeight` ones widen it, so all four are bounded.) The
    check is solved one param at a time — with `avail` the fraction of the run
    left for kicker + landing, the whole constraint is `sKick + sLand <=
    avail·L` — and each bound tightens its handle's range, rounded
    outward-safe to that handle's own quantum because the caller snaps AFTER it
    clamps. Browser-verified: pushed toward 10 m, `length` stops at 19.5
    (= ceil(19.461/0.5)); pushed toward 20, `kickHeight` stops at 10.75
    (= floor(10.791/0.25)); the jump still fits and keeps all five handles in
    both cases.
    - **An EMPTY range is its own case:** a tall kicker can leave no landing
      angle that fits at all (measured bound 88.99 deg against a 30 deg spec
      max), and the caller's `min(max, max(min, raw))` on an inverted range
      silently returns the max — precisely the illegal value the bound exists
      to prevent, which stranded the piece a second time. A handle with nothing
      legal to write is now not offered (`build().filter(h => h.min <= h.max)`)
      and returns as soon as another param makes room.
  - **`landingDeg` can be dragged into existence from flat.** It used to have
    no handle at 0 ("the field is the way back in"), i.e. one param the drag
    genuinely could not reach. The crest height a landing WOULD have is a
    function of the kick alone (`JUMP_LAND_CREST_FRAC · kickHeight`), so the
    same closed form covers both states: the handle sits on the bare crest and
    pulling it out along the run is what creates the face.
  - **`PieceHandle.value`** carries the param's EFFECTIVE value, replacing the
    preview's `currentParamValue` doc read (which fell back to `def.min`). An
    OPTIONAL param absent from the doc still has a real value — an inherited
    width, a held pitch, the legacy jump profile, an auto radius — and only
    `handlesForPiece` knows it.
  - **Verified** in `/dev/greenline-piece-builder`. Enumeration: every key in
    `KIND_SPECS` resolves to a handle across all seven kinds (freeform's empty
    list included). The headline check — a 9-piece closed circuit built TWICE,
    once with typed `setParams` and once by DRAGGING ALONE (31 drags through
    the real capture-phase pointer path; structure from the palette + CLOSE THE
    LOOP, `setParams` never called), with every target chosen to DIFFER from
    the value the piece would have with no drag at all so nothing could pass by
    accident: **0 param diffs across all 31 params and a byte-identical
    compiled geometry hash** (12,898 chars covering all 282 samples' x/z,
    elevation, banking and width), same 946.055148 m lap, same closure of
    exactly 0 on all five axes. The export then parsed through the REAL
    `parseTrack` (schema v3, 9 pieces, 1 path, 282 samples) and PLAYTESTED in
    the movement harness: 4 cars, best laps 28.1 / 30.8 / 31.4 s, 0 flips, all
    upright and finite, every weapon class firing. Framebuffer read-back (WebGL
    screenshots hang the pane) confirms every handle draws the brand green
    `#2ae57e` at its own projected position, 22.4 px minimum separation at a
    piece-editing zoom with each picking itself. Regression: all five committed
    tracks are byte-identical to HEAD across **24,907 compared numbers** (both
    swept edges, centreline, elevations, banking, half widths, plus a
    1,600-point `surfaceYAt` grid each), measured by stashing the change.
    `svelte-check` clean, 0 errors, 0 new warnings.
  - **HARNESS NOTE:** a scripted drag drive must aim the camera off the
    PIECE'S OWN heading. A fixed azimuth eventually looks down the road, where
    the length axis is near-parallel to the pointer ray and `rayLineS`
    correctly declines — every probe then reads as "no response" and looks
    exactly like a broken handle. Also, `window.__glPreview3D` is REPLACED on a
    remount, so a helper that captured it early goes on querying a disposed
    scene; read it dynamically.

- **Start-grid apron: `PieceChainSurface.startGridWidth`.** The investigation is
  the load-bearing part, because the grid is not shaped the way it looks.
  - **There is no start-grid ELEMENT.** `TrackData.spawn` is a bare point
    (`{x, z, headingDeg}`), the `'pad'` prop is decorative and the runtime never
    reads it, and the grid itself is pure layout: `slotPose(k)` puts pole on the
    spawn and fills staggered rows stepping `GRID_ROW_STEP_PTS` (2) centerline
    samples BACK per row, ±`GRID_LATERAL` (3 m). So the width under the grid is
    whatever the RIBBON is there — nothing else.
  - **The grid straddles the chain's wrap seam**, which is what the old model
    could not express. `deriveFurniture` puts the spawn ~2 samples behind a
    start/finish gate that sits ~6 samples in, so the grid runs from about
    sample +4 back through 0 and onto the LAST piece. Measured on a 12-car
    field: slots land on samples **212, 214, 216, 218, 0, 2, 4** of a 220-sample
    lap — 7 of 12 cars behind the seam.
  - **Which made the chain's own `width` the wrong knob.** It only seeds the
    FIRST piece's width blend, so it widens forward and leaves everything behind
    the seam at the last piece's width. Measured with `width` 26 over a 12 m
    road: `[12 x16] | 26 | 26, 25.8, 25.6 ...` — a hard **12 -> 26 step exactly
    at the seam**, with half the grid on the narrow side of it.
  - **So the apron is its own field, applied as a WIDTHS pass** (`applyStartGrid`
    in track-pieces.ts) over the stitched samples: full width across the grid
    run, eased to nothing over `START_GRID_BLEND_M` with the same smootherstep
    every other blend here uses, walked forward and backward from the seam so
    the wrap is handled the way the grid actually sits. The hold distances are
    DERIVED, not picked: `START_GRID_HOLD_BACK_M` 56 is 6 rows x 2 samples x the
    4 m `PIECE_SAMPLE_STEP` plus a car length, and `START_GRID_HOLD_AHEAD_M` 32
    carries pole and the timing gate. Two rules keep it safe on any chain — it
    only ever WIDENS (`Math.max`, so a piece the author made wider is never
    pinched), and it never touches VERBATIM freeform samples (the catch-plane
    raise's exemption). It runs BEFORE the bank raise, which sizes itself on
    `width * sin(bank)` and so has to see the widened road.
  - **Absent = nothing happens at all** (`startGridWidth !== undefined` guards
    the call), so every existing track compiles unchanged. Exposed in the
    builder as "grid width" beside the corridor width, blank = none.
  - **Verified** in `/dev/greenline-piece-builder` + the movement harness. The
    apron profile is symmetric about the seam with **no step** (behind/at/ahead
    all read the full 28), and its width first-difference is a clean bell
    starting AND ending at exactly 0 (`0.14, 0.8, 1.69, 2.48, 2.92, 2.92, 2.46,
    1.67, 0.78, 0.13, 0 ...`) — C1 by inspection, C2 from smootherstep, so the
    taper joins the constant-width road with no crease. Edge turn scales with
    the widening and never steps: max per-segment turn on the swept edge is
    3.3 deg with no apron, 5.0 at 16 m, 6.8 at 20 m, 10.2 at 28 m, while the
    CENTERLINE stays 3.27 in every case. A widths-only guarantee was asserted
    globally: with the apron on vs off over the same chain, no sample is ever
    NARROWER, only 18 of 210 samples change, they form one contiguous run across
    the seam, and centerline/elevation/banking are byte-identical. Round trip:
    the field survives export -> the REAL `parseTrack` -> `buildRuntime` (26 m
    across the seam in the game's own runtime). Race: a 12-car grid puts **every
    slot on 28 m road** (one width value under the whole grid, tightest margin
    11 m); a matched 96 s A/B, apron 28 m vs none, ran 3 vs 2 flips, 0 vs 0
    falls, 1 vs 1 wall, 12/12 upright both, best lap **22.924 vs 22.910 s** —
    indistinguishable. Committed tracks byte-identical to HEAD across 16,907
    numbers (measured by stashing). `svelte-check` clean, 0 errors.
  - **MEASUREMENT TRAP** that produced two wrong readings before I caught them:
    a piece's `width` is what it blends TO by its END, so the authored width AT
    the seam is the CHAIN's width, not piece 0's — an assertion sampled across
    the seam compares two different authored widths and reads as a pinch that is
    not there. And `raceState()` sampled after any delay measures cars that have
    already dispersed, not the grid; reset and read with no await.

- **Cursor-anchored wheel zoom + WASD free-fly in the piece-builder preview.**
  Two camera additions; the SolidWorks gestures, the handles and road picking
  are untouched.
  - **Zoom dollies toward the point UNDER THE CURSOR**, the rotate pivot's
    principle applied to the wheel: `applyZoom` uniformly scales BOTH the camera
    and the orbit target about that anchor. Because the pair scales as one body
    the view direction is untouched (`C' - T' = f·(C - T)`) and the
    camera-to-anchor vector only changes LENGTH, so the anchor projects to
    exactly the same pixel. The dolly is `f` whatever the anchor is
    (`|C'-T'| = f·|C-T|`), so the anchor decides only where the camera ends up
    laterally and the target can never slide behind it. The anchor is
    `pickPivot()`, the SAME resolution a rotate drag uses, so the two gestures
    agree on what "under the cursor" means. OrbitControls only ever dollies
    along the camera-to-target axis, so `enableZoom` is off and the wheel is
    owned here — the takeover the middle button already needed — at its own 0.95
    per notch, with `deltaMode` LINE/PAGE normalised. At a limit the step is
    REFUSED rather than clamped (a clamped step slides the anchor off the
    cursor), and each guard blocks only a step that makes things WORSE, so a
    camera already past a limit can work its way back.
  - **Free-fly is a keyboard PAN, not an orbit:** WASD/space/shift translate the
    camera AND the orbit target by the same delta (`applyPan`'s principle), so
    the view direction is exactly preserved and every later rotate/zoom/pan
    still has a sane target ahead of the camera. WASD is HORIZONTAL relative to
    facing — looking down and holding W flies level rather than diving, so
    altitude is space/shift's alone; the flattened camera-up is the fallback
    when a straight-down view leaves no horizontal facing. Speed follows the
    distance to the target (the quantity pan's reach already uses), clamped
    6..420 m/s, so flying feels the same zoomed out over the whole circuit as
    nosed up against one piece; diagonals are normalised.
  - **Arbitration:** fly stands down for the whole of a camDrag / handle drag /
    piece drag, which is also what keeps shift-as-descend from sinking the view
    during a shift+MMB pan. Shift is additionally suppressed while an ARROW is
    held, so the nudge's own 90-degree modifier does not double as a descend.
    Wheel zoom inherits the handle-drag freeze from `controls.enabled`.
  - **THE FOCUS GUARD IS `document.activeElement`, NOT A BLUR EVENT** — the
    correction this pass earned. Keydown lives on the canvas and a param field
    is a SIBLING, so a press delivered to the field never passes through the
    listener; that structural guard covers WASD exactly as it already covered
    arrows. But a key already HELD when focus moves to a field was a genuine
    leak, and the blur handlers meant to clear it DO NOT ALWAYS FIRE: focus can
    move with no blur at all (a programmatic `focus()`, a window the OS never
    focused), measured live here. So `flyStep` asks who is focused and clears
    the held set itself; the keyup and both blur handlers stay for promptness,
    not correctness.
  - **Verified** in `/dev/greenline-piece-builder`. Zoom: the aimed world point
    drifts **0.11 to 0.21 px** across four screen quadrants up to 368 px off
    centre, dolly ratio exactly `0.95^n` every time; the A/B against a
    centre-anchored dolly moves that same point **5.8 to 36 px** while holding
    the screen-centre point at exactly 0 — the mirror image. Limits hold (far
    5975 of 6000, near 1.55 of 1.5, camera y never under 0.5 through 400
    zoom-ins at a ground point). Fly: W/S read ±1 along the flattened facing and
    A/D exactly 0 (strafe, D = camera-right), space/shift pure ±Y, all at a
    uniform 34.87 m = speed x dt, camera and target translating IDENTICALLY in
    every case; a steep look-down + W gives dY exactly 0; straight down falls
    back and still flies level; diagonals and triples move the same distance as
    one axis; opposites cancel; descent stops at exactly y = 0.5. Arbitration:
    fly returns false and the camera is byte-frozen through MMB rotate,
    shift+MMB pan and a handle drag (which still wrote its param 60 -> 81.5,
    wheel refused and restored on release); the same pan gesture with and
    without Shift physically held gave BYTE-IDENTICAL deltas with fly steps
    interleaved where the loop runs them; shift+arrow nudges with a y delta of
    exactly 0 while shift alone still descends; piece selection works with fly
    keys held. Regressions: plain MMB still rotates about a pivot (camera and
    target move by different vectors), shift/ctrl+MMB still pan rigidly
    (mismatch exactly 0), the nudge is still exactly 15 / 90 degrees, handle
    drags still reshape, 0 console errors. Typing: a trusted click and real
    keystrokes put "142" through to the doc and a trusted ArrowUp stepped it
    142 -> 143 (`prevented: false`) while the camera stayed byte-identical and
    the held set emptied.
  - **The rAF loop needs a REAL window to verify** — the harness tab is
    `document.hidden` with 0 frames, so `flyStep` calls bypass `tick` entirely
    and prove nothing about the loop. Popups are blocked in both browsers here,
    so the loop was reached instead by patching `requestAnimationFrame` to
    capture callbacks and forcing a CLIENT-SIDE remount (a synthetic anchor
    click through SvelteKit's router keeps the JS context, and so the patch; a
    reload throws it away), then stepping the captured `tick` by hand: steady
    frames move `speed x 0.016` exactly, a release stops it dead, a fresh
    mount's first frame moves 0, and a 5-second gap moves `speed x 0.1` — the
    clamp holding instead of teleporting 352 m.
    **TRAP:** those callbacks RE-ARM, so iterating `__RAFQ` live recurses
    forever and wedges the renderer (it did, and the pane had to be abandoned).
    Snapshot the queue, or take only its newest entry.

- **Jump piece: independent takeoff + landing angles, real ramp mass, handles.**
  - **Investigation first (the launch was, and stays, pure ramp geometry).**
    The pre-existing jump had two params, `length` and `kickHeight`, and a
    hardcoded profile: a lip at 52% of the run, a steep drop face (marked
    `cliff`, exempt from the grade lint because it is flown over), a flat
    run-out. Nothing in the compiler or `GreenlineRace` imparts an impulse —
    the car goes ballistic only because the surface falls away faster than its
    wheels can follow — so gap and apex are earned by ENTRY SPEED alone.
    **Kept pure ramp geometry** (the task's default-if-unclear, and the harder
    direction to walk back): no assisted launch. Rewards carried speed, matches
    the physics-driven feel, and an assist can be added later without undoing a
    tuned one. Single piece kind: no subtypes or presets — the parametric
    approach covers the range.
  - **Two new OPTIONAL params, `takeoffDeg` and `landingDeg`, that resolve to
    the old profile when absent.** `jumpGeometry` (track-pieces.ts) is ONE
    closed-form span layout — shared by the generator, the range validator, the
    solid-mesh builder and the handles, so none can disagree about where the
    lip or landing is. `takeoffDeg` is the kicker's slope AT THE LIP
    (`sKick = KICK_EXP·kickHeight / tan(takeoff)`); `landingDeg` is the landing
    face's slope AT ITS CREST, where the car actually arrives, on a
    `hLand·(1-u)²` profile whose slope is STEEPEST at the crest and only eases
    to flat — so the authored number is both the arrival angle and the worst
    the face gets, never a figure the middle of the ramp quietly exceeds.
    Absent, `takeoffDeg` is derived from the legacy 52% lip and `landingDeg`
    defaults to 0 (a FLAT landing, the old profile and the harshest one), so
    every pre-existing jump compiles BYTE-IDENTICALLY — browser-verified to
    5e-15 m across five length/kick cases. A new jump authored in the builder
    ships explicit angles (18/12) so it uses the parametric model. Both angles
    are capped inside `atan(PIECE_GRADE_MAX)` (`JUMP_ANGLE_MAX_DEG = 30`,
    atan(0.62) = 31.8) because the kicker and landing are DRIVEN surfaces
    subject to the grade lint — only the drop face between them is exempt — so
    an author can never pick an angle the lint would then reject. A derived-span
    set that overruns the run reports a "does not fit" issue with the numbers,
    never silently reshapes.
  - **Real ramp mass, not a folded sheet (`jumpSolidMesh` in track-visual.ts).**
    The old jump was the flat ribbon with a deck-style underside paralleling the
    top, which read as bent card. A kicker is EARTHWORK: the fill's underside is
    the GROUND (y 0), so the mass grows with the ramp and the lip becomes a real
    edge with thickness behind it — same solidity standard as the deck work,
    but founded on the apron rather than hung on trestles (a deck is a bridge; a
    jump is a mound). Decorative only, never handed to cannon-es; the car still
    interacts only with the swept ribbon. `RibbonRuntime.jumpSpans` carries the
    jump sample ranges so the visual layer founds the fill without knowing what
    a piece is; the builder's preview re-wraps its chain as a verbatim ribbon
    (which erases piece kinds, so a broken chain still renders) and therefore
    passes the spans in from its diagnostics. Mounted in BOTH the builder
    preview and `GreenlineRace` (168 tris in a live race, verified).
  - **Handles (`AxisOpts.solve`, an exact non-linear readout).** Both angles are
    realised as SPANS, so the lip and the landing's base travel on a straight
    LINE along the run — the drag is a slide, and the readout inverts the span
    back to the angle in closed form (`atan(h / s)`) rather than a linearised
    `gain`. Pull the lip back → the kicker shortens and steepens; pull the
    landing base toward its crest → the landing face does. A flat landing (0°)
    has no face, so it has no handle (the field is the way back in). Same
    architecture as every other handle. Browser-verified: takeoff drag moved
    doc/field/readout together to 25 while landing stayed put, and vice versa.
  - **Verification — the landing genuinely drives differently.** Built matched
    jumps differing ONLY in `landingDeg`, driven with a controlled identical
    launch (`__greenline.teleport(x,z,h,speed)` for the same pre-jump state) and
    measured peak suspension force at the initial touchdown (the real "how hard
    it lands" number, off `downforceInfo().wheels`). At a 22 m/s launch: flat
    (0°) 2379 N, 16° 3078 N, 26° 2318 N — a ~30% spread at identical launch,
    with different touchdown positions and a flat-vs-elevated-tilted landing
    surface. The relationship is NON-MONOTONIC on purpose: softening is
    governed by how the ramp angle matches the car's DESCENT angle
    (`v·sin(rampAngle − descentAngle)` into the surface), and at 22 m/s the car
    descends ~18°, so a 16° ramp roughly matches while a 26° ramp over-steepens
    — exactly the design space "soften OR steepen" opens, not a monotonic
    knob. (Also learned: a fast car overflies a short landing entirely and
    touches down on the run-out beyond it, which is physically correct — the
    landing only bites a car that comes down onto it, so an author sizes the
    run-up to the landing.) Full 4-car AI race over a jump track: laps
    completed (~27.6 s best), 0 falls, 0 floor catches, all upright, no console
    errors. `svelte-check` clean, 0 errors, 0 new warnings.

- **The `closer` piece + honest open-chain preview + actionable closure
  reporting (the "closing a chain by hand is impossible" fix).** Closing a
  loop is a simultaneous position + heading + elevation + bank solve (plus
  pitch, which the closure check also judges); authors had no tool for it.
  Three changes, one feature:
  - **`{ kind: 'closer', radius? }`** is a seventh piece kind
    (`track-pieces.ts` / `track-schema.ts`) whose entire job is bridging the
    chain's end pose EXACTLY back to the chain start (technically: the first
    compiled piece's entry). CLOSED FORM, decomposed the way the generators
    already decompose: the PLAN is a Dubins-style turn/straight/turn
    connector — all six candidate words built from tangent geometry between
    the entry and target turning circles (the same arc + straight vocabulary
    `curve`/`straight` are made of); the outer-tangent words always exist at
    equal radii so a solution always exists, and every candidate is
    COMPOSE-CHECKED (segments walked analytically, end pose compared) so a
    wrong construction self-discards instead of shipping — the shortest
    valid word wins. ELEVATION + PITCH ride a cubic Hermite in arc length
    (height AND grade matched at both ends); BANK is the bank piece's own
    smootherstep blend; WIDTH blends to the chain's first-sample width. The
    one loop is AUTO-RADIUS (radius omitted): start at chord/3 clamped to
    [12, 60], then a bounded deterministic ladder (×1.4, ≤10 steps) widens
    the sweep while the Hermite's peak grade exceeds `CLOSER_SOFT_GRADE`
    (half the lint ceiling) — a pick among exact solutions, not an iterative
    approximation. The exit pose is returned as the exact target (heading
    reconciled mod 360 to the spin count actually swept), so closure reads
    literally 0.000 on all five axes. Rules: a closer must be the LAST piece
    and needs a compiled piece before it (both reported, and skipped in
    collect mode); `radius` is validated 4..2000 like a curve. The
    diagnostic row carries a `note` ("LSL · R 60.0 m auto") saying what it
    solved.
  - **The eager auto-closing preview ghost is retired.** `piecesChain`
    compiles with `closed: true` always, so `previewTrack` used to hand the
    sweep a closed ribbon and the wrap segment drew a straight-line ghost
    road from the chain end back to the start, clipping through everything
    it crossed. The compiler's closure record now carries `pitchGapDeg` +
    `ok` (all five gaps within tolerance), and an unclosed chain previews
    OPEN: no wrap in the sweep (`lengthM` also stops counting the phantom
    bridge), `deriveFurniture` emits NO boundaries (closed offset loops
    would bridge the gap the same way) and parks the gold start/finish pane
    AT the true chain start as the "bring the road back here" marker, and
    the 3D view skips checkpoint panes, showing an `OPEN — ends N m from
    the start` chip instead. Real exports never see any of this (export is
    gated on compiling clean, closure included). Verified by framebuffer
    read-back: the point on the old ghost line 50 m from any real road reads
    [0,0,0,0] while real road reads lit pixels.
  - **Closure reporting is a checklist, not jargon.** Closure failures are
    tagged `'closure'` on `ChainIssue`; the builder's guardrail list drops
    them (an unclosed chain mid-build is a NORMAL state, not five
    violations), the header chip gains a steel OPEN state (issue counts are
    genuine guardrail breaks only), and the closure panel renders
    `closureReadout()` (chain-doc): SIGNED deltas in plain directions
    ("pointing 50.0° left of the start", "8.10 m above the start", each row
    flipping to ✓ as it comes true, so closing by hand stays first-class)
    plus a one-click **CLOSE THE LOOP** button that appends the closer.
    `__glPieceBuilder` gains `closure` + `closeLoop()`; `__glPreview3D`
    gains `lastPreview` / `renderNow` / `toScreen` / `readPixel` (the
    no-WebGL-screenshot probe surface).
  - **Bank semantics, investigated and surfaced (not rebuilt):**
    `bank.targetBankDeg` is ABSOLUTE (eases from the entry bank to the
    target), so returning to level was always expressible as target 0 —
    just undiscoverable. The blurb/hint now say "absolute, not a delta; 0
    levels the road back out", the row summary reads "-> level" at 0, and
    the bank inspector gets a one-click "level out (0°)" quick-set.
  - **Verified in the browser** (dev harness + `__glPieceBuilder`): a chain
    violating all five constraints at once (202.65 m gap, 50° heading,
    +8.1 m elevation, 18° bank, 6° pitch) closes to EXACTLY 0.000 on every
    axis with one CLOSE THE LOOP click; 120 randomized chains all close at
    exactly zero residual with all six Dubins words appearing as winners
    (LSL 59 / RSR 49 / LSR 5 / RSL 4 / LRL 2 / RLR 1); the grade ladder
    bridges a 24 m descent at 13.4% peak grade by widening to R 48; an
    explicit radius is honored un-laddered; misplaced closers report their
    two rules; and the closed exports drove through the REAL playtest path
    (localStorage park -> tracks.ts -> parseTrack -> buildRuntime -> AI race
    in the movement harness): the all-five-constraints chain laps (falls
    there trace to its deliberately hostile hand-authored section), and the
    isolating flat chain whose closer supplies 364 of 629 m races SPOTLESS —
    4/4 cars lapping, 0 falls, 0 flips, 0 floor catches. Regression:
    piece-proof-01 recompiles to its documented figures exactly (152
    samples, 596 m, closure 2e-14 m, arch 2.36 m, raise 0) and races at its
    documented pace (best ~21.7 s, 0 falls, all upright). Zero console
    errors throughout.

- **Shared track visuals (`src/lib/greenline/track-visual.ts`) + the builder's
  live 3D preview.** Numbers alone do not answer "what does this corkscrew look
  like", which is the gap the preview closes and the reason its camera is FREE
  (orbit / zoom / pan) rather than top-down or chase — bank and spiral only read
  from an angle you pick.
  - **The extraction is the point.** `GreenlineRace.svelte` built the ribbon
    mesh, edge lines, boundary walls and gate panes INLINE; a preview with its
    own mesh code would be free to disagree with the road the game renders and
    collides. So the geometry construction moved to `track-visual.ts`
    (`buildRibbonGeometry` / `edgeLinePoints` / `buildBoundaryGeometry` /
    `buildGatePane`) and BOTH mount it — the rig-visual.ts convention applied to
    the track. Geometry there, MATERIALS at the call site: the race dresses its
    ribbon in worn asphalt under night lighting, the builder wants a lighter
    readable surface (shading is the author's only cue for grade and bank), and
    neither should inherit the other's look to share a shape. three.js is passed
    in rather than imported, so the module carries no static three dependency.
    Verified byte-identical: positions, UVs, vertex colors, indices, edge-line
    points and boundary walls all compare `===` against the pre-extraction
    algorithm across every committed track (450 / 1540 / 220 / 304 ribbon tris).
  - **One pipeline, nothing recomputed:** the document compiles through
    `diagnoseChain` (already the builder's source of truth), those exact arrays
    go to `buildRuntime`, and the meshes come from the shared builders. The
    preview mesh was measured against the runtime of the COMMITTED
    piece-proof-01 and matches the driven surface to 7.5e-6 m over all 306
    vertices — float32 storage precision, i.e. the same surface the physics
    Trimesh is wound from.
  - **Reaching a BROKEN chain needed one trick, not a second path.** A v3
    `pieces` surface cannot carry a broken chain (`parseTrack` compiles it and
    the compiler throws on the first violation — right for a track load, useless
    for an author who needs to SEE what they just broke). So `previewTrack`
    ships `diagnoseChain`'s already-compiled arrays as a verbatim `ribbon`
    surface. That is not a second geometry path: a ribbon IS a one-piece
    verbatim `freeform` chain internally (the documented v3 backward-compat
    contract), so `compileSurface` hands those very arrays straight back and
    `buildRuntime` sweeps them identically. `deriveFurniture` (spawn, gates,
    boundaries) is shared with `exportTrack`, so the surroundings an author
    inspects are the ones the exported file will carry.
  - **Violations read on the SURFACE, from the same state.** The per-sample
    `color` attribute the shared builder already writes is overwritten across an
    offending piece's own sample range — amber for a guardrail break, green for
    the selected piece — so the flag is a vertex tint on the shared geometry,
    not a second mesh and not a second check (it reads `diag.issues`). One
    honest exception, called out in the panel: a piece whose PARAMS are out of
    range (the bank-past-60 case) is SKIPPED by the compiler walk, so it
    contributes no geometry at all and cannot be tinted — the panel names it
    ("not drawn (params out of range): piece N") instead of pretending.
  - **Commit model, and the Svelte 5 trap it exposed.** Structural edits (add /
    remove / reorder / freeform paste / load) rebuild the scene immediately; a
    typed parameter commits on `change` (blur or Enter). The numeric readouts
    stay live throughout either way. The first attempt gated on a `rev` counter
    but still rebuilt on every keystroke: reading a prop inside an `$effect`
    SUBSCRIBES to it, and `doc`/`diag` change on every input event — so the
    doc/diag reads are wrapped in `untrack` and only `rev` and `selected` are
    tracked. Verified: typing 7 then 31 into a field left the mesh untouched
    (same uuid) while the doc read 31; the change event rebuilt it.
  - **Camera is the author's.** A fit-to-bounds solve (bounding sphere against
    the tighter half-FOV) frames the track ONCE; later edits never move the
    camera, since being yanked back after every tweak is the opposite of
    inspecting a corkscrew. A `Refit` control re-frames on demand.
  - **Verified** in the browser: the whole 13-piece piece-proof-01 chain renders
    with its corkscrew climb, banked corner and deck jump legible from arbitrary
    orbit angles (the selected corkscrew visibly ROLLS — near edge dipping, far
    edge lifting — through the middle and flattens at the top); a grade-breaking
    corkscrew renders amber against the grey road with export blocked; a
    `targetBankDeg: 75` bank flags its row AND reports "not drawn"; reordering
    the corkscrew after a 30 m straight shifted the rendered elevation profile
    by exactly that straight's length (the ROAD moved, not just the numbers) and
    removing a piece dropped the mesh from 306 to 292 vertices. The race itself
    still renders and drives after the extraction (Terminal Nine: 3 paths, zones
    firing, cars lapping; Proving Ground 07: 0 falls, 0 floor catches, 5 physics
    bodies — the flat-track gating intact).

- **Elevation-aware boundary walls + deck presence (Phase 9-fix-f), both in the
  shared `track-visual.ts` so the race AND the piece-builder preview pick them
  up with no duplicate wiring.** Two reported problems, and the investigation
  found they had DIFFERENT causes than the symptom suggested.
  - **Which of the two was actually broken.** The RENDERED wall was: it swept
    `y 0 -> 0.9` for every track regardless of relief, so beside
    piece-proof-01's raised deck it drew the barrier at ground level while the
    road it marks sat at 7.34 m. The PHYSICAL boundary was NOT: `surfaceState`
    never takes a y at all — it is a top-down polygon test, i.e. a column of
    infinite height — so it already applied at every elevation and never
    "stayed near ground level".
  - **The real reason a car was not caught up there**, measured rather than
    assumed: on the deck the ribbon edge sits at 6.0 m lateral and the
    boundary line at 7.8 m, but the collision surface ENDED at the edge. So a
    car ran 1.8 m off the deck into thin air, lost every wheel contact, and
    was already ballistic before the soft wall — a horizontal spring — had
    anything to push against. It fell to the y-0 catch plane. On a flat track
    that same strip is solid ground (the apron plane), which is precisely why
    walls work there. The Terminal Nine run-off-margin lesson had already
    narrowed the margin for this reason; it reduced the failure without
    removing it.
  - **Fix: a run-off SHOULDER** (`deckShoulderMesh`), real ground continuing
    the road's own cross-section past each edge wherever the ribbon is raised,
    with ONE `MeshData` feeding both the visual mesh and the `CANNON.Trimesh`
    so the two cannot drift. Deliberately not a hard collision wall — the
    runtime rules those out on purpose.
    - `SHOULDER_M` is 5.5, sized from measurement: the authored margin (1.8)
      plus how deep the wall actually lets a car go before arresting it
      (2.07 / 2.08 / 2.48 m at 18/25/35 degree approaches). An earlier 3 m
      strip ran out of ground mid-arrest and the car fell anyway.
    - **The strip runs out HORIZONTALLY at the edge height, and that is a
      correctness requirement.** `surfaceYAt` clamps a query past the edge to
      that edge's height, so the runtime ALREADY declares the surface out here
      to be flat; the shoulder has to BE that surface. A first version raked
      it along the banked plane instead, putting real ground BELOW the
      reported height on the low side of every banked deck — the chassis-floor
      watchdog read that as a car sunk through the floor and shoved it back up
      **467 times** in one pass over Terminal Nine's sweeper, against 8 before.
      Flat at the edge height, the two agree and the watchdog has nothing to do.
    - Gated on `DECK_MIN_RISE_M` (0.5, the same threshold the chassis floor
      uses): below it the apron plane already is the run-off ground.
  - **Deck presence (decorative only, never handed to physics):**
    `deckSlabMesh` extrudes a raised span down to a real thickness
    (`halfWidth * 0.16`, clamped 0.4-1.4 m) and `deckSupportsMesh` puts trestle
    bents — two legs, cross-beam, brace on tall ones — under anything above 2 m
    at ~17 m spacing, all merged into ONE mesh per path for the draw-call
    budget. Box faces carry their own vertices so edges stay crisp; shared
    corners smooth-shaded them into soft lumps, which defeats the point. The
    slab underside is clamped at the apron — unclamped it sank 0.63 m THROUGH
    the y-0 plane where a deck barely clears the rise threshold.
  - **`buildBoundaryGeometry` takes an optional `rt`** and foots each post at
    the local surface via `surfaceProbe`, using the same two-grounds rule the
    scenery placement uses (within 20 m of the edge rides the ribbon, further
    out stays on the apron). Omitting `rt` keeps the old flat band.
  - **Verified.** Wall: now spans `y 0 -> 8.24` with **exactly 0 mismatch**
    against road height at every boundary point over raised ground. Caught:
    run-wide approaches at 10/18/25/35 degrees on the elevated straight are all
    held with 0 falls, where 18/25/35 all fell before; a near-perpendicular 50
    degree launch still leaves, which is correct and preserves deliberate
    deck-edge cliffs (Terminal Nine's kicker still flies — 0.54 s airtime,
    2.93 m clearance at 45.6 m/s). **Collision parity, the strong claim:** a
    fingerprint of the whole drivable surface — both swept edges, half-widths,
    banking, elevations and the `surfaceYAt` query, 12,600 numbers across all
    four tracks — is **byte-identical to HEAD**. Proving Ground 07 (flat)
    builds NOTHING (0 shoulder/slab/support triangles, still 5 physics bodies,
    surfaceY 0 over a 1600-point grid, 0 falls, 0 floor catches). Terminal Nine
    reads upY 0.956 = cos 17 degrees on the sweeper and 0.86 ride height on the
    deck; relief-proof-01 reads upY 0.951 = cos 18 degrees measured while
    RACING (a stationary teleport onto a steep berm slides and flips — a test
    artifact, not a regression, and it does the same at HEAD). Same-config AI
    race A/B: Terminal Nine HEAD 9 falls / 539 floor catches in 192 s against
    2 / 237 in 174 s with the fix; relief-proof-01 HEAD 7 falls / 516 catches /
    2 upright against 7 / 366 / 3 upright — at or better than baseline
    everywhere, because cars now have ground where they used to drop off.
    Nothing on any track dips below the apron. `svelte-check` clean, 0 errors.
  - **NOTE for future harness work:** the piece-builder preview does NOT pump
    rAF, so in a hidden/automated tab it renders once and never updates —
    orbit and zoom appear to do nothing. The race harness has `?glheadless=1`
    for exactly this; the builder does not. To inspect deck geometry visually,
    render the shared builders into your own scene and camera and call
    `render()` yourself, which is also the honest test since those builders are
    the single source both surfaces mount.

- **Real SFX content for categories 1-6 (`src/lib/greenline/sfx.ts`), replacing
  the placeholder tones.** All 190 recorded `.wav` takes land flat in
  `static/greenline/audio/` beside the music (the existing convention), named
  `sfx_<category>_<specific>_NN.wav`. `sfx.ts` is the ROSTER — the content layer
  over the Phase 2C engine, which keeps owning the bus graph, voice pooling, pan
  and Doppler. An entry declares its takes, bus, mix level, pitch jitter and
  whether it loops; call sites only ever name an event.
  - **Take counts follow what is ON DISK, not a planned number.** Where more
    takes were recorded than the original roster called for, ALL of them are in
    (autocannon fire 8, turret fire 7, hit-crunch and railgun impact 6, hook
    pull and ui-confirm 5, ...), so nothing recorded goes unused and repetition
    is as rare as the source allows. Verified by content hash: every distinct
    source `.wav` is present, zero dropped.
  - **The engine had NO loader and NO loop path** (`playBuffer` took an
    `AudioBuffer` nothing ever produced), so both were added: `audioEngine.decode`
    and `PlayOptions.loop` / `fadeInSec`, with the handle gaining
    `setGain`/`stop`. **Looping voices are EXEMPT from the soft-cap stealing** —
    a sustained cue silently killed by an unrelated burst has no way to restart
    itself — which makes every start the caller's to stop. Fixed alongside:
    `stopVoice` used to disconnect the graph immediately, cutting its own
    fade-out into a click; it now leaves teardown to the already-wired
    `source.onended` so the fade is actually heard (invisible on the old
    one-shot steal path, obvious on a loop).
  - **Loading model, and why:** a gameplay frame cannot await, so `playSfx` is
    synchronous and plays only from an already-decoded buffer; a miss kicks off
    that file's load and returns null (ONE silent trigger) rather than firing
    late and out of sync. `primeSfx()` warms all 124 at concurrency 4 on the
    first gesture (`GreenlineMusic`'s existing `armGesture`, i.e. the title
    screen, long before a race) and again at race mount for the dev harnesses,
    which mount the race without the music controller. Idempotent. Every failure
    mode — missing file, bad decode, no Web Audio — resolves to silence, never a
    throw into a frame.
  - **`syncLoop(name, wanted, ref, pos?)`** in `GreenlineRace` drives every
    sustained cue off a per-frame boolean (rising edge starts, falling edge
    stops), so a held state never restarts the sound. Wired: jammer hum, shield
    hum, guided lock-charging, nitro / grip / air-correction, tether pull,
    per-projectile rocket motors (keyed `proj:<id>`, so they Doppler past on
    their own), the low-hull alarm, the pit-repair machinery, and the weather
    beds (yard / rain / fog, keyed off `ENV.id` so a live weather swap
    cross-swaps the bed with the visuals). Two hygiene points that are NOT
    optional given loops are unstealable: `stopAllSfxLoops()` on teardown, and
    the same at the `paused` early-return — that return skips the block driving
    every loop, so one left running would drone under the pause menu with
    nothing able to stop it.
  - **New triggers that had no cue at all:** countdown ticks, cluster splash,
    EMP impact, oil trigger, hook latch/release, blade retract, flip recovery,
    weapons-offline status, thunder on the lightning strike, and tire dust
    (throttled to ~3/s and player-only — puffs spawn ~18/s, so one cue per puff
    would be a rattle, not a texture).
  - **UI had no sound anywhere.** `src/lib/greenline/ui-sfx.ts` is a `uiSounds`
    Svelte ACTION: one delegated pointer pair on a panel root gives every button
    inside it hover + click, instead of a play call in 100+ handlers. A button
    names a different cue declaratively with `data-sfx="confirm|back|save|tab|
    none"`. Mounted on the title, garage, settings and results roots. OUTCOME
    cues (purchase vs insufficient funds) call `playUiSfx` at the decision
    point, because they depend on what the handler decided, not on what was
    pressed. **One deliberate UX change:** the occupied socket button in the
    garage moved from `disabled` to `aria-disabled` — a genuinely disabled
    control swallows pointer events, so the "that hardpoint is taken" cue could
    never have fired. It stays exactly as non-functional (its handler only plays
    the cue) and the delegated sound skips it on the same attribute.
  - **Aliases, not duplicate files:** cluster lock/travel reuse the rocket's
    recordings and the turret reuses the autocannon's impact, resolved in the
    roster to the SAME cached buffer (browser-asserted by object identity).
  - **Verified** in `/dev/greenline-portal` (whose audio bar gained
    `prime`/`cache`/`play`/`loop`/`stopLoops`) and
    `/dev/greenline-movement?glheadless=1`: all 190 files fetch and decode
    (`loaded 190, failed 0` — meaningful because the SvelteKit dev server serves
    the HTML app shell with a 200 for a MISSING static path, so only a real
    decode proves an asset exists); an analyser tapped on the master bus shows real
    signal for one sound from each of the six categories (peak RMS 0.049-0.357
    against a silent floor of ~0); the voices are `AudioBufferSourceNode` with
    `oscFreq: null` and real stereo buffers, i.e. genuinely recordings and not
    the old tones; all eight bus mappings match the spec; variation rotation
    reaches every take in the deepest pools (8/8 autocannon, 7/7 turret, 6/6
    crunch, 5/5 confirm) with **0 immediate repeats**; a loop survives a 20-shot flood on its
    own bus, is still sounding well past its buffer end, and fades on stop; the
    game's OWN path fires real buffers (weapon fire, damage funnel, the ambient
    bed live in-race) with a 4-car race running weapons/tether/caltrops, all
    rigs upright, 0 falls, no console errors; and the `data-sfx` routing is
    exact (tab button plays tab-switch, primary plays confirm, untagged plays
    click, all cue sets disjoint by buffer identity), with the taken socket
    playing exactly ONE conflict cue, not the generic click, and leaving the
    loadout unchanged while free sockets still work.
  - **Every roster event now has real recorded audio** (190 takes total). The
    one remaining unwired asset is `sfx_abl_repair_loop`: it is loaded but has
    no trigger, because Overcharge Repair is an instant heal with no sustained
    repair phase to cover (the pit stop uses `env_pit_repair_loop` plus
    `abl_repair_complete` on release).

- **Real SFX for the last five categories (engine, collision, drift, results,
  fun): 29 more takes, and the engine-audio system that did not exist before.**
  Same content-layer model as the first six categories — the roster
  (`sfx.ts`) owns which file, how loud and how variations rotate; the engine
  (`audio-engine.ts`) owns the bus graph, pooling, pan and Doppler.
  - **A dedicated `engine` bus**, sibling to music/weapons/impacts/ui/ambient
    rather than folded into ambient: it is the one bus carrying nothing but
    sustained loops, it is always several voices deep, and its level wants to
    move on its own. It sits OUTSIDE the soft-cap arithmetic on purpose — the
    four one-shot caps still sum to `GLOBAL_VOICE_CAP`, and engine voices are
    loops, which are already exempt from cap accounting and stealing.
  - **`VoiceHandle.setRate`** is the one new engine primitive (mirroring
    `setGain`): it writes `voice.baseRate`, so Doppler keeps MULTIPLYING on
    top instead of overwriting the caller's pitch on the next ticker frame.
  - **RPM is a proxy, and it is derived per build, not shared.** There is no
    gearbox to read, so `Rig.engineRpm` is `speed / sqrt(engineForce /
    aeroDrag)` — the SAME top-speed formula the garage hero and the AI driver
    use, so every car peaks at its own ceiling — lifted by throttle
    (`ENGINE_THROTTLE_LIFT` 0.26, so a car standing still and floored still
    revs) and eased asymmetrically (rise 5.5/s, fall 2.4/s) for engine
    inertia. Nothing in the sim reads it back.
  - **Equal-power crossfade, not linear.** Three constant-RPM recordings per
    archetype run as continuous loops while the vehicle is audible, and the
    adjacent pair crossfades on `cos/sin(t·π/2)`. Linear would dip ~3dB in the
    middle of every transition, which is exactly the "smooth at idle and max,
    wrong in between" failure. A single continuous rate curve
    (`ENGINE_RATE_LO` 0.94 -> `HI` 1.07 across the rev range) rides underneath
    so both audible layers glide together and nothing steps at a boundary.
  - **THE GAINS IN THE ENGINE ROSTER BLOCK ARE MEASURED, NOT PICKED.** The
    twelve takes arrived spanning a ~6.7x RMS range (handling idle 0.080
    against systems mid 0.537); crossfading between takes that far apart
    lurches rather than glides. Each gain is `(target x band) / measuredRms`
    with a band profile (idle 0.72 / mid 1.0 / high 1.25) that deliberately
    keeps a revving engine louder than an idling one after normalization has
    flattened everything else. The four result stings got the same treatment
    (they spanned 6x; the lose take is genuinely quiet at 0.034 RMS and sits
    at gain 1.0 for that reason). **Re-measure and recompute if a take is
    replaced** — equal gains would undo the whole thing.
  - **Distance is handled in the game layer, because the panner cannot.**
    Voices are pan-only (`rolloffFactor 0`), which is right for discrete
    one-shots and would make every car in the field a full-volume motor. So
    the falloff is applied as gain (flat inside 14 m, easing to nothing at
    75 m) and a vehicle past 75 m has its loops STOPPED — which is what keeps
    the live voice count near the handful of cars actually around you
    (measured 3-24 voices in an 8-car race) instead of the whole grid. AI
    engines run alongside the player's; no player-only fallback was needed.
  - **`audioEngine.setListener` is now called every frame** (camera position +
    orientation, player velocity for Doppler), read BEFORE screen shake so a
    hit never jitters the pan. Nothing set a listener before this, so every
    positional cue in the game had been panning relative to the world origin.
  - **Ram tiers off the ram's own `violence` scalar**, recomputed exactly as
    `tryRam` scales its damage by it, so the sound and the damage read the
    same number: light under 0.95, medium to 1.25, heavy above (a 9-17 m/s
    closing speed is a clunk, 18-22 a crunch, 22.5+ a crush). One sound per
    contact, at the contact point.
  - **Drift is player-only** (a grip report about your own machine, on the
    ambient bus with the other own-vehicle readouts): a chirp on the rising
    edge of a real slide, then a grinding bed whose level swells with slip.
    Thresholds are sized against the MEASURED regimes — a clean straight sits
    near 0.2 lateral m/s and a committed corner 0.9-1.5, so screeching starts
    at 1.8 (hysteresis release 1.4, full level at 4.0) and the cue means "you
    are sliding", not "you are turning". `syncLoop` gained an optional gain
    scale to carry the swell.
  - **Results stings** fire once on the results screen off the outcome it
    opened with (an untracked latch, so the board arriving or a rating click
    never re-triggers them). The record flourish is a SEPARATE, later cue keyed
    on `award.pbBonus` — the server's own answer to "did this run beat your
    previous best lap here" — so it plays whether or not the run was also won.
  - **`result_milestone_unlock` marks the CONFIRMED unlock**, in the route's
    purchase handler when the server has actually credited it, a round trip
    after the garage's optimistic `ui_purchase` click chime. A replayed
    `already_unlocked` deliberately gets no flourish.
  - **`fun_siren` / `fun_horn` are loaded but UNWIRED**, the `abl_repair_loop`
    precedent: no horn or siren action exists in the control registry and
    inventing one is a gameplay change, not a content pass.
  - **Verified** in `/dev/greenline-portal` and
    `/dev/greenline-movement?glheadless=1`: all 219 roster files fetch and
    decode (`loaded 219, failed 0` — meaningful because the dev server returns
    the app shell with a 200 for a MISSING static path, so only a real decode
    proves an asset exists); every new one-shot produces real signal against a
    zero floor, with the ram tiers escalating in level as authored (0.218 /
    0.460 / 0.503). The engine crossfade was swept across the FULL rev range on
    a dyno for two archetypes — HANDLING held 0.051-0.068 engine-bus RMS and
    SYSTEMS (the worst case, raw takes spanning 5.8x) held 0.040-0.071, both
    with continuous gain curves and no gaps — and then driven for real on
    ARMOR through accelerate/coast/brake/accelerate/lift, where revs fall as
    well as rise: 140 samples, 0 silent, rms 0.031-0.082. Distance culling,
    pause (12 engine voices -> 0, back to 9 on resume, no drone under the
    menu) and unmount teardown (12 -> 0, no leak) all confirmed. The drift cue
    stayed silent on a clean 17.4 m/s straight and fired at lat 3.22 in a real
    handbrake slide, ambient bus 0.0017 -> 0.1030, edge-triggered not
    per-frame. The record flourish was isolated by integrated energy in the
    850ms+ window: 6x with `pbBonus 40` against `pbBonus 0`, identically for
    P1 and P4. **Not verifiable without live credentials:** the
    `result_milestone_unlock` trigger, which sits behind the signed-in
    `/greenline` purchase round trip (the sound itself is proven to play).

- **Real distance falloff, and a spatial/flat split declared in the roster.**
  Panning and Doppler existed since Phase 2C but `rolloffFactor` was 0, so
  nothing ever got quieter with distance. It does now, for world sounds only.
  - **THE PANNER STILL DOES AZIMUTH ONLY, AND THAT IS DELIBERATE.** Both native
    distance models were MEASURED against an OfflineAudioContext before the
    design was picked, and neither does what this game needs: **`inverse`
    ignores `maxDistance` completely** (the term appears only in the `linear`
    formula), so it keeps falling forever — 0.012x across a 1.2km straight,
    i.e. silent, with no way to floor it; and **`linear` honours maxDistance by
    hitting exactly zero there**, which is the same problem with a harder edge
    on top of its known near-field spike. So `distanceGainFor()` evaluates the
    `inverse` CURVE in JS with maxDistance as a genuine clamp and an explicit
    floor under it. It is close to free: the Doppler ticker already computed
    every positional voice's distance each frame, so this reuses that number.
  - **Distance rides its OWN GainNode** (`source -> gainNode -> distNode ->
    panner -> bus`), never the caller's. The engine crossfade rewrites the
    caller gain every frame; if distance shared that node the two writers would
    overwrite each other.
  - **Four named tuning knobs, all in one block** in `audio-engine.ts`:
    `DISTANCE_REF_M` 14 (full volume inside), `DISTANCE_MAX_M` 180 (falloff
    stops steepening), `DISTANCE_ROLLOFF` 1, `DISTANCE_MIN_GAIN` 0.06 (a
    backstop; the maxDistance clamp is what sets the practical floor at
    ref/max = 0.078). Doppler's clamp widened to `[0.85, 1.18]` from
    `[0.94, 1.06]`, same two named constants as before. All starting points to
    be tuned by ear — no call site carries a falloff curve of its own.
  - **The engine loops' own distance curve was DELETED, not layered under this
    one.** The previous session gave them a game-layer falloff precisely
    because the panner had none; keeping it would have attenuated engines twice
    and quietly undone the mix. What remains in `GreenlineRace` is voice
    management, not loudness: past `ENGINE_CULL_M` (pinned to the audio
    engine's own `DISTANCE_MODEL.maxM`, so anything culled was already at the
    floor and the stop is inaudible) a vehicle's three loops stop outright.
  - **`SfxDef.spatial: false` is the category split**, declared per entry
    rather than inferred from whether a call site remembered to pass a
    position — so a caller can never accidentally turn the rain bed or a menu
    click into a point source. `playSfx`/`startSfxLoop` STRIP position and
    velocity for those entries, and `setPosition` on a non-positional voice is
    a no-op. Flat: all `ui_*`, `race_countdown_tick`/`race_go`, all `result_*`,
    and the four atmosphere beds (yard/rain/fog/thunder — thunder included
    because the strike has no position and a rolling recording already carries
    its own distance). **Two judgment calls beyond the brief's list:**
    `veh_low_health_warning` and `veh_offline_status` are flat too — a cockpit
    alarm and a systems-down callout are instrumentation about your own
    machine, not events at a point in the yard (the brief's world-space
    `veh_*` means the hit/damage cues, which are all spatial). `env_draft_engage`
    was in neither list and is treated as spatial, being a real world event.
  - **The last non-positional world sounds were fixed.** Ten player-owned cues
    (jammer/shield hums, the lock-charge beep, hook-pull, nitro loop + end,
    grip, air-correct, pit repair, repair complete) passed no position at all,
    purely because nothing had asked them for one. They ride the car now, like
    the engine layers already did. Distance is a no-op for them in practice
    (the chase camera sits inside the reference radius), so nothing got
    quieter; what changed is that they swing correctly around you under
    free-look instead of sitting glued to centre.
  - **VOICE STEALING: PARTLY FIXED, AND THE REST IS FLAGGED.** The tiebreak
    ranked by `peak` — the authored mix level — which never sees distance, so
    it could NOT have become distance-aware on its own; it now ranks by
    `peak x distGain`, the actually-audible level. But the primary key is still
    AGE, and age dominates: measured, a same-frame burst correctly sacrificed
    3 distant voices and kept all 4 nearby ones, while a staggered case where
    the nearby sounds were merely OLDER sacrificed 3 of 4 loud nearby voices to
    keep faint across-the-map ones. Left as-is deliberately (the brief scoped
    the policy out, and oldest-first guarantees turnover so no sound can
    monopolise a slot) — making level the primary key is a one-line change in
    `steal()` if playtesting wants it.
  - **Verified** in `/dev/greenline-portal` (two new audio-bar buttons,
    `near/far` and `meta @400m`, plus `__greenlineAudio.distanceModel`) and
    `/dev/greenline-movement?glheadless=1`. Acoustically on the master bus, one
    world sound swept out: flat 0.42 at 0m/7m/14m (no near-field spike), 0.196
    at 30m, 0.098 at 60m, 0.0588 at 100m, then **0.0327 at 180m, 400m AND
    1200m** — the floor holding exactly as intended, a 12.8:1 (~22dB) near-far
    difference. Category split proved by HANDING A POSITION AND VELOCITY TO
    EVERY ID: all 10 world sounds attenuated (0.078 at 400m, panner tracking),
    all 12 meta/bed cues refused it (`distGain` null, `panX` null, no panner at
    all), and `result_win`/`race_go` measured identical at 0m vs 1200m
    (0.43/0.4291, 0.5139/0.5152 — the far reading marginally HIGHER, i.e.
    noise). `ui_confirm` looked like it attenuated until repeated plays at one
    position showed a 0.077-0.137 spread from its 5 rotating takes, with the
    far set peaking higher than any near one. Flyby at 70 m/s: rate 1.18
    approaching -> 0.85 receding with distance swelling 0.093 -> 1.0 -> 0.096
    symmetrically. Engines proved single-attenuated by predicting the curve for
    each live voice's distance and comparing: **max error 0.002** across a
    running race. **Perf:** the whole spatial pass (Doppler + distance, every
    emitter repositioned) costs **0.126 ms/frame at 63 positional voices** —
    75% more than the game's own 36-voice worst case — i.e. **0.75% of the
    16.7ms budget**. A full 12-car race held mean 5.21ms / p95 9.1 / worst 15.2
    (31.2% of budget), master peak 0.774 with **0 clipped and 0 NaN samples**
    over 1325 sampled frames, context "running" throughout, 38 concurrent
    voices, no console errors or audio-graph warnings.
  - **Tuning note for playtesting:** the Doppler clamp saturates above ~52 m/s
    closing (approach) and ~60 m/s (recede), and GREENLINE cars run 45-80 m/s,
    so head-on passes will often sit AT the clamp rather than sweeping through
    it. Widen `DOPPLER_MIN`/`DOPPLER_MAX` further if passes should sweep more.

- **Self-crossing tracks (overpasses): detection, local boundary enforcement,
  overpass-aware deck structure.** A piece chain whose road comes back over
  its own earlier footprint (a loop returning above a straight) used to break
  three ways, each with a different root cause, all confirmed by
  investigation before fixing:
  - **The car-blocker was the BOUNDARY system, not wall footing.** The
    builder's derived boundaries are two closed 2D offset loops following the
    centerline order; on a self-crossing chain both loops cut ACROSS the other
    pass's corridor in XZ, and `surfaceState`'s even-odd `insideLoop` test is
    a pure top-down column — so clear road read as out of bounds and the
    25 kN soft-wall spring pinned cars on it (measured at HEAD: the proof
    track's own centerline registered 114 wall violations over 260 samples
    through the real publish validator; with the fix, 0).
  - **Detection (`computePathOverlapZones`, track-runtime):** per-path
    spatial-hash pass over the compiled samples finding pairs close ACROSS
    the ground (within summed half widths, `real`; +12 m slack for
    structure-query `near` zones) but far ALONG the road (exclusion window
    1.75x summed half widths + 8 m, so a hairpin's own legs never flag; wrap
    distance on closed paths). Clustered into `PathOverlapZone` range pairs
    on `RibbonRuntime.overlapZones`; any `real` zone flips
    `TrackRuntime.selfOverlaps`. SAME-PATH only, deliberately: a branch
    genuinely shares ground with the main line at its joins (that is what a
    merge is), so Terminal Nine's branches/pit lanes never flag —
    branch-over-main crossings are OUT OF SCOPE this pass and keep the old
    behavior. All four committed tracks: zero geometry/enforcement change
    (fingerprinted byte-identical vs HEAD; PG07 carries 2 inert near-miss
    zones from its switchback legs, `real: false`).
  - **Enforcement goes strictly local on such tracks** (the schema doctrine:
    the data says where the limits are, never how they are enforced): when
    `selfOverlaps`, `surfaceState` REPLACES the polygon walk with per-sample
    lateral limits `limitLeft`/`limitRight` = bank-shortened half width +
    `boundaryMarginFor(edgeY)` — the ONE margin rule, moved to track-runtime
    and imported by chain-doc so the authored line and the enforced line
    cannot diverge — enforced against the pass the vehicle is actually on
    (warm-scoped), pushing back toward that pass's own centerline. The
    authored loops stay in the data (minimap still draws them, schematic).
    Cars on either pass of a crossing never see a false violation; the wall
    is still there past the limit with the push pointing back at the road.
  - **Deck structure asks what is under it** (`otherStretchAt` +
    `underFloorAt`/`clippedShoulderExtra` in track-visual, `OVERPASS_CLEAR_M`
    2.75): support bents whose feet OR span sit over the other pass's
    drivable corridor are SKIPPED outright (a clear bridged span; a column
    cars drive through would be worse than none — `sinceLast` stays past
    spacing so the next clear sample plants one), feet beside the road stop
    on that local ground instead of piercing to the apron, the lower brace is
    dropped when any road runs below; the slab skirt and jump fill clamp
    their undersides against the pass below (keep `OVERPASS_CLEAR_M` open
    over its roadway, sit on its run-off beside it); the shoulder strip stops
    short of the other pass's envelope where the two are at similar heights
    (the start of a climb-over), so no ledge crosses the lower road — which
    also scopes the PHYSICS shoulder trimesh, since it is the same MeshData.
  - **Walls/fence:** on self-crossing tracks the race and the piece-builder
    preview mount `buildLimitWallGeometries` — per-pass bands standing
    exactly on the enforced limits at each sample's own edge height (lower
    pass's wall runs under the bridge, upper's above) — instead of
    `buildBoundaryGeometry` loops; the chain-link fence is skipped (it
    follows the outer loop, which crosses the road there).
  - **Fall-recovery adopt (`adoptStretchUnder`):** a car that drops off the
    overpass onto the pass underneath stays warm-locked to the deck overhead
    (the two passes share XZ, so the warm window never leaves it) and used to
    be Lakitu-yanked back up 1.2 s later while driving legitimate road. When
    `selfOverlaps` and the drop condition trips, the runtime first checks for
    another stretch of the same road right under the car (corridor + run-off,
    within the drop threshold) and ADOPTS its nearest sample as the new warm
    index instead of recovering. Browser-verified: warm 128 (upper range) ->
    19 (lower) on the first frame, falls delta 0, car kept driving under the
    bridge.
  - **Derived gates step clear of crossings** (`deriveFurniture`): a gate
    line is a 2D segment crossed at ANY height, so a gate under an overpass
    is also crossed by traffic above (rejection noise at best, a wrong-pass
    start/finish satisfaction at worst) and its pane would draw at whichever
    pass is XZ-nearest. Every derived gate index slides forward to the next
    sample clear of the overlap zones, forward-only so checkpoint order stays
    monotonic (a checkpoint with no room left is dropped rather than
    misplaced); non-crossing chains place exactly as before.
  - **Proof track `tracks/overpass-proof-01.json`** (1023 m, kind `test`,
    registered in tracks.ts): a flat start straight crossed 15.9 m overhead
    by the return leg, one real overlap zone (samples 12-29 under 120-138).
    Verified end to end: the publish validator passes (fails at HEAD with 114
    wall violations), 204 on-road probes 0 false violations / walls present
    past the limits with correct push, 0 support/shoulder verts inside the
    lower roadway envelope, gates all clear of the zone, and REAL drives in
    the harness — the lower pass straight through under the bridge with no
    stall and no wall contact, the upper pass across the full bridge at
    constant deck height, the drop-adopt case above, and a full AI race
    completing laps. Physics/enforcement identical on every committed track
    (fingerprint A/B), svelte-check clean.
  - **Still deliberately out of scope:** cross-path overlaps (a ribbon
    BRANCH flying over the main line), polygon-union outer boundaries for
    the minimap on self-crossing tracks, and hard pylon collision (deck
    structure stays decorative; the drivable surface is still only the
    ribbon + shoulder trimeshes).

