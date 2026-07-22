<script module lang="ts">
	/**
	 * The outcome of a completed RACE, handed to `onFinish`. Shaped to feed
	 * submitRaceResult (the caller adds trackId / mode / archetype).
	 */
	export interface RaceOutcome {
		finishPosition: number;
		totalTimeMs: number | null;
		bestLapMs: number | null;
		laps: number;
		/**
		 * Which way round the track the player drove (telemetry, Phase 8f):
		 * 'main', or the id of the alternate RibbonBranch they used. On a
		 * single-route track this is always 'main'.
		 *
		 * MVP semantics, stated plainly because they are coarse: this reports
		 * the LAST alternate route the player was on at any point in the race,
		 * not a per-lap breakdown. It answers "did this player use the
		 * shortcut", which is the design question Terminal Nine's split
		 * actually poses; a per-lap series is a later phase's job.
		 */
		route: string;
	}

	/**
	 * The subset of the live tuning DEFAULTS that the garage's hero numbers read,
	 * exported so a standalone garage screen (the real portal route) can show the
	 * same figures without mounting the tuning panel. Kept in lock-step with
	 * DEFAULTS below (health = COMBAT_DEFAULTS.maxHealth).
	 */
	export const GARAGE_BASELINE = { health: 260, mass: 180, engine: 2900, drag: 0.68 };
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { parseTrack, type TrackData } from '$lib/greenline/track-schema';
	import { clampAiCount, GRID_MAX_AI } from '$lib/greenline/grid-selection.svelte';
	import {
		buildRuntime,
		formatLapMs,
		headingToDir,
		LapTracker,
		surfaceProbe,
		surfaceState,
		surfaceYAt,
		zoneEntries
	} from '$lib/greenline/track-runtime';
	import {
		COMBAT_DEFAULTS,
		cooldownRemaining,
		driveMods,
		slotCooldownRemaining,
		splitPools,
		tetherStatus,
		tryActivateShield,
		tryBladeStrike,
		tryDeployBlades,
		tryDeployCaltrops,
		tryDeployOil,
		tryFire,
		tryFireKinetic,
		tryLaunchGuided,
		tryRam,
		tryTether,
		updateCaltropFields,
		updateOilSlicks,
		updateProjectiles,
		updateTurret,
		updateWeaponLock,
		VehicleCombat,
		WEAPON_NONE,
		WEAPON_SLOTS,
		weaponById,
		type ActiveTether,
		type CaltropField,
		type Combatant,
		type CombatTuning,
		type DamageResult,
		type GreenlineMode,
		type HitZone,
		type OilSlick,
		type PoolMaxes,
		type Projectile,
		type WeaponDef,
		type WeaponLock,
		type WeaponSlotId,
		type WeaponSocketId
	} from '$lib/greenline/combat';
	import {
		ABILITY_NONE,
		ABILITY_SLOTS,
		abilityById,
		driftIntensity,
		tryActivateAbility,
		VehicleAbilities,
		type AbilitySlotId
	} from '$lib/greenline/abilities';
	import {
		AI_DEFAULTS,
		AiDriver,
		VEHICLE_TRACTION_ACCEL,
		aiTuningFor,
		fireThreshold,
		type AiSkill,
		type AiTuning
	} from '$lib/greenline/ai';
	import type { EnvironmentPreset, EnvPresetId } from '$lib/greenline/environment';
	import {
		activeEnvironment,
		setWeatherPreset,
		weatherSettings
	} from '$lib/greenline/weather.svelte';
	import {
		archetypeById,
		defaultLoadout,
		neutralStats,
		normalizeCosmetics,
		parseLoadout,
		resolveLoadout,
		resolveWeaponSockets,
		sanitizeLoadout,
		serializeLoadout,
		type ArchetypeId,
		type Cosmetics,
		type Loadout,
		type PartSlot,
		type ResolvedStats
	} from '$lib/greenline/loadout';
	import { audioEngine } from '$lib/greenline/audio-engine';
	import {
		COM_DROP,
		createRigVisuals,
		decalImageState,
		GL,
		registerDecalImage,
		visualKeyFor,
		WHEEL_CONNECTIONS,
		WHEEL_RADIUS
	} from '$lib/greenline/rig-visual';
	import {
		ACTION_KIND,
		CONTROL_ACTIONS,
		actionForKey,
		controlSettings,
		keyLabel,
		padBindingHeld,
		padBindingValue,
		type ControlAction
	} from '$lib/greenline/control-settings.svelte';
	import Minimap from '$lib/greenline/Minimap.svelte';
	import provingGroundJson from '$lib/greenline/tracks/proving-ground-07.json';
	import { browser } from '$app/environment';
	import './brand/brand';

	/**
	 * GREENLINE movement + track + combat + AI prototype (dev-only harness).
	 *
	 * Vehicle-feel testbed on the v1 track format: cannon-es RaycastVehicle
	 * cars where the player and every AI opponent run through the IDENTICAL
	 * per-vehicle pipeline (controls -> combat drive modifiers -> physics ->
	 * meshes). AI drivers ($lib/greenline/ai.ts, pure) follow the centerline
	 * racing line derived from the track data, slow for corners, recover when
	 * knocked off, and fire the shared disruption weapon with restraint. Each
	 * vehicle tracks its own laps, checkpoints, and health; RACE resolves by
	 * finishing order, ELIMINATION by last vehicle running. The zero-health
	 * mode branch is VehicleCombat.applyDamage. A flip-recovery watchdog in
	 * the per-vehicle pipeline rights any rig (player or AI) left resting
	 * upside down, since wheels-off-the-ground means no force can recover
	 * it. Everything numeric is in the live tuning panel. Track dressing
	 * (floodlight towers, gantries, containers, railcars, barriers, skid-pad
	 * paint, the banked berm, yard buildings, and yard machinery) renders
	 * generically from the track file's `props` through a shared prop kit:
	 * per-type part templates merged into per-material geometries and drawn
	 * via InstancedMesh, so a fully dressed yard stays a flat draw-call
	 * budget. Sky gradient, fog, hemisphere/key lights, and floodlight
	 * intensity all come from ONE environment preset
	 * ($lib/greenline/environment.ts, `night` today) so a future
	 * time-of-day/weather system is a data addition, not a scene rewrite.
	 *
	 * Track relief (Phase 8a, schema v2): a track carrying per-point
	 * elevation/banking gets a real drivable Trimesh built from the runtime's
	 * 3D sweep (the same geometry the visual ribbon renders), so the
	 * RaycastVehicle wheels follow slopes and banked turns natively; flat
	 * tracks keep the plane-only physics untouched. A fall watchdog (the flip
	 * pattern) recovers any car far below the local surface (off an elevated
	 * edge) onto the nearest centerline point. Schema-v2 `zones` are gameplay
	 * trigger circles: boost pads (entry impulse + a timed engine-force
	 * window) and hazards (v2 ships `oil`, the deployed-slick traction cut),
	 * entry-edge detected per vehicle with a rearm window.
	 *
	 * Four disruption tools, all vehicle-agnostic (AI uses them through the
	 * same paths): EMP burst (F / RB), oil slick dropped behind (E / X),
	 * tether yank at the nearest vehicle ahead (Q / LB), and the passive
	 * shockwave ram that triggers on nose-first contact above a closing-speed
	 * threshold. On top of them sit the EQUIPPED weapons (Phase 4a): two
	 * loadout-chosen mount slots (weaponPrimary Z / B, weaponSecondary X / Y)
	 * over the combat.ts WeaponDef catalog, budgeted by the archetype's flat
	 * mount capacity — the Autocannon (kinetic hit-scan) and the Homing
	 * Rocket (continuous forward-cone lock acquisition, then a live steered
	 * projectile; breaking the cone before the dwell completes denies the
	 * lock). Projectiles are race-level state stepped by updateProjectiles
	 * (the oil-slick pattern); locks tick per rig per frame and feed the HUD
	 * cells + the player's tightening lock reticle. Damage is ZONED off the TARGET's own facing into three pools
	 * (front/side -> armor, rear -> mount, overflow -> chassis; chassis zero
	 * is the down/elimination trigger and a dead mount takes the fired tools
	 * offline until full heal). Combat facts live in $lib/greenline/combat.ts;
	 * this file owns every force and all the feedback: trauma-based screen
	 * shake, spark / smoke / debris-chunk / tire-dust particle pools,
	 * zone-anchored hit bursts, armor plates that visibly strip off as the
	 * armor pool empties, the dead sputtering mount, escalating damage states
	 * on the bodywork (scorch tint, crumpled hull vertices, rattled plates,
	 * hood smoke), oil puddles, the live tether cable, the stun crackle ring,
	 * and ram shockwave rings.
	 *
	 * Bodywork: every vehicle composes four NAMED parts (chassis base, armor
	 * plating, weapon-mount socket, wheels; see Rig.parts) proportioned and
	 * chrome-toned per archetype in the GREENLINE brand palette, with the
	 * signature green thread on the player's machine only. The builder lives
	 * in $lib/greenline/rig-visual.ts (SHARED with the garage's 3D preview)
	 * and also renders the four equipped part slots onto the rig: plating on
	 * the armor group, drivetrain greebles on the chassis, tire variants on
	 * the wheels, systems hardware on the mount. Physics stays one cannon-es
	 * body; parts are visual attachment groups under carGroup.
	 *
	 * Loadouts ($lib/greenline/Garage.svelte over the
	 * $lib/greenline/loadout.ts catalog): one archetype (ARMOR / VELOCITY /
	 * HANDLING / SYSTEMS) plus one part per slot, resolved to per-rig stat
	 * MULTIPLIERS over the physics baseline and applied live to physics
	 * (engine, drag, brakes, steering, mass, grip, suspension, grass drag),
	 * health pool, incoming-effect resistances (VehicleCombat.resist), and
	 * offense (damage, EMP range, tool cooldowns via ctFor). AIs cycle the
	 * four archetypes so every round has build variety. The build is chosen in
	 * the pre-race garage screen (the portal flow); there is no in-race garage.
	 *
	 * Controls: fully remappable (keyboard + gamepad) through the settings
	 * overlay, backed by $lib/greenline/control-settings.svelte.ts (the action
	 * registry + persisted bindings); every input here resolves through that
	 * store per keypress/frame. Defaults: W/S throttle+brake (reverse from
	 * standstill), A/D steer, Space handbrake, Z/X primary/secondary weapon,
	 * C/V primary/secondary ability, R reset round, F cycle camera, Q look back
	 * (EMP / oil / tether are equipped weapons since Phase 8g, fired through the
	 * weapon slots). Gamepad: left stick steer, RT throttle, LT brake, A
	 * handbrake, B/Y weapons, D-pad up/down abilities, RB cycle camera, LB look
	 * back. Mouse drag over the track free-looks (orbits) without changing the
	 * follow.
	 */

	const {
		loadout,
		onFinish,
		track: trackOverride,
		onQuit,
		onFeedback,
		inputBlocked = false,
		playerQualifyingMs = null,
		aiCount: aiCountProp
	}: {
		/**
		 * The build to race. When omitted the component owns its loadout locally
		 * (the dev harness: seeded from / persisted to localStorage). The real
		 * portal route always passes one, chosen in its own garage screen.
		 */
		loadout?: Loadout;
		/** Called once when the player completes a RACE. */
		onFinish?: (outcome: RaceOutcome) => void;
		/**
		 * The track to race (a parseTrack result). Omitted = Proving Ground 07,
		 * so every existing caller is unchanged. Read ONCE at init (the whole
		 * scene/physics world builds from it in onMount); switching tracks
		 * means remounting the component.
		 */
		track?: TrackData;
		/**
		 * Leave the race from the pause menu (Phase 8e). When omitted the pause
		 * menu still opens (resume / restart), it just offers no way out — the
		 * dev harness has no screen to quit TO.
		 */
		onQuit?: () => void;
		/**
		 * Open the host's feedback box from the pause menu. The race deliberately
		 * does not own the feedback UI: the parent already mounts ONE FeedbackBox
		 * for every screen, and it is the parent that has the Supabase client. The
		 * race stays paused underneath while it is open, so Escape steps back
		 * feedback -> pause menu -> race, matching the settings-overlay
		 * convention.
		 */
		onFeedback?: () => void;
		/**
		 * True while the HOST has a modal open above the race (its feedback box,
		 * a settings overlay). The race then processes NO keys at all, including
		 * Escape.
		 *
		 * This is not belt-and-braces, it is the actual fix: both this component
		 * and any overlay listen on `window`, and this component's listener is
		 * registered first (it mounted first), so `stopPropagation` in the
		 * overlay cannot save us — the race sees the key regardless. Without
		 * this, one Escape press would close the overlay AND unpause, skipping a
		 * step and throwing the player back onto the track mid-sentence. Same
		 * convention as GreenlineTitle's `enableShortcut`.
		 */
		inputBlocked?: boolean;
		/**
		 * Qualifying-based grid placement (Phase 9b): the PLAYER's best recorded
		 * lap time on this track (ms), read from the real leaderboard by the portal
		 * route. `null` = no time set on this track yet, which starts the player at
		 * the BACK of the grid (real motorsport convention: no time, start last).
		 * The player is sorted against the AI field by this time — a slow time can
		 * genuinely put the player off pole. AI qualifying times are simulated
		 * (see the grid-assignment block). Read ONCE at init like the other props
		 * (a new race remounts the component with the fresh time); the dev harness
		 * omits it and can inject one via `__greenline.setPlayerQualifying`.
		 */
		playerQualifyingMs?: number | null;
		/**
		 * Grid size (Phase 9-fix-b): how many AI opponents to race against,
		 * clamped to [GRID_MIN_AI, GRID_MAX_AI]. Omitted = the historical
		 * default of 3, so the dev harness is unchanged. The portal route
		 * passes the player's choice from the garage's grid-size picker,
		 * captured at race start like the track and the creative flag.
		 *
		 * Read ONCE at init (a new race remounts the component), and only to
		 * SEED `tuning.aiCount` — so `__greenline.setAiCount` still owns it
		 * afterwards for scripted drives.
		 */
		aiCount?: number;
	} = $props();

	const DEFAULTS = {
		/**
		 * SPEED (retuned Phase 8c, was engine 2300 / drag 1.8 = a ~80 mph car).
		 *
		 * Top speed is DERIVED, never capped: quadratic aero drag balances drive
		 * force at v = sqrt(engineForce / aeroDrag). That square root is the whole
		 * story — raising the ceiling ~1.7x took a ~4.5x lift in the RATIO, not in
		 * either number alone. The lift is mostly on the DRAG side (1.8 -> 0.8,
		 * with engine only 2300 -> 2900), which is both how real top-speed cars
		 * get there (drag-limited, not power-limited) and the change that leaves
		 * launch feel closest to what was already tuned: standing acceleration
		 * goes 12.8 -> 16.1 m/s^2, not 4x.
		 *
		 *   stock terminal    = sqrt(2900 / 0.68)          = 65.3 m/s = 146 mph
		 *   VELOCITY build    x sqrt(1.15 / 0.8)  = x1.199 = 78.3 m/s = 175 mph
		 *   + slipstream      x sqrt(1 / 0.75)    = x1.155 = 90.4 m/s = 202 mph
		 *   + Nitro (2.2s)    x sqrt(1.8)         = x1.342 = a burst well past it
		 *
		 * The 200 mph mark is deliberately placed at the SUSTAINED velocity-build
		 * draft figure rather than behind a Nitro burst: Nitro only lasts 2.2s,
		 * far short of the time needed to actually reach a terminal speed, so
		 * hanging the headline number on it would have been a number no one ever
		 * sees. Optimal conditions here means the right build, tucked in a wake -
		 * something a player earns by racing well, and can hold.
		 *
		 * chassisMass is deliberately UNCHANGED at 180. Terminal speed is
		 * mass-independent here (drag is a force, not an acceleration), so mass
		 * buys nothing for the goal, while moving it would silently re-tune the
		 * jump impulse, ram knockback, and tether pull that were measured against
		 * 180 kg.
		 *
		 * The knock-on is that lifting off no longer scrubs speed the way 1.8 drag
		 * did: coasting stays fast and the brake pedal genuinely matters. That is
		 * the intended consequence, not a side effect to compensate for.
		 */
		engineForce: 2900,
		brakeForce: 50,
		handbrakeForce: 50,
		/**
		 * Handbrake drift feel (Phase 9a). The old model cut rear grip instantly
		 * and binarily the frame the key went down and restored it the frame it
		 * came up, which read as a sharp snap sideways and an equally sharp
		 * hook-back. Grip now fades in and out over a per-rig engagement scalar
		 * (`rig.hbEngage`), so the tail steps out progressively and settles rather
		 * than stepping.
		 *
		 * - handbrakeGrip: the REAR-axle grip fraction at full engagement.
		 *   Deepened from 0.65 to 0.4. Lower rear friction both steps the tail out
		 *   further AND scrubs less forward momentum (a low-grip locked wheel slides
		 *   instead of braking hard), so the car CARRIES speed through the slide
		 *   rather than stopping dead — the difference between a drift and a spin.
		 *   Ramped, a deep cut is controllable where the old instant one was a
		 *   twitch.
		 * - handbrakeFrontGrip: the FRONT-axle grip fraction at full engagement.
		 *   Kept at FULL (1.0) — the reconsidered front-wheel behaviour. A front
		 *   cut was tried and measured to be WRONG: with the nose unable to bite,
		 *   the car just understeers/plows straight ahead while decelerating (a
		 *   high-speed handbrake produced ZERO lateral slip). A handbrake drift
		 *   needs the front to grip and rotate the car while the LOCKED rear steps
		 *   out, so the front stays planted; the rear alone does the sliding. The
		 *   field is kept (rather than dropping the front multiply) so the choice
		 *   is explicit and tunable.
		 * - handbrakeEngageRate / handbrakeReleaseRate: exponential approach rates
		 *   (1/s) for hbEngage toward the held / released state. Engage is faster
		 *   (the tail should break with intent), release is slower (grip returns
		 *   gently so exiting a drift settles the car instead of snapping it
		 *   straight).
		 */
		handbrakeGrip: 0.4,
		handbrakeFrontGrip: 1,
		handbrakeEngageRate: 9,
		handbrakeReleaseRate: 4.5,
		/**
		 * Handbrake YAW AUTHORITY (Phase 9-fix-d). The 9a pass fixed HOW GRIP
		 * ARRIVES (the hbEngage ramp) but nothing ever bounded how fast the car
		 * could be made to ROTATE once the rear let go, and that is a separate
		 * mechanism: see the long note at the application site for the measured
		 * yaw-rate sweep that isolated it.
		 *
		 * Both values were swept in the harness rather than guessed (four pairs x
		 * two entry speeds, measuring spin per tap against retained lateral slip).
		 *
		 * - handbrakeYawMax: the fastest sustained rotation (rad/s about the
		 *   chassis up axis) a handbrake slide may hold. 1.4 rad/s is 80 deg/s:
		 *   at 22 m/s that is a ~16m-radius arc, unmistakably a committed drift.
		 *   MEASURED: a 250ms tap turns the car 51 / 49 / 52 deg at 14 / 22 / 30
		 *   m/s, against 84 / 150 / 199 deg before -- note the spin is now
		 *   essentially FLAT across the speed range instead of exploding with it,
		 *   which is the real quality signal. Rotating further is still entirely
		 *   available: a 1.8s HOLD gives 90-105 deg, so a full 180 costs roughly
		 *   3s of deliberate holding rather than one twitch. That is the whole
		 *   distinction being drawn: a flick, not a coin toss.
		 * - handbrakeYawDamp: how hard the EXCESS above that ceiling is bled off
		 *   (1/s). It has to be strong because the front tires drive yaw up at
		 *   roughly 24 rad/s^2 -- at the first-attempt value of 8 the equilibrium
		 *   sat at 5.6 rad/s and barely dented the spin. 45 holds the ceiling
		 *   properly. It does NOT read as a hard clamp, because the term is
		 *   scaled by `e` (hbEngage), which ramps in over ~360ms: the flick still
		 *   spikes sharply to ~2.9 rad/s in the first moments and is then caught,
		 *   which is exactly how a rear axle biting back should feel.
		 */
		handbrakeYawMax: 1.4,
		handbrakeYawDamp: 45,
		aeroDrag: 0.68,
		maxSteer: 1,
		steerSpeedFalloff: 0.04,
		/** Anti-wheelie: local pitch-rate damping (1/s). Light builds backflip
		 * under full throttle without it; yaw (steering) is untouched. */
		pitchDamp: 5,
		chassisMass: 180,
		gravity: 14,
		suspensionStiffness: 35,
		dampingCompression: 4.4,
		dampingRelaxation: 2.3,
		suspensionRestLength: 0.4,
		maxSuspensionTravel: 0.3,
		frictionSlip: 5,
		/**
		 * TRACTION LIMITING (Phase 9-fix-e). The longitudinal acceleration the
		 * tires can put down at neutral grip, m/s^2; scaled per build by its grip
		 * multiplier. Sourced from `VEHICLE_TRACTION_ACCEL` rather than a literal
		 * so the human player's limit and the AI's commanded-throttle cap (Phase
		 * 9d-i) are provably the same number.
		 *
		 * The AI has fed its throttle through this since 9d-i; the player never
		 * did, which is why a VELOCITY build was still spinning itself 180 deg
		 * off a standing start on a dead-straight road with no steering input.
		 * The car was never the bug — a human holding the accelerator was simply
		 * being allowed to ask for 21.8 m/s^2 out of tires good for 15.5.
		 */
		tractionAccel: VEHICLE_TRACTION_ACCEL,
		/**
		 * How fast the drive force fades toward (engage) and back off (release)
		 * the traction limit, 1/s, mirroring the handbrake's engage/release ramp
		 * directly above.
		 *
		 * This smoothing is the whole difference between a traction limiter and
		 * an input ceiling. Applied instantly, the limit reads as a dead zone —
		 * the pedal is down and the car simply refuses a third of it. Ramped, the
		 * first ~120ms of a launch delivers everything the driver asked for, the
		 * tires break loose, and the force bleeds back to what they can hold: the
		 * car feels like it is fighting for grip and finding it, which is what is
		 * physically happening. Release is slower still (~250ms) so power returns
		 * as a swell rather than a shove when the limit lifts.
		 *
		 * Both are exact no-ops on a car whose tires can take its power: the
		 * target factor is a constant 1, so the eased value never leaves 1.
		 */
		tractionEngageRate: 8,
		tractionReleaseRate: 4,
		/**
		 * Floor under the limited throttle, matching the AI cap's own floor. A
		 * traction-limited car must still be a car that drives; nothing in the
		 * catalog comes close to needing this (VELOCITY, the worst case, limits
		 * to 0.71 at rest), so it is a guard rail against a future build, not a
		 * value that shapes anything today.
		 */
		tractionFloor: 0.3,
		rollInfluence: 0.01,
		grassDrag: 8,
		wallSpring: 1800,
		wallDamp: 300,
		/** Flip recovery: a chassis whose local up vector's world Y stays below
		 * flipUpY while slower than flipMaxSpeed for flipDelaySec is re-seated
		 * upright (wheels off the ground means no drive force can right it). */
		flipUpY: 0.2,
		flipDelaySec: 2,
		flipMaxSpeed: 1.5,
		/** Fall recovery (Phase 8a, relief tracks only): a chassis sitting more
		 * than fallRecoverDrop meters BELOW the local track surface for
		 * fallRecoverDelaySec is re-seated on the nearest centerline point. A
		 * car off an elevated edge lands on the catch plane with no drivable
		 * route back up, so recovery is the only exit (Lakitu-style; this
		 * deliberately also recovers a car lingering on the ground BESIDE an
		 * elevated span or banked berm — 2.5 is low enough to catch the
		 * bottom of relief-proof-01's 3.7 m berm wall). Never fires on flat
		 * tracks. */
		fallRecoverDrop: 2.5,
		fallRecoverDelaySec: 1.2,
		/**
		 * Chassis floor (Phase 9-fix-c, relief tracks only): how deep a chassis
		 * may sink into the ribbon before it is stood back on top of it. A
		 * RaycastVehicle only ever touches the track through its four wheel
		 * rays and cannon-es has no Box-vs-Trimesh narrowphase, so a chassis
		 * whose wheels cannot reach the surface -- rolled onto its roof or
		 * side, or driven into the deck by a landing that blows through the
		 * suspension travel -- has literally nothing holding it up on an
		 * elevated span. Deliberately the SAME value as fallRecoverDrop, which
		 * splits the two watchdogs cleanly with no gap and no overlap:
		 * penetrating the floor is this block's job, and anything deeper than
		 * that has genuinely fallen off and is the fall watchdog's.
		 */
		chassisFloorBand: 2.5,
		/** Slipstream / draft: a trailing vehicle tucked into another's wake gets
		 * reduced aero drag (a higher top speed), universal and free — no slot, no
		 * cost, every vehicle player and AI alike, no equipment or AI decision.
		 * Detection is a forward wake corridor behind the leader; the strength
		 * scales with how tightly the trailer is tucked in. Numbers are sized to
		 * real pack spacing (the car is ~3.8m long, grid columns sit 6m apart): the
		 * wake reaches draftMaxDist ~14m back (~3.5 car lengths) inside a
		 * draftHalfWidth 3m corridor, needs headings within ~53deg (draftAlignDot
		 * 0.6, so an oncoming or crossing car never counts), and only fires while
		 * the trailer is actually moving (draftMinSpeed 6 m/s; below that the
		 * quadratic drag is negligible anyway, and it keeps the stationary grid from
		 * false-triggering). Peak draftDragReduction 0.25 (drag x0.75 -> top speed
		 * ~x1.15) when nearly nose-to-tail, tapering to 0 at the corridor edges. It
		 * reduces the SAME aeroDrag term the build stat scales, so it stacks
		 * cleanly with Nitro (which lifts engineForce) instead of colliding. */
		draftMaxDist: 14,
		draftMinDist: 3,
		draftHalfWidth: 3,
		draftAlignDot: 0.6,
		draftMinSpeed: 6,
		draftDragReduction: 0.25,
		/**
		 * DOWNFORCE (Phase 9-fix-a). Before this there was ZERO downforce model,
		 * which is why the nose lifted at speed — not a tuning issue, a missing
		 * system. This is REAL downforce, the same v^2 shape as drag but a
		 * downward force on the chassis: it compresses the suspension, which
		 * raises the wheel normal load cannon-es already uses to bound tire
		 * friction, so grip follows from physics (the 8a trimesh standard), NOT a
		 * frictionSlip fudge. F_down = aeroDownforce * v^2 (N), universal — the
		 * baseline is applied to EVERY vehicle regardless of build (aeroDown = 1),
		 * so a stock car is stable unmodified; the AERO part slot scales it.
		 *
		 *   stock @ 65 m/s (terminal)  = 0.42 * 65^2  = 1776 N ~= 0.70 * weight
		 *   stock @ 85 m/s (fast draft)= 0.42 * 85^2  = 3035 N ~= 1.20 * weight
		 *   stock @ 15 m/s (low speed) = 0.42 * 15^2  =   95 N ~= 0.04 * weight
		 *
		 * Negligible at low speed (as real aero is), decisive at the 60-85 m/s
		 * band, so low-speed handling is untouched by construction. (weight =
		 * chassisMass * gravity = 180 * 14 = 2520 N.)
		 *
		 * FRONT/REAR SPLIT — the reason a single COM force is NOT enough. The
		 * reported symptom is FRONT lift, which is a pitch problem: drive force
		 * enters at the rear contact patches (ground level) while the COM sits
		 * above them, so acceleration pitches the nose UP (worse under Nitro,
		 * where engineForce is ~2x). A uniform downforce at the COM adds grip but
		 * applies no pitch moment, so it cannot correct that. Splitting the force
		 * front-biased (downforceFrontBias > 0.5) and applying the halves at the
		 * front/rear axle offsets (downforceArm, the ~1.25 m wheelbase half)
		 * produces a nose-DOWN moment that GROWS with v^2 — exactly matched to
		 * where lift appears — while the total vertical force is unchanged. The
		 * bias is modest so it never digs the nose on a steady cruise; its
		 * authority is only felt at speed, self-correcting against the accel/Nitro
		 * nose-up. Zeroed while FULLY airborne (no wheels down) so ramp jumps and
		 * Air Correction are untouched; a wheelie (rears still down) keeps it,
		 * which is precisely when the nose needs pushing back to the ground.
		 */
		aeroDownforce: 0.42,
		downforceFrontBias: 0.62,
		downforceArm: 1.25,
		/**
		 * Chase camera. camDistance / camHeight are the STANDING values; the rig
		 * pulls back and lifts with speed (Phase 8c) so the higher ceiling reads
		 * as fast rather than as a wall of car filling the screen.
		 *
		 * The curve is linear in speed and CLAMPED, ramping from 0 to camSpeedRef
		 * (60 m/s, about the stock terminal, so a stock car reaches full pull-back
		 * at its own top end and faster builds simply hold it there). At the cap
		 * the TARGET sits 9 -> 13.5 m back and 3.5 -> 4.5 m up.
		 *
		 * The gain is deliberately modest because the camera was never as fixed as
		 * it looked: the camStiffness lerp chases a target that is itself moving,
		 * so at steady speed it settles a further ~v / camStiffness behind it
		 * (~12 m at 60 m/s). Measured end to end, effective distance goes from
		 * ~16 m at the OLD 35 m/s ceiling to ~26 m at the new one. Doubling the
		 * explicit term on top of that lag pushed the car too far away to read.
		 *
		 * Linear-and-clamped on purpose over anything sharper: the camera must
		 * never move faster than that same lerp can smooth, or the pull-back
		 * itself becomes the disorientation it exists to prevent.
		 */
		camDistance: 9,
		camHeight: 3.5,
		camStiffness: 5,
		/** Speed (m/s) at which the pull-back reaches full extent. */
		camSpeedRef: 60,
		/** Extra distance / height at the cap, world units. */
		camDistanceGain: 4.5,
		camHeightGain: 1,
		/**
		 * Camera views + free-look + look-back (Phase 9a). The speed-scaled
		 * pull-back above still governs the follow; these layer ON TOP of whichever
		 * view is active and never change the follow distance/smoothing itself.
		 *
		 * - camPanSens: radians of orbit per pixel of mouse drag over the track.
		 * - camPanYawMax / camPanPitchMax: clamps on the free-look orbit (yaw in
		 *   radians, pitch as a world-unit height offset).
		 * - camPanRecenter: how fast (1/s) free-look eases back to neutral once the
		 *   drag ends, so a glance never sticks.
		 * - camLookBackRate: how fast (1/s) the look-back swing eases in/out (near
		 *   instant — it is a held glance, not a follow change).
		 * - camLookBackArch: extra height (world units) at the MIDPOINT of the
		 *   look-back swing, so the camera arcs OVER the car rather than clipping
		 *   through it as it crosses from behind to in front.
		 */
		camPanSens: 0.0042,
		camPanYawMax: 1.25,
		camPanPitchMax: 4,
		camPanRecenter: 5,
		camLookBackRate: 11,
		camLookBackArch: 3,
		...COMBAT_DEFAULTS,
		/** Screen shake amplitude at full trauma, world units. */
		shakeMax: 0.6,
		/** Trauma decay per second (higher = shake dies faster). */
		shakeDecay: 1.6,
		/** Particle count multiplier for every burst. */
		fxDensity: 1,
		lapTarget: 3,
		aiCount: 3,
		/** Fraction of its OWN terminal speed an AI targets; see AiSkill. */
		aiSpeedFrac: AI_DEFAULTS.speedFrac,
		aiCorner: AI_DEFAULTS.cornerAccel,
		aiAggression: AI_DEFAULTS.aggression
	};

	const tuning = $state({ ...DEFAULTS });

	// Grid size: seed tuning.aiCount from the caller's choice, ONCE, before the
	// field is built (buildAis reads tuning.aiCount in onMount, and every later
	// resetRound re-reads it). Read untracked and only as a seed so a scripted
	// __greenline.setAiCount still owns the value from then on.
	{
		const n = untrack(() => aiCountProp);
		if (n !== undefined) tuning.aiCount = clampAiCount(n);
	}

	const track = untrack(() => trackOverride) ?? parseTrack(provingGroundJson);
	const rt = buildRuntime(track);

	let mode = $state<GreenlineMode>('race');

	// ---- Player loadout. Source: the `loadout` prop when the parent supplies
	// one (the real route, chosen in its garage screen); otherwise seeded from /
	// persisted to localStorage (the dev harness). Parts multiply the physics
	// baseline. Live edits arrive only through the __greenline console API
	// (setArchetype / equip); there is no in-race garage. ----
	const LOADOUT_KEY = 'greenline_loadout';
	// True when this instance owns its loadout locally (no parent prop). Captured
	// once at init (untrack makes the intent explicit); the real route always
	// passes a prop, the dev harness never does. Later prop changes flow through
	// the $effect below, not this seed.
	const localLoadout = untrack(() => loadout) == null;
	let playerLoadout = $state<Loadout>(
		untrack(() => loadout) ??
			((browser && parseLoadout(localStorage.getItem(LOADOUT_KEY))) || defaultLoadout())
	);
	// Assigned in onMount once the player rig exists (the resetRound pattern).
	let applyPlayerLoadout: () => void = () => {};
	// Weather (Phase 8c): assigned in onMount once the scene exists, the same
	// pattern. A no-op before mount so an early store change can never throw.
	let applyEnvironment: (env: EnvironmentPreset) => void = () => {};
	// Push the selected weather preset into the live scene. Presentation only —
	// nothing in applyEnvironment touches physics, AI, or timing, so a weather
	// change mid-race is safe and a stormy lap is the same lap as a clear one.
	$effect(() => {
		const env = activeEnvironment();
		void weatherSettings.preset;
		applyEnvironment(env);
	});
	// Adopt a parent-supplied loadout when it changes (real-route hot-swap; inert
	// for the dev harness, which passes no prop).
	$effect(() => {
		if (loadout) playerLoadout = loadout;
	});
	// Re-apply the current build to the player rig whenever it changes. onMount
	// applies it once at spawn; this keeps it live through console-API swaps.
	$effect(() => {
		void playerLoadout;
		applyPlayerLoadout();
	});
	const persistLoadout = () => {
		if (!localLoadout) return;
		try {
			localStorage.setItem(LOADOUT_KEY, serializeLoadout(playerLoadout));
		} catch {
			/* storage unavailable: session-only loadout */
		}
	};
	// Both edits run through the weapon sanitizer: the garage UI blocks invalid
	// weapon fits up front, but an archetype swap can shrink mount capacity
	// under the equipped pair, and the __greenline console equip path has no UI
	// guard — the sanitizer keeps every stored build valid either way.
	const selectArchetype = (id: ArchetypeId) => {
		playerLoadout = sanitizeLoadout({ ...playerLoadout, archetype: id });
		persistLoadout();
	};
	const equipPart = (slot: PartSlot, partId: string) => {
		playerLoadout = sanitizeLoadout({
			...playerLoadout,
			parts: { ...playerLoadout.parts, [slot]: partId }
		});
		persistLoadout();
	};
	// Mount-socket pick for an equipped weapon slot (console API only in-race;
	// the garage owns the interactive picker). The sanitizer drops a pick the
	// resolution cannot honor (occupied / incompatible), so the stored build
	// stays valid exactly like an equip.
	const setWeaponSocket = (slot: WeaponSlotId, socket: WeaponSocketId) => {
		playerLoadout = sanitizeLoadout({
			...playerLoadout,
			weaponSockets: { ...playerLoadout.weaponSockets, [slot]: socket }
		});
		persistLoadout();
	};
	// Preset livery patch (Phase 6b): merge the {color?, pattern?, number?} field
	// and re-normalize (drops invalid/default values, 'none' pattern, out-of-range
	// numbers). Purely cosmetic, so no sim reset — applyPlayerLoadout rebuilds the
	// bodywork via visualKeyFor, exactly like an equip.
	const setCosmetic = (patch: Partial<Cosmetics>) => {
		playerLoadout = sanitizeLoadout({
			...playerLoadout,
			cosmetics: normalizeCosmetics({ ...playerLoadout.cosmetics, ...patch })
		});
		persistLoadout();
	};

	let speedMph = $state(0);
	let padName = $state('');
	/** Current camera view name, flashed briefly on the HUD when cycled. */
	let cameraView = $state('Standard');
	let bootError = $state('');
	let banner = $state('');
	let resetRound: () => void = () => {};

	// ---- Pause (Phase 8e) ----
	//
	// THE CLOCK IS THE WHOLE PROBLEM. Everything time-based in this component —
	// lap timing, weapon and ability cooldowns, boost windows, revive channels,
	// the start countdown, FX lifetimes — is an ABSOLUTE performance.now()
	// stamp. Simply skipping the simulation while paused would leave real time
	// running underneath it, so on resume every one of those stamps would jump:
	// the current lap would gain the paused duration, and every cooldown in
	// flight would silently expire.
	//
	// So the sim runs on its own clock. `gameNow()` is performance.now() minus
	// the time spent paused, which makes pausing invisible to every consumer
	// without touching any of them: stamps stay comparable across a pause
	// because the clock they were taken from simply does not advance while the
	// menu is open. Only genuinely wall-clock things — the frame-cost
	// instrumentation and the headless pump's throttle — keep reading the real
	// clock.
	//
	// Physics is frozen the honest way too: the world is never stepped while
	// paused, so nothing drifts, settles, or falls asleep behind the menu.
	let paused = $state(false);
	let pausedAccumMs = 0;
	let pauseStartedAt = 0;
	/**
	 * The simulation clock: real time minus time spent paused. While paused it
	 * is genuinely FROZEN, not merely offset — the tick early-returns so nothing
	 * in the sim reads it today, but a future caller (or a console drive) asking
	 * the time mid-pause should get the stopped clock, not one quietly ticking
	 * toward a jump.
	 */
	const gameNow = () =>
		paused ? pauseStartedAt - pausedAccumMs : performance.now() - pausedAccumMs;
	/** Cleared on pause so a key held at that moment can't stick down. */
	let clearHeldKeys: () => void = () => {};

	function setPaused(on: boolean) {
		if (on === paused) return;
		if (on) {
			pauseStartedAt = performance.now();
			// A throttle or steer held as the menu opens would otherwise still be
			// in `keys` on resume, with no keyup ever arriving (the menu has focus).
			clearHeldKeys();
		} else {
			pausedAccumMs += performance.now() - pauseStartedAt;
		}
		paused = on;
	}

	// The bottom controls hint reflects the CURRENT (remappable) key bindings.
	const keyHint = $derived(
		[
			`${keyLabel(controlSettings.keyboard.accelerate)}/${keyLabel(controlSettings.keyboard.brake)} DRIVE`,
			`${keyLabel(controlSettings.keyboard.steerLeft)}/${keyLabel(controlSettings.keyboard.steerRight)} STEER`,
			`${keyLabel(controlSettings.keyboard.handbrake)} HANDBRAKE`,
			`${keyLabel(controlSettings.keyboard.fireWeaponPrimary)} PRIMARY`,
			`${keyLabel(controlSettings.keyboard.fireWeaponSecondary)} SECONDARY`,
			`${keyLabel(controlSettings.keyboard.useAbilityPrimary)}/${keyLabel(controlSettings.keyboard.useAbilitySecondary)} ABILITY`,
			`${keyLabel(controlSettings.keyboard.cycleCamera)} CAMERA (${cameraView.toUpperCase()})`,
			`${keyLabel(controlSettings.keyboard.lookBack)} LOOK BACK`,
			`${keyLabel(controlSettings.keyboard.resetRound)} RESET`
		].join(' · ')
	);

	const pose = $state({ x: track.spawn.x, z: track.spawn.z, hx: 1, hz: 0 });
	const aiPoses = $state<{ x: number; z: number; hx: number; hz: number; out: boolean }[]>([]);
	interface StandRow {
		pos: number;
		label: string;
		arch: string;
		laps: number;
		cp: number;
		hp: number;
		note: string;
	}
	let standings = $state<StandRow[]>([]);
	const hud = $state({
		timing: false,
		lap: 1,
		cp: 0,
		total: track.checkpoints.length,
		currentMs: null as number | null,
		lastMs: null as number | null,
		bestMs: null as number | null,
		offTrack: false,
		/** Player is currently in another vehicle's slipstream (draft cue). */
		drafting: false
	});
	/** HUD cell state for one equipped weapon slot (lock is guided-only). */
	interface SlotHudCell {
		slot: WeaponSlotId;
		short: string;
		key: string;
		ready: number;
		offline: boolean;
		lock: { progress: number; locked: boolean } | null;
		/** Shield/blades currently deployed (an active timed window). */
		active?: boolean;
		/** Passive weapon (Radar Jammer): always on, no cooldown/trigger. */
		passive?: boolean;
	}
	/** HUD cell state for one equipped ability slot. */
	interface AbilityHudCell {
		slot: AbilitySlotId;
		short: string;
		key: string;
		/** Meter + cooldown both satisfied (and alive) — activatable now. */
		ready: boolean;
		/** A timed effect window (nitro/grip) is currently live. */
		active: boolean;
		/** Seconds left on the slot's secondary cooldown throttle (0 = ready). */
		cooldown: number;
		/** Not enough meter banked to afford this ability. */
		needMeter: boolean;
	}
	// Pre-mount HUD placeholders: the default budget through the neutral split.
	const initPools = splitPools(COMBAT_DEFAULTS.maxHealth);
	const chud = $state({
		/** Primary readout: CHASSIS, the life pool (armor/mount are shields). */
		hp: initPools.chassis,
		max: initPools.chassis,
		armor: initPools.armor,
		armorMax: initPools.armor,
		mount: initPools.mount,
		mountMax: initPools.mount,
		mountDown: false,
		status: '' as '' | 'DISRUPTED' | 'DOWN' | 'ELIMINATED',
		oiled: false,
		tethered: false,
		downLeft: 0,
		/** Energy Shield absorb fraction (0 = inactive, else 0..1 of the pool). */
		shieldPct: 0,
		// Ram is the only fixed always-on tool left (Phase 8g): EMP / oil / tether
		// are equipped weapons now, so they live in `slots`, not here.
		ready: { ram: 0 },
		/** Equipped-weapon cells (primary always; secondary only when equipped). */
		slots: [] as SlotHudCell[],
		/** Shared drift meter, 0..1 (both ability slots draw from it). */
		meter: 0,
		/** Equipped-ability cells (primary always; secondary only when equipped). */
		abilities: [] as AbilityHudCell[],
		/**
		 * Whether the PLAYER's own weapons and abilities are armed (Phase
		 * 9-fix-b): false on the grid and until this car crosses the start line,
		 * so the cells read SAFE rather than a READY that would not fire.
		 */
		armed: false
	});
	let lapFlash = $state('');
	// Race-start countdown text ('3' | '2' | '1' | 'GO' | ''), driven by the loop.
	let countText = $state('');

	let stage: HTMLDivElement;

	// A tuning value can momentarily read NaN (e.g. a bad stored loadout); fall
	// back to the default so the sim never ingests a non-finite value.
	/**
	 * Hard ceiling on AI opponents. Both the grid builder and the round reset
	 * clamp to this one constant, which now lives in grid-selection.svelte.ts
	 * (Phase 9-fix-b) so the garage's grid-size picker clamps to the SAME
	 * number — the UI can never offer a field the sim will not build. The
	 * rationale for the value (and what raising it would cost) is documented
	 * there.
	 */
	const MAX_AI = GRID_MAX_AI;
	/**
	 * Airborne detection (Phase 8d). A vehicle counts as airborne only with ALL
	 * FOUR wheels clear of the ground, held for AIRBORNE_MIN_SEC. Both halves
	 * matter: requiring zero contacts (rather than a majority) means a kerb
	 * strike, a crest, or a wheel unloading over a bump can never read as
	 * flight, and the short dwell filters the one-or-two-frame ray misses that
	 * rough ground produces. Sized against Terminal Nine's deck jump, which
	 * gives ~1.29 s of genuine air, so 0.12 s is ~9% of a real jump but longer
	 * than any bump survives.
	 */
	const AIRBORNE_MIN_SEC = 0.12;
	/**
	 * Touchdown dwell before an Air Correction window is closed. Deliberately
	 * tiny: the requirement is that the effect does NOT linger once grounded,
	 * and 60 ms is imperceptible, but it stops a single-frame wheel graze
	 * mid-flight from cancelling the ability outright.
	 */
	const GROUNDED_END_SEC = 0.06;
	/**
	 * How far the ribbon must rise above the y-0 catch plane before the chassis
	 * floor (Phase 9-fix-c) takes over from it. Below this the plane is already
	 * under the car with a real Box-vs-Plane narrowphase, and adding a second
	 * floor there would only nudge hard landings on ordinary ground.
	 */
	const CHASSIS_FLOOR_MIN_RISE = 0.5;
	const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);
	/** Wrap a relative offset into [-half, half] (the rain volume's toroidal
	 * follow: drops left behind the camera reappear ahead of it). */
	const wrapRel = (d: number, half: number) => {
		const span = half * 2;
		return ((((d + half) % span) + span) % span) - half;
	};

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | null = null;
		let flashTimer: ReturnType<typeof setTimeout> | undefined;
		const flash = (msg: string) => {
			lapFlash = msg;
			clearTimeout(flashTimer);
			flashTimer = setTimeout(() => (lapFlash = ''), 2200);
		};

		(async () => {
			try {
				const THREE = await import('three');
				const CANNON = await import('cannon-es');
				const { mergeGeometries } = await import(
					'three/examples/jsm/utils/BufferGeometryUtils.js'
				);
				if (disposed || !stage) return;

				// ---- Renderer / scene ----
				const renderer = new THREE.WebGLRenderer({ antialias: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
				renderer.setSize(stage.clientWidth, stage.clientHeight, false);
				stage.appendChild(renderer.domElement);

				// ---- Environment: everything sky/light/fog reads ONE preset ----
				// (environment.ts). The WEATHER selector swaps the preset live (see
				// applyEnvironment below); nothing in here hardcodes a look. `ENV` is
				// the preset in force right now — the build-time reads below use the
				// one selected at mount, and applyEnvironment re-points it after.
				let ENV = untrack(() => activeEnvironment());

				const scene = new THREE.Scene();
				scene.background = new THREE.Color(ENV.sky.base);
				const sceneFog = new THREE.FogExp2(ENV.fog.color, ENV.fog.density);
				scene.fog = sceneFog;

				const camera = new THREE.PerspectiveCamera(
					70,
					stage.clientWidth / Math.max(1, stage.clientHeight),
					0.1,
					1000
				);

				const hemiLight = new THREE.HemisphereLight(
					ENV.hemisphere.sky,
					ENV.hemisphere.ground,
					ENV.hemisphere.intensity
				);
				scene.add(hemiLight);
				// Key directionals are rebuilt per preset (a preset may carry a
				// different count), so they live in a swappable list.
				const keyLightObjs: InstanceType<typeof THREE.DirectionalLight>[] = [];
				const buildKeyLights = (env: EnvironmentPreset) => {
					for (const dl of keyLightObjs) scene.remove(dl);
					keyLightObjs.length = 0;
					for (const kl of env.keyLights) {
						const dl = new THREE.DirectionalLight(kl.color, kl.intensity);
						dl.position.set(kl.position.x, kl.position.y, kl.position.z);
						scene.add(dl);
						keyLightObjs.push(dl);
					}
				};
				buildKeyLights(ENV);

				// Storm lightning: one flash light, idle at zero. Pulsed by the
				// render loop only while the active preset carries `lightning`.
				const flashLight = new THREE.DirectionalLight(0xdcecff, 0);
				flashLight.position.set(40, 160, -30);
				scene.add(flashLight);
				let nextFlashAtMs = Infinity;
				let flashStartMs = -1e9;

				// Deterministic RNG for every generated texture / scatter detail, so
				// the yard looks identical run to run (and headless drives stay
				// reproducible; Math.random stays out of world building).
				let texSeed = 1337;
				const trand = () => {
					texSeed = (texSeed * 16807) % 2147483647;
					return texSeed / 2147483647;
				};

				// ---- Sky: gradient dome from the preset (no shader) ----
				// Baked to a canvas, so a weather swap repaints the same canvas and
				// flags the texture rather than rebuilding the dome mesh.
				const skyCanvas = document.createElement('canvas');
				skyCanvas.width = 512;
				skyCanvas.height = 256;
				const paintSky = (env: EnvironmentPreset) => {
					const g2 = skyCanvas.getContext('2d')!;
					g2.globalCompositeOperation = 'source-over';
					const grad = g2.createLinearGradient(0, 0, 0, 256);
					grad.addColorStop(0, env.sky.top);
					grad.addColorStop(0.34, env.sky.high);
					grad.addColorStop(0.47, env.sky.horizon);
					grad.addColorStop(0.5, env.sky.glow);
					grad.addColorStop(0.55, env.sky.base);
					grad.addColorStop(1, env.sky.base);
					g2.fillStyle = grad;
					g2.fillRect(0, 0, 512, 512);
					// Motivated horizon glows: warm one heading, cool the opposite.
					g2.globalCompositeOperation = 'lighter';
					for (const [u, col] of [
						[0.22, env.sky.warmGlow],
						[0.68, env.sky.coolGlow]
					] as const) {
						const gx = u * 512;
						const gy = 0.49 * 256;
						const rg = g2.createRadialGradient(gx, gy, 0, gx, gy, 90);
						rg.addColorStop(0, col);
						rg.addColorStop(1, 'rgba(0,0,0,0)');
						g2.save();
						g2.translate(gx, gy);
						g2.scale(1, 0.34);
						g2.translate(-gx, -gy);
						g2.fillStyle = rg;
						g2.fillRect(gx - 90, gy - 90, 180, 180);
						g2.restore();
					}
					g2.globalCompositeOperation = 'source-over';
				};
				paintSky(ENV);
				const skyTex = new THREE.CanvasTexture(skyCanvas);
				skyTex.colorSpace = THREE.SRGBColorSpace;
				{
					const dome = new THREE.Mesh(
						new THREE.SphereGeometry(820, 32, 16),
						new THREE.MeshBasicMaterial({
							map: skyTex,
							side: THREE.BackSide,
							fog: false,
							depthWrite: false
						})
					);
					dome.renderOrder = -10;
					scene.add(dome);
				}

				// ---- Ground: worn tarmac apron (visual only; physics stays the
				// flat plane below). One generated asphalt texture drives both the
				// apron and the darker track ribbon. ----
				const asphaltTex = (() => {
					const c = document.createElement('canvas');
					c.width = 512;
					c.height = 512;
					const g2 = c.getContext('2d')!;
					g2.fillStyle = '#8a939b';
					g2.fillRect(0, 0, 512, 512);
					// Low-frequency tonal blotches: worn patches, old repaves.
					for (let i = 0; i < 90; i++) {
						const x = trand() * 512;
						const y = trand() * 512;
						const r = 24 + trand() * 90;
						const rg = g2.createRadialGradient(x, y, 0, x, y, r);
						rg.addColorStop(
							0,
							trand() > 0.5 ? 'rgba(214, 224, 232, 0.06)' : 'rgba(10, 14, 18, 0.09)'
						);
						rg.addColorStop(1, 'rgba(0,0,0,0)');
						g2.fillStyle = rg;
						g2.fillRect(x - r, y - r, r * 2, r * 2);
					}
					// Aggregate speckle.
					for (let i = 0; i < 2600; i++) {
						g2.fillStyle = trand() > 0.5 ? 'rgba(222, 230, 236, 0.05)' : 'rgba(8, 11, 14, 0.1)';
						g2.fillRect(trand() * 512, trand() * 512, 1.4, 1.4);
					}
					// Faint meandering cracks.
					g2.strokeStyle = 'rgba(8, 11, 14, 0.14)';
					g2.lineWidth = 1;
					for (let i = 0; i < 14; i++) {
						g2.beginPath();
						let x = trand() * 512;
						let y = trand() * 512;
						g2.moveTo(x, y);
						for (let s = 0; s < 5; s++) {
							x += (trand() - 0.5) * 70;
							y += (trand() - 0.5) * 70;
							g2.lineTo(x, y);
						}
						g2.stroke();
					}
					const tex = new THREE.CanvasTexture(c);
					tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
					tex.colorSpace = THREE.SRGBColorSpace;
					return tex;
				})();
				const apronTex = asphaltTex.clone();
				apronTex.repeat.set(6, 6);
				const groundMesh = new THREE.Mesh(
					new THREE.PlaneGeometry(600, 600),
					new THREE.MeshStandardMaterial({ map: apronTex, color: 0x272e34, roughness: 1 })
				);
				groundMesh.rotation.x = -Math.PI / 2;
				scene.add(groundMesh);

				// ---- Environmental dressing: props from the track data ----
				// A shared PROP KIT: each prop type is authored ONCE as a template
				// of primitive parts, baked/merged into one buffer geometry per
				// material bucket, then drawn as ONE InstancedMesh per
				// (template, bucket) across every placement -- a yard full of
				// dressing stays a small flat number of draw calls on the aging
				// school desktops. All presentation; gameplay never reads any of
				// it, and props never get physics bodies.
				const DEGR = Math.PI / 180;
				const floodMul = ENV.floodIntensity;
				// Flood materials are baked with the mount-time multiplier; a weather
				// swap rescales them from their registered BASE value, so repeated
				// swaps never compound.
				const floodScalables: { apply: (mul: number) => void }[] = [];
				let floodAppliedMul = floodMul;

				// Worn corrugated-panel texture shared by containers / railcars.
				const corrTex = (() => {
					const c = document.createElement('canvas');
					c.width = 256;
					c.height = 256;
					const g2 = c.getContext('2d')!;
					g2.fillStyle = '#98a1a8';
					g2.fillRect(0, 0, 256, 256);
					for (let x = 0; x < 256; x += 11) {
						g2.fillStyle = 'rgba(6, 9, 12, 0.28)';
						g2.fillRect(x, 0, 3, 256);
						g2.fillStyle = 'rgba(235, 242, 248, 0.12)';
						g2.fillRect(x + 5, 0, 2, 256);
					}
					for (let i = 0; i < 26; i++) {
						const x = trand() * 256;
						const h = 30 + trand() * 180;
						const streak = g2.createLinearGradient(0, 0, 0, h);
						streak.addColorStop(0, 'rgba(16, 20, 22, 0.22)');
						streak.addColorStop(1, 'rgba(16, 20, 22, 0)');
						g2.fillStyle = streak;
						g2.fillRect(x, 0, 2 + trand() * 5, h);
					}
					for (let i = 0; i < 240; i++) {
						g2.fillStyle = 'rgba(96, 66, 48, 0.16)';
						g2.fillRect(trand() * 256, trand() * 256, 1 + trand() * 2.4, 1 + trand() * 1.6);
					}
					g2.fillStyle = 'rgba(6, 9, 12, 0.35)';
					g2.fillRect(0, 0, 256, 10);
					g2.fillRect(0, 246, 256, 10);
					const tex = new THREE.CanvasTexture(c);
					tex.colorSpace = THREE.SRGBColorSpace;
					return tex;
				})();

				// Bucket name -> ONE shared material. Props deliberately skip the
				// vehicle env map (standard lights only is the lighting ceiling).
				type PropMat =
					| InstanceType<typeof THREE.MeshStandardMaterial>
					| InstanceType<typeof THREE.MeshBasicMaterial>;
				const propMats: Record<string, PropMat> = {
					steel: new THREE.MeshStandardMaterial({
						color: 0x4a565f,
						metalness: 0.55,
						roughness: 0.55
					}),
					dark: new THREE.MeshStandardMaterial({
						color: 0x151b21,
						metalness: 0.35,
						roughness: 0.8
					}),
					concrete: new THREE.MeshStandardMaterial({ color: 0x565d63, roughness: 0.95 }),
					corr: new THREE.MeshStandardMaterial({
						map: corrTex,
						vertexColors: true,
						metalness: 0.3,
						roughness: 0.75
					}),
					sil: new THREE.MeshStandardMaterial({ color: 0x0b0f13, roughness: 0.95 }),
					lamp: new THREE.MeshStandardMaterial({
						color: 0x1c2126,
						emissive: 0xeaf4ff,
						emissiveIntensity: 1.9 * floodMul
					}),
					window: new THREE.MeshStandardMaterial({
						color: 0x14100c,
						emissive: 0xe8c9a0,
						emissiveIntensity: 0.85
					}),
					glass: new THREE.MeshStandardMaterial({
						color: 0x0c1216,
						emissive: 0x9fc8e0,
						emissiveIntensity: 0.5,
						metalness: 0.4,
						roughness: 0.3
					}),
					beacon: new THREE.MeshStandardMaterial({
						color: 0x201510,
						emissive: 0xffb86e,
						emissiveIntensity: 1.4
					}),
					green: new THREE.MeshStandardMaterial({
						color: 0x0a3d24,
						emissive: 0x2ae57e,
						emissiveIntensity: 1.3
					}),
					cone: new THREE.MeshBasicMaterial({
						color: 0xdfeaff,
						transparent: true,
						// Four per-lamp beams now share this material (see towerTpl), so
						// each is dimmer than the old single merged cone to keep the
						// tower's total visual weight comparable rather than 4x brighter.
						opacity: 0.032 * floodMul,
						side: THREE.DoubleSide,
						depthWrite: false,
						blending: THREE.AdditiveBlending,
						fog: false
					}),
					pool: new THREE.MeshBasicMaterial({
						color: 0xdfeaff,
						transparent: true,
						opacity: 0.032 * floodMul,
						depthWrite: false,
						blending: THREE.AdditiveBlending,
						fog: false
					})
				};

				// Template part: a base geometry plus a baked local transform (and
				// an optional vertex-color tone, corrugated bucket only).
				type PropGeo = Parameters<typeof mergeGeometries>[0][number];
				interface PropPart {
					g: PropGeo;
					p?: [number, number, number];
					r?: [number, number, number];
					s?: [number, number, number];
					c?: number;
				}
				const uBox = new THREE.BoxGeometry(1, 1, 1);
				const bakePart = ({ g, p, r, s, c }: PropPart) => {
					const gg = g.clone();
					if (c !== undefined) {
						const col = new THREE.Color(c);
						const n = gg.attributes.position.count;
						const arr = new Float32Array(n * 3);
						for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
						gg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
					}
					gg.applyMatrix4(
						new THREE.Matrix4().compose(
							new THREE.Vector3(...(p ?? [0, 0, 0])),
							new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r ?? [0, 0, 0]))),
							new THREE.Vector3(...(s ?? [1, 1, 1]))
						)
					);
					return gg;
				};
				const buildTemplate = (buckets: Record<string, PropPart[]>) => {
					const out: Record<string, PropGeo> = {};
					for (const [bucket, parts] of Object.entries(buckets)) {
						if (!parts.length) continue;
						const baked = parts.map(bakePart);
						out[bucket] = mergeGeometries(baked, false)!;
						baked.forEach((g) => g.dispose());
					}
					return out;
				};
				/**
				 * Ground height a piece of scenery stands on (Phase 9-fix-c). Props
				 * carry no physics and were placed at a hardcoded y 0, which is only
				 * correct while the whole yard is flat: on a relief track a tower
				 * beside the 13.5 m gantry deck sank to the apron and threw its light
				 * cones 13.5 m below the road, and a gantry meant to span the deck sat
				 * buried under it.
				 *
				 * The world has TWO grounds — the flat apron plane at y 0 and the
				 * ribbon wherever it rises — so trackside furniture (within
				 * PROP_TRACKSIDE_M of the ribbon edge) rides the ribbon's local
				 * surface, and anything further out stays on the apron. Deliberately a
				 * hard threshold rather than a blend: a half-lifted prop floats, which
				 * never reads as correct. The margin is sized off real placements (the
				 * furthest authored trackside prop sits 16 m off the edge; the nearest
				 * yard machinery 22 m). Flat tracks read 0 everywhere through
				 * surfaceProbe's own fast path, so their scenery is untouched.
				 */
				const PROP_TRACKSIDE_M = 20;
				const propGroundY = (x: number, z: number) => {
					if (!rt.hasRelief) return 0;
					const s = surfaceProbe(rt, x, z);
					return s.edgeGap <= PROP_TRACKSIDE_M ? s.y : 0;
				};
				const propRuns = new Map<
					string,
					{ buckets: Record<string, PropGeo>; list: { x: number; y: number; z: number; hd: number }[] }
				>();
				const placeProp = (
					key: string,
					x: number,
					z: number,
					hd: number,
					make: () => Record<string, PropPart[]>
				) => {
					let run = propRuns.get(key);
					if (!run) {
						run = { buckets: buildTemplate(make()), list: [] };
						propRuns.set(key, run);
					}
					run.list.push({ x, y: propGroundY(x, z), z, hd });
				};
				// Local prop-space offset -> world, for the non-instanceable extras
				// (billboard halo sprites).
				const worldOf = (x: number, z: number, hd: number, lx: number, lz: number) => {
					const yaw = hd * DEGR;
					const cos = Math.cos(yaw);
					const sin = Math.sin(yaw);
					return { x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos };
				};
				const glowTex = (() => {
					const c = document.createElement('canvas');
					c.width = 64;
					c.height = 64;
					const g2 = c.getContext('2d')!;
					const rg = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
					rg.addColorStop(0, 'rgba(255,255,255,1)');
					rg.addColorStop(0.35, 'rgba(255,255,255,0.35)');
					rg.addColorStop(1, 'rgba(255,255,255,0)');
					g2.fillStyle = rg;
					g2.fillRect(0, 0, 64, 64);
					return new THREE.CanvasTexture(c);
				})();
				const haloMats = {
					flood: new THREE.SpriteMaterial({
						map: glowTex,
						color: 0xdfeaff,
						transparent: true,
						opacity: 0.38 * floodMul,
						blending: THREE.AdditiveBlending,
						depthWrite: false,
						fog: false
					}),
					warm: new THREE.SpriteMaterial({
						map: glowTex,
						color: 0xffb86e,
						transparent: true,
						opacity: 0.15,
						blending: THREE.AdditiveBlending,
						depthWrite: false,
						fog: false
					}),
					cool: new THREE.SpriteMaterial({
						map: glowTex,
						color: 0x9fc4e8,
						transparent: true,
						opacity: 0.13,
						blending: THREE.AdditiveBlending,
						depthWrite: false,
						fog: false
					})
				};
				// The four flood-driven materials, registered with their BASE
				// (un-multiplied) values so a live weather rescale never compounds.
				floodScalables.push(
					{
						apply: (m) => {
							(propMats.lamp as InstanceType<typeof THREE.MeshStandardMaterial>).emissiveIntensity =
								1.9 * m;
						}
					},
					{ apply: (m) => (propMats.cone.opacity = 0.032 * m) },
					{ apply: (m) => (propMats.pool.opacity = 0.032 * m) },
					{ apply: (m) => (haloMats.flood.opacity = 0.38 * m) }
				);
				const addHalo = (
					kind: keyof typeof haloMats,
					wx: number,
					wy: number,
					wz: number,
					size: number
				) => {
					const spr = new THREE.Sprite(haloMats[kind]);
					spr.position.set(wx, wy, wz);
					spr.scale.set(size, size * 0.55, 1);
					scene.add(spr);
				};

				// Unit gable prism (1 long x 1 wide, ridge height 1, base on y=0)
				// for warehouse rooflines; indexed so it merges with boxes.
				const prism = (() => {
					const p: number[] = [];
					const quad = (a: number[], b: number[], cc: number[], d: number[]) =>
						p.push(...a, ...b, ...cc, ...a, ...cc, ...d);
					const A = [-0.5, 0, 0.5];
					const B = [0.5, 0, 0.5];
					const C = [0.5, 0, -0.5];
					const D = [-0.5, 0, -0.5];
					const E = [-0.5, 1, 0];
					const F = [0.5, 1, 0];
					quad(A, B, F, E);
					quad(C, D, E, F);
					p.push(...B, ...C, ...F);
					p.push(...D, ...A, ...E);
					const g = new THREE.BufferGeometry();
					g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
					g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((p.length / 3) * 2), 2));
					g.setIndex([...Array(p.length / 3).keys()]);
					g.computeVertexNormals();
					return g;
				})();

				// Worn paint tones for container units (muted, night-albedo).
				const CONTAINER_TONES = [0x66727b, 0x5d5348, 0x506055, 0x6e4a40, 0x4c5a68];

				// -- Templates ------------------------------------------------

				// High-mast floodlight tower: foundation, two-section tapered mast
				// with a bolted joint flange, service ladder, railed head platform,
				// four aimed floodlight heads, aviation beacon, light cone + pool.
				const towerTpl = (hgt: number) => (): Record<string, PropPart[]> => {
					const steel: PropPart[] = [];
					const dark: PropPart[] = [];
					const lamp: PropPart[] = [];
					const beacon: PropPart[] = [];
					dark.push({ g: uBox, p: [0, 0.28, 0], s: [1.7, 0.56, 1.7] });
					steel.push({ g: new THREE.CylinderGeometry(0.52, 0.52, 0.1, 12), p: [0, 0.6, 0] });
					steel.push({
						g: new THREE.CylinderGeometry(0.27, 0.38, hgt * 0.55, 10),
						p: [0, 0.6 + hgt * 0.275, 0]
					});
					steel.push({
						g: new THREE.CylinderGeometry(0.34, 0.34, 0.14, 10),
						p: [0, 0.6 + hgt * 0.55, 0]
					});
					steel.push({
						g: new THREE.CylinderGeometry(0.17, 0.26, hgt * 0.45, 10),
						p: [0, 0.6 + hgt * 0.775, 0]
					});
					const ladderH = hgt * 0.62;
					for (const lz of [-0.19, 0.19])
						steel.push({ g: uBox, p: [-0.45, 0.6 + ladderH / 2, lz], s: [0.05, ladderH, 0.05] });
					const rungs = Math.floor(ladderH / 1.15);
					for (let i = 1; i <= rungs; i++)
						steel.push({
							g: uBox,
							p: [-0.45, 0.6 + (i * ladderH) / (rungs + 1), 0],
							s: [0.04, 0.05, 0.42]
						});
					const headY = 0.6 + hgt;
					steel.push({ g: uBox, p: [0, headY, 0], s: [1.9, 0.12, 1.9] });
					for (const px of [-0.9, 0.9])
						for (const pz of [-0.9, 0.9])
							steel.push({ g: uBox, p: [px, headY + 0.32, pz], s: [0.05, 0.55, 0.05] });
					for (const [sx, sz, lx, lz] of [
						[0, -0.9, 1.9, 0.05],
						[0, 0.9, 1.9, 0.05],
						[-0.9, 0, 0.05, 1.9],
						[0.9, 0, 0.05, 1.9]
					])
						steel.push({ g: uBox, p: [sx, headY + 0.58, sz], s: [lx, 0.05, lz] });
					steel.push({ g: uBox, p: [0.3, headY + 0.42, 0], s: [0.6, 0.24, 3.9] });
					const HEAD_OFFSETS = [-1.62, -0.54, 0.54, 1.62];
					// The lamp LENS and the light POOL on the ground are the beam's two
					// real endpoints; the cone below is derived from them (see there).
					const LAMP_X = 1.14;
					const LAMP_Y = headY + 0.28;
					const POOL_X = 9.4;
					const POOL_Y = 0.03;
					for (const off of HEAD_OFFSETS) {
						steel.push({ g: uBox, p: [0.62, headY + 0.42, off], s: [0.5, 0.14, 0.14] });
						dark.push({
							g: uBox,
							p: [0.92, headY + 0.42, off],
							s: [0.55, 0.72, 0.9],
							r: [0, 0, -0.55]
						});
						lamp.push({
							g: uBox,
							p: [LAMP_X, LAMP_Y, off],
							s: [0.1, 0.66, 0.82],
							r: [0, 0, -0.55]
						});
					}
					steel.push({ g: uBox, p: [0, headY + 0.85, 0], s: [0.05, 0.55, 0.05] });
					beacon.push({ g: new THREE.SphereGeometry(0.11, 8, 6), p: [0, headY + 1.18, 0] });
					// Four separate beams, one per lamp head: each cone/pool pair
					// carries the SAME z offset as its lamp (HEAD_OFFSETS), so the
					// light visibly originates from its own fixture and lands in its
					// own patch of ground instead of one merged centerline beam.
					//
					// Phase 9-fix-c: the beam is DERIVED from its two real endpoints
					// (the lamp lens above, the pool on the ground) instead of a
					// hand-placed centre and tilt, which had the tilt INVERTED: a
					// ConeGeometry's apex is its +y end, and rotating by -0.5 swung
					// that apex outward and its wide base back under the mast, so
					// every tower on every track shone an upside-down beam from its
					// own foot into empty air while the pool glowed 9 m away with
					// nothing joining them. Rotating by +atan2(dx, dy) instead swings
					// the BASE out to the pool and leaves the apex on the lens.
					// (Euler XYZ composes as RY * RZ, so this z tilt runs in the
					// prop's own vertical plane before any placement yaw.)
					const beamDx = POOL_X - LAMP_X;
					const beamDy = LAMP_Y - POOL_Y;
					const cone: PropPart[] = HEAD_OFFSETS.map((off) => ({
						g: new THREE.ConeGeometry(3.1, Math.hypot(beamDx, beamDy), 14, 1, true),
						p: [(LAMP_X + POOL_X) / 2, (LAMP_Y + POOL_Y) / 2, off],
						r: [0, 0, Math.atan2(beamDx, beamDy)]
					}));
					// The pool sits on the tower's OWN ground plane. Every ground
					// query beyond the ribbon edge clamps to that edge's height, so a
					// trackside tower and the patch it lights read the same surface
					// height (verified for all 12 Terminal Nine towers); a tower
					// authored close enough that its pool falls on banked ribbon would
					// need per-instance beam geometry, which nothing needs today.
					const pool: PropPart[] = HEAD_OFFSETS.map((off) => ({
						g: new THREE.CircleGeometry(3.4, 20),
						p: [POOL_X, POOL_Y, off],
						r: [-Math.PI / 2, 0, 0]
					}));
					return { steel, dark, lamp, beacon, cone, pool };
				};

				// Overhead truss gantry: A-frame legs on foot plates, box-truss
				// beam with chords/verticals/diagonals, catwalk + railing, signage
				// board, green track markers (the key art's gantry dots).
				const gantryTpl = (span: number) => (): Record<string, PropPart[]> => {
					const steel: PropPart[] = [];
					const dark: PropPart[] = [];
					const green: PropPart[] = [];
					const beamY = 6.4;
					for (const side of [-1, 1]) {
						const z0 = (side * span) / 2;
						for (const lx of [-0.85, 0.85]) {
							steel.push({
								g: uBox,
								p: [lx / 2, beamY / 2, z0],
								s: [0.34, beamY, 0.4],
								r: [0, 0, lx > 0 ? -0.115 : 0.115]
							});
							dark.push({ g: uBox, p: [lx, 0.09, z0], s: [0.8, 0.18, 0.8] });
						}
						steel.push({ g: uBox, p: [0, 2.2, z0], s: [1.35, 0.16, 0.3] });
						steel.push({ g: uBox, p: [0, 4.3, z0], s: [0.9, 0.16, 0.3] });
					}
					const chordL = span + 1.4;
					for (const cy of [beamY, beamY + 1.1])
						for (const cx of [-0.42, 0.42])
							steel.push({ g: uBox, p: [cx, cy, 0], s: [0.2, 0.2, chordL] });
					const bays = Math.max(4, Math.round(span / 2.2));
					const bayW = (chordL - 0.4) / bays;
					const diagLen = Math.hypot(bayW, 1.1);
					const diagAng = Math.atan2(bayW, 1.1);
					for (let i = 0; i < bays; i++) {
						const z = -(chordL - 0.4) / 2 + (i + 0.5) * bayW;
						const dir = i % 2 ? 1 : -1;
						for (const cx of [-0.42, 0.42]) {
							steel.push({
								g: uBox,
								p: [cx, beamY + 0.55, z],
								s: [0.09, diagLen, 0.09],
								r: [dir * diagAng, 0, 0]
							});
							steel.push({ g: uBox, p: [cx, beamY + 0.55, z + bayW / 2], s: [0.09, 1.1, 0.09] });
						}
					}
					steel.push({ g: uBox, p: [-0.75, beamY + 1.16, 0], s: [0.55, 0.07, span * 0.9] });
					steel.push({ g: uBox, p: [-1.0, beamY + 1.62, 0], s: [0.05, 0.05, span * 0.9] });
					const rposts = Math.max(3, Math.round(span / 3.4));
					for (let i = 0; i <= rposts; i++)
						steel.push({
							g: uBox,
							p: [-1.0, beamY + 1.4, -span * 0.45 + (i * span * 0.9) / rposts],
							s: [0.05, 0.45, 0.05]
						});
					dark.push({ g: uBox, p: [-0.55, beamY + 0.55, 0], s: [0.1, 0.85, 3.2] });
					const marks = Math.max(4, Math.round(span / 3.2));
					for (let i = 0; i <= marks; i++)
						green.push({
							g: uBox,
							p: [-0.56, beamY - 0.14, -span * 0.42 + (i * span * 0.84) / marks],
							s: [0.09, 0.16, 0.16]
						});
					return { steel, dark, green };
				};

				// Free-sized corrugated yard box (the `block` container kind).
				const blockBoxTpl =
					(l: number, h: number, w: number, v: number) => (): Record<string, PropPart[]> => {
						const corr: PropPart[] = [
							{ g: uBox, p: [0, h / 2, 0], s: [l, h, w], c: CONTAINER_TONES[v] }
						];
						const dark: PropPart[] = [];
						for (const cx of [-1, 1])
							for (const cz of [-1, 1])
								dark.push({
									g: uBox,
									p: [(cx * (l - 0.26)) / 2, h / 2, (cz * (w - 0.16)) / 2],
									s: [0.28, h + 0.04, 0.2]
								});
						for (const rz of [-0.3, 0.3])
							dark.push({
								g: uBox,
								p: [l / 2 + 0.03, h / 2, rz * w],
								s: [0.08, h - 0.25, 0.08]
							});
						return { corr, dark };
					};

				// ISO container stack (the freestanding `container` prop): 20/40 ft
				// units, per-level paint tones, slight stack misalignment, corner
				// castings and door lock rods.
				const containerTpl =
					(long: boolean, stack: number, v: number) => (): Record<string, PropPart[]> => {
						const l = long ? 12.2 : 6.1;
						const w = 2.44;
						const h = 2.6;
						const corr: PropPart[] = [];
						const dark: PropPart[] = [];
						for (let i = 0; i < stack; i++) {
							const dx = i === 0 ? 0 : Math.sin((v + 1) * (i * 2.7)) * 0.22;
							const dz = i === 0 ? 0 : Math.cos((v + 2) * (i * 1.9)) * 0.1;
							const y0 = i * h;
							corr.push({
								g: uBox,
								p: [dx, y0 + h / 2, dz],
								s: [l - 0.12, h - 0.06, w],
								c: CONTAINER_TONES[(v + i) % CONTAINER_TONES.length]
							});
							for (const cx of [-1, 1])
								for (const cz of [-1, 1])
									dark.push({
										g: uBox,
										p: [dx + (cx * (l - 0.3)) / 2, y0 + h / 2, dz + (cz * (w - 0.18)) / 2],
										s: [0.3, h, 0.24]
									});
							for (const rz of [-0.75, -0.25, 0.25, 0.75])
								dark.push({
									g: uBox,
									p: [dx + l / 2 - 0.02, y0 + h / 2, dz + rz],
									s: [0.1, h - 0.3, 0.09]
								});
						}
						return { corr, dark };
					};

				// Rail boxcar on bogies (the `block` railcar kind): ribbed body,
				// underframe, sliding doors, roof walk, two bogies with wheels.
				const railcarTpl =
					(l: number, h: number, w: number) => (): Record<string, PropPart[]> => {
						const bodyH = h * 0.68;
						const deckY = h - bodyH;
						const corr: PropPart[] = [
							{ g: uBox, p: [0, deckY + bodyH / 2, 0], s: [l * 0.96, bodyH, w], c: 0x454c52 }
						];
						const dark: PropPart[] = [
							{ g: uBox, p: [0, deckY - 0.14, 0], s: [l, 0.3, w * 0.8] },
							{ g: uBox, p: [l / 2 + 0.12, deckY - 0.1, 0], s: [0.26, 0.18, w * 0.5] },
							{ g: uBox, p: [-l / 2 - 0.12, deckY - 0.1, 0], s: [0.26, 0.18, w * 0.5] },
							{ g: uBox, p: [0, h + 0.03, 0], s: [l * 0.9, 0.06, 0.7] }
						];
						for (const sz of [-1, 1])
							dark.push({
								g: uBox,
								p: [0, deckY + bodyH * 0.45, (sz * (w + 0.08)) / 2],
								s: [2.6, bodyH * 0.8, 0.08]
							});
						const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12);
						for (const bx of [-1, 1]) {
							dark.push({ g: uBox, p: [bx * l * 0.31, deckY - 0.42, 0], s: [2.1, 0.5, w * 0.6] });
							for (const ax of [-0.65, 0.65])
								for (const sz of [-1, 1])
									dark.push({
										g: wheel,
										p: [bx * l * 0.31 + ax, 0.42, (sz * w * 0.62) / 2],
										r: [Math.PI / 2, 0, 0]
									});
						}
						return { corr, dark };
					};

				// Jersey-profile concrete barrier (the `block` barrier kind).
				const barrierTpl =
					(l: number, h: number, w: number) => (): Record<string, PropPart[]> => {
						const bw = w / 2;
						const tw = Math.min(w * 0.17, 0.1);
						const shape = new THREE.Shape();
						shape.moveTo(-bw, 0);
						shape.lineTo(bw, 0);
						shape.lineTo(bw * 0.85, h * 0.09);
						shape.lineTo(tw * 1.6, h * 0.45);
						shape.lineTo(tw, h);
						shape.lineTo(-tw, h);
						shape.lineTo(-tw * 1.6, h * 0.45);
						shape.lineTo(-bw * 0.85, h * 0.09);
						shape.closePath();
						const g = new THREE.ExtrudeGeometry(shape, { depth: l, bevelEnabled: false });
						g.translate(0, 0, -l / 2);
						g.rotateY(Math.PI / 2);
						return { concrete: [{ g }] };
					};

				// Background yard building: near-black silhouette mass, sparse lit
				// windows, warehouse gable + vents or tower parapet + beacon mast.
				const buildingTpl =
					(kind: 'warehouse' | 'tower', w: number, l: number, h: number, v: number) =>
					(): Record<string, PropPart[]> => {
						const sil: PropPart[] = [{ g: uBox, p: [0, h / 2, 0], s: [l, h, w] }];
						const dark: PropPart[] = [];
						const windows: PropPart[] = [];
						const beacon: PropPart[] = [];
						if (kind === 'warehouse') {
							const ridge = w * 0.16;
							sil.push({ g: prism, p: [0, h, 0], s: [l * 0.995, ridge, w * 1.002] });
							for (let i = 0; i < 3; i++)
								dark.push({
									g: uBox,
									p: [(-0.3 + i * 0.3) * l, h + ridge + 0.18, 0],
									s: [1.1, 0.5, 1.3]
								});
							dark.push({
								g: uBox,
								p: [l * 0.12, h * 0.36, -(w / 2 + 0.04)],
								s: [l * 0.24, h * 0.72, 0.1]
							});
							const wcount = 2 + (v % 3);
							for (let i = 0; i < wcount; i++)
								windows.push({
									g: uBox,
									p: [
										((i + 0.7) / wcount - 0.5) * l * 0.8 + Math.sin(v * 3.7 + i * 2.9) * l * 0.06,
										h * 0.74,
										w / 2 + 0.02
									],
									s: [1.15, 0.7, 0.06]
								});
							windows.push({
								g: uBox,
								p: [-l * 0.28, h * 0.42, -(w / 2) - 0.02],
								s: [0.5, 0.9, 0.06]
							});
						} else {
							for (const sz of [-1, 1]) {
								dark.push({
									g: uBox,
									p: [0, h + 0.22, sz * (w / 2 - 0.14)],
									s: [l + 0.15, 0.45, 0.22]
								});
								dark.push({
									g: uBox,
									p: [sz * (l / 2 - 0.14), h + 0.22, 0],
									s: [0.22, 0.45, w + 0.15]
								});
							}
							dark.push({ g: uBox, p: [l * 0.16, h + 0.55, -w * 0.12], s: [l * 0.3, 1.1, w * 0.4] });
							const mastH = Math.max(3, h * 0.22);
							dark.push({
								g: new THREE.CylinderGeometry(0.07, 0.11, mastH, 8),
								p: [-l * 0.22, h + mastH / 2, w * 0.1]
							});
							beacon.push({
								g: new THREE.SphereGeometry(0.14, 8, 6),
								p: [-l * 0.22, h + mastH + 0.12, w * 0.1]
							});
							const rows = Math.max(2, Math.round(h / 6)) * 2;
							for (let i = 0; i < rows; i++) {
								const fy = h * (0.35 + 0.55 * ((i * 0.618 + v * 0.21) % 1));
								const side = i % 2 ? 1 : -1;
								if (i % 3 === 0)
									windows.push({
										g: uBox,
										p: [side * (l / 2 + 0.02), fy, (((i * 0.37 + v * 0.13) % 1) - 0.5) * w * 0.7],
										s: [0.06, 0.75, 1.0]
									});
								else
									windows.push({
										g: uBox,
										p: [(((i * 0.53 + v * 0.29) % 1) - 0.5) * l * 0.7, fy, side * (w / 2 + 0.02)],
										s: [1.0, 0.75, 0.06]
									});
							}
						}
						return { sil, dark, window: windows, beacon };
					};

				// Rubber-tyred gantry crane, mid-lift: portal frames on wheel
				// bogies, twin girders, trolley + cables + spreader holding a
				// container in the air, hung operator cab.
				const craneTpl = (): Record<string, PropPart[]> => {
					const steel: PropPart[] = [];
					const dark: PropPart[] = [];
					const corr: PropPart[] = [];
					const glass: PropPart[] = [];
					const beacon: PropPart[] = [];
					const SPAN = 8.4;
					const LEGX = 1.5;
					for (const sz of [-1, 1]) {
						const z0 = (sz * SPAN) / 2;
						for (const lx of [-LEGX, LEGX])
							steel.push({ g: uBox, p: [lx, 4.9, z0], s: [0.5, 7.8, 0.62] });
						steel.push({ g: uBox, p: [0, 8.55, z0], s: [3.9, 0.75, 0.6] });
						steel.push({ g: uBox, p: [0, 1.15, z0], s: [3.9, 0.55, 0.55] });
						steel.push({ g: uBox, p: [0, 3.0, z0], s: [0.24, 5.4, 0.24], r: [0, 0, 0.5] });
						for (const lx of [-LEGX, LEGX]) {
							dark.push({ g: uBox, p: [lx, 0.62, z0], s: [1.7, 0.6, 0.55] });
							for (const wx of [-0.55, 0.55])
								dark.push({
									g: new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12),
									p: [lx + wx, 0.55, z0],
									r: [Math.PI / 2, 0, 0]
								});
						}
					}
					for (const gx of [-0.95, 0.95])
						steel.push({ g: uBox, p: [gx, 9.25, 0], s: [0.55, 0.72, SPAN + 1.6] });
					dark.push({ g: uBox, p: [0, 8.62, 1.4], s: [2.3, 0.55, 1.5] });
					for (const cx of [-0.6, 0.6])
						dark.push({ g: uBox, p: [cx, 6.75, 1.4], s: [0.06, 3.3, 0.06] });
					dark.push({ g: uBox, p: [0, 5.05, 1.4], s: [0.45, 0.3, 5.6] });
					corr.push({ g: uBox, p: [0, 3.65, 1.4], s: [2.44, 2.5, 6.0], c: 0x6e4a40 });
					dark.push({ g: uBox, p: [1.1, 7.3, SPAN / 2 - 0.4], s: [1.3, 1.15, 1.35] });
					glass.push({ g: uBox, p: [1.65, 7.35, SPAN / 2 - 0.4], s: [0.08, 0.7, 1.1] });
					beacon.push({ g: new THREE.SphereGeometry(0.12, 8, 6), p: [0.95, 9.75, 0] });
					return { steel, dark, corr, glass, beacon };
				};

				// Parked wheel loader: rear engine deck, cab with glass band,
				// articulated front frame, lift arms, tipped bucket, four wheels.
				const loaderTpl = (): Record<string, PropPart[]> => {
					const steel: PropPart[] = [];
					const dark: PropPart[] = [];
					const glass: PropPart[] = [];
					const beacon: PropPart[] = [];
					steel.push({ g: uBox, p: [-1.35, 1.55, 0], s: [2.3, 1.15, 1.95] });
					steel.push({ g: uBox, p: [-2.2, 1.95, 0], s: [0.7, 0.5, 1.6], r: [0, 0, 0.18] });
					dark.push({ g: uBox, p: [-1.35, 0.95, 0], s: [2.5, 0.55, 1.5] });
					dark.push({
						g: new THREE.CylinderGeometry(0.09, 0.09, 0.9, 8),
						p: [-0.75, 2.7, 0.55]
					});
					dark.push({ g: uBox, p: [-0.5, 2.62, 0], s: [1.35, 1.15, 1.7] });
					glass.push({ g: uBox, p: [-0.5, 2.66, 0], s: [1.15, 0.72, 1.78] });
					beacon.push({ g: new THREE.SphereGeometry(0.09, 8, 6), p: [-0.5, 3.32, 0] });
					steel.push({ g: uBox, p: [0.55, 1.15, 0], s: [1.3, 0.9, 1.4] });
					for (const az of [-0.72, 0.72])
						steel.push({ g: uBox, p: [1.7, 1.35, az], s: [2.5, 0.3, 0.24], r: [0, 0, -0.32] });
					steel.push({ g: uBox, p: [2.2, 1.05, 0], s: [0.22, 0.22, 1.5] });
					dark.push({ g: uBox, p: [3.05, 0.62, 0], s: [1.0, 1.0, 2.7], r: [0, 0, 0.22] });
					dark.push({ g: uBox, p: [3.55, 0.24, 0], s: [0.5, 0.12, 2.75], r: [0, 0, 0.1] });
					const wgeo = new THREE.CylinderGeometry(0.78, 0.78, 0.62, 14);
					const hub = new THREE.CylinderGeometry(0.3, 0.3, 0.66, 10);
					for (const wx of [-1.75, 1.05])
						for (const wz of [-1, 1]) {
							dark.push({ g: wgeo, p: [wx, 0.78, wz * 1.05], r: [Math.PI / 2, 0, 0] });
							steel.push({ g: hub, p: [wx, 0.78, wz * 1.05], r: [Math.PI / 2, 0, 0] });
						}
					return { steel, dark, glass, beacon };
				};
				for (const prop of track.props ?? []) {
					if (prop.type === 'pad') {
						// Skid pad: worn painted rings + baked-in tire scrub, one
						// generated texture on one disc (rings are paint, not meshes).
						const px = 1024;
						const pscale = px / (prop.radius * 2);
						const c = document.createElement('canvas');
						c.width = px;
						c.height = px;
						const g2 = c.getContext('2d')!;
						g2.fillStyle = '#20262b';
						g2.fillRect(0, 0, px, px);
						for (let i = 0; i < 40; i++) {
							const x = trand() * px;
							const y = trand() * px;
							const r = 40 + trand() * 160;
							const rg = g2.createRadialGradient(x, y, 0, x, y, r);
							rg.addColorStop(
								0,
								trand() > 0.5 ? 'rgba(210, 220, 228, 0.05)' : 'rgba(6, 9, 12, 0.08)'
							);
							rg.addColorStop(1, 'rgba(0,0,0,0)');
							g2.fillStyle = rg;
							g2.fillRect(x - r, y - r, r * 2, r * 2);
						}
						const cx = px / 2;
						for (const rr of prop.rings ?? []) {
							g2.strokeStyle = 'rgba(198, 210, 218, 0.4)';
							g2.lineWidth = 0.5 * pscale;
							g2.beginPath();
							g2.arc(cx, cx, rr * pscale, 0, Math.PI * 2);
							g2.stroke();
							// Wear: knock chunks back out of the paint.
							for (let i = 0; i < 26; i++) {
								const a = trand() * Math.PI * 2;
								g2.strokeStyle = 'rgba(32, 38, 43, 0.55)';
								g2.lineWidth = 0.55 * pscale;
								g2.beginPath();
								g2.arc(cx, cx, rr * pscale, a, a + 0.05 + trand() * 0.2);
								g2.stroke();
							}
						}
						const ringList = prop.rings?.length ? prop.rings : [prop.radius * 0.5];
						for (let i = 0; i < 30; i++) {
							const rr = ringList[Math.floor(trand() * ringList.length)] + (trand() - 0.5) * 7;
							const a0 = trand() * Math.PI * 2;
							const sweep = 0.5 + trand() * 1.6;
							g2.strokeStyle = `rgba(8, 10, 13, ${0.16 + trand() * 0.22})`;
							g2.lineWidth = 0.3 * pscale;
							for (const off of [0, 1.9]) {
								g2.beginPath();
								g2.arc(cx, cx, Math.max(4, (rr + off) * pscale), a0, a0 + sweep);
								g2.stroke();
							}
						}
						const tex = new THREE.CanvasTexture(c);
						tex.colorSpace = THREE.SRGBColorSpace;
						const disc = new THREE.Mesh(
							new THREE.CircleGeometry(prop.radius, 64),
							new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
						);
						disc.rotation.x = -Math.PI / 2;
						disc.position.set(prop.x, propGroundY(prop.x, prop.z) + 0.018, prop.z);
						scene.add(disc);
					} else if (prop.type === 'lightTower') {
						const hgt = prop.height ?? 15;
						placeProp(`tower:${hgt}`, prop.x, prop.z, prop.headingDeg, towerTpl(hgt));
						const head = worldOf(prop.x, prop.z, prop.headingDeg, 0.9, 0);
						// The halo is a separate world-space sprite, so it needs the same
						// ground lift the instanced mast just got or it hangs mid-air.
						addHalo('flood', head.x, propGroundY(prop.x, prop.z) + hgt + 1.05, head.z, 6);
					} else if (prop.type === 'gantry') {
						placeProp(
							`gantry:${prop.span}`,
							prop.x,
							prop.z,
							prop.headingDeg,
							gantryTpl(prop.span)
						);
					} else if (prop.type === 'block') {
						const hash = Math.abs(Math.round(prop.x * 7 + prop.z * 13));
						const dims = `${prop.l}x${prop.h}x${prop.w}`;
						if (prop.kind === 'barrier') {
							placeProp(
								`barrier:${dims}`,
								prop.x,
								prop.z,
								prop.headingDeg,
								barrierTpl(prop.l, prop.h, prop.w)
							);
						} else if (prop.kind === 'railcar') {
							placeProp(
								`railcar:${dims}`,
								prop.x,
								prop.z,
								prop.headingDeg,
								railcarTpl(prop.l, prop.h, prop.w)
							);
						} else {
							const v = hash % CONTAINER_TONES.length;
							placeProp(
								`blockbox:${dims}:${v}`,
								prop.x,
								prop.z,
								prop.headingDeg,
								blockBoxTpl(prop.l, prop.h, prop.w, v)
							);
						}
					} else if (prop.type === 'container') {
						const stack = Math.min(3, Math.max(1, prop.stack ?? 1));
						const long = prop.long ?? false;
						const v = Math.abs(Math.round(prop.x * 7 + prop.z * 13)) % CONTAINER_TONES.length;
						placeProp(
							`container:${long ? 40 : 20}:${stack}:${v}`,
							prop.x,
							prop.z,
							prop.headingDeg,
							containerTpl(long, stack, v)
						);
					} else if (prop.type === 'building') {
						const kind = prop.kind ?? 'warehouse';
						const hash = Math.abs(Math.round(prop.x * 7 + prop.z * 13));
						placeProp(
							`building:${kind}:${prop.l}x${prop.h}x${prop.w}:${hash % 4}`,
							prop.x,
							prop.z,
							prop.headingDeg,
							buildingTpl(kind, prop.w, prop.l, prop.h, hash % 4)
						);
						// The key art's soft motivated glow hanging over each mass.
						addHalo(
							hash % 2 ? 'warm' : 'cool',
							prop.x,
							propGroundY(prop.x, prop.z) + prop.h * 1.05,
							prop.z,
							Math.max(prop.l, prop.w) * 1.1
						);
					} else if (prop.type === 'machine') {
						const kind = prop.kind ?? 'crane';
						placeProp(
							`machine:${kind}`,
							prop.x,
							prop.z,
							prop.headingDeg,
							kind === 'crane' ? craneTpl : loaderTpl
						);
					} else if (prop.type === 'berm') {
						// Banked concrete sweeper: lofted strip with seam texture +
						// a steel cap rail on posts along the top edge.
						//
						// Phase 9-fix-c: every y here is measured from the LOCAL track
						// surface, read per point from the same elevation/banking data
						// the ribbon sweep itself uses. The strip used to loft between
						// two hardcoded heights (0.05 and prop.height), which is only
						// the truth on a flat yard: against Terminal Nine's banked
						// sweeper (surface ~3.1 m, -17 deg) the whole wall was buried to
						// its cap rail and read as a curb.
						const m = Math.min(prop.inner.length, prop.outer.length);
						const innerY = prop.inner.map((p) => surfaceYAt(rt, p.x, p.z));
						const outerY = prop.outer.map((p) => surfaceYAt(rt, p.x, p.z));
						const verts = new Float32Array(m * 2 * 3);
						const uvs = new Float32Array(m * 2 * 2);
						let along = 0;
						for (let i = 0; i < m; i++) {
							if (i > 0)
								along += Math.hypot(
									prop.inner[i].x - prop.inner[i - 1].x,
									prop.inner[i].z - prop.inner[i - 1].z
								);
							verts.set([prop.inner[i].x, innerY[i] + 0.05, prop.inner[i].z], i * 6);
							verts.set([prop.outer[i].x, outerY[i] + prop.height, prop.outer[i].z], i * 6 + 3);
							uvs.set([along / 4.2, 0], i * 4);
							uvs.set([along / 4.2, 1], i * 4 + 2);
						}
						const idx: number[] = [];
						for (let i = 0; i < m - 1; i++) {
							idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
						}
						const geo = new THREE.BufferGeometry();
						geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
						geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
						geo.setIndex(idx);
						geo.computeVertexNormals();
						const bermTex = (() => {
							const c = document.createElement('canvas');
							c.width = 256;
							c.height = 128;
							const g2 = c.getContext('2d')!;
							g2.fillStyle = '#878e94';
							g2.fillRect(0, 0, 256, 128);
							// Pour seams between banking sections.
							g2.fillStyle = 'rgba(10, 13, 16, 0.3)';
							g2.fillRect(0, 0, 2, 128);
							g2.fillRect(127, 0, 2, 128);
							// Grime gathering at the foot of the wall (v=0 = base).
							const grime = g2.createLinearGradient(0, 128, 0, 40);
							grime.addColorStop(0, 'rgba(10, 13, 16, 0.34)');
							grime.addColorStop(1, 'rgba(10, 13, 16, 0)');
							g2.fillStyle = grime;
							g2.fillRect(0, 0, 256, 128);
							for (let i = 0; i < 30; i++) {
								g2.fillStyle = trand() > 0.5 ? 'rgba(214,222,228,0.05)' : 'rgba(10,13,16,0.08)';
								const x = trand() * 256;
								g2.fillRect(x, trand() * 128, 3 + trand() * 14, 3 + trand() * 10);
							}
							const tex = new THREE.CanvasTexture(c);
							tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
							tex.colorSpace = THREE.SRGBColorSpace;
							return tex;
						})();
						scene.add(
							new THREE.Mesh(
								geo,
								new THREE.MeshStandardMaterial({
									map: bermTex,
									color: 0x434a51,
									roughness: 0.95,
									side: THREE.DoubleSide
								})
							)
						);
						// Cap rail + posts, merged into one draw call (world-space). Each
						// post stands on its own point's surface height and each rail
						// segment is PITCHED to span between its two ends, so the rail
						// follows a climbing berm as one line instead of stair-stepping
						// through it. (Euler XYZ composes as RY(yaw) * RZ(pitch), so a
						// +x-aligned box tilts in its own vertical plane, then yaws.)
						const railParts: PropPart[] = [];
						for (let i = 0; i < m - 1; i++) {
							const a = prop.outer[i];
							const b = prop.outer[i + 1];
							const ay = outerY[i] + prop.height + 0.42;
							const by = outerY[i + 1] + prop.height + 0.42;
							const flat = Math.hypot(b.x - a.x, b.z - a.z);
							const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
							railParts.push({
								g: uBox,
								p: [(a.x + b.x) / 2, (ay + by) / 2, (a.z + b.z) / 2],
								s: [Math.hypot(flat, by - ay) + 0.15, 0.16, 0.3],
								r: [0, yaw, Math.atan2(by - ay, flat)]
							});
							if (i % 2 === 0)
								railParts.push({
									g: uBox,
									p: [a.x, outerY[i] + prop.height + 0.14, a.z],
									s: [0.09, 0.62, 0.09]
								});
						}
						const railGeo = mergeGeometries(railParts.map(bakePart), false)!;
						scene.add(new THREE.Mesh(railGeo, propMats.steel));
					}
				}

				// Instantiate the collected placements: ONE InstancedMesh per
				// (template, bucket). Culling is off because one mesh's instances
				// span the whole yard (the geometry-local bounds would clip them).
				{
					const im = new THREE.Matrix4();
					const iq = new THREE.Quaternion();
					const iv = new THREE.Vector3();
					const is1 = new THREE.Vector3(1, 1, 1);
					const ie = new THREE.Euler();
					for (const { buckets, list } of propRuns.values()) {
						for (const [bucket, geo] of Object.entries(buckets)) {
							const mesh = new THREE.InstancedMesh(geo, propMats[bucket], list.length);
							list.forEach((t, i) => {
								ie.set(0, t.hd * DEGR, 0);
								iq.setFromEuler(ie);
								iv.set(t.x, t.y, t.z);
								im.compose(iv, iq, is1);
								mesh.setMatrixAt(i, im);
							});
							mesh.instanceMatrix.needsUpdate = true;
							mesh.frustumCulled = false;
							scene.add(mesh);
						}
					}
				}

				// Chain-link fence read along the outer boundary: posts + top rail.
				{
					const fence = rt.boundaries.find((b) => b.id === 'outer');
					if (fence) {
						const pts = fence.points;
						const step = 3;
						const count = Math.ceil(pts.length / step);
						const postGeoF = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6);
						const postMatF = new THREE.MeshStandardMaterial({ color: 0x39454a, roughness: 0.85 });
						const posts = new THREE.InstancedMesh(postGeoF, postMatF, count);
						const im = new THREE.Matrix4();
						// Phase 9-fix-c: the fence is the guardrail the driver reads the
						// track edge from, so it climbs with the track instead of staying
						// on the apron — on the gantry deck it used to sit 13.5 m under
						// the road it was meant to line. The outer boundary hugs the
						// ribbon (measured: within 9 m of the edge everywhere the track
						// is raised, 2 m on the deck itself), so every post is trackside
						// by propGroundY's margin and the run lifts smoothly rather than
						// stepping.
						for (let i = 0; i < count; i++) {
							const p = pts[(i * step) % pts.length];
							im.makeTranslation(p.x, propGroundY(p.x, p.z) + 1.3, p.z);
							posts.setMatrixAt(i, im);
						}
						scene.add(posts);
						const railPts = [...pts, pts[0]].map(
							(p) => new THREE.Vector3(p.x, propGroundY(p.x, p.z) + 2.55, p.z)
						);
						scene.add(
							new THREE.Line(
								new THREE.BufferGeometry().setFromPoints(railPts),
								new THREE.LineBasicMaterial({ color: 0x3a4f44, transparent: true, opacity: 0.7 })
							)
						);
					}
				}

				// ---- Track visuals (from the JSON data, all visual-only) ----
				const nC = rt.center.length;
				// One swept surface per path: the main line, plus any branch spurs
				// (Phase 8b). A branch is REAL road, so it gets the same asphalt,
				// wear ramps, and edge lines rather than a painted hint. Tracks
				// with no branches run this loop exactly once, over the main
				// centerline, which is the pre-8b behavior.
				for (const path of rt.paths) {
					const nP = path.center.length;
					const closed = path.closed;
					// Cumulative distance along the centerline drives the ribbon's
					// texture tiling and the braking-zone wear ramps. On a closed
					// path the last cross-section is duplicated (with the
					// end-of-loop u) so the closing quad doesn't smear the whole
					// texture backwards; an open spur simply ends.
					const cum: number[] = [0];
					for (let i = 1; i < nP; i++)
						cum[i] =
							cum[i - 1] +
							Math.hypot(
								path.center[i].x - path.center[i - 1].x,
								path.center[i].z - path.center[i - 1].z
							);
					const total = closed
						? cum[nP - 1] +
							Math.hypot(
								path.center[0].x - path.center[nP - 1].x,
								path.center[0].z - path.center[nP - 1].z
							)
						: cum[nP - 1];
					// Rubbered-in braking zones: the surface darkens on the approach
					// to every gate and briefly past it. Purely visual.
					const gates = [...rt.checkpoints, rt.startFinish];
					// Only gates that actually sit on THIS path get a braking-wear
					// ramp on it, so a branch does not inherit rubber from a gate
					// 200 m away on the main line.
					const gateS: number[] = [];
					for (const g of gates) {
						let best = 0;
						let bd = Infinity;
						for (let i = 0; i < nP; i++) {
							const d =
								(path.center[i].x - g.gate.x) ** 2 + (path.center[i].z - g.gate.z) ** 2;
							if (d < bd) {
								bd = d;
								best = i;
							}
						}
						if (bd <= (path.maxHalfWidth + 12) ** 2) gateS.push(cum[best]);
					}
					const wearAt = (s: number) => {
						let w = 0;
						for (const gs of gateS) {
							const d = closed ? (((gs - s) % total) + total) % total : Math.max(0, gs - s);
							if (d < 30) w = Math.max(w, 1 - d / 30);
							else if (closed && total - d < 9) w = Math.max(w, (1 - (total - d) / 9) * 0.5);
						}
						return w;
					};
					const rings = closed ? nP + 1 : nP;
					const verts = new Float32Array(rings * 2 * 3);
					const uvs = new Float32Array(rings * 2 * 2);
					const cols = new Float32Array(rings * 2 * 3);
					const tile = 13.5;
					for (let i = 0; i < rings; i++) {
						const j = i % nP;
						const s = i === nP ? total : cum[i];
						// The 3D sweep (elevation + banking; flat tracks sweep at y 0)
						// — the same geometry the physics trimesh is built from.
						verts.set(
							[path.leftEdge3[j].x, path.leftEdge3[j].y + 0.03, path.leftEdge3[j].z],
							i * 6
						);
						verts.set(
							[path.rightEdge3[j].x, path.rightEdge3[j].y + 0.03, path.rightEdge3[j].z],
							i * 6 + 3
						);
						uvs.set([s / tile, 0], i * 4);
						uvs.set([s / tile, 1], i * 4 + 2);
						const tone = 1 - 0.5 * wearAt(s);
						cols.set([tone, tone, tone], i * 6);
						cols.set([tone, tone, tone], i * 6 + 3);
					}
					const idx: number[] = [];
					for (let i = 0; i < rings - 1; i++) {
						// Wind the quads so the right-hand-rule normals point UP: the
						// old order ((L,R,L'),(L',R,R')) faced DOWN, which FrontSide
						// culling silently hid — invisible against the apron plane on
						// a flat track, but fatal on an elevated span with nothing
						// behind it. (Latent since the first ribbon mesh; the darker
						// corridor + braking wear ramps render for the first time.)
						idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
					}
					const geo = new THREE.BufferGeometry();
					geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
					geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
					geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
					geo.setIndex(idx);
					geo.computeVertexNormals();
					const ribbonTex = asphaltTex.clone();
					scene.add(
						new THREE.Mesh(
							geo,
							new THREE.MeshStandardMaterial({
								map: ribbonTex,
								color: 0x1c2227,
								vertexColors: true,
								roughness: 0.98
							})
						)
					);
				}
				// Oil stains near the braking zones: cheap shared-texture decals.
				{
					const c = document.createElement('canvas');
					c.width = 128;
					c.height = 128;
					const g2 = c.getContext('2d')!;
					for (let i = 0; i < 7; i++) {
						const x = 44 + trand() * 40;
						const y = 44 + trand() * 40;
						const r = 12 + trand() * 34;
						const rg = g2.createRadialGradient(x, y, 0, x, y, r);
						rg.addColorStop(0, `rgba(4, 6, 8, ${0.5 + trand() * 0.3})`);
						rg.addColorStop(0.7, 'rgba(4, 6, 8, 0.18)');
						rg.addColorStop(1, 'rgba(4, 6, 8, 0)');
						g2.fillStyle = rg;
						g2.fillRect(0, 0, 128, 128);
					}
					const stainMat = new THREE.MeshBasicMaterial({
						map: new THREE.CanvasTexture(c),
						transparent: true,
						opacity: 0.5,
						depthWrite: false
					});
					const stainGeo = new THREE.PlaneGeometry(1, 1);
					for (const g of rt.checkpoints) {
						const size = 3 + ((Math.abs(g.gate.x * 13 + g.gate.z * 7) | 0) % 30) / 10;
						const back = 6 + ((Math.abs(g.gate.x * 5 + g.gate.z * 11) | 0) % 90) / 10;
						const stain = new THREE.Mesh(stainGeo, stainMat);
						stain.rotation.set(-Math.PI / 2, 0, (g.gate.x + g.gate.z) % 3.1);
						const d = headingToDir(g.gate.headingDeg);
						const sx = g.gate.x - d.x * back;
						const sz = g.gate.z - d.z * back;
						stain.position.set(sx, surfaceYAt(rt, sx, sz) + 0.045, sz);
						stain.scale.set(size, size * 0.7, 1);
						scene.add(stain);
					}
				}
				// Painted edge lines: with a variable-width ribbon the corridor's
				// breathing (wide pad, narrow yard) must read at speed. Cool worn
				// white, per the steel-not-green night palette.
				for (const path of rt.paths)
				for (const edge of [path.leftEdge3, path.rightEdge3]) {
					const loop = path.closed ? [...edge, edge[0]] : edge;
					const pts = loop.map((p) => new THREE.Vector3(p.x, p.y + 0.06, p.z));
					scene.add(
						new THREE.Line(
							new THREE.BufferGeometry().setFromPoints(pts),
							new THREE.LineBasicMaterial({ color: 0x9fb0bd, transparent: true, opacity: 0.75 })
						)
					);
				}
				const wallMat = new THREE.MeshBasicMaterial({
					color: 0x00ff41,
					transparent: true,
					opacity: 0.14,
					side: THREE.DoubleSide,
					depthWrite: false
				});
				for (const b of rt.boundaries) {
					const m = b.points.length;
					const verts = new Float32Array(m * 2 * 3);
					for (let i = 0; i < m; i++) {
						verts.set([b.points[i].x, 0, b.points[i].z], i * 6);
						verts.set([b.points[i].x, 0.9, b.points[i].z], i * 6 + 3);
					}
					const idx: number[] = [];
					const last = b.closed ? m : m - 1;
					for (let i = 0; i < last; i++) {
						const j = (i + 1) % m;
						idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
					}
					const geo = new THREE.BufferGeometry();
					geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
					geo.setIndex(idx);
					scene.add(new THREE.Mesh(geo, wallMat));
				}
				const postGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.6, 10);
				const paneFor = (g: (typeof rt.checkpoints)[number], color: number, opacity: number) => {
					const group = new THREE.Group();
					// Gate visuals sit on the LOCAL surface (relief tracks); the
					// crossing math itself stays top-down 2D, unaffected by height.
					const gy = surfaceYAt(rt, g.gate.x, g.gate.z);
					const mat = new THREE.MeshBasicMaterial({
						color,
						transparent: true,
						opacity,
						side: THREE.DoubleSide,
						depthWrite: false
					});
					const postMat = new THREE.MeshBasicMaterial({ color });
					for (const [px, pz] of [
						[g.ax, g.az],
						[g.bx, g.bz]
					]) {
						const post = new THREE.Mesh(postGeo, postMat);
						post.position.set(px, gy + 1.3, pz);
						group.add(post);
					}
					const pane = new THREE.Mesh(new THREE.PlaneGeometry(g.gate.halfWidth * 2, 2.6), mat);
					pane.position.set(g.gate.x, gy + 1.3, g.gate.z);
					pane.rotation.y = Math.atan2(g.dx, g.dz);
					group.add(pane);
					scene.add(group);
					return { mat, postMat };
				};
				const cpMats = rt.checkpoints.map((g) => paneFor(g, 0x00ff41, 0.1));
				paneFor(rt.startFinish, 0xc8ff00, 0.2);

				// ---- Trigger zones (schema v2): boost pads + hazards ----
				// Visuals only here; the trigger check lives in the per-vehicle
				// pipeline (zoneEntries). Rings/rims pulse gently via zonePulse in
				// the frame loop. Empty on tracks without zones (zero cost).
				const zonePulse: {
					mat: InstanceType<typeof THREE.MeshBasicMaterial>;
					base: number;
					phase: number;
				}[] = [];
				if (rt.zones.length) {
					const zoneDiscGeo = new THREE.CircleGeometry(1, 30);
					zoneDiscGeo.rotateX(-Math.PI / 2);
					const zoneRingGeo = new THREE.RingGeometry(0.82, 1, 30);
					zoneRingGeo.rotateX(-Math.PI / 2);
					// Boost chevrons: three signature-green arrows pointing along
					// local +x; the pad is rotated to the track direction below.
					const chevTex = (() => {
						const c = document.createElement('canvas');
						c.width = 128;
						c.height = 128;
						const g2 = c.getContext('2d')!;
						g2.strokeStyle = '#2ae57e';
						g2.lineWidth = 10;
						g2.lineJoin = 'miter';
						for (const cx of [28, 58, 88]) {
							g2.beginPath();
							g2.moveTo(cx - 10, 30);
							g2.lineTo(cx + 14, 64);
							g2.lineTo(cx - 10, 98);
							g2.stroke();
						}
						const tex = new THREE.CanvasTexture(c);
						tex.colorSpace = THREE.SRGBColorSpace;
						return tex;
					})();
					// Pit repair cross: a bold signature-green plus on transparent, the
					// friendly-stop counterpart to the boost chevrons.
					const pitCrossTex = (() => {
						const c = document.createElement('canvas');
						c.width = 128;
						c.height = 128;
						const g2 = c.getContext('2d')!;
						g2.fillStyle = '#2ae57e';
						const arm = 22;
						g2.fillRect(64 - arm / 2, 30, arm, 68);
						g2.fillRect(30, 64 - arm / 2, 68, arm);
						const tex = new THREE.CanvasTexture(c);
						tex.colorSpace = THREE.SRGBColorSpace;
						return tex;
					})();
					rt.zones.forEach((zn, zi) => {
						const zy = surfaceYAt(rt, zn.x, zn.z);
						const group = new THREE.Group();
						group.position.set(zn.x, zy, zn.z);
						if (zn.type === 'boost') {
							// Direction of travel at the pad, so the chevrons point the
							// way the pad shoves.
							let bi = 0;
							let bd = Infinity;
							for (let i = 0; i < rt.center.length; i++) {
								const d =
									(rt.center[i].x - zn.x) ** 2 + (rt.center[i].z - zn.z) ** 2;
								if (d < bd) {
									bd = d;
									bi = i;
								}
							}
							const p2 = rt.center[(bi + 1) % rt.center.length];
							group.rotation.y = Math.atan2(
								-(p2.z - rt.center[bi].z),
								p2.x - rt.center[bi].x
							);
							const baseMat = new THREE.MeshBasicMaterial({
								color: 0x0b2417,
								transparent: true,
								opacity: 0.85,
								depthWrite: false
							});
							const base = new THREE.Mesh(zoneDiscGeo, baseMat);
							base.scale.set(zn.radius, 1, zn.radius);
							base.position.y = 0.04;
							const chevMat = new THREE.MeshBasicMaterial({
								map: chevTex,
								transparent: true,
								opacity: 0.9,
								depthWrite: false,
								blending: THREE.AdditiveBlending
							});
							const chev = new THREE.Mesh(
								new THREE.PlaneGeometry(zn.radius * 1.7, zn.radius * 1.7),
								chevMat
							);
							chev.rotation.x = -Math.PI / 2;
							// Canvas +u runs along local +x after the flat rotation.
							chev.rotation.z = Math.PI / 2;
							chev.position.y = 0.06;
							const rimMat = new THREE.MeshBasicMaterial({
								color: 0x2ae57e,
								transparent: true,
								opacity: 0.6,
								depthWrite: false,
								blending: THREE.AdditiveBlending
							});
							const rim = new THREE.Mesh(zoneRingGeo, rimMat);
							rim.scale.set(zn.radius, 1, zn.radius);
							rim.position.y = 0.05;
							group.add(base, chev, rim);
							zonePulse.push({ mat: rimMat, base: 0.6, phase: zi });
							zonePulse.push({ mat: chevMat, base: 0.9, phase: zi + 1.6 });
						} else if (zn.type === 'pit') {
							// Pit box: a painted green repair pad with a bright cross,
							// signature green so it reads as a friendly stop, not a hazard.
							const baseMat = new THREE.MeshBasicMaterial({
								color: 0x0b2417,
								transparent: true,
								opacity: 0.9,
								depthWrite: false
							});
							const base = new THREE.Mesh(zoneDiscGeo, baseMat);
							base.scale.set(zn.radius, 1, zn.radius);
							base.position.y = 0.04;
							const crossMat = new THREE.MeshBasicMaterial({
								map: pitCrossTex,
								transparent: true,
								opacity: 0.95,
								depthWrite: false,
								blending: THREE.AdditiveBlending
							});
							const cross = new THREE.Mesh(
								new THREE.PlaneGeometry(zn.radius * 1.5, zn.radius * 1.5),
								crossMat
							);
							cross.rotation.x = -Math.PI / 2;
							cross.position.y = 0.06;
							const pRimMat = new THREE.MeshBasicMaterial({
								color: 0x2ae57e,
								transparent: true,
								opacity: 0.7,
								depthWrite: false,
								blending: THREE.AdditiveBlending
							});
							const pRim = new THREE.Mesh(zoneRingGeo, pRimMat);
							pRim.scale.set(zn.radius, 1, zn.radius);
							pRim.position.y = 0.05;
							group.add(base, cross, pRim);
							zonePulse.push({ mat: pRimMat, base: 0.7, phase: zi });
							zonePulse.push({ mat: crossMat, base: 0.95, phase: zi + 1.1 });
						} else {
							// Oil hazard: the deployed-slick look (glossy dark puddle,
							// additive violet rim), permanent.
							const discMat = new THREE.MeshStandardMaterial({
								color: 0x0a0a14,
								roughness: 0.05,
								metalness: 0.9,
								transparent: true,
								opacity: 0.92
							});
							const disc = new THREE.Mesh(zoneDiscGeo, discMat);
							disc.scale.set(zn.radius, 1, zn.radius);
							disc.position.y = 0.05;
							const rimMat = new THREE.MeshBasicMaterial({
								color: 0x8f5fff,
								transparent: true,
								opacity: 0.55,
								depthWrite: false,
								blending: THREE.AdditiveBlending
							});
							const rim = new THREE.Mesh(zoneRingGeo, rimMat);
							rim.scale.set(zn.radius, 1, zn.radius);
							rim.position.y = 0.07;
							group.add(disc, rim);
							zonePulse.push({ mat: rimMat, base: 0.55, phase: zi });
						}
						scene.add(group);
					});
				}
				const styleGates = (next: number) => {
					cpMats.forEach((m, i) => {
						const color = i === next ? 0x00f0ff : i < next ? 0x1d4531 : 0x00ff41;
						m.mat.color.setHex(color);
						m.mat.opacity = i === next ? 0.28 : 0.1;
						m.postMat.color.setHex(color);
					});
				};
				styleGates(0);

				// ---- Physics world ----
				const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -tuning.gravity, 0) });
				world.defaultContactMaterial.friction = 0.3;

				const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
				groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
				world.addBody(groundBody);
				// The body cached its world AABB while the quaternion was still
				// identity (plane normal +z, half-space z<=0) and static bodies never
				// refresh it. Contacts ignore the AABB but RAYCASTS are culled by it,
				// so without this the wheel rays only find ground at z<0 and the car
				// rolls over onto the phantom side.
				groundBody.updateAABB();

				// Ribbon relief collision (Phase 8a): a track carrying elevation or
				// banking gets REAL drivable geometry — a static Trimesh built from
				// the SAME 3D sweep (rt.leftEdge3/rightEdge3) the visual ribbon
				// renders, so physics and visuals cannot drift apart by
				// construction. RaycastVehicle's own wheel rays follow slopes and
				// banking against it natively; world.rayTest skips backfaces, so the
				// triangles are wound normals-UP (verified against cannon-es's
				// net-right-hand-rule Trimesh.updateNormals). The flat plane above
				// stays as the catch/run-off surface at y 0: cannon-es has no
				// Box-vs-Trimesh narrowphase, so the CHASSIS never contacts the
				// ribbon (wheels are the only ground interface — exactly the
				// RaycastVehicle model), and a car that tumbles or drives off an
				// elevated edge lands on the plane for the fall watchdog to
				// recover. Flat tracks build nothing here: plane-only physics,
				// identical to pre-8a.
				if (rt.hasRelief) {
					// One collision mesh per path (Phase 8b): a branch spur is
					// driven on, so it needs real geometry under the wheels, not
					// just a visual. Single-path tracks build exactly one body, as
					// before.
					for (const path of rt.paths) {
						const nT = path.center.length;
						const tv: number[] = [];
						for (let i = 0; i < nT; i++) {
							const L = path.leftEdge3[i];
							const R = path.rightEdge3[i];
							tv.push(L.x, L.y, L.z, R.x, R.y, R.z);
						}
						const ti: number[] = [];
						// An open spur has no closing quad back to its first ring.
						const quads = path.closed ? nT : nT - 1;
						for (let i = 0; i < quads; i++) {
							const j = (i + 1) % nT;
							// (L_i, L_j, R_i) + (R_i, L_j, R_j): right-hand normals up.
							ti.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
						}
						const ribbonBody = new CANNON.Body({ mass: 0, shape: new CANNON.Trimesh(tv, ti) });
						world.addBody(ribbonBody);
						// Same static-body stale-AABB raycast trap as the plane above.
						ribbonBody.updateAABB();
					}
				}

				// ---- Vehicle rigs: ONE pipeline for every vehicle ----
				// (COM_DROP / WHEEL_RADIUS / WHEEL_CONNECTIONS come from
				// rig-visual.ts, shared with the garage preview's static pose.)
				const SPAWN_Y = 0.9;
				// Spawn / re-seat height: a wheel-drop above the LOCAL track
				// surface. Flat tracks read surfaceYAt 0 everywhere (its fast
				// path), so this is exactly the pre-8a SPAWN_Y behavior there.
				const seatY = (x: number, z: number, warmIdx?: number) =>
					SPAWN_Y + surfaceYAt(rt, x, z, warmIdx);

				interface RigSpawn {
					x: number;
					z: number;
					headingDeg: number;
					warmIdx: number;
				}

				interface Rig {
					id: string;
					label: string;
					body: InstanceType<typeof CANNON.Body>;
					vehicle: InstanceType<typeof CANNON.RaycastVehicle>;
					carGroup: InstanceType<typeof THREE.Group>;
					/** Per-rig tintable hull/plating material (status tint + scorch
					 * write its color every frame, so it can never be shared). */
					bodyMat: InstanceType<typeof THREE.MeshStandardMaterial>;
					/** The single deformable hull mesh inside parts.chassis: the
					 * crumple target, its geometry cloned per rig. */
					bodyMesh: InstanceType<typeof THREE.Mesh>;
					/** Phase 6b livery: the bodyMesh's dedicated pattern-decal material
					 * (null unless the build has a pattern; its color is a white-based
					 * scorch MULTIPLIER tinted alongside bodyMat each frame), plus every
					 * per-build cosmetic material/texture (pattern + number decals) that
					 * buildRigVisual disposes on the next rebuild. */
					bodyDecalMat: InstanceType<typeof THREE.MeshStandardMaterial> | null;
					cosmeticDisposables: { dispose(): void }[];
					/** The body tone the scorch lerps from — the LIVERY color when the
					 * build overrides it, else the archetype tone. */
					baseColor: number;
					/** Named visual parts: chassis base, armor plating, and the
					 * weapon-mount socket are attachment Groups under carGroup, each
					 * at its own local transform, so a future system can swap one
					 * part's geometry/material - or map a hit point to its nearest
					 * part for damage targeting - without touching the rest. Wheels
					 * are the fourth part but stay scene-level meshes because the
					 * RaycastVehicle drives them in world space. */
					parts: {
						chassis: InstanceType<typeof THREE.Group>;
						armor: InstanceType<typeof THREE.Group>;
						mount: InstanceType<typeof THREE.Group>;
						wheels: InstanceType<typeof THREE.Mesh>[];
					};
					/** visualKeyFor() of the build the current bodywork represents
					 * (null pre-build); applyLoadoutToRig rebuilds the visuals when
					 * it changes (archetype OR any equipped part swap). */
					visualKey: string | null;
					wheelMeshes: InstanceType<typeof THREE.Mesh>[];
					combat: VehicleCombat;
					tracker: LapTracker;
					ai: AiDriver | null;
					bar: {
						group: InstanceType<typeof THREE.Group>;
						fg: InstanceType<typeof THREE.Mesh>;
						fgMat: InstanceType<typeof THREE.MeshBasicMaterial>;
						/** Thin armor-pool sliver under the chassis fill. */
						arm: InstanceType<typeof THREE.Mesh>;
						armMat: InstanceType<typeof THREE.MeshBasicMaterial>;
						/** Amber "weapon down" dot, visible while the mount is dead. */
						mnt: InstanceType<typeof THREE.Mesh>;
					} | null;
					/** Resolved build multipliers (archetype x parts), neutral = 1. */
					buildStats: ResolvedStats;
					archetype: ArchetypeId;
					/** Equipped weapon id per slot (WEAPON_NONE = empty secondary),
					 * set by applyLoadoutToRig from the sanitized build. */
					weapons: Record<WeaponSlotId, string>;
					/** Live guided-weapon lock per slot (null = nothing acquired).
					 * Ticked in the frame loop while the slot is ready. */
					locks: Record<WeaponSlotId, WeaponLock | null>;
					/** Equipped ability id per slot (ABILITY_NONE = empty secondary),
					 * set by applyLoadoutToRig from the sanitized build. */
					abilities: Record<AbilitySlotId, string>;
					/** Per-vehicle ability state: the shared drift meter both slots
					 * draw from, per-slot cooldowns, and the active nitro/grip windows. */
					abilityState: VehicleAbilities;
					/** Crumple state: 0 pristine .. 3 wrecked; drives the stage-based
					 * plate rattle + damage smoke tiers. */
					dentStage: number;
					/** Pristine hull-geometry positions, restored on heal/reset. */
					dentBase: Float32Array;
					/** Accumulated per-vertex hull deformation (Phase 6a): each hit adds
					 * a compounding bite here (clamped), so repeated damage reads as
					 * progressively worse crumple instead of snapping to one stage. The
					 * live hull = dentBase + dentAccum; heal/reset zeroes it. */
					dentAccum: Float32Array;
					/** Cyan crackle ring shown while disrupted (inside carGroup). */
					stunMat: InstanceType<typeof THREE.MeshBasicMaterial>;
					stunRing: InstanceType<typeof THREE.Mesh>;
					/** Energy Shield: the translucent field projected around the
					 * whole vehicle while the absorb pool is up (4c — the emitter
					 * nub on the socket is deliberately small; THIS is the visual
					 * mass of the weapon). Shared geometry/material, per-rig mesh;
					 * visibility keys off combat.shieldActive each frame. */
					shieldBubble: InstanceType<typeof THREE.Mesh>;
					/** Per-rig weapon-mount material: chars dark while the mount pool
					 * is dead (the shared mount material can never be tinted). */
					mountMat: InstanceType<typeof THREE.MeshStandardMaterial>;
					/** Mirrors combat.mountDown for the dead-mount visual state. */
					mountDead: boolean;
					smokeAcc: number;
					dripAcc: number;
					/** Tire dust: emission accumulator + which rear wheel puffs next. */
					dustAcc: number;
					dustWheel: number;
					/** Velocity captured before world.step, for ram closing speed. */
					preVx: number;
					preVz: number;
					/** Seconds spent flipped (up vector below the panel threshold)
					 * while nearly stationary; drives the flip-recovery re-seat. */
					flipAcc: number;
					/**
					 * Airborne detection (Phase 8d). `wheelContacts` is the live count
					 * of wheels reporting isInContact; the two accumulators are how
					 * long the vehicle has been continuously clear of / back on the
					 * ground. Nothing read wheel contact before this.
					 */
					wheelContacts: number;
					airborneSec: number;
					groundedSec: number;
					/** Seconds spent far BELOW the local track surface (drove off an
					 * elevated edge, or tumbled through the ribbon — the chassis box
					 * has no Trimesh narrowphase); drives the fall-recovery re-seat.
					 * Always 0 on flat tracks. */
					fallAcc: number;
					/** Boost-pad window: engine-force multiplier applied while the
					 * stamp is in the future (Phase 8a trigger zones). */
					boostUntilMs: number;
					boostMul: number;
					/** Per-zone occupancy + retrigger stamps, parallel to rt.zones
					 * (zoneEntries updates the occupancy in place per frame). */
					zoneInside: boolean[];
					zoneRearmMs: number[];
					/** Throttle stamp for the pit-repair FX pulse (Phase 9c). */
					pitFxMs: number;
					warmIdx: number;
					/**
					 * Which ribbon PATH `warmIdx` indexes (0 = main line, >0 = a
					 * branch spur). Carried per vehicle so the warm-started
					 * nearest-point search resumes on the path the car is actually
					 * on; single-path tracks leave this 0 forever.
					 */
					warmPath: number;
					/**
					 * Telemetry (Phase 8f): the last ALTERNATE route this vehicle was
					 * driving — a RibbonBranch id — or 'main' if it has only ever been
					 * on the main line. Derived from `warmPath` (which the surface
					 * query already maintains), so it costs one comparison per frame
					 * and nothing in the sim reads it back. Reset per round.
					 */
					routeUsed: string;
					lastOnRibbon: boolean;
					steerCurrent: number;
					/** Handbrake drift engagement 0..1: eases toward the held state so
					 * the rear-grip cut and lock brake fade in/out instead of snapping
					 * (Phase 9a). Player-only in practice (AI never sets the handbrake). */
					hbEngage: number;
					/**
					 * Traction limiting 0..1 (Phase 9-fix-e): the fraction of the
					 * driver's commanded throttle the tires can currently put down,
					 * eased over time so grip fades in and out instead of snapping.
					 * 1 = unlimited, and it stays EXACTLY 1 for the whole race on any
					 * build whose tires can take its power (three of the four
					 * archetypes), which is what makes the limiter provably a no-op
					 * for them rather than merely a small one.
					 */
					tractionEase: number;
					hx: number;
					hz: number;
					/** Slipstream, set each frame by the draft-detection pass. drafting =
					 * currently in another vehicle's wake; draftFactor 0..1 = how tightly
					 * tucked in (scales the drag reduction); draftPrev drives the
					 * engage-SFX rising edge for the player. */
					drafting: boolean;
					draftFactor: number;
					draftPrev: boolean;
					prevX: number;
					prevZ: number;
					flashUntil: number;
					finished: boolean;
					finishPos: number;
					/** Timing-start / finish stamps (ms), for per-rig total race time.
					 * Mirror the player's playerRaceStartMs logic for every vehicle so
					 * the headless stress runner can read an exact total per rig. */
					raceStartMs: number | null;
					finishAtMs: number | null;
					spawn: RigSpawn;
					/** Qualifying lap time (ms) that decides this rig's grid slot
					 * (Phase 9b): the player's real best recorded lap on the track, or
					 * a simulated time for AI. NO_QUAL_MS (a large sentinel) means "no
					 * time set" and sorts to the back of the grid. */
					qualMs: number;
				}

				// Ram detection: chassis-chassis contacts queue here from cannon's
				// collide events (fired inside world.step) and are evaluated right
				// after the step using PRE-step velocities, because by the time the
				// event fires the solver has already bled off the closing speed.
				const rigByBodyId = new Map<number, Rig>();
				let pendingRams: { a: Rig; b: Rig }[] = [];

				const quatFor = (headingDeg: number) => {
					const q = new CANNON.Quaternion();
					q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), (headingDeg * Math.PI) / 180);
					return q;
				};

				// Grid anchor: the centerline point nearest the player's spawn. AI
				// rows step back from here, so the spacing is correct regardless of
				// where the start line sits in the point list.
				let startIdx = 0;
				{
					let bd = Infinity;
					for (let i = 0; i < nC; i++) {
						const d = Math.hypot(rt.center[i].x - track.spawn.x, rt.center[i].z - track.spawn.z);
						if (d < bd) {
							bd = d;
							startIdx = i;
						}
					}
				}
				// Starting grid SLOTS (Phase 9b): `slotPose(k)` is the PHYSICAL layout
				// of grid position k, and is deliberately UNCHANGED — slot 0 is pole
				// (alone on the line), the rest fill staggered rows of two behind it,
				// alternating right/left of the centerline. Rows step back
				// GRID_ROW_STEP_PTS centerline points (~8m, well over a 3.8m car
				// length) and the two columns sit 2 x GRID_LATERAL = 6m apart (car
				// half-width 0.85m), so a normal launch never puts neighbouring slots
				// in contact. What CHANGED is only WHO gets which slot: it is no
				// longer hardcoded "player = slot 0", it is decided by qualifying time
				// in assignGrid() below (fastest = pole). The countdown + ram grace
				// are the primary launch guards; this spacing is the structural one.
				const GRID_LATERAL = 3.0;
				const GRID_ROW_STEP_PTS = 2;
				const slotPose = (k: number): RigSpawn => {
					if (k === 0) return { ...track.spawn, warmIdx: startIdx };
					const row = Math.ceil(k / 2); // 1,1,2,2,3,3,...
					const side = k % 2 === 1 ? 1 : -1; // odd = right, even = left
					const back = GRID_ROW_STEP_PTS * row; // centerline points behind the line
					const idx = (((startIdx - back) % nC) + nC) % nC;
					const p = rt.center[idx];
					const p2 = rt.center[(idx + 1) % nC];
					const tx = p2.x - p.x;
					const tz = p2.z - p.z;
					const tl = Math.hypot(tx, tz) || 1;
					const lat = side * GRID_LATERAL;
					return {
						x: p.x + (-tz / tl) * lat,
						z: p.z + (tx / tl) * lat,
						headingDeg: (Math.atan2(-tz, tx) * 180) / Math.PI,
						warmIdx: idx
					};
				};

				// ---- Qualifying grid placement (Phase 9b) ----
				// A rig's grid slot is decided by a qualifying lap time: the player's
				// REAL best recorded lap on this track (the `playerQualifyingMs` prop,
				// read from the leaderboard by the portal route), and a SIMULATED time
				// for each AI (they have no persistent history). Sorted ascending,
				// fastest takes pole; a rig with no time sorts to the back.
				//
				// `NO_QUAL_MS` is the "no time set" sentinel — large and finite so the
				// numeric sort puts it dead last with no NaN/Infinity edge cases.
				const NO_QUAL_MS = Number.MAX_SAFE_INTEGER;

				// Lap length of the main line, summed from the centerline (closed
				// loop). Used only to scale the AI's simulated qualifying baseline so a
				// long circuit gets long times and a short one short — the physical
				// grid layout does NOT depend on it.
				let lapLenM = 0;
				for (let i = 0; i < nC; i++) {
					const a = rt.center[i];
					const b = rt.center[(i + 1) % nC];
					lapLenM += Math.hypot(b.x - a.x, b.z - a.z);
				}

				// AI simulated qualifying baseline = lap length / an assumed competent
				// best-lap average speed. When this was written it was an ESTIMATE,
				// because AI top speed was still the mismatched ~17 m/s that Phase
				// 9d-i went on to fix, and measuring then would have baked in a number
				// about to change.
				//
				// 9d-i CHECKED IT and left it at 30. Measured clean AI laps on the now
				// properly-derived speed: Terminal Nine (2494 m) 76.5 to 84.6 s, which
				// is a 29.5 to 32.6 m/s average — the estimate landed on it. Proving
				// Ground (794 m) runs 32.7 to 42.3 s, i.e. ~19 to 24 m/s, because it is
				// far tighter and shorter, so no single constant fits both; 30 is kept
				// because it is measured-correct on the default track and only ever
				// scales a SIMULATED grid time, never anything a car has to drive.
				const GRID_AI_LAP_SPEED = 30;
				// Per-archetype tendency so the field is not a flat line: velocity
				// quickest, armor slowest. Multiplies the baseline lap time.
				const AI_QUAL_ARCH_MUL: Record<ArchetypeId, number> = {
					velocity: 0.96,
					handling: 0.99,
					systems: 1.01,
					armor: 1.04
				};
				// A plausible simulated qualifying time for one AI: the length-scaled
				// baseline, its archetype tendency, and +/-4% per-car variance so no
				// two AIs of a kind tie and the grid has spread. Generated once per AI
				// at build time (stored on the rig) so the grid is stable across a
				// round rather than reshuffling every reset.
				const simulatedAiQualMs = (arch: ArchetypeId): number => {
					const baseMs = (lapLenM / GRID_AI_LAP_SPEED) * 1000;
					const jitter = 0.96 + Math.random() * 0.08; // 0.96 .. 1.04
					return baseMs * (AI_QUAL_ARCH_MUL[arch] ?? 1) * jitter;
				};

				// ---- GREENLINE bodywork: the SHARED rig-visual builder ----
				// The brand palette, chrome IBL recipe, shared vehicle materials,
				// the four archetype part sets, and the part-variant layer
				// (plating / drivetrain / tires / systems) all live in
				// $lib/greenline/rig-visual.ts, shared with the garage's 3D
				// preview so the machine composed there is BY CONSTRUCTION the
				// machine that appears on track. Physics is untouched: the
				// cannon-es chassis stays ONE body; parts are visual attachment
				// groups under carGroup.
				const rigVis = createRigVisuals(THREE, renderer);

				// Build (or rebuild, on a live build swap in the garage) a rig's
				// visual parts through the shared builder: it clears the three
				// attachment groups, repopulates them from the composed build's
				// shared geometry set, restyles the per-rig hull material, and
				// hands back the fresh crumple target. Shared geometries are never
				// disposed here; the per-rig hull clone is.
				const buildRigVisual = (rig: Rig, l: Loadout) => {
					// The outgoing per-rig hull clone (or the makeRig placeholder).
					rig.bodyMesh.geometry.dispose();
					// The outgoing livery decals (pattern + number materials/textures)
					// are ours to dispose (Phase 6b), so a live swap never leaks; the
					// number quads themselves are cleared by build()'s group.clear().
					for (const d of rig.cosmeticDisposables) d.dispose();
					const built = rigVis.build(
						{
							chassis: rig.parts.chassis,
							armor: rig.parts.armor,
							mount: rig.parts.mount,
							wheels: rig.parts.wheels,
							hullMat: rig.bodyMat,
							mountMat: rig.mountMat,
							accent: rig.id === 'player' ? 'green' : 'steel'
						},
						l
					);
					rig.bodyMesh = built.bodyMesh;
					rig.bodyDecalMat = built.bodyDecalMat;
					rig.cosmeticDisposables = built.cosmeticDisposables;
					rig.dentBase = built.dentBase;
					// Fresh clone is pristine; the compounding crumple starts at zero
					// (the frame loop re-applies whatever stage the health calls for).
					rig.dentAccum = new Float32Array(built.dentBase.length);
					rig.baseColor = built.tone;
					rig.visualKey = built.key;
					// Fresh geometry is pristine; the frame loop re-applies whatever
					// stage the rig's current health calls for.
					rig.dentStage = 0;
				};

				// Energy Shield bubble: ONE shared ellipsoid geometry + additive
				// translucent material across every rig (the field is the same
				// energy either way); each rig carries its own mesh so visibility
				// is per vehicle. Sized to wrap the largest hull; barrels poking
				// through the film slightly is fine (it reads as a field, not a
				// shell).
				const shieldBubbleGeo = new THREE.SphereGeometry(1, 24, 16);
				const shieldBubbleMat = new THREE.MeshBasicMaterial({
					color: 0x6fd3ff,
					transparent: true,
					opacity: 0.13,
					depthWrite: false,
					blending: THREE.AdditiveBlending,
					side: THREE.DoubleSide
				});

				const makeBar = () => {
					const group = new THREE.Group();
					const bg = new THREE.Mesh(
						new THREE.PlaneGeometry(2.4, 0.4),
						new THREE.MeshBasicMaterial({ color: 0x070a0e, transparent: true, opacity: 0.8 })
					);
					// Primary fill = CHASSIS (the life pool the standings read too).
					const fgMat = new THREE.MeshBasicMaterial({ color: GL.chromeMid });
					const fg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), fgMat);
					fg.position.set(0, 0.06, 0.01);
					// Thin cool-rim sliver under it = the ARMOR shield pool.
					const armMat = new THREE.MeshBasicMaterial({ color: GL.coolRim });
					const arm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.06), armMat);
					arm.position.set(0, -0.12, 0.01);
					// Amber dot off the bar's right end: mount dead, weapons offline.
					const mnt = new THREE.Mesh(
						new THREE.PlaneGeometry(0.18, 0.18),
						new THREE.MeshBasicMaterial({ color: GL.amber })
					);
					mnt.position.set(1.42, 0, 0.01);
					mnt.visible = false;
					group.add(bg);
					group.add(fg);
					group.add(arm);
					group.add(mnt);
					scene.add(group);
					return { group, fg, fgMat, arm, armMat, mnt };
				};

				const makeRig = (id: string, label: string, arch: ArchetypeId, spawn: RigSpawn): Rig => {
					const body = new CANNON.Body({ mass: tuning.chassisMass });
					body.addShape(
						new CANNON.Box(new CANNON.Vec3(1.9, 0.4, 0.85)),
						new CANNON.Vec3(0, COM_DROP, 0)
					);
					body.position.set(spawn.x, seatY(spawn.x, spawn.z, spawn.warmIdx), spawn.z);
					body.quaternion.copy(quatFor(spawn.headingDeg));
					const vehicle = new CANNON.RaycastVehicle({
						chassisBody: body,
						indexForwardAxis: 0,
						indexUpAxis: 1,
						indexRightAxis: 2
					});
					const wheelOptions = {
						radius: WHEEL_RADIUS,
						directionLocal: new CANNON.Vec3(0, -1, 0),
						axleLocal: new CANNON.Vec3(0, 0, 1),
						suspensionStiffness: tuning.suspensionStiffness,
						suspensionRestLength: tuning.suspensionRestLength,
						maxSuspensionTravel: tuning.maxSuspensionTravel,
						dampingCompression: tuning.dampingCompression,
						dampingRelaxation: tuning.dampingRelaxation,
						frictionSlip: tuning.frictionSlip,
						rollInfluence: tuning.rollInfluence,
						maxSuspensionForce: 100000,
						customSlidingRotationalSpeed: -30,
						useCustomSlidingRotationalSpeed: true,
						chassisConnectionPointLocal: new CANNON.Vec3()
					};
					for (const [x, y, z] of WHEEL_CONNECTIONS) {
						wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(x, y, z);
						vehicle.addWheel(wheelOptions);
					}
					vehicle.addToWorld(world);

					const carGroup = new THREE.Group();
					const bodyMat = rigVis.makeHullMat();
					// Per-rig mount material, cloned off the shared recipe, so a dead
					// mount can char dark without touching every other rig's socket.
					const rigMountMat = rigVis.makeMountMat();
					// The named attachment groups buildRigVisual populates. Chassis
					// and armor share the COM_DROP frame; the mount group takes the
					// archetype's socket transform on build.
					const partChassis = new THREE.Group();
					partChassis.name = 'chassis';
					partChassis.position.y = COM_DROP;
					const partArmor = new THREE.Group();
					partArmor.name = 'armor';
					partArmor.position.y = COM_DROP;
					const partMount = new THREE.Group();
					partMount.name = 'mount';
					carGroup.add(partChassis, partArmor, partMount);
					scene.add(carGroup);

					// Bare meshes: buildRigVisual assigns the build's wheel geometry
					// and tire material (and the hardwall band child) right below.
					const wheelMeshes = WHEEL_CONNECTIONS.map(() => {
						const m = new THREE.Mesh();
						scene.add(m);
						return m;
					});

					// Stun crackle ring: flickers around the hull while disrupted
					// (cool-rim arc light, the brand's electric tone).
					const stunMat = new THREE.MeshBasicMaterial({
						color: GL.coolRim,
						transparent: true,
						opacity: 0,
						side: THREE.DoubleSide,
						depthWrite: false,
						blending: THREE.AdditiveBlending
					});
					const stunRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.05, 26), stunMat);
					stunRing.rotation.x = -Math.PI / 2;
					stunRing.position.y = 0.35;
					stunRing.visible = false;
					carGroup.add(stunRing);

					// Energy Shield field (hidden until the absorb pool is up).
					const shieldBubble = new THREE.Mesh(shieldBubbleGeo, shieldBubbleMat);
					shieldBubble.scale.set(2.6, 1.5, 1.9);
					shieldBubble.position.y = 0.45;
					shieldBubble.visible = false;
					carGroup.add(shieldBubble);

					const rig: Rig = {
						id,
						label,
						body,
						vehicle,
						carGroup,
						bodyMat,
						// Placeholders until buildRigVisual below assigns the
						// archetype's hull mesh + pristine crumple base.
						bodyMesh: new THREE.Mesh(),
						bodyDecalMat: null,
						cosmeticDisposables: [],
						baseColor: GL.steel,
						parts: { chassis: partChassis, armor: partArmor, mount: partMount, wheels: wheelMeshes },
						visualKey: null,
						wheelMeshes,
						combat: new VehicleCombat(id, splitPools(num(tuning.maxHealth, DEFAULTS.maxHealth))),
						tracker: new LapTracker(),
						ai: null,
						bar: null,
						buildStats: neutralStats(),
						archetype: 'handling',
						weapons: { weaponPrimary: 'autocannon', weaponSecondary: WEAPON_NONE },
						locks: { weaponPrimary: null, weaponSecondary: null },
						abilities: { abilityPrimary: 'nitro-boost', abilitySecondary: ABILITY_NONE },
						abilityState: new VehicleAbilities(id),
						dentStage: 0,
						dentBase: new Float32Array(0),
						dentAccum: new Float32Array(0),
						stunMat,
						stunRing,
						shieldBubble,
						mountMat: rigMountMat,
						mountDead: false,
						smokeAcc: 0,
						dripAcc: 0,
						dustAcc: 0,
						dustWheel: 2,
						preVx: 0,
						preVz: 0,
						flipAcc: 0,
						wheelContacts: 4,
						airborneSec: 0,
						groundedSec: 0,
						fallAcc: 0,
						boostUntilMs: 0,
						boostMul: 1,
						zoneInside: rt.zones.map(() => false),
						zoneRearmMs: rt.zones.map(() => 0),
						pitFxMs: 0,
						warmIdx: spawn.warmIdx,
						warmPath: 0,
						routeUsed: 'main',
						lastOnRibbon: true,
						steerCurrent: 0,
						hbEngage: 0,
						tractionEase: 1,
						hx: 1,
						hz: 0,
						drafting: false,
						draftFactor: 0,
						draftPrev: false,
						prevX: spawn.x,
						prevZ: spawn.z,
						flashUntil: 0,
						finished: false,
						finishPos: 0,
						raceStartMs: null,
						finishAtMs: null,
						spawn,
						qualMs: NO_QUAL_MS
					};
					buildRigVisual(rig, defaultLoadout(arch));
					rigByBodyId.set(body.id, rig);
					body.addEventListener('collide', (e: { body: InstanceType<typeof CANNON.Body> }) => {
						const other = rigByBodyId.get(e.body.id);
						if (!other || other === rig) return;
						// Dedupe: both bodies fire the event for one contact.
						if (pendingRams.some((p) => (p.a === rig && p.b === other) || (p.a === other && p.b === rig)))
							return;
						pendingRams.push({ a: rig, b: other });
					});
					return rig;
				};

				// ---- Zone-targeted damage dressing: strip plates, kill mounts ----
				const tmpWorld = new THREE.Vector3();

				// World position of a rig's REAR hardpoint (the classic mount bay:
				// rear-hit feedback and the dead-mount sputter anchor there). The
				// mount group holds one sub-group per socket since 4c; fall back
				// through any socket to the group itself so the anchor never
				// disappears mid-rebuild.
				const rearSocketWorld = (rig: Rig) => {
					const kids = rig.parts.mount.children;
					const rear =
						kids.find((c) => c.userData?.socketId === 'rear') ?? kids[0] ?? rig.parts.mount;
					return rear.getWorldPosition(tmpWorld);
				};

				// World-space anchor for a hit's feedback: the actual zone struck
				// (nose, the flank facing the attacker, or the rear hardpoint
				// itself for rear hits), never the generic rig center.
				const hitAnchor = (rig: Rig, srcX: number, srcZ: number, zone: HitZone) => {
					const p = rig.body.position;
					if (zone === 'front') {
						return { x: p.x + rig.hx * 1.8, y: p.y + 0.5, z: p.z + rig.hz * 1.8 };
					}
					if (zone === 'rear') {
						const mp = rearSocketWorld(rig);
						return { x: mp.x, y: mp.y + 0.15, z: mp.z };
					}
					const px = -rig.hz;
					const pz = rig.hx;
					const side = (srcX - p.x) * px + (srcZ - p.z) * pz >= 0 ? 1 : -1;
					return { x: p.x + px * side, y: p.y + 0.55, z: p.z + pz * side };
				};

				// Dead-mount visual state: EVERY hardpoint chars dark (the shared
				// per-rig mount material covers collars, pedestals, and weapon
				// mass on all sockets) and each socket sub-group sits knocked
				// askew around its own origin; the per-frame sputter sparks key
				// off rig.mountDead. Applied per socket so the pattern survives
				// the 4c one-socket -> many-sockets split.
				const setMountDead = (rig: Rig, dead: boolean) => {
					// Deliberately no same-state early-out: a bodywork rebuild
					// recreates the socket sub-groups upright, so applyLoadoutToRig
					// must be able to re-assert the tilt on a still-dead mount.
					rig.mountDead = dead;
					rig.mountMat.color.setHex(dead ? 0x0a0c0e : 0x1a2128);
					rig.mountMat.roughness = dead ? 0.9 : 0.5;
					for (const sg of rig.parts.mount.children) {
						sg.rotation.z = dead ? 0.22 : 0;
						// The mount struts/tabs bridging this hardpoint to the body
						// buckle and drop when the mount is dead (Phase 6a), restored
						// to their build transform when the mount comes back.
						for (const child of sg.children) {
							if (child.userData.connector !== 'mount') continue;
							const b = child.userData.base as
								| { pos: InstanceType<typeof THREE.Vector3>; rot: InstanceType<typeof THREE.Euler> }
								| undefined;
							if (!b) continue;
							if (dead) {
								child.rotation.set(b.rot.x, b.rot.y, b.rot.z + 0.55);
								child.position.set(b.pos.x, b.pos.y - 0.06, b.pos.z);
							} else {
								child.position.copy(b.pos);
								child.rotation.copy(b.rot);
							}
						}
					}
				};

				// Reconcile visible armor plates with the AGGREGATE armor pool (one
				// pool per vehicle, deliberately not per-plate tracking): the plate
				// count tracks the pool fraction, and each strip detaches the
				// visible plate nearest the hit, so the battered side goes bare
				// first and exposes the hull underneath. `silent` skips the burst
				// FX for non-hit reconciles (garage swaps, heals).
				const syncArmorPlates = (rig: Rig, hitX?: number, hitZ?: number, silent = false) => {
					const children = rig.parts.armor.children;
					if (!children.length) return;
					// Plates and their inner mounting brackets (Phase 6a) reconcile as
					// separate sets, so the brackets strip WITH the armor without
					// skewing the plate-fraction count.
					const plates = children.filter((c) => c.userData.connector !== 'armor');
					const connectors = children.filter((c) => c.userData.connector === 'armor');
					const frac =
						rig.combat.maxArmor > 0
							? Math.max(0, rig.combat.armorHealth / rig.combat.maxArmor)
							: 0;
					const want = Math.ceil(frac * plates.length);
					let visible = plates.filter((p) => p.visible);
					while (visible.length > want) {
						let pick = visible[visible.length - 1];
						if (hitX !== undefined && hitZ !== undefined) {
							let bd = Infinity;
							for (const p of visible) {
								const wp = p.getWorldPosition(tmpWorld);
								const dd = (wp.x - hitX) ** 2 + (wp.z - hitZ) ** 2;
								if (dd < bd) {
									bd = dd;
									pick = p;
								}
							}
						}
						pick.visible = false;
						if (!silent) {
							const wp = pick.getWorldPosition(tmpWorld);
							const ox = wp.x - rig.body.position.x;
							const oz = wp.z - rig.body.position.z;
							const ol = Math.hypot(ox, oz) || 1;
							spawnDebris(wp.x, wp.y, wp.z, 6, ox / ol, oz / ol, 6);
							spawnSparks(wp.x, wp.y, wp.z, 10, 0xffb347, 8, 420);
						}
						visible = plates.filter((p) => p.visible);
					}
					for (const p of plates) {
						if (visible.length >= want) break;
						if (!p.visible) {
							p.visible = true;
							visible.push(p);
						}
					}
					// Armor mounting brackets strip with the pool too (Phase 6a): a
					// failing bracket spits its own smaller steel-fleck debris + a
					// distinct snap cue, its own damage category on the shared pools.
					const wantC = Math.ceil(frac * connectors.length);
					let visC = connectors.filter((p) => p.visible);
					let snapped = false;
					while (visC.length > wantC) {
						let pick = visC[visC.length - 1];
						if (hitX !== undefined && hitZ !== undefined) {
							let bd = Infinity;
							for (const p of visC) {
								const wp = p.getWorldPosition(tmpWorld);
								const dd = (wp.x - hitX) ** 2 + (wp.z - hitZ) ** 2;
								if (dd < bd) {
									bd = dd;
									pick = p;
								}
							}
						}
						pick.visible = false;
						if (!silent) {
							const wp = pick.getWorldPosition(tmpWorld);
							const ox = wp.x - rig.body.position.x;
							const oz = wp.z - rig.body.position.z;
							const ol = Math.hypot(ox, oz) || 1;
							spawnDebris(wp.x, wp.y, wp.z, 2, ox / ol, oz / ol, 5);
							spawnSparks(wp.x, wp.y, wp.z, 4, GL.steel, 6, 260);
							snapped = true;
						}
						visC = connectors.filter((p) => p.visible);
					}
					for (const p of connectors) {
						if (visC.length >= wantC) break;
						if (!p.visible) {
							p.visible = true;
							visC.push(p);
						}
					}
					if (snapped) damageSfx('connector-snap', rig.body.position.x, rig.body.position.z);
				};

				// Full-heal restore (RACE recovery, round reset): every plate and armor
				// bracket back on, the mount + struts online, and the compounding
				// crumple wiped so the bodywork comes back whole.
				const restoreRigCondition = (rig: Rig) => {
					for (const p of rig.parts.armor.children) p.visible = true;
					setMountDead(rig, false);
					if (rig.dentAccum.length) {
						rig.dentAccum.fill(0);
						applyDentStage(rig, 0);
					}
				};

				// A rig's per-pool maximums: the panel's TOTAL budget x the build's
				// hull multiplier, split by the archetype's pool fractions.
				const poolsForBuild = (arch: ArchetypeId, stats: ResolvedStats): PoolMaxes =>
					splitPools(
						num(tuning.maxHealth, DEFAULTS.maxHealth) * stats.maxHealth,
						archetypeById(arch)?.pools
					);

				// Apply a resolved build to a rig: multipliers for the physics
				// pipeline, the combat resistances, and this vehicle's own three
				// health pools (each pool keeps its damage FRACTION, so a mid-run
				// swap is honest rather than a free heal; a dead pool stays dead).
				const applyLoadoutToRig = (rig: Rig, rawLoadout: Loadout) => {
					// Defense in depth: whatever reaches the sim is a valid weapon
					// fit (capacity + no duplicates), even off the console API.
					const l = sanitizeLoadout(rawLoadout);
					const s = resolveLoadout(l);
					rig.buildStats = s;
					rig.archetype = l.archetype;
					if (
						rig.weapons.weaponPrimary !== l.parts.weaponPrimary ||
						rig.weapons.weaponSecondary !== l.parts.weaponSecondary
					) {
						// A weapon swap clears in-progress locks (the new weapon
						// starts its own acquisition); slot cooldowns are per-slot
						// state and deliberately survive.
						rig.weapons = {
							weaponPrimary: l.parts.weaponPrimary,
							weaponSecondary: l.parts.weaponSecondary
						};
						rig.locks = { weaponPrimary: null, weaponSecondary: null };
					}
					// Abilities carry no visual and no lock; just adopt the equipped
					// pair (the shared meter + effect windows in rig.abilityState are
					// run-state, untouched by a build swap). The sanitizer above already
					// shed an over-budget secondary against this archetype's ability cap.
					rig.abilities = {
						abilityPrimary: l.parts.abilityPrimary,
						abilitySecondary: l.parts.abilitySecondary
					};
					// Rebuild the bodywork when the visual identity changes: the
					// archetype OR any equipped part (live garage swaps included).
					if (rig.visualKey !== visualKeyFor(l)) buildRigVisual(rig, l);
					const pools = poolsForBuild(l.archetype, s);
					const c = rig.combat;
					const rescale = (cur: number, max: number, newMax: number) => {
						const frac = max > 0 ? Math.min(1, Math.max(0, cur / max)) : 1;
						return frac <= 0 ? 0 : Math.max(1, Math.round(frac * newMax));
					};
					c.armorHealth = rescale(c.armorHealth, c.maxArmor, pools.armor);
					c.chassisHealth = rescale(c.chassisHealth, c.maxChassis, pools.chassis);
					c.mountHealth = rescale(c.mountHealth, c.maxMount, pools.mount);
					c.maxArmor = pools.armor;
					c.maxChassis = pools.chassis;
					c.maxMount = pools.mount;
					c.resist.disruption = s.disruptionTaken;
					c.resist.oilSlip = s.oilSlipTaken;
					c.resist.impactDamage = s.impactDamageTaken;
					c.resist.spinKick = s.spinKickTaken;
					// Radar Jammer is passive: always active while equipped in EITHER
					// slot (no trigger, no mount-death gate), so its lock-rate penalty
					// lives on combat state like the resist mods. 1 = no jammer.
					const jam =
						weaponById(l.parts.weaponPrimary)?.jammer ?? weaponById(l.parts.weaponSecondary)?.jammer;
					c.jammerLockMul = jam ? jam.lockRateMul : 1;
					// Reconcile the bodywork with the rescaled pools: an archetype
					// rebuild starts pristine, a same-archetype tweak keeps its
					// battle damage. Quiet, no burst FX.
					syncArmorPlates(rig, undefined, undefined, true);
					setMountDead(rig, c.mountHealth <= 0);
				};

				const player = makeRig('player', 'YOU', playerLoadout.archetype, slotPose(0));
				applyLoadoutToRig(player, playerLoadout);
				applyPlayerLoadout = () => applyLoadoutToRig(player, playerLoadout);
				// The player's qualifying time is their real best recorded lap on this
				// track (prop from the leaderboard); null / non-positive = no time set,
				// which sorts to the back of the grid (NO_QUAL_MS).
				const playerQualFromProp = (): number =>
					typeof playerQualifyingMs === 'number' && playerQualifyingMs > 0
						? playerQualifyingMs
						: NO_QUAL_MS;
				player.qualMs = playerQualFromProp();
				// AIs cycle the four archetypes (stock parts) so every round has
				// build variety to race and fight against: AI-1 armor, AI-2
				// velocity, AI-3 handling, AI-4 systems, then repeat. Identity is
				// carried by the archetype bodywork itself, not a color array.
				const AI_ARCHS: ArchetypeId[] = ['armor', 'velocity', 'handling', 'systems'];
				// Weapon fits cycle alongside the archetypes. EIGHT entries (two full
				// archetype passes) so the whole 13-weapon roster is exercised across a
				// larger field, INCLUDING the three folded in at Phase 8g (EMP Burst,
				// Oil Slick, Grappling Hook). Entry k pairs with archetype
				// AI_ARCHS[(k-1)%4]; because this list also cycles a/v/h/s, index i%4 is
				// that archetype, so every fit respects its own mount capacity (armor 4,
				// velocity 2, handling 4, systems 5). The default 3-AI field is the first
				// three, which deliberately showcases the three NEW weapons.
				const AI_WEAPONS: [string, string][] = [
					['emp-burst', 'auto-turret'], // armor (4): 2 + 2  (EMP)
					['oil-slick', 'shotgun-burst'], // velocity (2): 1 + 1  (oil)
					['grappling-hook', 'caltrops'], // handling (4): 2 + 1  (hook)
					['railgun', 'homing-rocket'], // systems (5): 3 + 2
					['energy-shield', 'radar-jammer'], // armor (4): 3 + 1
					['deployable-blades', WEAPON_NONE], // velocity (2): 2
					['cluster-missile', 'autocannon'], // handling (4): 3 + 1
					['emp-burst', 'railgun'] // systems (5): 2 + 3
				];
				// Ability fits cycle alongside the archetypes, each within its
				// archetype's INVERTED ability budget (armor 4, velocity 5, handling
				// 4, systems 2), so the default 3-AI field exercises repair + flip
				// (armor), nitro + grip (velocity), and grip + repair (handling); the
				// 4th (systems) shows nitro alone. Jump is deliberately not AI-used
				// (no ramps on this track yet), so no AI fit carries it.
				const AI_ABILITIES: [string, string][] = [
					['overcharge-repair', 'emergency-flip'], // armor (4): 2 + 1
					['nitro-boost', 'air-correction'], // velocity (5): 2 + 1
					['grip-surge', 'overcharge-repair'], // handling (4): 1 + 2
					['nitro-boost', ABILITY_NONE] // systems (2): 2
				];
				const aiLoadoutFor = (k: number): Loadout => {
					const l = defaultLoadout(AI_ARCHS[(k - 1) % AI_ARCHS.length]);
					const [wp, ws] = AI_WEAPONS[(k - 1) % AI_WEAPONS.length];
					l.parts.weaponPrimary = wp;
					l.parts.weaponSecondary = ws;
					const [ap, as] = AI_ABILITIES[(k - 1) % AI_ABILITIES.length];
					l.parts.abilityPrimary = ap;
					l.parts.abilitySecondary = as;
					return l;
				};
				let ais: Rig[] = [];
				const rigsAll = () => [player, ...ais];

				const disposeRig = (r: Rig) => {
					rigByBodyId.delete(r.body.id);
					r.vehicle.removeFromWorld(world);
					scene.remove(r.carGroup);
					r.wheelMeshes.forEach((m) => scene.remove(m));
					// Per-rig GPU resources only; part geometries are shared.
					r.bodyMesh.geometry.dispose();
					r.bodyMat.dispose();
					r.mountMat.dispose();
					r.stunRing.geometry.dispose();
					r.stunMat.dispose();
					if (r.bar) scene.remove(r.bar.group);
				};

				const buildAis = (count: number) => {
					ais.forEach(disposeRig);
					ais = [];
					aiPoses.length = 0;
					const n = Math.max(1, Math.min(MAX_AI, Math.round(count)));
					for (let k = 1; k <= n; k++) {
						const arch = AI_ARCHS[(k - 1) % AI_ARCHS.length];
						const rig = makeRig(`ai-${k}`, `AI-${k}`, arch, slotPose(k));
						rig.ai = new AiDriver(rt);
						rig.bar = makeBar();
						// A simulated qualifying time, fixed for this rig's lifetime so the
						// grid is stable across resets (regenerated only when the field is
						// rebuilt, e.g. the AI count changes).
						rig.qualMs = simulatedAiQualMs(arch);
						applyLoadoutToRig(rig, aiLoadoutFor(k));
						ais.push(rig);
						aiPoses.push({ x: rig.spawn.x, z: rig.spawn.z, hx: 1, hz: 0, out: false });
					}
				};
				buildAis(num(tuning.aiCount, DEFAULTS.aiCount));

				// Assign grid slots by qualifying time: sort player + AI ascending
				// (fastest = pole = slot 0), then map each to slotPose(slot). Only the
				// slot ASSIGNMENT changes here; slotPose() (the physical layout) is
				// untouched. Re-seats each rig's body to its assigned pose, so it is
				// self-contained enough to run at init and at the top of a reset.
				// The field sorted by qualifying time ascending (fastest first). A
				// no-time rig (NO_QUAL_MS) sorts to the back; an exact tie breaks
				// deterministically (player first, then by id) so the grid never
				// depends on Array.sort stability. Shared by assignment + the debug
				// snapshot so the two can never disagree.
				const gridOrder = (): Rig[] =>
					[...rigsAll()].sort((a, b) => {
						const d = a.qualMs - b.qualMs;
						if (d !== 0) return d;
						if (a === player) return -1;
						if (b === player) return 1;
						return a.id < b.id ? -1 : 1;
					});
				const assignGrid = () => {
					gridOrder().forEach((r, slot) => {
						r.spawn = slotPose(slot);
						r.body.position.set(
							r.spawn.x,
							seatY(r.spawn.x, r.spawn.z, r.spawn.warmIdx),
							r.spawn.z
						);
						r.body.quaternion.copy(quatFor(r.spawn.headingDeg));
						r.body.velocity.setZero();
						r.body.angularVelocity.setZero();
						r.warmIdx = r.spawn.warmIdx;
						r.warmPath = 0;
						// Sync the last-position trackers to the new seat so the grid
						// teleport never registers a phantom gate crossing.
						r.prevX = r.spawn.x;
						r.prevZ = r.spawn.z;
						const ai = ais.indexOf(r);
						if (ai >= 0 && aiPoses[ai]) {
							aiPoses[ai].x = r.spawn.x;
							aiPoses[ai].z = r.spawn.z;
						}
					});
					pose.x = player.spawn.x;
					pose.z = player.spawn.z;
				};
				assignGrid();

				// Debug snapshot of the current grid: recompute the slot order (same
				// comparator as assignGrid — qualMs is stable, so the order matches the
				// last assignment) and report each rig's qual time and seated pose.
				const gridSnapshot = () =>
					gridOrder().map((r, slot) => ({
						id: r.id,
						archetype: r.archetype,
						qualMs: r.qualMs === NO_QUAL_MS ? null : Math.round(r.qualMs),
						slot,
						x: +r.spawn.x.toFixed(2),
						z: +r.spawn.z.toFixed(2),
						warmIdx: r.spawn.warmIdx
					}));

				// ================= FEEDBACK TOOLKIT (visual only) =================
				// Everything here is presentation: rings, sparks, smoke, screen
				// shake. Nothing in this block touches combat state or physics.

				// Soft round sprite texture (radial falloff) shared by particles.
				const softTex = (() => {
					const c = document.createElement('canvas');
					c.width = c.height = 64;
					const g = c.getContext('2d')!;
					const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
					grad.addColorStop(0, 'rgba(255,255,255,1)');
					grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
					grad.addColorStop(1, 'rgba(255,255,255,0)');
					g.fillStyle = grad;
					g.fillRect(0, 0, 64, 64);
					return new THREE.CanvasTexture(c);
				})();

				// ---- Expanding ground rings (EMP burst, ram shockwave, latch) ----
				const fxList: {
					mesh: InstanceType<typeof THREE.Mesh>;
					born: number;
					life: number;
					maxR: number;
					baseOpacity: number;
				}[] = [];
				const fxGeo = new THREE.RingGeometry(0.82, 1, 40);
				fxGeo.rotateX(-Math.PI / 2);
				const spawnRing = (
					x: number,
					z: number,
					color: number,
					maxR: number,
					lifeMs = 320,
					baseOpacity = 0.55,
					y = 0.5
				) => {
					const mesh = new THREE.Mesh(
						fxGeo,
						new THREE.MeshBasicMaterial({
							color,
							transparent: true,
							opacity: baseOpacity,
							side: THREE.DoubleSide,
							depthWrite: false
						})
					);
					mesh.position.set(x, y, z);
					scene.add(mesh);
					fxList.push({ mesh, born: gameNow(), life: lifeMs, maxR, baseOpacity });
				};

				// ---- Spark pool: additive points for impacts and debris ----
				const SPARK_CAP = 1000;
				const sparkPos = new Float32Array(SPARK_CAP * 3);
				const sparkCol = new Float32Array(SPARK_CAP * 3);
				const sparkVel = new Float32Array(SPARK_CAP * 3);
				const sparkBase = new Float32Array(SPARK_CAP * 3);
				const sparkBorn = new Float32Array(SPARK_CAP);
				const sparkLife = new Float32Array(SPARK_CAP);
				sparkPos.fill(-9999);
				const sparkGeo = new THREE.BufferGeometry();
				sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
				sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
				const sparkPoints = new THREE.Points(
					sparkGeo,
					new THREE.PointsMaterial({
						size: 0.5,
						map: softTex,
						vertexColors: true,
						transparent: true,
						depthWrite: false,
						blending: THREE.AdditiveBlending
					})
				);
				sparkPoints.frustumCulled = false;
				scene.add(sparkPoints);
				let sparkCursor = 0;
				const tmpColor = new THREE.Color();
				const tmpColA = new THREE.Color();
				const tmpColB = new THREE.Color();
				const spawnSparks = (
					x: number,
					y: number,
					z: number,
					count: number,
					color: number,
					speed = 12,
					lifeMs = 550
				) => {
					const n = Math.max(1, Math.round(count * num(tuning.fxDensity, DEFAULTS.fxDensity)));
					tmpColor.setHex(color);
					const now = gameNow();
					for (let k = 0; k < n; k++) {
						const i = sparkCursor;
						sparkCursor = (sparkCursor + 1) % SPARK_CAP;
						const a = Math.random() * Math.PI * 2;
						const up = Math.random() * 0.9 + 0.15;
						const s = speed * (0.35 + Math.random() * 0.85);
						sparkPos[i * 3] = x;
						sparkPos[i * 3 + 1] = y;
						sparkPos[i * 3 + 2] = z;
						sparkVel[i * 3] = Math.cos(a) * s;
						sparkVel[i * 3 + 1] = up * s * 0.7;
						sparkVel[i * 3 + 2] = Math.sin(a) * s;
						const v = 0.75 + Math.random() * 0.25;
						sparkBase[i * 3] = tmpColor.r * v;
						sparkBase[i * 3 + 1] = tmpColor.g * v;
						sparkBase[i * 3 + 2] = tmpColor.b * v;
						sparkBorn[i] = now;
						sparkLife[i] = lifeMs * (0.55 + Math.random() * 0.9);
					}
				};
				const updateSparks = (now: number, dt: number) => {
					const drag = 1 - Math.min(1, dt * 1.6);
					for (let i = 0; i < SPARK_CAP; i++) {
						if (sparkLife[i] <= 0) continue;
						const age = (now - sparkBorn[i]) / sparkLife[i];
						if (age >= 1) {
							sparkLife[i] = 0;
							sparkPos[i * 3 + 1] = -9999;
							continue;
						}
						sparkVel[i * 3 + 1] -= 22 * dt;
						sparkVel[i * 3] *= drag;
						sparkVel[i * 3 + 2] *= drag;
						sparkPos[i * 3] += sparkVel[i * 3] * dt;
						sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
						sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
						if (sparkPos[i * 3 + 1] < 0.05) {
							sparkPos[i * 3 + 1] = 0.05;
							sparkVel[i * 3 + 1] *= -0.35;
						}
						const fade = 1 - age;
						sparkCol[i * 3] = sparkBase[i * 3] * fade;
						sparkCol[i * 3 + 1] = sparkBase[i * 3 + 1] * fade;
						sparkCol[i * 3 + 2] = sparkBase[i * 3 + 2] * fade;
					}
					sparkGeo.getAttribute('position').needsUpdate = true;
					sparkGeo.getAttribute('color').needsUpdate = true;
				};

				// ---- Debris chunk pool: low-poly fragments for significant hits
				// and part-strip moments. Scripted ballistics only (velocity +
				// gravity + one damped ground bounce), never physics bodies;
				// pooled and capped like the sparks. ----
				const DEBRIS_CAP = 48;
				const debrisGeo = new THREE.TetrahedronGeometry(0.13);
				const debrisMats = [
					new THREE.MeshStandardMaterial({ color: 0x6b7b88, metalness: 0.7, roughness: 0.45 }),
					new THREE.MeshStandardMaterial({ color: 0x232a31, metalness: 0.4, roughness: 0.8 })
				];
				interface DebrisChunk {
					mesh: InstanceType<typeof THREE.Mesh>;
					vx: number;
					vy: number;
					vz: number;
					rx: number;
					rz: number;
					born: number;
					life: number;
					size: number;
				}
				const debrisPool: DebrisChunk[] = [];
				for (let i = 0; i < DEBRIS_CAP; i++) {
					const mesh = new THREE.Mesh(debrisGeo, debrisMats[i % 2]);
					mesh.visible = false;
					scene.add(mesh);
					debrisPool.push({ mesh, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, born: 0, life: 0, size: 1 });
				}
				let debrisCursor = 0;
				// dirX/dirZ bias the scatter along the hit direction (unit-ish).
				const spawnDebris = (
					x: number,
					y: number,
					z: number,
					count: number,
					dirX = 0,
					dirZ = 0,
					speed = 7
				) => {
					const n = Math.max(1, Math.round(count * num(tuning.fxDensity, DEFAULTS.fxDensity)));
					const now = gameNow();
					for (let k = 0; k < n; k++) {
						const d = debrisPool[debrisCursor];
						debrisCursor = (debrisCursor + 1) % DEBRIS_CAP;
						const a = Math.random() * Math.PI * 2;
						const s = speed * (0.4 + Math.random() * 0.9);
						d.mesh.visible = true;
						d.mesh.position.set(x, y, z);
						d.size = 0.6 + Math.random() * 1.1;
						d.mesh.scale.setScalar(d.size);
						d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
						d.vx = dirX * s + Math.cos(a) * s * 0.55;
						d.vz = dirZ * s + Math.sin(a) * s * 0.55;
						d.vy = 2.5 + Math.random() * 3.5;
						d.rx = (Math.random() - 0.5) * 14;
						d.rz = (Math.random() - 0.5) * 14;
						d.born = now;
						d.life = 800 + Math.random() * 500;
					}
				};
				const updateDebris = (now: number, dt: number) => {
					for (const d of debrisPool) {
						if (!d.mesh.visible) continue;
						const age = (now - d.born) / d.life;
						if (age >= 1) {
							d.mesh.visible = false;
							continue;
						}
						d.vy -= 22 * dt;
						const p = d.mesh.position;
						p.x += d.vx * dt;
						p.y += d.vy * dt;
						p.z += d.vz * dt;
						if (p.y < 0.07) {
							p.y = 0.07;
							d.vy *= -0.3;
							d.vx *= 0.6;
							d.vz *= 0.6;
							d.rx *= 0.5;
							d.rz *= 0.5;
						}
						d.mesh.rotation.x += d.rx * dt;
						d.mesh.rotation.z += d.rz * dt;
						// Shrink out over the last stretch instead of an opacity
						// fade, so the two chunk materials stay shared.
						if (age > 0.7) d.mesh.scale.setScalar(d.size * (1 - (age - 0.7) / 0.3));
					}
				};

				// ---- Puff sprite pools: billboarded sprites (normal blending, so
				// dark smoke, oil drips, and pale tire dust actually read against
				// the ground). One factory, two pools -- damage/oil smoke and tire
				// dust -- so continuous dust emission can never evict a wreck's
				// smoke column from the shared ring buffer. ----
				interface Puff {
					sprite: InstanceType<typeof THREE.Sprite>;
					mat: InstanceType<typeof THREE.SpriteMaterial>;
					born: number;
					life: number;
					vx: number;
					vy: number;
					vz: number;
					size: number;
					grow: number;
					baseOpacity: number;
				}
				const makePuffPool = (cap: number) => {
					const pool: Puff[] = [];
					for (let i = 0; i < cap; i++) {
						const mat = new THREE.SpriteMaterial({
							map: softTex,
							color: 0x333333,
							transparent: true,
							opacity: 0,
							depthWrite: false
						});
						const sprite = new THREE.Sprite(mat);
						sprite.visible = false;
						scene.add(sprite);
						pool.push({
							sprite,
							mat,
							born: 0,
							life: 0,
							vx: 0,
							vy: 0,
							vz: 0,
							size: 1,
							grow: 1,
							baseOpacity: 0.5
						});
					}
					let cursor = 0;
					const spawn = (
						x: number,
						y: number,
						z: number,
						color: number,
						size = 1,
						lifeMs = 1100,
						rise = 1.6,
						baseOpacity = 0.45
					) => {
						const p = pool[cursor];
						cursor = (cursor + 1) % cap;
						p.sprite.visible = true;
						p.sprite.position.set(x, y, z);
						p.mat.color.setHex(color);
						p.born = gameNow();
						p.life = lifeMs * (0.7 + Math.random() * 0.6);
						p.vx = (Math.random() - 0.5) * 1.2;
						p.vy = rise * (0.7 + Math.random() * 0.6);
						p.vz = (Math.random() - 0.5) * 1.2;
						p.size = size * (0.8 + Math.random() * 0.5);
						p.grow = 1.8;
						p.baseOpacity = baseOpacity;
					};
					const update = (now: number, dt: number) => {
						for (const p of pool) {
							if (!p.sprite.visible) continue;
							const age = (now - p.born) / p.life;
							if (age >= 1) {
								p.sprite.visible = false;
								p.mat.opacity = 0;
								continue;
							}
							p.sprite.position.x += p.vx * dt;
							p.sprite.position.y += p.vy * dt;
							p.sprite.position.z += p.vz * dt;
							const s = p.size * (1 + p.grow * age);
							p.sprite.scale.set(s, s, 1);
							p.mat.opacity = p.baseOpacity * Math.pow(1 - age, 1.3);
						}
					};
					return { spawn, update };
				};
				const smokePool = makePuffPool(90);
				const spawnSmoke = smokePool.spawn;
				const updateSmoke = smokePool.update;
				const dustPool = makePuffPool(110);
				const spawnDust = dustPool.spawn;
				const updateDust = dustPool.update;

				// ---- Precipitation (weather presets only) ----
				// ONE LineSegments draw call: a box of falling streaks that rides
				// with the camera and wraps, so the player is always inside the
				// weather without simulating a whole sky. Presentation only — rain
				// never touches grip, drag, damage, or timing (weather.svelte.ts).
				// Allocated once at the largest preset's count; the draw range
				// (setDrawRange) is what a lighter preset shrinks, so switching
				// weather never reallocates a buffer mid-race.
				const RAIN_MAX = 4200;
				const RAIN_BOX = 46; // half-extent of the wrap volume around the camera
				const RAIN_TOP = 26;
				const rainPos = new Float32Array(RAIN_MAX * 6); // 2 verts per streak
				const rainSeed = new Float32Array(RAIN_MAX * 3); // x, y, z of the head
				for (let i = 0; i < RAIN_MAX; i++) {
					rainSeed[i * 3] = (Math.random() * 2 - 1) * RAIN_BOX;
					rainSeed[i * 3 + 1] = Math.random() * RAIN_TOP;
					rainSeed[i * 3 + 2] = (Math.random() * 2 - 1) * RAIN_BOX;
				}
				const rainGeo = new THREE.BufferGeometry();
				rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
				rainGeo.setDrawRange(0, 0);
				const rainMat = new THREE.LineBasicMaterial({
					color: 0xb8d4ea,
					transparent: true,
					opacity: 0.34,
					depthWrite: false,
					fog: true
				});
				const rainMesh = new THREE.LineSegments(rainGeo, rainMat);
				rainMesh.frustumCulled = false; // it always surrounds the camera
				rainMesh.visible = false;
				scene.add(rainMesh);
				const updateRain = (dt: number) => {
					const p = ENV.precip;
					if (!p) return;
					const n = Math.min(RAIN_MAX, p.count);
					const fall = p.speed * dt;
					// A slight lean sells falling speed without a wind system.
					const lean = p.length * 0.22;
					const cx = camera.position.x;
					const cy = camera.position.y;
					const cz = camera.position.z;
					for (let i = 0; i < n; i++) {
						let y = rainSeed[i * 3 + 1] - fall;
						if (y < 0) y += RAIN_TOP;
						rainSeed[i * 3 + 1] = y;
						// Wrap x/z into the box centered on the camera, so the volume
						// follows the player without per-drop repositioning logic.
						const hx = cx + wrapRel(rainSeed[i * 3] - cx, RAIN_BOX);
						const hz = cz + wrapRel(rainSeed[i * 3 + 2] - cz, RAIN_BOX);
						const hy = cy - RAIN_TOP * 0.5 + y;
						const o = i * 6;
						rainPos[o] = hx;
						rainPos[o + 1] = hy;
						rainPos[o + 2] = hz;
						rainPos[o + 3] = hx + lean;
						rainPos[o + 4] = hy - p.length;
						rainPos[o + 5] = hz;
					}
					rainGeo.getAttribute('position').needsUpdate = true;
					rainGeo.setDrawRange(0, n * 2);
				};

				// ---- Live weather swap ----
				// Re-points ENV and pushes it into every object built from a preset.
				// Everything here is sky/light/fog/precipitation: no physics body,
				// AI target, or timing value is touched, by design.
				applyEnvironment = (env: EnvironmentPreset) => {
					ENV = env;
					(scene.background as InstanceType<typeof THREE.Color>).set(env.sky.base);
					sceneFog.color.set(env.fog.color);
					sceneFog.density = env.fog.density;
					hemiLight.color.set(env.hemisphere.sky);
					hemiLight.groundColor.set(env.hemisphere.ground);
					hemiLight.intensity = env.hemisphere.intensity;
					buildKeyLights(env);
					paintSky(env);
					skyTex.needsUpdate = true;
					for (const f of floodScalables) f.apply(env.floodIntensity);
					floodAppliedMul = env.floodIntensity;
					if (env.precip) {
						rainMat.color.set(env.precip.color);
						rainMat.opacity = env.precip.opacity;
						rainMesh.visible = true;
					} else {
						rainMesh.visible = false;
						rainGeo.setDrawRange(0, 0);
					}
					flashLight.intensity = 0;
					flashStartMs = -1e9;
					nextFlashAtMs = env.lightning ? gameNow() + env.lightning.minGapSec * 1000 : Infinity;
				};
				applyEnvironment(ENV);

				// ---- Screen shake: trauma model (shake = trauma^2) ----
				let trauma = 0;
				const addTrauma = (amount: number) => {
					trauma = Math.min(1, trauma + amount);
				};
				// Distance-scaled: full punch within 15u of the player, 1/d beyond.
				const addTraumaAt = (x: number, z: number, amount: number) => {
					const d = Math.hypot(x - player.body.position.x, z - player.body.position.z);
					addTrauma(amount * Math.min(1, 15 / Math.max(d, 15)));
				};

				// ---- Damage state: crumple the hull + rattle the plates ----
				// Stage 0 pristine .. 3 wrecked. The (per-rig) hull geometry
				// re-jitters its vertices from the pristine base; the armor plates
				// (shared geometry, so no vertex writes) shift and tilt off their
				// stored base transforms, reading as panels knocked loose. Healing
				// (RACE recovery, reset) restores both exactly.
				// Write the live hull = pristine base + the accumulated crumple.
				const writeHull = (rig: Rig) => {
					if (!rig.dentBase.length) return;
					const attr = rig.bodyMesh.geometry.getAttribute('position') as InstanceType<
						typeof THREE.BufferAttribute
					>;
					const arr = attr.array as Float32Array;
					const base = rig.dentBase;
					const acc = rig.dentAccum;
					for (let i = 0; i < arr.length; i++) arr[i] = base[i] + (acc[i] || 0);
					attr.needsUpdate = true;
					rig.bodyMesh.geometry.computeVertexNormals();
				};

				// Per-vertex clamp: repeated hits keep deepening the crumple up to
				// this, so a battered car looks progressively worse without shredding
				// the mesh into noise.
				const CRUMPLE_MAX = 0.34;
				// Add ONE compounding deformation bite from a hit. The struck side
				// (hit direction projected into the hull's local frame) crumples
				// harder, and the accumulation persists across hits until a heal
				// zeroes dentAccum — this is what makes damage read as escalating
				// over a race rather than snapping to a single stage.
				const addCrumple = (rig: Rig, amount: number, hitX: number, hitZ: number) => {
					const acc = rig.dentAccum;
					const base = rig.dentBase;
					if (!acc.length) return;
					const wdx = hitX - rig.body.position.x;
					const wdz = hitZ - rig.body.position.z;
					const wl = Math.hypot(wdx, wdz) || 1;
					// Hit direction resolved into local x (heading) / z (lateral).
					const lx = (wdx / wl) * rig.hx + (wdz / wl) * rig.hz;
					const lz = (wdx / wl) * -rig.hz + (wdz / wl) * rig.hx;
					const amp = Math.min(0.07, 0.012 + amount * 0.0018);
					for (let v = 0; v < acc.length; v += 3) {
						// Vertices on the struck half take ~2x the bite.
						const side = base[v] * lx + base[v + 2] * lz > 0 ? 1 : 0.5;
						for (let k = 0; k < 3; k++) {
							const j = v + k;
							let n = acc[j] + (Math.random() - 0.5) * amp * 2 * side;
							if (n > CRUMPLE_MAX) n = CRUMPLE_MAX;
							else if (n < -CRUMPLE_MAX) n = -CRUMPLE_MAX;
							acc[j] = n;
						}
					}
					writeHull(rig);
				};

				// Stage drives the escalating PLATE rattle + damage-smoke tiers; the
				// hull itself is written from the compounding dentAccum (above), so a
				// stage change just re-seats the hull and rattles the plates.
				const applyDentStage = (rig: Rig, stage: number) => {
					rig.dentStage = stage;
					writeHull(rig);
					for (const plate of rig.parts.armor.children) {
						const base = plate.userData.base as
							| {
									pos: InstanceType<typeof THREE.Vector3>;
									rot: InstanceType<typeof THREE.Euler>;
							  }
							| undefined;
						if (!base) continue;
						plate.position.copy(base.pos);
						plate.rotation.copy(base.rot);
						if (stage > 0) {
							const amp = 0.03 * stage;
							plate.position.x += (Math.random() - 0.5) * amp;
							plate.position.y += (Math.random() - 0.5) * amp;
							plate.position.z += (Math.random() - 0.5) * amp;
							plate.rotation.x += (Math.random() - 0.5) * 0.06 * stage;
							plate.rotation.z += (Math.random() - 0.5) * 0.06 * stage;
						}
					}
				};

				// ---- Combat wiring (shared by player input and AI shooters) ----
				// The shared, build-independent combat constants. Since Phase 8g the
				// EMP / oil / tether numbers live on their WeaponDefs (equipment now),
				// so this holds only what is genuinely shared: the disruption/oil
				// EFFECT scales (whatever caused them), ram, and the down window.
				const combatTuning = (): CombatTuning => ({
					maxHealth: num(tuning.maxHealth, DEFAULTS.maxHealth),
					disruptEngineCut: num(tuning.disruptEngineCut, DEFAULTS.disruptEngineCut),
					disruptSteerCut: num(tuning.disruptSteerCut, DEFAULTS.disruptSteerCut),
					spinKick: num(tuning.spinKick, DEFAULTS.spinKick),
					downSec: num(tuning.downSec, DEFAULTS.downSec),
					oilSlipSec: num(tuning.oilSlipSec, DEFAULTS.oilSlipSec),
					oilTractionCut: num(tuning.oilTractionCut, DEFAULTS.oilTractionCut),
					ramMinClosingSpeed: num(tuning.ramMinClosingSpeed, DEFAULTS.ramMinClosingSpeed),
					ramDamage: num(tuning.ramDamage, DEFAULTS.ramDamage),
					ramImpulse: num(tuning.ramImpulse, DEFAULTS.ramImpulse),
					ramPopUp: num(tuning.ramPopUp, DEFAULTS.ramPopUp),
					ramStunSec: num(tuning.ramStunSec, DEFAULTS.ramStunSec),
					ramCooldownSec: num(tuning.ramCooldownSec, DEFAULTS.ramCooldownSec)
				});
				// The build's OFFENSE scaling, applied through WeaponFireOpts to every
				// equipped weapon (kinetic/guided/disruption/oil/tether alike): damage
				// x damageDealt, cooldown x weaponCooldown, and reach x empRange (only
				// the EMP reads the range scale today). Defense lives on the TARGET's
				// VehicleCombat.resist. The ram is passive; its cooldown stays global.
				const weaponOpts = (rig: Rig) => ({
					damageScale: rig.buildStats.damageDealt,
					cooldownScale: rig.buildStats.weaponCooldown,
					rangeScale: rig.buildStats.empRange
				});

				// Field-wide driver skill (what every AI shares). Deliberately
				// carries NO absolute speed: see AiSkill.
				const aiSkill = (): AiSkill => ({
					speedFrac: num(tuning.aiSpeedFrac, DEFAULTS.aiSpeedFrac),
					cornerAccel: num(tuning.aiCorner, DEFAULTS.aiCorner),
					brakeAccel: AI_DEFAULTS.brakeAccel,
					tractionAccel: AI_DEFAULTS.tractionAccel,
					steerGain: AI_DEFAULTS.steerGain,
					aggression: num(tuning.aiAggression, DEFAULTS.aiAggression)
				});

				/**
				 * The AI DRIVER's targets, resolved from ITS OWN vehicle, so an
				 * armor AI drives like a truck and a velocity AI like a missile.
				 *
				 * The numbers handed over are the SAME absolute quantities the
				 * physics loop below applies to this rig (panel baseline x build
				 * multipliers), so the driver's straight-line target IS the speed
				 * the car actually reaches — it can no longer drift away from the
				 * physics the way a flat constant did for four phases.
				 */
				const aiTuningForRig = (rig: Rig, skill: AiSkill): AiTuning => {
					const s = rig.buildStats;
					return aiTuningFor(
						{
							engineForce: num(tuning.engineForce, DEFAULTS.engineForce) * s.engineForce,
							aeroDrag: num(tuning.aeroDrag, DEFAULTS.aeroDrag) * s.aeroDrag,
							mass: num(tuning.chassisMass, DEFAULTS.chassisMass) * s.chassisMass,
							gripMul: s.frictionSlip
						},
						skill
					);
				};

				const combatantOf = (r: Rig): Combatant => ({
					id: r.id,
					x: r.body.position.x,
					z: r.body.position.z,
					hx: r.hx,
					hz: r.hz,
					combat: r.combat
				});

				let roundOver = false;

				// ---- Headless stress-test instrumentation (data only) ----
				// Per-round counters the AI-only stress runner reads through
				// __greenline.getTelemetry(); nothing here is read by gameplay.
				// Weapon "fire" counts every triggered use; "hit" counts uses that
				// landed at least one target (oil "hit" = a rival consumed a slick).
				const testStats = {
					fire: { emp: 0, tether: 0, oil: 0, autocannon: 0, rocket: 0, railgun: 0, shotgun: 0, cluster: 0, caltrops: 0, turret: 0, shield: 0, blades: 0 },
					hit: { emp: 0, tether: 0, oil: 0, autocannon: 0, rocket: 0, railgun: 0, shotgun: 0, cluster: 0, clusterSplash: 0, caltrops: 0, turret: 0, blades: 0, shieldBreak: 0 },
					ram: 0,
					flips: 0,
					flipsByRig: {} as Record<string, number>,
					// Fall-recovery re-seats this round (relief tracks only).
					falls: 0,
					// Chassis-floor catches this round (Phase 9-fix-c): frames a
					// chassis was stood back on the ribbon because no wheel could
					// reach it. Normal driving never trips this, so a non-zero count
					// on a clean lap is the signal that something is scraping.
					floorCatches: 0,
					// Vehicle-frames the traction limiter actually bound this round
					// (Phase 9-fix-e). Zero across a whole race is the assertion that
					// a build's tires can take its power; a non-zero count says the
					// limiter is doing work rather than merely being installed.
					tractionLimitedFrames: 0,
					// Trigger-zone entries this round (Phase 8a).
					zone: { boost: 0, hazard: 0 },
					// Ability activations this round (nitro/jump/flip/repair/grip).
					ability: { nitro: 0, jump: 0, flip: 0, repair: 0, grip: 0, air: 0 },
					// Survivability instrumentation (Phase 9-fix-d). Every damage source
					// funnels through afterDamage, so tallying there covers all 13
					// weapons plus ram, caltrops, splash and the debug hook with no
					// per-source wiring. `damageTaken` sums what actually landed on a
					// rig's pools (shield soak included, so a shielded hit is not
					// invisible); `downs` counts zero-chassis events. Together they turn
					// "combat feels lethal" into a number: damage/second survived and
					// downs per race, comparable across a balance change.
					damageTaken: {} as Record<string, number>,
					damageDealt: {} as Record<string, number>,
					downs: {} as Record<string, number>,
					// Which POOL the field's incoming damage actually lands in. The pool
					// split assumes hits arrive spread across the body; in a race you
					// spend most of your time being chased, so this is the check on that
					// assumption -- and it is what sized the mount share.
					pool: { armor: 0, mount: 0, chassis: 0, shield: 0 },
					hitZone: { front: 0, side: 0, rear: 0 }
				};
				const resetTestStats = () => {
					testStats.fire.emp = testStats.fire.tether = testStats.fire.oil = 0;
					testStats.hit.emp = testStats.hit.tether = testStats.hit.oil = 0;
					testStats.fire.autocannon = testStats.fire.rocket = 0;
					testStats.hit.autocannon = testStats.hit.rocket = 0;
					testStats.fire.railgun = testStats.fire.shotgun = testStats.fire.cluster = testStats.fire.caltrops = 0;
					testStats.hit.railgun = testStats.hit.shotgun = testStats.hit.cluster = 0;
					testStats.hit.clusterSplash = testStats.hit.caltrops = 0;
					testStats.fire.turret = testStats.fire.shield = testStats.fire.blades = 0;
					testStats.hit.turret = testStats.hit.blades = testStats.hit.shieldBreak = 0;
					testStats.ram = 0;
					testStats.flips = 0;
					testStats.flipsByRig = {};
					testStats.falls = 0;
					testStats.floorCatches = 0;
					testStats.tractionLimitedFrames = 0;
					testStats.zone.boost = testStats.zone.hazard = 0;
					testStats.ability.nitro = testStats.ability.jump = testStats.ability.flip = 0;
					testStats.ability.repair = testStats.ability.grip = testStats.ability.air = 0;
					testStats.damageTaken = {};
					testStats.damageDealt = {};
					testStats.downs = {};
					testStats.pool.armor = testStats.pool.mount = testStats.pool.chassis = 0;
					testStats.pool.shield = 0;
					testStats.hitZone.front = testStats.hitZone.side = testStats.hitZone.rear = 0;
				};

				const checkLastStanding = () => {
					if (mode !== 'elimination' || roundOver) return;
					const alive = rigsAll().filter((r) => !r.combat.eliminated);
					if (alive.length === 1) {
						roundOver = true;
						banner =
							alive[0] === player
								? 'YOU WIN — LAST VEHICLE RUNNING'
								: `${alive[0].label} WINS — LAST VEHICLE RUNNING`;
					}
				};

				// The knockout moment: any vehicle reaching zero health (down OR
				// eliminated) detonates loud -- sparks, fireball smoke, a ground
				// ring, and shake. These machines are expensive; breaking them
				// should look violent.
				const explodeRig = (r: Rig) => {
					const p = r.body.position;
					spawnSparks(p.x, p.y + 0.6, p.z, 60, 0xffb347, 16, 900);
					spawnSparks(p.x, p.y + 0.6, p.z, 30, 0xfff2c0, 22, 550);
					for (let k = 0; k < 7; k++) {
						spawnSmoke(
							p.x + (Math.random() - 0.5) * 2,
							p.y + 0.8,
							p.z + (Math.random() - 0.5) * 2,
							0x181818,
							1.8,
							1800,
							2.2,
							0.6
						);
					}
					spawnRing(p.x, p.z, 0xffb347, 10, 420, 0.5);
					addTraumaAt(p.x, p.z, 0.7);
				};

				// Shared aftermath for every damage source (EMP, tether, ram,
				// debug): the ONE-TIME pool-edge feedback off the DamageResult
				// (armor stripped, mount killed, heavy chassis bites) plus the
				// existing zero-chassis outcome handling. srcX/srcZ locate the
				// attack so plate strips and bursts land on the struck side.
				const afterDamage = (
					target: Rig,
					res: DamageResult,
					sourceLabel: string,
					srcX: number,
					srcZ: number
				) => {
					if (res.outcome === 'ignored') return;
					// Survivability tally (data only, read by __greenline.getTelemetry).
					// applyDamage already stamped the attacker on the target, so both
					// sides of the ledger come from one place.
					{
						const landed = res.shield + res.armor + res.mount + res.chassis;
						testStats.damageTaken[target.id] = (testStats.damageTaken[target.id] ?? 0) + landed;
						const from = target.combat.lastDamageFrom;
						if (from) testStats.damageDealt[from] = (testStats.damageDealt[from] ?? 0) + landed;
						if (res.outcome === 'down' || res.outcome === 'eliminated')
							testStats.downs[target.id] = (testStats.downs[target.id] ?? 0) + 1;
						testStats.pool.armor += res.armor;
						testStats.pool.mount += res.mount;
						testStats.pool.chassis += res.chassis;
						testStats.pool.shield += res.shield;
						testStats.hitZone[res.zone] += landed;
					}
					// Energy Shield feedback: a soaked hit pings the bubble; the
					// pool emptying is the loud, legible "SHIELD DOWN" break moment.
					if (res.shield > 0) {
						const tp = target.body.position;
						spawnSparks(tp.x, tp.y + 0.6, tp.z, 6, 0x6fd3ff, 6, 260);
					}
					if (res.shieldBroke) {
						const tp = target.body.position;
						spawnRing(tp.x, tp.z, 0x6fd3ff, 4.4, 380, 0.6, 1.0);
						spawnSparks(tp.x, tp.y + 0.6, tp.z, 20, 0x6fd3ff, 11, 480);
						weaponSfx('shield-break', tp.x, tp.z);
						testStats.hit.shieldBreak++;
						if (target === player) addTrauma(0.4);
						flash(target === player ? 'SHIELD DOWN — exposed' : `${target.label} SHIELD DOWN`);
					}
					if (res.armor > 0 || res.armorStripped) syncArmorPlates(target, srcX, srcZ);
					if (res.armorStripped) {
						const p = target.body.position;
						spawnRing(p.x, p.z, 0xffb347, 5, 300, 0.4);
						damageSfx('armor-strip', p.x, p.z);
						flash(
							target === player
								? 'ARMOR STRIPPED — hull exposed'
								: `${target.label} ARMOR STRIPPED`
						);
					}
					if (res.mountDisabled) {
						// setMountDead also buckles + drops the mount struts (Phase 6a).
						setMountDead(target, true);
						const mp = hitAnchor(target, srcX, srcZ, 'rear');
						spawnSparks(mp.x, mp.y, mp.z, 26, GL.amber, 10, 650);
						spawnDebris(mp.x, mp.y, mp.z, 8, -target.hx, -target.hz, 6);
						spawnSmoke(mp.x, mp.y + 0.2, mp.z, 0x141414, 1.1, 1400, 1.6, 0.55);
						// Each failing strut spits a cool electrical fleck at its own
						// world position, and a chunk of bracket debris breaks free.
						for (const sg of target.parts.mount.children) {
							for (const child of sg.children) {
								if (child.userData.connector !== 'mount') continue;
								const wp = child.getWorldPosition(tmpWorld);
								spawnSparks(wp.x, wp.y, wp.z, 2, GL.coolRim, 5, 240);
							}
						}
						spawnDebris(mp.x, mp.y, mp.z, 3, -target.hx, -target.hz, 5);
						damageSfx('mount-kill', mp.x, mp.z);
						damageSfx('connector-snap', mp.x, mp.z);
						flash(
							target === player
								? 'WEAPON SYSTEMS DESTROYED'
								: `${target.label} WEAPONS OFFLINE`
						);
					} else if (res.outcome === 'damaged' && res.chassis >= 18) {
						// A heavy bite of bare frame kicks debris even with no strip.
						const a = hitAnchor(target, srcX, srcZ, res.zone);
						const dx = a.x - srcX;
						const dz = a.z - srcZ;
						const dl = Math.hypot(dx, dz) || 1;
						spawnDebris(a.x, a.y, a.z, 4, dx / dl, dz / dl, 5);
					}
					// Compounding hull crumple (Phase 6a): every chassis bite deepens the
					// deformation, so a car battered across a race looks progressively
					// worse instead of snapping to a single stage. Pool-depletion cues
					// already sounded in their branches; the ordinary bites pick a heavy
					// crunch vs a light scuff so severity reads by ear too.
					if (res.chassis > 0) addCrumple(target, res.chassis, srcX, srcZ);
					if (!res.mountDisabled && !res.armorStripped) {
						const dp = target.body.position;
						if (res.chassis >= 14) damageSfx('crunch', dp.x, dp.z);
						else if (res.chassis > 0 || res.armor > 0 || res.mount > 0)
							damageSfx('scuff', dp.x, dp.z);
					}
					if (res.outcome === 'eliminated') {
						explodeRig(target);
						if (target === player) {
							banner = 'YOU ARE ELIMINATED — press R to reset the round';
						} else {
							flash(`${target.label} ELIMINATED by ${sourceLabel}`);
						}
						checkLastStanding();
					} else if (res.outcome === 'down') {
						explodeRig(target);
						flash(`${target.label} DOWN — recovering`);
					}
				};

				// EMP Burst (equipped `disruption` weapon since Phase 8g). Fired only
				// from the slot whose def carries a disruption block; a build with no
				// EMP never reaches this.
				const performFire = (shooter: Rig, slot: WeaponSlotId, def: WeaponDef) => {
					const ct = combatTuning();
					const now = gameNow();
					const result = tryFire(
						combatantOf(shooter),
						rigsAll().map(combatantOf),
						slot,
						def,
						mode,
						ct,
						now,
						weaponOpts(shooter)
					);
					if (!result.fired) return result;
					testStats.fire.emp++;
					if (result.hits.length) testStats.hit.emp++;
					const empReach = (def.disruption?.range ?? 30) * shooter.buildStats.empRange;
					spawnRing(shooter.body.position.x, shooter.body.position.z, 0x00f0ff, empReach);
					weaponSfx('emp-fire', shooter.body.position.x, shooter.body.position.z);
					if (shooter === player) addTrauma(0.15);
					const sp2 = shooter.body.position;
					for (const hit of result.hits) {
						const target = rigsAll().find((r) => r.id === hit.targetId);
						if (!target) continue;
						target.body.angularVelocity.y +=
							ct.spinKick * hit.spinSign * target.combat.resist.spinKick;
						target.flashUntil = now + 180;
						// Impact burst on the zone actually struck, not the rig center.
						const a = hitAnchor(target, sp2.x, sp2.z, hit.result.zone);
						spawnSparks(a.x, a.y + 0.2, a.z, 22, 0x00f0ff, 10, 500);
						if (target === player) addTrauma(0.4);
						else addTraumaAt(a.x, a.z, 0.25);
						if (hit.result.outcome === 'damaged' && (target === player || shooter === player)) {
							flash(
								shooter === player
									? `HIT ${target.label} -${hit.damage}`
									: `${shooter.label} HIT YOU -${hit.damage}`
							);
						}
						// Edge/outcome feedback last, so its flashes win the slot.
						afterDamage(target, hit.result, shooter.label, sp2.x, sp2.z);
					}
					return result;
				};

				// ---- Oil slicks: combat facts + puddle visuals keyed by slick id ----
				let slickSeq = 1;
				const slicks: OilSlick[] = [];
				const slickVis = new Map<
					number,
					{
						group: InstanceType<typeof THREE.Group>;
						discMat: InstanceType<typeof THREE.MeshStandardMaterial>;
						rimMat: InstanceType<typeof THREE.MeshBasicMaterial>;
						sheenMat: InstanceType<typeof THREE.MeshBasicMaterial>;
					}
				>();
				const oilDiscGeo = new THREE.CircleGeometry(1, 28);
				oilDiscGeo.rotateX(-Math.PI / 2);
				const oilRimGeo = new THREE.RingGeometry(0.78, 1, 28);
				oilRimGeo.rotateX(-Math.PI / 2);

				// Oil Slick (equipped `area` weapon carrying an `oil` block, Phase 8g).
				const performOil = (shooter: Rig, slot: WeaponSlotId, def: WeaponDef): boolean => {
					const now = gameNow();
					const slick = tryDeployOil(combatantOf(shooter), slot, def, now, slickSeq, weaponOpts(shooter));
					if (!slick) return false;
					slickSeq++;
					slicks.push(slick);
					testStats.fire.oil++;
					weaponSfx('oil-deploy', slick.x, slick.z);
					// Glossy dark puddle (real reflectance under the sun) with an
					// unmissable additive iridescent rim + faint violet sheen,
					// squishing in from the drop point.
					const discMat = new THREE.MeshStandardMaterial({
						color: 0x0a0a14,
						roughness: 0.05,
						metalness: 0.9,
						transparent: true,
						opacity: 0.92
					});
					const rimMat = new THREE.MeshBasicMaterial({
						color: 0x8f5fff,
						transparent: true,
						opacity: 0.65,
						depthWrite: false,
						blending: THREE.AdditiveBlending
					});
					const disc = new THREE.Mesh(oilDiscGeo, discMat);
					disc.position.y = 0.05;
					const rim = new THREE.Mesh(oilRimGeo, rimMat);
					rim.position.y = 0.07;
					const sheenMat = new THREE.MeshBasicMaterial({
						color: 0x8f5fff,
						transparent: true,
						opacity: 0.12,
						depthWrite: false,
						blending: THREE.AdditiveBlending
					});
					const sheen = new THREE.Mesh(oilDiscGeo, sheenMat);
					sheen.position.y = 0.06;
					const group = new THREE.Group();
					group.add(disc);
					group.add(sheen);
					group.add(rim);
					group.position.set(slick.x, 0, slick.z);
					group.scale.set(0.01, 1, 0.01);
					scene.add(group);
					slickVis.set(slick.id, { group, discMat, rimMat, sheenMat });
					if (shooter === player) flash('OIL SLICK DEPLOYED');
					return true;
				};

				const removeSlickVis = (id: number) => {
					const vis = slickVis.get(id);
					if (vis) {
						scene.remove(vis.group);
						vis.discMat.dispose();
						vis.rimMat.dispose();
						vis.sheenMat.dispose();
						slickVis.delete(id);
					}
				};

				// ---- Tethers: live cables + transient probe beams ----
				interface TetherVis {
					t: ActiveTether;
					cable: InstanceType<typeof THREE.Mesh>;
					cableMat: InstanceType<typeof THREE.MeshBasicMaterial>;
					hook: InstanceType<typeof THREE.Mesh>;
				}
				const tethers: TetherVis[] = [];
				const beams: {
					mesh: InstanceType<typeof THREE.Mesh>;
					mat: InstanceType<typeof THREE.MeshBasicMaterial>;
					born: number;
					life: number;
				}[] = [];
				const cableGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
				const hookGeo = new THREE.SphereGeometry(0.3, 12, 10);
				const cableA = new THREE.Vector3();
				const cableB = new THREE.Vector3();
				const cableDir = new THREE.Vector3();
				const yAxis = new THREE.Vector3(0, 1, 0);
				const placeCable = (
					mesh: InstanceType<typeof THREE.Mesh>,
					ax: number,
					ay: number,
					az: number,
					bx: number,
					by: number,
					bz: number
				) => {
					cableA.set(ax, ay, az);
					cableB.set(bx, by, bz);
					cableDir.subVectors(cableB, cableA);
					const len = Math.max(0.001, cableDir.length());
					mesh.position.copy(cableA).addScaledVector(cableDir, 0.5);
					cableDir.normalize();
					mesh.quaternion.setFromUnitVectors(yAxis, cableDir);
					mesh.scale.set(1, len, 1);
				};

				const removeTetherVis = (tv: TetherVis) => {
					scene.remove(tv.cable);
					scene.remove(tv.hook);
					tv.cableMat.dispose();
				};

				// Grappling Hook (equipped `tether` weapon since Phase 8g).
				const performTether = (shooter: Rig, slot: WeaponSlotId, def: WeaponDef) => {
					const now = gameNow();
					const res = tryTether(
						combatantOf(shooter),
						rigsAll().map(combatantOf),
						slot,
						def,
						mode,
						combatTuning(),
						now,
						weaponOpts(shooter)
					);
					if (!res.fired) return res;
					testStats.fire.tether++;
					weaponSfx('hook-fire', shooter.body.position.x, shooter.body.position.z);
					if (shooter === player) addTrauma(0.12);
					const sp = shooter.body.position;
					if (!res.hit) {
						// Miss: a probe beam that flashes forward and fizzles.
						const mat = new THREE.MeshBasicMaterial({
							color: 0xc8ff00,
							transparent: true,
							opacity: 0.7,
							depthWrite: false
						});
						const mesh = new THREE.Mesh(cableGeo, mat);
						const reach = (def.tether?.range ?? 42) * 0.55;
						placeCable(
							mesh,
							sp.x,
							sp.y + 0.5,
							sp.z,
							sp.x + shooter.hx * reach,
							sp.y + 0.5,
							sp.z + shooter.hz * reach
						);
						scene.add(mesh);
						beams.push({ mesh, mat, born: now, life: 220 });
						if (shooter === player) flash('TETHER MISSED');
						return res;
					}
					const target = rigsAll().find((r) => r.id === res.hit!.targetId);
					if (!target) return res;
					testStats.hit.tether++;
					// One live cable per shooter: a re-fire replaces the old one.
					for (let i = tethers.length - 1; i >= 0; i--) {
						if (tethers[i].t.shooterId === shooter.id) {
							removeTetherVis(tethers[i]);
							tethers.splice(i, 1);
						}
					}
					const cableMat = new THREE.MeshBasicMaterial({
						color: 0xc8ff00,
						transparent: true,
						opacity: 0.9,
						depthWrite: false
					});
					const cable = new THREE.Mesh(cableGeo, cableMat);
					const hook = new THREE.Mesh(hookGeo, cableMat);
					scene.add(cable);
					scene.add(hook);
					tethers.push({
						t: {
							shooterId: shooter.id,
							targetId: target.id,
							untilMs: now + (def.tether?.holdSec ?? 1.25) * 1000,
							weaponId: def.id
						},
						cable,
						cableMat,
						hook
					});
					target.flashUntil = now + 180;
					const tp = target.body.position;
					spawnRing(tp.x, tp.z, 0xc8ff00, 4, 260, 0.7);
					// The hook's bite sparks on the face it actually latched.
					const la = hitAnchor(target, sp.x, sp.z, res.hit.result.zone);
					spawnSparks(la.x, la.y + 0.15, la.z, 16, 0xc8ff00, 9, 450);
					if (shooter === player || target === player) addTrauma(0.35);
					else addTraumaAt(tp.x, tp.z, 0.25);
					if (res.hit.result.outcome === 'damaged') {
						if (shooter === player) flash(`TETHER LATCHED ${target.label}`);
						else if (target === player) flash(`TETHERED by ${shooter.label}`);
					}
					afterDamage(target, res.hit.result, shooter.label, sp.x, sp.z);
					return res;
				};

				// ---- Equipped weapons: fire dispatch, locks, projectiles ----
				// The two mount slots resolve whatever WeaponDef the build carries
				// (autocannon = kinetic hit-scan, homing rocket = lock + live
				// projectile); an equipped-but-unimplemented catalog id simply
				// does not fire. Offense scales with the SHOOTER's build (the
				// ctFor convention): damage x damageDealt, cooldown x
				// weaponCooldown.
				const effSlotCooldown = (rig: Rig, cooldownSec: number) =>
					cooldownSec * rig.buildStats.weaponCooldown;

				// PLACEHOLDER SFX: synthesized tones on the audio-engine buses
				// until real weapon audio is sourced (build plan section 8). Swap
				// each playTone for playBuffer with the real asset; positions
				// already ride through, so the swap is content-only.
				const weaponSfx = (
					kind:
						| 'auto-fire'
						| 'auto-hit'
						| 'rail-fire'
						| 'rail-hit'
						| 'shot-fire'
						| 'shot-hit'
						| 'rocket-launch'
						| 'rocket-hit'
						| 'cluster-launch'
						| 'cluster-hit'
						| 'caltrops-deploy'
						| 'caltrops-hit'
						| 'turret-fire'
						| 'turret-hit'
						| 'shield-up'
						| 'shield-break'
						| 'blade-deploy'
						| 'blade-hit'
						| 'jammer-hum'
						| 'lock-on'
						| 'no-lock'
						| 'emp-fire'
						| 'oil-deploy'
						| 'hook-fire',
					x?: number,
					z?: number
				) => {
					const pos = x !== undefined && z !== undefined ? { x, y: 0.8, z } : undefined;
					if (kind === 'auto-fire')
						audioEngine.playTone('weapons', { freq: 480, durationMs: 70, type: 'square', gain: 0.16, pitchJitter: [0.92, 1.08], position: pos });
					else if (kind === 'auto-hit')
						audioEngine.playTone('impacts', { freq: 210, durationMs: 90, type: 'triangle', gain: 0.18, pitchJitter: [0.9, 1.1], position: pos });
					else if (kind === 'rail-fire')
						audioEngine.playTone('weapons', { freq: 900, durationMs: 140, type: 'square', gain: 0.22, pitchJitter: [0.98, 1.02], position: pos });
					else if (kind === 'rail-hit')
						audioEngine.playTone('impacts', { freq: 140, durationMs: 220, type: 'sawtooth', gain: 0.3, position: pos });
					else if (kind === 'shot-fire')
						audioEngine.playTone('weapons', { freq: 300, durationMs: 90, type: 'square', gain: 0.2, pitchJitter: [0.82, 1.2], position: pos });
					else if (kind === 'shot-hit')
						audioEngine.playTone('impacts', { freq: 200, durationMs: 90, type: 'triangle', gain: 0.2, pitchJitter: [0.85, 1.15], position: pos });
					else if (kind === 'rocket-launch')
						audioEngine.playTone('weapons', { freq: 180, durationMs: 340, type: 'sawtooth', gain: 0.22, pitchJitter: [0.95, 1.05], position: pos });
					else if (kind === 'rocket-hit')
						audioEngine.playTone('impacts', { freq: 90, durationMs: 320, type: 'sawtooth', gain: 0.3, position: pos });
					else if (kind === 'cluster-launch')
						audioEngine.playTone('weapons', { freq: 210, durationMs: 320, type: 'sawtooth', gain: 0.22, pitchJitter: [0.95, 1.05], position: pos });
					else if (kind === 'cluster-hit')
						audioEngine.playTone('impacts', { freq: 80, durationMs: 360, type: 'sawtooth', gain: 0.32, position: pos });
					else if (kind === 'caltrops-deploy')
						audioEngine.playTone('weapons', { freq: 620, durationMs: 120, type: 'square', gain: 0.16, pitchJitter: [0.85, 1.15], position: pos });
					else if (kind === 'caltrops-hit')
						audioEngine.playTone('impacts', { freq: 340, durationMs: 60, type: 'square', gain: 0.15, pitchJitter: [0.9, 1.1], position: pos });
					else if (kind === 'turret-fire')
						audioEngine.playTone('weapons', { freq: 560, durationMs: 55, type: 'square', gain: 0.13, pitchJitter: [0.9, 1.12], position: pos });
					else if (kind === 'turret-hit')
						audioEngine.playTone('impacts', { freq: 240, durationMs: 70, type: 'triangle', gain: 0.14, pitchJitter: [0.9, 1.1], position: pos });
					else if (kind === 'shield-up')
						audioEngine.playTone('ui', { freq: 320, durationMs: 260, type: 'sine', gain: 0.2, pitchJitter: [1.0, 1.4] });
					else if (kind === 'shield-break')
						audioEngine.playTone('impacts', { freq: 150, durationMs: 300, type: 'sawtooth', gain: 0.3, pitchJitter: [0.7, 0.95], position: pos });
					else if (kind === 'blade-deploy')
						audioEngine.playTone('weapons', { freq: 420, durationMs: 240, type: 'sawtooth', gain: 0.18, pitchJitter: [1.0, 1.6] });
					else if (kind === 'blade-hit')
						audioEngine.playTone('impacts', { freq: 300, durationMs: 80, type: 'sawtooth', gain: 0.18, pitchJitter: [0.85, 1.2], position: pos });
					else if (kind === 'jammer-hum')
						audioEngine.playTone('ambient', { freq: 70, durationMs: 900, type: 'sine', gain: 0.05, pitchJitter: [0.97, 1.03] });
					else if (kind === 'lock-on')
						audioEngine.playTone('ui', { freq: 880, durationMs: 90, type: 'sine', gain: 0.14 });
					else if (kind === 'emp-fire')
						audioEngine.playTone('weapons', { freq: 620, durationMs: 200, type: 'square', gain: 0.2, pitchJitter: [0.9, 1.1], position: pos });
					else if (kind === 'oil-deploy')
						audioEngine.playTone('weapons', { freq: 160, durationMs: 200, type: 'sine', gain: 0.16, pitchJitter: [0.9, 1.1], position: pos });
					else if (kind === 'hook-fire')
						audioEngine.playTone('weapons', { freq: 240, durationMs: 160, type: 'sawtooth', gain: 0.18, pitchJitter: [0.85, 1.05], position: pos });
					else audioEngine.playTone('ui', { freq: 220, durationMs: 120, type: 'sine', gain: 0.12 });
				};

				// PLACEHOLDER structural-damage SFX (Phase 6a), tiered so each visual
				// damage step reads by ear: a light scuff, a heavy crumple crunch, a
				// sharp metallic connector snap, plate armor tearing, and the deep
				// mount-kill destruction are five DISTINCT tones (freq/type/length),
				// not one generic "hit". Same audio-engine-bus convention as weaponSfx;
				// swap for real assets later (positions ride through).
				const damageSfx = (
					kind: 'scuff' | 'crunch' | 'connector-snap' | 'armor-strip' | 'mount-kill',
					x?: number,
					z?: number
				) => {
					const pos = x !== undefined && z !== undefined ? { x, y: 0.8, z } : undefined;
					if (kind === 'scuff')
						audioEngine.playTone('impacts', { freq: 130, durationMs: 70, type: 'triangle', gain: 0.12, pitchJitter: [0.85, 1.15], position: pos });
					else if (kind === 'crunch')
						audioEngine.playTone('impacts', { freq: 90, durationMs: 180, type: 'sawtooth', gain: 0.24, pitchJitter: [0.8, 1.05], position: pos });
					else if (kind === 'connector-snap')
						audioEngine.playTone('impacts', { freq: 640, durationMs: 70, type: 'square', gain: 0.17, pitchJitter: [0.9, 1.25], position: pos });
					else if (kind === 'armor-strip')
						audioEngine.playTone('impacts', { freq: 260, durationMs: 160, type: 'sawtooth', gain: 0.22, pitchJitter: [0.85, 1.1], position: pos });
					else
						audioEngine.playTone('impacts', { freq: 70, durationMs: 340, type: 'sawtooth', gain: 0.3, pitchJitter: [0.9, 1.0], position: pos });
				};

				// Live projectiles (combat facts) + their meshes keyed by id. The
				// combat array is owned here and stepped by updateProjectiles;
				// visuals share ONE geometry/material pair across all rockets.
				let projSeq = 1;
				const projectiles: Projectile[] = [];
				const projGeo = new THREE.ConeGeometry(0.13, 0.72, 8);
				projGeo.rotateZ(-Math.PI / 2); // point +x so lookalong = heading
				const projMat = new THREE.MeshBasicMaterial({ color: 0xe6edf3 });
				const projVis = new Map<number, InstanceType<typeof THREE.Mesh>>();
				const spawnProjectileVis = (p: Projectile) => {
					const mesh = new THREE.Mesh(projGeo, projMat);
					mesh.position.set(p.x, p.y, p.z);
					scene.add(mesh);
					projVis.set(p.id, mesh);
				};
				const removeProjectileVis = (id: number) => {
					const mesh = projVis.get(id);
					if (mesh) {
						scene.remove(mesh);
						projVis.delete(id);
					}
				};
				const clearProjectiles = () => {
					for (const p of projectiles) removeProjectileVis(p.id);
					projectiles.length = 0;
				};

				// Caltrop fields (combat facts) + their ground visuals keyed by id
				// (the OilSlick vis pattern, but persistent multi-trigger hazards).
				// A field reads as a matte scatter patch studded with steel spikes,
				// distinct from the glossy oil puddle. Spike geometry is shared.
				let caltropSeq = 1;
				const caltropFields: CaltropField[] = [];
				const caltropSpikeGeo = new THREE.ConeGeometry(0.06, 0.22, 5);
				const caltropVis = new Map<
					number,
					{
						group: InstanceType<typeof THREE.Group>;
						patchMat: InstanceType<typeof THREE.MeshStandardMaterial>;
						spikeMat: InstanceType<typeof THREE.MeshStandardMaterial>;
					}
				>();
				const caltropPatchGeo = new THREE.CircleGeometry(1, 24);
				caltropPatchGeo.rotateX(-Math.PI / 2);
				const spawnCaltropVis = (f: CaltropField) => {
					const cdef = weaponById(f.weaponId);
					const radius = cdef?.area?.radius ?? 3.4;
					const patchMat = new THREE.MeshStandardMaterial({
						color: 0x1a1712,
						roughness: 0.95,
						metalness: 0.1,
						transparent: true,
						opacity: 0.7
					});
					const patch = new THREE.Mesh(caltropPatchGeo, patchMat);
					patch.position.y = 0.03;
					const group = new THREE.Group();
					group.add(patch);
					// A scatter of small steel spikes across the patch (seeded off the
					// field id so the pattern is stable per field, cheap fixed count).
					const spikeMat = new THREE.MeshStandardMaterial({ color: 0x9aa6ad, roughness: 0.4, metalness: 0.8, transparent: true, opacity: 1 });
					const spikeCount = 11;
					for (let i = 0; i < spikeCount; i++) {
						const ang = i * 2.399963 + f.id; // golden-angle scatter
						const rr = radius * (0.15 + 0.8 * ((i * 0.618034 + f.id * 0.13) % 1));
						const spike = new THREE.Mesh(caltropSpikeGeo, spikeMat);
						spike.position.set(Math.cos(ang) * rr, 0.11, Math.sin(ang) * rr);
						spike.rotation.set(Math.sin(ang) * 0.4, ang, Math.cos(ang) * 0.4);
						group.add(spike);
					}
					group.position.set(f.x, 0, f.z);
					group.scale.set(0.01, 1, 0.01);
					scene.add(group);
					caltropVis.set(f.id, { group, patchMat, spikeMat });
				};
				const removeCaltropVis = (id: number) => {
					const vis = caltropVis.get(id);
					if (vis) {
						scene.remove(vis.group);
						vis.patchMat.dispose();
						vis.spikeMat.dispose();
						caltropVis.delete(id);
					}
				};
				const clearCaltrops = () => {
					for (const f of caltropFields) removeCaltropVis(f.id);
					caltropFields.length = 0;
				};

				// The player's lock reticle: one reusable ground ring placed on
				// the locked target. Cool-rim while acquiring (tightening onto
				// the target), signature green once LOCKED (green = ready). The
				// player's own lock only; being locked BY an AI is deliberately
				// not telegraphed in this pass.
				const lockRingMat = new THREE.MeshBasicMaterial({
					color: GL.coolRim,
					transparent: true,
					opacity: 0,
					side: THREE.DoubleSide,
					depthWrite: false,
					blending: THREE.AdditiveBlending
				});
				const lockRingGeo = new THREE.RingGeometry(0.86, 1, 32);
				lockRingGeo.rotateX(-Math.PI / 2);
				const lockRing = new THREE.Mesh(lockRingGeo, lockRingMat);
				lockRing.visible = false;
				scene.add(lockRing);
				// Rising-edge memory for the player's lock-complete cue.
				let playerLockedPrev = false;
				// Radar Jammer character: a soft continuous low hum while the PLAYER
				// carries one (passive, so there is no fire/impact cue). Re-emitted on
				// an interval since the placeholder tones are one-shots; player-only so
				// an AI field of jammers is not a cacophony.
				let lastJammerHumMs = 0;

				// Fire the equipped weapon in a slot. Returns true when a shot /
				// launch actually happened (cooldown spent).
				const performWeaponFire = (shooter: Rig, slot: WeaponSlotId): boolean => {
					const def = weaponById(shooter.weapons[slot]);
					if (!def) return false;
					const now = gameNow();
					const opts = weaponOpts(shooter);
					const ct = combatTuning();
					const sp = shooter.body.position;
					// EMP Burst / Oil Slick / Grappling Hook (Phase 8g): the three former
					// fixed tools dispatch here now, into their own rich-visual perform*
					// helpers, exactly like every other equipped weapon.
					if (def.category === 'disruption') return performFire(shooter, slot, def).fired;
					if (def.category === 'tether') return performTether(shooter, slot, def).fired;
					if (def.category === 'area' && def.oil) return performOil(shooter, slot, def);
					if (def.category === 'kinetic' && def.kinetic) {
						const res = tryFireKinetic(
							combatantOf(shooter),
							rigsAll().map(combatantOf),
							slot,
							def,
							mode,
							ct,
							now,
							opts
						);
						if (!res.fired) return false;
						// Per-weapon telemetry + feedback: the railgun is a heavy
						// precision crack, the shotgun a close spread, the autocannon
						// the light rapid baseline. Meshes/bespoke FX are Phase 4c.
						const rail = def.id === 'railgun';
						const shot = def.id === 'shotgun-burst';
						const kkey = rail ? 'railgun' : shot ? 'shotgun' : 'autocannon';
						testStats.fire[kkey]++;
						if (res.hits.length) testStats.hit[kkey]++;
						// Muzzle flash at the nose; railgun a sharp bright lance, shotgun
						// a wide scatter, autocannon a small puff (a rapid weapon must
						// not strobe the screen).
						const mx = sp.x + shooter.hx * 1.9;
						const mz = sp.z + shooter.hz * 1.9;
						if (rail) {
							spawnSparks(mx, sp.y + 0.5, mz, 14, 0xbfeaff, 16, 260);
							spawnRing(mx, mz, 0xbfeaff, 3.2, 220, 0.5, 0.6);
							weaponSfx('rail-fire', sp.x, sp.z);
							if (shooter === player) addTrauma(0.12);
						} else if (shot) {
							spawnSparks(mx, sp.y + 0.5, mz, 12, 0xffe0a0, 11, 220);
							weaponSfx('shot-fire', sp.x, sp.z);
							if (shooter === player) addTrauma(0.08);
						} else {
							spawnSparks(mx, sp.y + 0.5, mz, 5, 0xfff2c0, 7, 200);
							weaponSfx('auto-fire', sp.x, sp.z);
							if (shooter === player) addTrauma(0.04);
						}
						for (const hit of res.hits) {
							const target = rigsAll().find((r) => r.id === hit.targetId);
							if (!target) continue;
							target.flashUntil = now + (rail ? 220 : 120);
							const a = hitAnchor(target, sp.x, sp.z, hit.result.zone);
							spawnSparks(a.x, a.y + 0.2, a.z, rail ? 16 : 8, GL.amberWarm, rail ? 11 : 8, rail ? 500 : 320);
							weaponSfx(rail ? 'rail-hit' : shot ? 'shot-hit' : 'auto-hit', a.x, a.z);
							if (target === player) addTrauma(rail ? 0.28 : 0.12);
							// No per-hit flash text (too chatty at this cadence);
							// afterDamage still fires the one-time edge flashes.
							afterDamage(target, hit.result, shooter.label, sp.x, sp.z);
						}
						return true;
					}
					if (def.category === 'guided' && def.guided) {
						const proj = tryLaunchGuided(
							combatantOf(shooter),
							rigsAll().map(combatantOf),
							slot,
							def,
							shooter.locks[slot],
							now,
							projSeq,
							opts
						);
						if (!proj) {
							// A press without a complete lock costs nothing.
							if (shooter === player && slotCooldownRemaining(shooter.combat, slot, effSlotCooldown(shooter, def.cooldownSec), now) <= 0) {
								flash('NO LOCK');
								weaponSfx('no-lock');
							}
							return false;
						}
						projSeq++;
						projectiles.push(proj);
						spawnProjectileVis(proj);
						shooter.locks[slot] = null;
						const cluster = def.id === 'cluster-missile';
						if (cluster) testStats.fire.cluster++;
						else testStats.fire.rocket++;
						spawnSmoke(proj.x, proj.y, proj.z, 0x2a2a2a, 0.7, 700, 1.2, 0.5);
						spawnSparks(proj.x, proj.y, proj.z, 6, GL.amberWarm, 6, 300);
						weaponSfx(cluster ? 'cluster-launch' : 'rocket-launch', proj.x, proj.z);
						if (shooter === player) {
							addTrauma(0.12);
							flash(cluster ? 'CLUSTER AWAY' : 'ROCKET AWAY');
						}
						return true;
					}
					if (def.category === 'area' && def.area) {
						const field = tryDeployCaltrops(combatantOf(shooter), slot, def, now, caltropSeq, opts);
						if (!field) return false;
						caltropSeq++;
						caltropFields.push(field);
						spawnCaltropVis(field);
						testStats.fire.caltrops++;
						weaponSfx('caltrops-deploy', field.x, field.z);
						if (shooter === player) flash('CALTROPS DEPLOYED');
						return true;
					}
					if (def.category === 'defensive' && def.shield) {
						// Energy Shield: raise the hard absorb bubble.
						if (!tryActivateShield(combatantOf(shooter), slot, def, now, opts)) return false;
						testStats.fire.shield++;
						weaponSfx('shield-up', sp.x, sp.z);
						spawnRing(sp.x, sp.z, 0x6fd3ff, 3.6, 340, 0.5, 0.9);
						if (shooter === player) flash('SHIELD UP');
						return true;
					}
					if (def.category === 'melee' && def.melee) {
						// Deployable Blades: toggle the active contact-damage window.
						if (!tryDeployBlades(combatantOf(shooter), slot, def, now, opts)) return false;
						testStats.fire.blades++;
						weaponSfx('blade-deploy', sp.x, sp.z);
						spawnRing(sp.x, sp.z, 0xffb347, 2.6, 260, 0.4, 0.7);
						if (shooter === player) flash('BLADES OUT');
						return true;
					}
					// Passive / auto weapons never fire from the trigger: the Radar
					// Jammer works just by being equipped, the Auto-Turret fires
					// itself in the per-frame turret tick. A fire press on them is a
					// harmless no-op (no cost spent).
					return false;
				};

				// Resolve one collision contact for the attacker's Deployable Blades.
				// Driven off the SAME contact queue the ram uses, but tryBladeStrike
				// has none of ram's gating: blades out + any contact = damage, per-
				// victim throttled so a grinding scrape does not machine-gun.
				const bladeContact = (attacker: Rig, victim: Rig, now: number) => {
					const slot = WEAPON_SLOTS.find(
						(sl) => weaponById(attacker.weapons[sl])?.category === 'melee'
					);
					if (!slot) return;
					const def = weaponById(attacker.weapons[slot]);
					if (!def) return;
					const res = tryBladeStrike(
						combatantOf(attacker),
						combatantOf(victim),
						def,
						mode,
						combatTuning(),
						now,
						{ damageScale: attacker.buildStats.damageDealt }
					);
					if (!res.struck) return;
					testStats.hit.blades++;
					const vp = victim.body.position;
					victim.flashUntil = now + 130;
					const a = hitAnchor(victim, attacker.body.position.x, attacker.body.position.z, res.result.zone);
					spawnSparks(a.x, a.y + 0.2, a.z, 10, 0xffd27f, 9, 300);
					weaponSfx('blade-hit', vp.x, vp.z);
					if (victim === player) addTrauma(0.16);
					else if (attacker === player) flash(`BLADES HIT ${victim.label} -${res.damage}`);
					afterDamage(victim, res.result, attacker.label, attacker.body.position.x, attacker.body.position.z);
				};

				// ---- Abilities: drift-charged active utilities ----
				// PLACEHOLDER SFX on the audio-engine buses (the weaponSfx convention:
				// swap each playTone for a real playBuffer later, positions ride
				// through so the swap is content-only).
				const abilitySfx = (
					kind: 'nitro' | 'jump' | 'flip' | 'repair' | 'grip' | 'air',
					x?: number,
					z?: number
				) => {
					const pos = x !== undefined && z !== undefined ? { x, y: 0.8, z } : undefined;
					if (kind === 'nitro')
						audioEngine.playTone('weapons', { freq: 150, durationMs: 420, type: 'sawtooth', gain: 0.2, pitchJitter: [1.0, 1.3], position: pos });
					else if (kind === 'jump')
						audioEngine.playTone('impacts', { freq: 240, durationMs: 200, type: 'sine', gain: 0.2, pitchJitter: [1.2, 1.7], position: pos });
					else if (kind === 'flip')
						audioEngine.playTone('ui', { freq: 300, durationMs: 260, type: 'triangle', gain: 0.18, pitchJitter: [0.8, 1.1] });
					else if (kind === 'repair')
						audioEngine.playTone('ui', { freq: 520, durationMs: 340, type: 'sine', gain: 0.2, pitchJitter: [1.0, 1.5] });
					else if (kind === 'air')
						// Thin cold hiss, read as attitude jets; deliberately unlike the
						// hop's low sine so the two never blur together in flight.
						audioEngine.playTone('ambient', { freq: 900, durationMs: 300, type: 'square', gain: 0.1, pitchJitter: [0.92, 1.08], position: pos });
					else
						audioEngine.playTone('ambient', { freq: 380, durationMs: 260, type: 'triangle', gain: 0.14, pitchJitter: [1.0, 1.3], position: pos });
				};

				// PLACEHOLDER draft cue (the weaponSfx/abilitySfx convention: swap the
				// playTone for a real playBuffer later). A soft airy sine on the ambient
				// bus, deliberately distinct from the ability tones (nitro sawtooth, grip
				// ambient-triangle), read as a wind whoosh as the trailer catches the
				// wake. Fired on the ENGAGE rising edge only (see the detection pass).
				const draftSfx = (x?: number, z?: number) => {
					const pos = x !== undefined && z !== undefined ? { x, y: 0.8, z } : undefined;
					audioEngine.playTone('ambient', { freq: 520, durationMs: 300, type: 'sine', gain: 0.12, pitchJitter: [1.0, 1.16], position: pos });
				};

				// PLACEHOLDER trigger-zone cue (same convention): a rising surge for
				// the boost pad, distinct from nitro's low sawtooth.
				const zoneSfx = (kind: 'boost', x?: number, z?: number) => {
					const pos = x !== undefined && z !== undefined ? { x, y: 0.8, z } : undefined;
					if (kind === 'boost')
						audioEngine.playTone('ambient', { freq: 340, durationMs: 380, type: 'sawtooth', gain: 0.18, pitchJitter: [1.15, 1.45], position: pos });
				};

				/**
				 * Genuinely in the air: ALL four wheels clear, held for the dwell.
				 * See AIRBORNE_MIN_SEC for why it is zero-contacts rather than a
				 * majority. Used both to gate activation and by the AI heuristic.
				 */
				const rigAirborne = (rig: Rig): boolean =>
					rig.wheelContacts === 0 && rig.airborneSec >= AIRBORNE_MIN_SEC;

				// Activate the ability in a slot. Returns true when it fired (meter
				// spent). Emergency Flip triggered while upright is a costless no-op
				// (the tryActivateAbility no-lock pattern): nothing spent, no feedback
				// but a one-line reason for the player.
				const performAbility = (rig: Rig, slot: AbilitySlotId): boolean => {
					const def = abilityById(rig.abilities[slot]);
					if (!def) return false;
					const now = gameNow();
					// "Genuinely flipped" = local up axis at/below the horizon (the
					// watchdog's flipUpY threshold), but with NO stationary requirement:
					// the whole point of the ability is to skip the wait.
					const upY = rig.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y;
					const isFlipped = upY < num(tuning.flipUpY, DEFAULTS.flipUpY);
					const isAirborne = rigAirborne(rig);
					const res = tryActivateAbility(rig.abilityState, rig.combat, slot, def, now, {
						isFlipped,
						isAirborne
					});
					if (!res.activated) {
						if (res.reason === 'not-flipped' && rig === player) flash('NOT FLIPPED');
						if (res.reason === 'not-airborne' && rig === player) flash('NOT AIRBORNE');
						return false;
					}
					const o = res.outcome;
					const p = rig.body.position;
					if (o?.kind === 'nitro') {
						testStats.ability.nitro++;
						abilitySfx('nitro', p.x, p.z);
						// A flame-toned exhaust burst out the tail.
						spawnSparks(p.x - rig.hx * 1.7, p.y + 0.35, p.z - rig.hz * 1.7, 16, GL.amberWarm, 13, 440);
						spawnRing(p.x, p.z, 0x8fffc4, 3, 260, 0.35, 0.5);
						if (rig === player) {
							addTrauma(0.25);
							flash('NITRO BOOST');
						}
					} else if (o?.kind === 'grip') {
						testStats.ability.grip++;
						abilitySfx('grip', p.x, p.z);
						spawnRing(p.x, p.z, 0x8fffc4, 3.2, 300, 0.4, 0.7);
						if (rig === player) flash('GRIP SURGE');
										} else if (o?.kind === 'air') {
							testStats.ability.air++;
							abilitySfx('air', p.x, p.z);
							// Cool-rim thruster puffs off the flanks; no ground ring, the
							// car is not near the ground.
							spawnSparks(p.x, p.y + 0.5, p.z, 10, 0xdfeaff, 6, 320);
							if (rig === player) flash('AIR CORRECTION');
						} else if (o?.kind === 'jump') {
						testStats.ability.jump++;
						// Wake the body first: cannon-es ignores an impulse on a
						// sleeping body, so a hop from a standstill would be a no-op.
						rig.body.wakeUp();
						rig.body.applyImpulse(new CANNON.Vec3(0, o.impulse, 0));
						abilitySfx('jump', p.x, p.z);
						spawnRing(p.x, p.z, 0xdfeaff, 3.4, 260, 0.4, 0.5);
						if (rig === player) {
							addTrauma(0.2);
							flash('HOP');
						}
					} else if (o?.kind === 'flip') {
						testStats.ability.flip++;
						// Immediate re-seat, mirroring the flip watchdog with no delay.
						// hx/hz are the forward flat projection, so yaw survives the roll.
						const yawDeg = (Math.atan2(-rig.hz, rig.hx) * 180) / Math.PI;
						rig.body.position.y = SPAWN_Y;
						rig.body.quaternion.copy(quatFor(yawDeg));
						rig.body.velocity.setZero();
						rig.body.angularVelocity.setZero();
						rig.steerCurrent = 0;
						rig.flipAcc = 0;
						abilitySfx('flip', p.x, p.z);
						spawnRing(p.x, p.z, 0x00ff41, 4, 320, 0.45);
						if (rig === player) flash('EMERGENCY FLIP — righted');
					} else if (o?.kind === 'repair') {
						testStats.ability.repair++;
						const healed = o.applied.armor + o.applied.chassis + o.applied.mount;
						// The heal may have revived a dead mount and refilled plates:
						// reconcile the bodywork with the restored pools, quietly.
						setMountDead(rig, rig.combat.mountDown);
						syncArmorPlates(rig, undefined, undefined, true);
						abilitySfx('repair', p.x, p.z);
						spawnRing(p.x, p.z, GL.green, 3.6, 420, 0.5, 0.9);
						spawnSparks(p.x, p.y + 0.5, p.z, 14, GL.green, 7, 380);
						if (rig === player) flash(`REPAIR +${Math.round(healed)}`);
					}
					return true;
				};
				// On spawn and every reset, NO throttle/steer/brake/weapon input
				// registers for ANY vehicle (player or AI) until GO. Physics stays
				// live so the cars simply sit at rest on the flat grid. After GO,
				// RAM damage/knockback is additionally suppressed for a short grace
				// window so a tight launch pack cannot trade contact damage before
				// real driving begins (EMP / oil / tether are unaffected).
				const COUNTDOWN_SEC = 3; // 3 - 2 - 1 then GO
				const GO_HOLD_SEC = 0.7; // how long the GO flash stays on screen
				const RAM_GRACE_SEC = 1.5; // ram-only suppression window after GO
				// Trigger-zone defaults (Phase 8a): a zone's own strength/durationSec
				// override the first two; the kick and rearm window are feel
				// constants (the kick is the instant shove, mass-scaled; rearm keeps
				// a car weaving along a zone edge from machine-gunning re-entries).
				const BOOST_STRENGTH = 1.8; // engine-force multiplier default
				const BOOST_DURATION_SEC = 1.5; // boost window default
				const BOOST_KICK_MPS = 5; // instant forward speed added on pad entry
				const ZONE_REARM_SEC = 1.5; // per-vehicle per-zone retrigger window
				// Pit repair (Phase 9c): a car STOPPED (speed <= PIT_STOP_SPEED) inside
				// a pit zone heals PIT_REPAIR_PER_SEC health/second through
				// VehicleCombat.repair(), so the amount scales with dwell (the pool
				// caps clamp a long stop to a full heal). Deliberately heals FAR more
				// completely than Overcharge Repair's fixed amount: a ~1s splash already
				// beats it, a ~2s stop tops a light build off, a heavy build wants ~3s
				// — paid for in the pit-lane detour + the stop, not a meter.
				// Scaled with the 9-fix-d durability budget (50 -> 125) so those
				// documented dwell times still hold against the bigger pools: ~1.5s
				// for a 182-point VELOCITY, ~3.3s for a 416-point ARMOR. A track zone
				// may still override it per box (zn.repairPerSec); none do today.
				const PIT_REPAIR_PER_SEC = 125;
				const PIT_STOP_SPEED = 2.5; // m/s at or below = stopped in the box
				// AI takes the pit lane when its chassis drops below this fraction
				// (simple usage only; strategic pitting is Phase 9d's job).
				const PIT_AI_HEALTH_FRAC = 0.5;
				// Absolute sim-clock ms at which controls unlock (GO). Set
				// here for the initial launch and re-armed by resetRound each round.
				let raceStartAtMs = gameNow() + COUNTDOWN_SEC * 1000;

				// ---- Weapon/ability arming: PER VEHICLE and POSITIONAL ----
				// (Phase 9-fix-b.) The countdown clock alone is the wrong gate: it
				// unlocks the whole field on the same frame, so a tightly packed grid
				// is armed while every car is still sitting on its slot, and the back
				// row can fire into the pack before anyone has moved. Arming is now a
				// question about THIS vehicle: has it actually launched?
				//
				// The signal is one the lap system already maintains — LapTracker.timing,
				// set by the `timing-started` event on a vehicle's FIRST start/finish
				// crossing. Nothing new is tracked, nothing is inferred: every grid slot
				// sits behind the line (slotPose steps rows BACK from the start anchor),
				// so crossing it is exactly "this car has left the grid and is racing",
				// and the staggered rows arm in the order they actually launch.
				//
				// LAUNCH_ARM_DIST_M is a safety net, not the mechanism: straight-line
				// distance from this round's grid seat, set far past what any car covers
				// before reaching the line on the current tracks (pole crosses within
				// ~12-32 m, the back of a full grid within ~80 m). It only matters if a
				// track were ever authored with its spawn PAST the start line, where the
				// timing signal would otherwise withhold weapons for a whole lap.
				const LAUNCH_ARM_DIST_M = 100;
				const weaponsArmed = (rig: Rig, now: number): boolean => {
					if (now < raceStartAtMs) return false; // never before GO
					if (rig.tracker.timing) return true;
					const dx = rig.body.position.x - rig.spawn.x;
					const dz = rig.body.position.z - rig.spawn.z;
					return dx * dx + dz * dz >= LAUNCH_ARM_DIST_M * LAUNCH_ARM_DIST_M;
				};

				// ---- Round state ----
				let finishOrder: Rig[] = [];
				// The player's timing-start stamp (first start/finish crossing), so
				// total race time = finishing-lap atMs - this. Reset each round.
				let playerRaceStartMs: number | null = null;
				let finishReported = false;
				let prevMs = gameNow();

				const syncHud = () => {
					hud.timing = player.tracker.timing;
					hud.lap = player.tracker.lapsCompleted + 1;
					hud.cp = player.tracker.nextCheckpoint;
					hud.lastMs = player.tracker.lastLapMs;
					hud.bestMs = player.tracker.bestLapMs;
				};

				// ---- Input state ----
				// Every check resolves through the remappable bindings in
				// control-settings, so a rebind in the settings overlay changes
				// what drives the car with no wiring here. `keys` tracks HELD key
				// codes only; edge actions trigger straight from the keydown (or
				// the pad edge scan below).
				const keys = new Set<string>();
				const keyHeld = (a: ControlAction) => keys.has(controlSettings.keyboard[a]);
				const PAD_EDGE_ACTIONS = CONTROL_ACTIONS.filter((d) => d.kind === 'edge').map(
					(d) => d.id
				);
				let firePrimaryQueued = false;
				let fireSecondaryQueued = false;
				let abilityPrimaryQueued = false;
				let abilitySecondaryQueued = false;
				const prevPadEdge: Partial<Record<ControlAction, boolean>> = {};

				// ---- Camera views + free-look state (Phase 9a) ----
				// The chase follow (speed-scaled pull-back + smoothing lerp) is
				// unchanged; a view only scales the target distance/height, and
				// free-look / look-back layer on top without touching the follow.
				const CAMERA_VIEWS: { name: string; distMul: number; heightMul: number }[] = [
					// Cycle order (F / RB): tighter -> the tuned standard -> wider.
					{ name: 'Close', distMul: 0.68, heightMul: 0.82 },
					{ name: 'Standard', distMul: 1, heightMul: 1 },
					{ name: 'Far', distMul: 1.5, heightMul: 1.35 }
				];
				let camViewIdx = 1; // Standard by default.
				const cycleCameraView = () => {
					camViewIdx = (camViewIdx + 1) % CAMERA_VIEWS.length;
					cameraView = CAMERA_VIEWS[camViewIdx].name;
				};
				// Free-look: mouse drag over the track orbits the camera around the
				// car (yaw radians + a pitch height offset), easing back to neutral
				// when the drag ends. Never changes the follow distance/smoothing.
				let panYaw = 0;
				let panPitch = 0;
				let panDragging = false;
				let panLastX = 0;
				let panLastY = 0;
				// Look-back: a held glance behind. lookBackF eases 0..1 toward the
				// held state; the camera swings from behind the car to in front of
				// it (looking back over the tail), arcing up at the midpoint.
				let lookBackF = 0;
				// Headless/debug override: forces look-back regardless of input.
				let lookBackForce = false;
				// Headless/debug drive override (Phase 9-fix-a verification): when set,
				// forces the human player's controls so a scripted drive can hold full
				// throttle in a straight line and measure lift/downforce deterministically.
				// null = normal keyboard/gamepad input. Never touches AI rigs.
				let debugHold: { thr: number; steer: number; brk: number; hbk: boolean } | null = null;
				// Headless/debug flat-ground DYNO (Phase 9-fix-a verification): when on,
				// the player is translated back to the spawn's x/z each frame AFTER the
				// step, keeping y / orientation / velocity untouched, so on a FLAT track
				// (plane at y 0) the wheel raycasts and suspension are physically
				// identical — the car accelerates in place to true terminal speed
				// without a track feature (cliff / braking gate) ever cutting the run,
				// which is the only way to measure the sustained 60-85 m/s band. Only
				// valid on a flat track; never used in normal play.
				let dynoOn = false;
				let dynoAnchor: { x: number; z: number } | null = null;

				resetRound = () => {
					const wantAis = Math.max(1, Math.min(MAX_AI, Math.round(num(tuning.aiCount, DEFAULTS.aiCount))));
					if (wantAis !== ais.length) buildAis(wantAis);
					// Re-derive the qualifying grid before seating: a changed AI count
					// regenerated the AI times, and the player's time is re-read from
					// the prop. assignGrid updates each rig's `.spawn`, which the seat
					// loop below then applies (idempotent — assignGrid also seats).
					player.qualMs = playerQualFromProp();
					assignGrid();
					for (const r of rigsAll()) {
						r.combat.reset(poolsForBuild(r.archetype, r.buildStats));
						restoreRigCondition(r);
						r.tracker.reset();
						r.body.position.set(r.spawn.x, seatY(r.spawn.x, r.spawn.z, r.spawn.warmIdx), r.spawn.z);
						r.body.quaternion.copy(quatFor(r.spawn.headingDeg));
						r.body.velocity.setZero();
						r.body.angularVelocity.setZero();
						r.steerCurrent = 0;
						r.hbEngage = 0;
						r.tractionEase = 1;
						r.flashUntil = 0;
						r.smokeAcc = 0;
						r.dripAcc = 0;
						r.dustAcc = 0;
						r.preVx = 0;
						r.preVz = 0;
						r.drafting = false;
						r.draftFactor = 0;
						r.draftPrev = false;
						r.flipAcc = 0;
						r.fallAcc = 0;
						r.boostUntilMs = 0;
						r.boostMul = 1;
						r.zoneInside.fill(false);
						r.zoneRearmMs.fill(0);
						r.pitFxMs = 0;
						// Wipe the compounding crumple, then re-seat the pristine hull.
						if (r.dentAccum.length) r.dentAccum.fill(0);
						applyDentStage(r, 0);
						r.warmIdx = r.spawn.warmIdx;
						r.warmPath = 0;
						r.routeUsed = 'main';
						r.lastOnRibbon = true;
						r.prevX = r.spawn.x;
						r.prevZ = r.spawn.z;
						r.finished = false;
						r.finishPos = 0;
						r.raceStartMs = null;
						r.finishAtMs = null;
						r.locks = { weaponPrimary: null, weaponSecondary: null };
						r.abilityState.reset();
					}
					resetTestStats();
					clearProjectiles();
					clearCaltrops();
					lockRing.visible = false;
					playerLockedPrev = false;
					for (const s of slicks) removeSlickVis(s.id);
					slicks.length = 0;
					for (const tv of tethers) removeTetherVis(tv);
					tethers.length = 0;
					for (const b of beams) scene.remove(b.mesh);
					beams.length = 0;
					pendingRams = [];
					trauma = 0;
					finishOrder = [];
					playerRaceStartMs = null;
					finishReported = false;
					roundOver = false;
					banner = '';
					styleGates(0);
					syncHud();
					hud.currentMs = null;
					// Re-arm the start countdown: controls stay locked until GO.
					raceStartAtMs = gameNow() + COUNTDOWN_SEC * 1000;
					countText = '';
				};

				// Held-key reset used when the pause menu takes focus (declared up
				// top so setPaused can reach it; see the pause block).
				clearHeldKeys = () => keys.clear();

				const onKeyDown = (e: KeyboardEvent) => {
					// A modal above us owns the keyboard entirely (see inputBlocked).
					if (inputBlocked) return;
					// Never act on a key the player is TYPING. Textarea belongs here
					// as much as input/select does — the feedback box's message field
					// is a textarea, and Escape from it must close only that box.
					if (
						e.target instanceof HTMLInputElement ||
						e.target instanceof HTMLSelectElement ||
						e.target instanceof HTMLTextAreaElement ||
						(e.target instanceof HTMLElement && e.target.isContentEditable)
					)
						return;
					// Escape is deliberately NOT a rebindable action: it is the
					// universal modal key here, exactly as in GreenlineSettings.
					// Escape steps back one layer at a time — the parent's feedback
					// box (if it is open, it swallows the key before this listener
					// ever sees it), then the pause menu, then nothing.
					if (e.code === 'Escape') {
						e.preventDefault();
						setPaused(!paused);
						return;
					}
					// While paused, no driving or weapon input reaches the sim.
					if (paused) return;
					const action = actionForKey(e.code);
					if (!action) return;
					// Any BOUND key is swallowed (a remapped Space or '/' must not
					// scroll or open the browser's quick find).
					e.preventDefault();
					if (ACTION_KIND[action] === 'edge') {
						if (action === 'resetRound') resetRound();
						else if (!e.repeat) {
							// EMP / oil / tether are equipped weapons now (Phase 8g): they fire
							// through the two weapon slots, not their own keys.
							if (action === 'fireWeaponPrimary') firePrimaryQueued = true;
							else if (action === 'fireWeaponSecondary') fireSecondaryQueued = true;
							else if (action === 'useAbilityPrimary') abilityPrimaryQueued = true;
							else if (action === 'useAbilitySecondary') abilitySecondaryQueued = true;
							else if (action === 'cycleCamera') cycleCameraView();
						}
						return;
					}
					keys.add(e.code);
				};
				const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
				const onBlur = () => {
					keys.clear();
					panDragging = false;
				};
				window.addEventListener('keydown', onKeyDown);
				window.addEventListener('keyup', onKeyUp);
				window.addEventListener('blur', onBlur);

				// ---- Mouse-drag free-look (Phase 9a) ----
				// Dragging over the track orbits the camera around the car; the
				// accumulated offset eases back to neutral once the drag ends (in
				// the chase-camera block). This is NOT a rebindable action -- it
				// reads the pointer directly -- and never touches the follow.
				const onPointerDown = (e: PointerEvent) => {
					if (inputBlocked || paused || e.button !== 0) return;
					panDragging = true;
					panLastX = e.clientX;
					panLastY = e.clientY;
					stage.setPointerCapture?.(e.pointerId);
				};
				const onPointerMove = (e: PointerEvent) => {
					if (!panDragging) return;
					const sens = num(tuning.camPanSens, DEFAULTS.camPanSens);
					const yawMax = num(tuning.camPanYawMax, DEFAULTS.camPanYawMax);
					const pitchMax = num(tuning.camPanPitchMax, DEFAULTS.camPanPitchMax);
					// Drag right -> orbit right (camera swings to the car's left),
					// drag up -> lift. Clamp so free-look can never invert or spin.
					panYaw = Math.max(-yawMax, Math.min(yawMax, panYaw - (e.clientX - panLastX) * sens));
					panPitch = Math.max(
						-pitchMax,
						Math.min(pitchMax, panPitch + (e.clientY - panLastY) * sens * 600)
					);
					panLastX = e.clientX;
					panLastY = e.clientY;
				};
				const endPointer = () => {
					panDragging = false;
				};
				stage.addEventListener('pointerdown', onPointerDown);
				stage.addEventListener('pointermove', onPointerMove);
				stage.addEventListener('pointerup', endPointer);
				stage.addEventListener('pointercancel', endPointer);
				stage.addEventListener('pointerleave', endPointer);

				// ---- Resize ----
				const ro = new ResizeObserver(() => {
					const w = stage.clientWidth;
					const h = Math.max(1, stage.clientHeight);
					renderer.setSize(w, h, false);
					camera.aspect = w / h;
					camera.updateProjectionMatrix();
				});
				ro.observe(stage);

				// ---- Chase camera state ----
				const spawnDir = headingToDir(track.spawn.headingDeg);
				camera.position.set(
					track.spawn.x - spawnDir.x * tuning.camDistance,
					tuning.camHeight,
					track.spawn.z - spawnDir.z * tuning.camDistance
				);
				camera.lookAt(track.spawn.x, 1, track.spawn.z);
				const camPos = new THREE.Vector3().copy(camera.position);
				const camLook = new THREE.Vector3(track.spawn.x, 1, track.spawn.z);
				const fwdWorld = new THREE.Vector3();
				const rightWorld = new THREE.Vector3();
				const upWorld = new THREE.Vector3();
				const tmpQuat = new THREE.Quaternion();

				let lastT = gameNow();
				let frame = 0;

				// Dev-only debug handle for poking the sim from the console.
				const teleportRig = (rig: Rig, x: number, z: number, headingDeg: number, speed = 0) => {
					const d = headingToDir(headingDeg);
					rig.body.position.set(x, seatY(x, z), z);
					rig.body.quaternion.copy(quatFor(headingDeg));
					rig.body.velocity.set(d.x * speed, 0, d.z * speed);
					rig.body.angularVelocity.setZero();
					rig.flipAcc = 0;
				};
				// Fire whichever equipped slot holds a weapon matching `match` (Phase
				// 8g dev hooks for EMP / oil / tether, which are equipment now).
				const fireEquippedByCategory = (
					rigId: string,
					match: (d: WeaponDef) => boolean
				): boolean => {
					const r = rigsAll().find((q) => q.id === rigId);
					if (!r) return false;
					const slot = WEAPON_SLOTS.find((sl) => {
						const d = weaponById(r.weapons[sl]);
						return d ? match(d) : false;
					});
					return slot ? performWeaponFire(r, slot) : false;
				};
				(window as unknown as Record<string, unknown>).__greenline = {
					world,
					player,
					getAis: () => ais,
					getRigs: () => rigsAll(),
					rt,
					// Phase 8e/8f introspection. `pauseInfo` exposes the sim-clock
					// offset so a scripted drive can assert that a pause really did
					// stop time rather than merely hiding it.
					setPaused: (on: boolean) => setPaused(on),
					isPaused: () => paused,
					pauseInfo: () => ({
						paused,
						pausedAccumMs: Math.round(pausedAccumMs),
						gameNow: Math.round(gameNow()),
						realNow: Math.round(performance.now())
					}),
					trackInfo: () => ({
						id: track.id,
						name: track.name,
						paths: rt.paths.length,
						routes: rt.routes.length,
						branches: (track.surface.branches ?? []).map((b) => b.id)
					}),
					getRoute: (rigId = 'player') =>
						rigsAll().find((q) => q.id === rigId)?.routeUsed ?? null,
					// Phase 8a introspection: the local track-surface height (0 on
					// flat tracks) and the trigger-zone state.
					surfaceY: (x: number, z: number) => surfaceYAt(rt, x, z),
					getZones: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						const now = gameNow();
						return {
							zones: rt.zones,
							rig: r
								? {
										inside: [...r.zoneInside],
										boostActive: now < r.boostUntilMs,
										boostMul: r.boostMul,
										boostLeftMs: Math.max(0, Math.round(r.boostUntilMs - now)),
										oiled: r.combat.isOiled(now)
									}
								: null
						};
					},
					teleport: (x: number, z: number, h: number, v = 0) => teleportRig(player, x, z, h, v),
					teleportRig: (id: string, x: number, z: number, h: number, v = 0) => {
						const r = rigsAll().find((q) => q.id === id);
						if (r) teleportRig(r, x, z, h, v);
					},
					resetRound: () => resetRound(),
					// Roll a rig over in place (default fully upside down) so the
					// flip-recovery watchdog can be exercised from a script.
					flip: (rigId = 'player', rollDeg = 180) => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return false;
						const roll = new CANNON.Quaternion();
						roll.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), (rollDeg * Math.PI) / 180);
						r.body.quaternion.mult(roll, r.body.quaternion);
						r.body.position.y = seatY(r.body.position.x, r.body.position.z) - 0.1;
						r.body.velocity.setZero();
						r.body.angularVelocity.setZero();
						return true;
					},
					// World Y of a rig's local up axis (1 upright, -1 upside down).
					upY: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? r.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y : null;
					},
					// EMP / oil / tether are equipped weapons now (Phase 8g): these dev
					// hooks fire whichever slot holds the matching weapon, returning false
					// when the rig has not equipped one — the "genuinely cannot use it
					// unless equipped" contract, exercisable headlessly.
					fire: (rigId = 'player') =>
						fireEquippedByCategory(rigId, (d) => d.category === 'disruption'),
					oil: (rigId = 'player') =>
						fireEquippedByCategory(rigId, (d) => d.category === 'area' && !!d.oil),
					tether: (rigId = 'player') =>
						fireEquippedByCategory(rigId, (d) => d.category === 'tether'),
					damage: (rigId: string, amount: number, zone: HitZone = 'front') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const res = r.combat.applyDamage(
							amount,
							'debug',
							mode,
							combatTuning(),
							gameNow(),
							zone
						);
						// Synthesize an attack origin on the struck side so the zone
						// feedback (plate strips, bursts) lands where a shot would.
						const p = r.body.position;
						const sx = zone === 'front' ? p.x + r.hx * 6 : zone === 'rear' ? p.x - r.hx * 6 : p.x - r.hz * 6;
						const sz = zone === 'front' ? p.z + r.hz * 6 : zone === 'rear' ? p.z - r.hz * 6 : p.z + r.hx * 6;
						afterDamage(r, res, 'DEBUG', sx, sz);
						return res;
					},
					getPools: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const c = r.combat;
						return {
							armor: c.armorHealth,
							armorMax: c.maxArmor,
							chassis: c.chassisHealth,
							chassisMax: c.maxChassis,
							mount: c.mountHealth,
							mountMax: c.maxMount,
							mountDown: c.mountDown
						};
					},
					// Phase 6a structural-damage introspection: the compounding-crumple
					// magnitude, plate/connector visibility, and the material-object
					// wiring (connectors share the per-rig materials the damage system
					// mutates), so the visuals are verifiable structurally, not by eye.
					getDamageVis: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						let crumpleMag = 0;
						let crumpleMax = 0;
						for (const v of r.dentAccum) {
							const a = Math.abs(v);
							crumpleMag += a;
							if (a > crumpleMax) crumpleMax = a;
						}
						const armorChildren = r.parts.armor.children;
						const armorPlates = armorChildren.filter((c) => c.userData.connector !== 'armor');
						const armorConns = armorChildren.filter((c) => c.userData.connector === 'armor');
						const mountConns: InstanceType<typeof THREE.Object3D>[] = [];
						for (const sg of r.parts.mount.children)
							for (const c of sg.children)
								if (c.userData.connector === 'mount') mountConns.push(c);
						const matchAll = (
							arr: InstanceType<typeof THREE.Object3D>[],
							mat: InstanceType<typeof THREE.Material>
						) =>
							arr.length > 0 &&
							arr.every((m) => (m as InstanceType<typeof THREE.Mesh>).material === mat);
						return {
							dentStage: r.dentStage,
							crumpleMag: Math.round(crumpleMag * 1000) / 1000,
							crumpleMax: Math.round(crumpleMax * 1000) / 1000,
							armorPlatesVisible: armorPlates.filter((p) => p.visible).length,
							armorPlatesTotal: armorPlates.length,
							armorConnectorsVisible: armorConns.filter((p) => p.visible).length,
							armorConnectorsTotal: armorConns.length,
							mountConnectorsTotal: mountConns.length,
							mountDead: r.mountDead,
							mountConnectorsUseMountMat: matchAll(mountConns, r.mountMat),
							armorConnectorsUseHullMat: matchAll(armorConns, r.bodyMat)
						};
					},
					setMode: (m: GreenlineMode) => {
						mode = m;
						resetRound();
						return mode;
					},
					// ---- Weather (Phase 8c) ----
					// Drives the SAME store the settings selector writes, so a
					// scripted drive exercises the real path end to end.
					setWeather: (id: EnvPresetId) => {
						setWeatherPreset(id);
						return weatherSettings.preset;
					},
					getWeather: () => ({
						id: ENV.id,
						selected: weatherSettings.preset,
						fogDensity: sceneFog.density,
						fogColor: `#${sceneFog.color.getHexString()}`,
						hemiIntensity: hemiLight.intensity,
						keyLights: keyLightObjs.map((k) => k.intensity),
						flood: ENV.floodIntensity,
						floodApplied: floodAppliedMul,
						rainVisible: rainMesh.visible,
						rainDrawn: rainGeo.drawRange.count / 2,
						rainOpacity: rainMat.opacity,
						lightning: !!ENV.lightning,
						flashIntensity: flashLight.intensity
					}),
					// Chase-camera geometry vs the speed driving it (Phase 8c),
					// plus the active view / free-look / look-back state (Phase 9a).
					camInfo: () => {
						const v = player.body.velocity;
						return {
							speedMs: Math.hypot(v.x, v.y, v.z),
							// Planar distance camera-to-car: the pull-back the player sees.
							distance: Math.hypot(
								camera.position.x - player.carGroup.position.x,
								camera.position.z - player.carGroup.position.z
							),
							height: camera.position.y - player.carGroup.position.y,
							view: CAMERA_VIEWS[camViewIdx].name,
							viewIndex: camViewIdx,
							lookBack: lookBackF,
							panYaw,
							panPitch
						};
					},
					// ---- Camera controls (Phase 9a) ----
					// Drive the SAME view cycle / look-back / free-look the player uses, so a
					// headless test can exercise them without a real key or mouse.
					cycleCamera: () => {
						cycleCameraView();
						return CAMERA_VIEWS[camViewIdx].name;
					},
					setCameraView: (i: number) => {
						camViewIdx = ((i % CAMERA_VIEWS.length) + CAMERA_VIEWS.length) % CAMERA_VIEWS.length;
						cameraView = CAMERA_VIEWS[camViewIdx].name;
						return CAMERA_VIEWS[camViewIdx].name;
					},
					lookBack: (on: boolean) => {
						lookBackForce = !!on;
						return lookBackForce;
					},
					setPan: (yaw: number, pitch = 0) => {
						const yawMax = num(tuning.camPanYawMax, DEFAULTS.camPanYawMax);
						const pitchMax = num(tuning.camPanPitchMax, DEFAULTS.camPanPitchMax);
						panYaw = Math.max(-yawMax, Math.min(yawMax, yaw));
						panPitch = Math.max(-pitchMax, Math.min(pitchMax, pitch));
						// Hold the offset so a scripted read sees it before recenter kicks in.
						panDragging = true;
						return { panYaw, panPitch };
					},
					releasePan: () => {
						panDragging = false;
					},
					// Handbrake drift engagement + achievable lateral slip, for re-measuring
					// the Phase 5a drift-meter thresholds against the new feel.
					driftInfo: () => {
						const vel = player.body.velocity;
						const lat = Math.abs(vel.x * -player.hz + vel.z * player.hx);
						return {
							hbEngage: player.hbEngage,
							lateralMs: lat,
							speedMs: Math.hypot(vel.x, vel.y, vel.z),
							meter: player.abilityState.meter
						};
					},
					// Frame cost over the rolling window: mean / median / p95 / worst
					// CPU ms per frame, against the 16.7ms 60fps budget. Used to size
					// MAX_AI against a real measurement rather than a guess.
					perf: () => {
						const n = perfFilled;
						if (!n) return null;
						const v = Array.from(perfSamples.slice(0, n)).sort((a, b) => a - b);
						const mean = v.reduce((a, b) => a + b, 0) / n;
						return {
							ais: ais.length,
							vehicles: ais.length + 1,
							frames: perfFrames,
							samples: n,
							meanMs: +mean.toFixed(2),
							medianMs: +v[Math.floor(n / 2)].toFixed(2),
							p95Ms: +v[Math.floor(n * 0.95)].toFixed(2),
							worstMs: +v[n - 1].toFixed(2),
							budgetPct60: +((mean / (1000 / 60)) * 100).toFixed(1),
							drawCalls: renderer.info.render.calls,
							triangles: renderer.info.render.triangles
						};
					},
					perfReset: () => {
						perfIdx = 0;
						perfFilled = 0;
						perfFrames = 0;
					},
					getSlicks: () => slicks,
					getTethers: () => tethers.map((tv) => tv.t),
					getLoadout: () => playerLoadout,
					setArchetype: (id: ArchetypeId) => selectArchetype(id),
					equip: (slot: PartSlot, partId: string) => equipPart(slot, partId),
					// ---- Mount sockets (Phase 4c) ----
					setSocket: (slot: WeaponSlotId, socket: WeaponSocketId) =>
						setWeaponSocket(slot, socket),
					getSockets: () => resolveWeaponSockets(playerLoadout),
					// ---- Livery cosmetics (Phase 6b) ----
					setCosmetic: (patch: Partial<Cosmetics>) => {
						setCosmetic(patch);
						return playerLoadout.cosmetics ?? null;
					},
					// 6c: make a decal ref resolvable from a scripted drive (the
					// pages register real signed URLs; a harness registers a
					// data: URL), so the custom-decal texture path is verifiable
					// headless.
					registerDecalImage: (ref: string, url: string | null) => registerDecalImage(ref, url),
					getCosmetics: () => playerLoadout.cosmetics ?? null,
					// Structural livery introspection for headless verification: the
					// resolved body color, whether a decal texture is live, and the
					// scorch base the damage lerp reads from.
					getLivery: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						let numberQuads = 0;
						for (const c of r.parts.chassis.children) if (c.userData.numberDecal) numberQuads++;
						return {
							cosmetics: r === player ? (playerLoadout.cosmetics ?? null) : null,
							baseColor: '0x' + (r.baseColor >>> 0).toString(16),
							bodyColor: '0x' + (r.bodyMat.color.getHex() >>> 0).toString(16),
							hasPatternDecal: !!r.bodyDecalMat,
							decalUsesMap: !!(r.bodyDecalMat && r.bodyDecalMat.map),
							bodyMeshUsesDecal: !!(r.bodyDecalMat && r.bodyMesh.material === r.bodyDecalMat),
							decalColor: r.bodyDecalMat ? '0x' + (r.bodyDecalMat.color.getHex() >>> 0).toString(16) : null,
							numberQuads,
							// Custom decal (6c): the equipped ref + its image's load state
							// in the module registry.
							customDecal: r === player ? (playerLoadout.cosmetics?.decal ?? null) : null,
							customDecalImage:
								r === player && playerLoadout.cosmetics?.decal
									? decalImageState(playerLoadout.cosmetics.decal)
									: null
						};
					},
					// ---- Equipped-weapon drive hooks (Phase 4a) ----
					fireWeapon: (rigId = 'player', slot: WeaponSlotId = 'weaponPrimary') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? performWeaponFire(r, slot) : false;
					},
					getWeapons: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? { ...r.weapons } : null;
					},
					getLocks: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r
							? {
									weaponPrimary: r.locks.weaponPrimary ? { ...r.locks.weaponPrimary } : null,
									weaponSecondary: r.locks.weaponSecondary ? { ...r.locks.weaponSecondary } : null
								}
							: null;
					},
					// AI target ranking for one rig's slot (Phase 9d-ii-a): the scored,
					// best-first candidate list the fire decision actually reads, plus the
					// threshold that shot has to clear. Verification only - reading it
					// changes nothing, and a rig with no AiDriver returns null.
					aiTargets: (rigId = 'ai-1', slot: WeaponSlotId = 'weaponPrimary') => {
						const r = rigsAll().find((q) => q.id === rigId);
						const def = r ? weaponById(r.weapons[slot]) : undefined;
						if (!r?.ai || !def) return null;
						const nowMs = gameNow();
						const aggr = aiSkill().aggression;
						const cands = r.ai.scoreTargets(
							combatantOf(r),
							rigsAll().map(combatantOf),
							def,
							nowMs,
							aggr
						);
						return {
							weapon: def.id,
							threshold: fireThreshold(def, aggr),
							locked: r.locks[slot]?.targetId ?? null,
							candidates: cands.map((c) => ({
								id: c.target.id,
								score: c.score,
								dist: c.dist,
								aimDot: c.aimDot,
								chassis: c.target.combat.chassisHealth,
								armor: c.target.combat.armorHealth,
								mount: c.target.combat.mountHealth
							}))
						};
					},
					getProjectiles: () => projectiles.map((p) => ({ ...p })),
					getCaltrops: () => caltropFields.map((f) => ({ ...f, nextHitMs: { ...f.nextHitMs } })),
					// Defensive-weapon state for the 4b-ii verification drives: shield
					// pool + active window, blades active window, and the jammer's
					// lock-rate multiplier applied against this vehicle.
					getDefense: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const c = r.combat;
						const nowMs = gameNow();
						return {
							shieldActive: c.shieldActive(nowMs),
							shieldHealth: c.shieldHealth,
							maxShield: c.maxShield,
							shieldMsLeft: Math.max(0, c.shieldUntilMs - nowMs),
							bladesActive: c.bladesActive(nowMs),
							bladesMsLeft: Math.max(0, c.bladesUntilMs - nowMs),
							jammerLockMul: c.jammerLockMul
						};
					},
					getBuildStats: (rigId = 'player') =>
						rigsAll().find((q) => q.id === rigId)?.buildStats ?? null,
					// ---- Abilities (Phase 5a) ----
					// Activate an equipped ability slot (the player-key path, scripted).
					useAbility: (rigId = 'player', slot: AbilitySlotId = 'abilityPrimary') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? performAbility(r, slot) : false;
					},
					// The equipped ability pair + live meter / effect windows.
					getAbilities: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const nowMs = gameNow();
						return {
							equipped: { ...r.abilities },
							meter: r.abilityState.meter,
							nitroActive: r.abilityState.nitroActive(nowMs),
							nitroMsLeft: Math.max(0, r.abilityState.nitroUntilMs - nowMs),
							gripActive: r.abilityState.gripActive(nowMs),
							gripMsLeft: Math.max(0, r.abilityState.gripUntilMs - nowMs)
						};
					},
					// Airborne state (Phase 8d): wheel contacts + the dwell that
					// gates Air Correction, and whether the window is live.
					getAir: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						return {
							wheelContacts: r.wheelContacts,
							airborneSec: +r.airborneSec.toFixed(3),
							groundedSec: +r.groundedSec.toFixed(3),
							airborne: rigAirborne(r),
							windowActive: r.abilityState.airActive(gameNow()),
							rollTorque: r.abilityState.airRollTorque,
							pitchTorque: r.abilityState.airPitchTorque
						};
					},
					getMeter: (rigId = 'player') =>
						rigsAll().find((q) => q.id === rigId)?.abilityState.meter ?? null,
					// ---- Downforce / lift verification (Phase 9-fix-a) ----
					// Force the human player's controls (thr/steer/brk in [-1,1] where
					// used, hbk bool); pass null to release. Lets a headless drive hold
					// full throttle in a straight line to measure lift deterministically.
					hold: (h: { thr?: number; steer?: number; brk?: number; hbk?: boolean } | null) => {
						debugHold = h
							? { thr: h.thr ?? 0, steer: h.steer ?? 0, brk: h.brk ?? 0, hbk: !!h.hbk }
							: null;
						return debugHold;
					},
					// Verification only: override the global baseline downforce
					// coefficient (DEFAULTS.aeroDownforce) so an A/B can compare the
					// fix against the pre-fix zero-downforce behavior. Pass null to
					// restore the default.
					setDownforce: (coef: number | null) => {
						tuning.aeroDownforce = coef == null ? DEFAULTS.aeroDownforce : coef;
						return tuning.aeroDownforce;
					},
					// ---- Traction limiting (Phase 9-fix-e) ----
					// What the tires can take vs what the driver is asking for, per
					// rig: the standing-start cap (1 = the limiter never binds on this
					// build), the live cap at the current speed, the eased factor
					// actually multiplying drive force, and the speed above which the
					// limiter releases entirely.
					tractionInfo: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const r2 = (v: number) => Math.round(v * 100) / 100;
						const bs = r.buildStats;
						const mass = num(tuning.chassisMass, DEFAULTS.chassisMass) * bs.chassisMass;
						const driveAccel =
							(num(tuning.engineForce, DEFAULTS.engineForce) * bs.engineForce) /
							Math.max(1, mass);
						const dragDecel =
							(num(tuning.aeroDrag, DEFAULTS.aeroDrag) * bs.aeroDrag) / Math.max(1, mass);
						const budget = num(tuning.tractionAccel, DEFAULTS.tractionAccel) * bs.frictionSlip;
						const v = Math.hypot(r.body.velocity.x, r.body.velocity.y, r.body.velocity.z);
						// v where (budget + drag*v^2) / drive = 1, i.e. the cap reaches
						// full throttle and the limiter stops binding for good.
						const releaseAt =
							driveAccel > budget && dragDecel > 0
								? Math.sqrt((driveAccel - budget) / dragDecel)
								: 0;
						return {
							id: r.id,
							archetype: r.archetype,
							driveAccel: r2(driveAccel),
							tractionBudget: r2(budget),
							capAtRest: r2(Math.min(1, budget / Math.max(0.001, driveAccel))),
							capNow: r2(Math.min(1, (budget + dragDecel * v * v) / Math.max(0.001, driveAccel))),
							ease: Math.round(r.tractionEase * 1000) / 1000,
							limiting: r.tractionEase < 1,
							speedMs: r2(v),
							releaseAtMs: r2(releaseAt),
							limitedFrames: testStats.tractionLimitedFrames
						};
					},
					// Verification only: override the traction budget so a scripted
					// drive can A/B the limiter, the setDownforce / setFloorBand
					// convention. A large value (e.g. 999) restores the pre-fix
					// uncapped behaviour exactly; null restores the default.
					setTraction: (accel: number | null) => {
						tuning.tractionAccel = accel == null ? DEFAULTS.tractionAccel : accel;
						return tuning.tractionAccel;
					},
					// Chassis-floor band (Phase 9-fix-c). 0 restores the pre-fix
					// behaviour — a chassis with no wheel on the ribbon falls straight
					// through an elevated span — so a scripted drive can A/B the floor
					// the same way setDownforce A/Bs the aero.
					setFloorBand: (m: number | null) => {
						tuning.chassisFloorBand = m == null ? DEFAULTS.chassisFloorBand : m;
						return tuning.chassisFloorBand;
					},
					// ---- AI speed derivation (Phase 9d-i) ----
					// Every rig's RESOLVED driving targets beside the terminal speed
					// its physics actually produces, so a scripted drive can assert
					// that the AI's straight-line target IS its car's capability (the
					// staleness this replaced is exactly a divergence between those two
					// columns). `speedFrac` is the one deliberate handicap knob.
					aiSpeedInfo: () => {
						const r2 = (v: number) => Math.round(v * 100) / 100;
						return {
							speedFrac: num(tuning.aiSpeedFrac, DEFAULTS.aiSpeedFrac),
							cornerAccel: num(tuning.aiCorner, DEFAULTS.aiCorner),
							brakeAccel: AI_DEFAULTS.brakeAccel,
							rigs: rigsAll().map((r) => {
								const s = r.buildStats;
								const eng = num(tuning.engineForce, DEFAULTS.engineForce) * s.engineForce;
								const drg = num(tuning.aeroDrag, DEFAULTS.aeroDrag) * s.aeroDrag;
								const t = aiTuningForRig(r, aiSkill());
								return {
									id: r.id,
									archetype: r.archetype,
									ai: !!r.ai,
									// What the PHYSICS gives this car (the garage's hero number).
									physicsTopSpeed: r2(Math.sqrt(eng / Math.max(0.01, drg))),
									// What the DRIVER aims for. These must track each other.
									aiTopSpeed: r2(t.topSpeed),
									aiCornerAccel: r2(t.cornerAccel),
									aiDragDecel: Math.round((t.dragDecel ?? 0) * 1e5) / 1e5,
									// Full-throttle drive accel vs what the tires can take, and
									// the resulting standing-start throttle cap (1 = no cap).
									driveAccel: r2(t.driveAccel ?? 0),
									tractionAccel: r2(t.tractionAccel ?? 0),
									throttleCapAtRest: r2(
										t.driveAccel ? Math.min(1, (t.tractionAccel ?? 0) / t.driveAccel) : 1
									)
								};
							})
						};
					},
					// Verification only: override the AI skill knobs so a scripted
					// drive can A/B a cornerAccel sweep, or restore the pre-9d-i flat
					// straight-line handicap via speedFrac. null restores the default.
					setAiSkill: (skill: { speedFrac?: number | null; cornerAccel?: number | null }) => {
						if (skill.speedFrac !== undefined)
							tuning.aiSpeedFrac =
								skill.speedFrac == null ? DEFAULTS.aiSpeedFrac : skill.speedFrac;
						if (skill.cornerAccel !== undefined)
							tuning.aiCorner = skill.cornerAccel == null ? DEFAULTS.aiCorner : skill.cornerAccel;
						return { speedFrac: tuning.aiSpeedFrac, cornerAccel: tuning.aiCorner };
					},
					// Handbrake yaw authority (Phase 9-fix-d). Passing damp 0 restores
					// the pre-fix behaviour exactly (an unbounded yaw spike), so a
					// scripted drive can A/B the fix the same way setDownforce and
					// setFloorBand A/B theirs. null on either arg restores its default.
					setHandbrakeYaw: (max: number | null, damp: number | null) => {
						tuning.handbrakeYawMax = max == null ? DEFAULTS.handbrakeYawMax : max;
						tuning.handbrakeYawDamp = damp == null ? DEFAULTS.handbrakeYawDamp : damp;
						return {
							max: tuning.handbrakeYawMax,
							damp: tuning.handbrakeYawDamp
						};
					},
					// Verification only: flat-ground dyno. Pins the player in place after
					// each step (velocity/orientation/suspension intact) so it reaches
					// true terminal speed on a FLAT track without a feature cutting the
					// run. Combine with hold({thr:1}) to spin the dyno up.
					dyno: (on = true) => {
						dynoOn = on;
						dynoAnchor = null;
						return dynoOn;
					},
					// Live downforce + lift readout for a rig: the applied downward force,
					// the nose pitch (positive = nose UP = lifting), and per-wheel ground
					// contact + suspension load (front wheels are 0,1; rear 2,3). Front
					// lift shows as a positive pitch and/or the front suspensionForce
					// dropping toward 0 while the rears stay loaded.
					downforceInfo: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const b = r.body;
						const q = new CANNON.Quaternion(
							b.quaternion.x,
							b.quaternion.y,
							b.quaternion.z,
							b.quaternion.w
						);
						const f = q.vmult(new CANNON.Vec3(1, 0, 0));
						const speed = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
						const coef = num(tuning.aeroDownforce, DEFAULTS.aeroDownforce) * r.buildStats.aeroDown;
						const grounded = r.vehicle.numWheelsOnGround > 0;
						const totalDown = grounded ? coef * speed * speed : 0;
						const wheels = r.vehicle.wheelInfos.map((w) => ({
							onGround: !!w.raycastResult.body,
							suspForce: Math.round(w.suspensionForce),
							suspLen: Math.round(w.suspensionLength * 1000) / 1000
						}));
						const frontLoad = (wheels[0]?.suspForce ?? 0) + (wheels[1]?.suspForce ?? 0);
						const rearLoad = (wheels[2]?.suspForce ?? 0) + (wheels[3]?.suspForce ?? 0);
						return {
							speed: Math.round(speed * 100) / 100,
							aeroDownCoef: Math.round(coef * 1000) / 1000,
							downforceN: Math.round(totalDown),
							bias: num(tuning.downforceFrontBias, DEFAULTS.downforceFrontBias),
							// Nose pitch in degrees: +up (lift), -down. asin of forward.y.
							pitchDeg:
								Math.round(Math.asin(Math.max(-1, Math.min(1, f.y))) * (180 / Math.PI) * 100) /
								100,
							numWheelsOnGround: r.vehicle.numWheelsOnGround,
							frontLoad,
							rearLoad,
							wheels
						};
					},
					// Set the drift meter directly (0..1), so a scripted drive can
					// verify each ability's EFFECT without first drifting up a charge.
					setMeter: (v: number, rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (r) r.abilityState.meter = Math.max(0, Math.min(1, v));
						return r?.abilityState.meter ?? null;
					},
					// Equip an ability into a slot (the console-equip path, sanitized
					// like a garage pick since equipPart runs sanitizeLoadout).
					setAbility: (slot: AbilitySlotId, abilityId: string) => equipPart(slot, abilityId),
					getMode: () => mode,
					getFinishOrder: () => finishOrder.map((r) => r.id),
					isRoundOver: () => roundOver,
						// ---- Headless AI-only stress-test hooks ----
						// Attach/detach an AiDriver on the player rig so it races as a
						// 4th AI (see the drive + weapon branches, both no-op for a
						// normal no-AI player). Returns whether the player is now AI.
						enableAiPlayer: (on = true) => {
							player.ai = on ? new AiDriver(rt) : null;
							return !!player.ai;
						},
						// Assign archetypes (stock parts) across the whole field in
						// rig order [player, ai-1, ai-2, ...]; the runner rotates the
						// assignment each race so every archetype visits every grid
						// slot evenly, cancelling starting-position bias.
						setFieldArchetypes: (archs: ArchetypeId[]) => {
							const rigs = rigsAll();
							rigs.forEach((r, i) =>
								applyLoadoutToRig(r, defaultLoadout(archs[i % archs.length] ?? 'handling'))
							);
							return rigs.map((r) => ({ id: r.id, archetype: r.archetype }));
						},
						// Shorten races for the headless throughput runner (the sim is
						// real-time and cannot be fast-forwarded); default game is 3.
						setLapTarget: (n: number) => {
							tuning.lapTarget = Math.max(1, Math.round(n));
							return tuning.lapTarget;
						},
						// Grid size, clamped to MAX_AI. Applies on the reset it triggers
						// (rigs are built at round start), which is how aiCount always
						// behaved. Exists so a full-grid perf run stays scriptable now
						// that the live tuning panel is gone.
						setAiCount: (n: number) => {
							tuning.aiCount = Math.max(1, Math.min(MAX_AI, Math.round(n)));
							resetRound();
							return tuning.aiCount;
						},
						maxAi: () => MAX_AI,
						// ---- Qualifying grid (Phase 9b) ----
						// Inject a player qualifying time the dev harness has no
						// leaderboard to supply, then re-derive the grid. `null` = no
						// time (back of grid). Returns the resulting grid order.
						setPlayerQualifying: (ms: number | null) => {
							player.qualMs = typeof ms === 'number' && ms > 0 ? ms : NO_QUAL_MS;
							assignGrid();
							return gridSnapshot();
						},
						// The grid as assigned: one row per rig, ordered by slot (0 =
						// pole), with each rig's qualifying time and seated position, so a
						// test can assert both the ORDERING (by qual) and that the
						// physical LAYOUT (positions per slot) is unchanged.
						gridInfo: () => gridSnapshot(),
						// ---- Weapon arming (Phase 9-fix-b) ----
						// Per-rig arming state, so a scripted drive can assert that a car
						// on the grid is genuinely disarmed and that arming follows the
						// start-line crossing rather than the countdown clock: `armed` is
						// what the sim gates on, `timing` is the crossing signal it reads,
						// and `distFromGrid` is the safety-net fallback's input.
						armedInfo: () => {
							const now = gameNow();
							return {
								preGo: now < raceStartAtMs,
								toGoMs: Math.round(raceStartAtMs - now),
								armDistM: LAUNCH_ARM_DIST_M,
								rigs: rigsAll().map((r) => ({
									id: r.id,
									armed: weaponsArmed(r, now),
									timing: r.tracker.timing,
									distFromGrid: Math.round(
										Math.hypot(r.body.position.x - r.spawn.x, r.body.position.z - r.spawn.z) * 10
									) / 10
								}))
							};
						},
						// Per-round weapon / flip / fall / zone counters (reset by
						// resetRound).
						getTelemetry: () => ({
							fire: { ...testStats.fire },
							hit: { ...testStats.hit },
							ram: testStats.ram,
							flips: testStats.flips,
							flipsByRig: { ...testStats.flipsByRig },
							falls: testStats.falls,
							floorCatches: testStats.floorCatches,
							tractionLimitedFrames: testStats.tractionLimitedFrames,
							zone: { ...testStats.zone },
							ability: { ...testStats.ability },
							damageTaken: { ...testStats.damageTaken },
							damageDealt: { ...testStats.damageDealt },
							downs: { ...testStats.downs },
							pool: { ...testStats.pool },
							hitZone: { ...testStats.hitZone }
						}),
						// A full snapshot of the field: per-rig progress, finish
						// state, exact total race time, best lap, and upright-ness.
						raceState: () => {
							const now = gameNow();
							return {
								mode,
								lapTarget: Math.max(1, Math.round(num(tuning.lapTarget, DEFAULTS.lapTarget))),
								aiPlayer: !!player.ai,
								finishOrder: finishOrder.map((r) => r.id),
								allFinished: rigsAll().every((r) => r.finished),
								rigs: rigsAll().map((r) => ({
									id: r.id,
									archetype: r.archetype,
									laps: r.tracker.lapsCompleted,
									cp: r.tracker.nextCheckpoint,
									timing: r.tracker.timing,
									bestLapMs: r.tracker.bestLapMs === null ? null : Math.round(r.tracker.bestLapMs),
									lastLapMs: r.tracker.lastLapMs === null ? null : Math.round(r.tracker.lastLapMs),
									finished: r.finished,
									finishPos: r.finishPos,
									totalTimeMs:
										r.finishAtMs !== null && r.raceStartMs !== null
											? Math.round(r.finishAtMs - r.raceStartMs)
											: null,
									eliminated: r.combat.eliminated,
									down: r.combat.isDown(now),
									// hp stays the survivability number = CHASSIS (the
									// stress runner's field name is kept stable).
									hp: Math.round(r.combat.chassisHealth),
									armor: Math.round(r.combat.armorHealth),
									mount: Math.round(r.combat.mountHealth),
									mountDown: r.combat.mountDown,
									x: Math.round(r.body.position.x * 100) / 100,
									y: Math.round(r.body.position.y * 100) / 100,
									z: Math.round(r.body.position.z * 100) / 100,
									speed:
										Math.round(
											Math.hypot(r.body.velocity.x, r.body.velocity.y, r.body.velocity.z) * 100
										) / 100,
									drafting: r.drafting,
									draftFactor: Math.round(r.draftFactor * 1000) / 1000,
									upY:
										Math.round(r.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y * 1000) / 1000
								}))
							};
						},
					// One-frame render to a small JPEG data URL, for scripted
					// visual checks in a hidden/headless tab (where the on-screen
					// canvas never presents and pane screenshots cannot capture).
					capture: (width = 480, brightness = 1) => {
						renderer.render(scene, camera);
						const src = renderer.domElement;
						const c = document.createElement('canvas');
						c.width = width;
						c.height = Math.round((src.height / src.width) * width) || 1;
						const g2d = c.getContext('2d')!;
						if (brightness !== 1) g2d.filter = `brightness(${brightness})`;
						g2d.drawImage(src, 0, 0, c.width, c.height);
						return c.toDataURL('image/jpeg', 0.55);
					}
				};

				// Rolling ring buffer of per-frame CPU cost (see the write at the end
				// of tick). ~4s at 60fps, enough to average out a GC or a spawn spike.
				const perfSamples = new Float32Array(240);
				let perfIdx = 0;
				let perfFilled = 0;
				let perfFrames = 0;
				const tick = () => {
					// frameT0 is REAL time (this measures main-thread cost, which a
					// pause must not distort); `now` is the SIM clock, which does not
					// advance while paused.
					const frameT0 = performance.now();
					const now = gameNow();
					// Paused: render the frozen frame so the scene stays visible
					// behind the menu, but step nothing. The world is never advanced,
					// and because `now` is the paused clock, no stamp anywhere ages.
					if (paused) {
						renderer.render(scene, camera);
						return;
					}
					const dt = Math.min((now - lastT) / 1000, 0.05);
					lastT = now;
					frame++;
					const ct = combatTuning();
					const aiT = aiSkill();
					const all = rigsAll();

					// Race-start phases: controls locked until GO, ram suppressed
					// through GO + the grace window. Both apply to every vehicle.
					const preLaunch = now < raceStartAtMs;
					const ramGrace = now < raceStartAtMs + RAM_GRACE_SEC * 1000;

					// -- Player input (keyboard + first connected gamepad), every
					// lookup through the remappable control-settings bindings --
					let steerInput = (keyHeld('steerLeft') ? 1 : 0) - (keyHeld('steerRight') ? 1 : 0);
					let throttle = keyHeld('accelerate') ? 1 : 0;
					let brakeInput = keyHeld('brake') ? 1 : 0;
					let handbrake = keyHeld('handbrake');
					// Look-back is a held camera glance (read here so the pad OR can
					// fold in below); consumed later in the chase-camera block.
					let lookBackHeld = keyHeld('lookBack') || lookBackForce;

					const pads = navigator.getGamepads ? navigator.getGamepads() : [];
					const pad = Array.from(pads).find((p) => p && p.connected) ?? null;
					if (pad) {
						if (pad.id !== padName) padName = pad.id;
						const gp = controlSettings.gamepad;
						// Two half-axis reads on the default stick bindings reproduce
						// the old single signed-axis steer exactly (dead zone per side).
						const padSteer =
							padBindingValue(pad, gp.steerLeft) - padBindingValue(pad, gp.steerRight);
						if (Math.abs(padSteer) > Math.abs(steerInput)) steerInput = padSteer;
						throttle = Math.max(throttle, padBindingValue(pad, gp.accelerate));
						brakeInput = Math.max(brakeInput, padBindingValue(pad, gp.brake));
						handbrake = handbrake || padBindingHeld(pad, gp.handbrake);
						lookBackHeld = lookBackHeld || padBindingHeld(pad, gp.lookBack);
						for (const a of PAD_EDGE_ACTIONS) {
							const down = padBindingHeld(pad, gp[a]);
							if (down && !prevPadEdge[a]) {
								// EMP / oil / tether fire through the weapon slots now (Phase 8g).
								if (a === 'fireWeaponPrimary') firePrimaryQueued = true;
								else if (a === 'fireWeaponSecondary') fireSecondaryQueued = true;
								else if (a === 'useAbilityPrimary') abilityPrimaryQueued = true;
								else if (a === 'useAbilitySecondary') abilitySecondaryQueued = true;
								else if (a === 'resetRound') resetRound();
								else if (a === 'cycleCamera') cycleCameraView();
							}
							prevPadEdge[a] = down;
						}
					} else {
						if (padName) padName = '';
						for (const a of PAD_EDGE_ACTIONS) prevPadEdge[a] = false;
					}

					// -- Global physics tuning --
					world.gravity.set(0, -num(tuning.gravity, DEFAULTS.gravity), 0);

					// -- Slipstream / draft detection (universal, free, no equipment) --
					// One O(n^2) pass over every vehicle pair BEFORE the physics loop, so
					// the drag calc below just reads rig.drafting/draftFactor. Positions
					// are current; headings use each rig's stored hx/hz (last frame),
					// which is fine — heading barely moves per frame, and it sidesteps the
					// mid-loop ordering where later rigs have not refreshed hx/hz yet. The
					// SAME detection runs for the player and every AI, no opt-in.
					{
						const dMax = num(tuning.draftMaxDist, DEFAULTS.draftMaxDist);
						const dMin = num(tuning.draftMinDist, DEFAULTS.draftMinDist);
						const dHalf = num(tuning.draftHalfWidth, DEFAULTS.draftHalfWidth);
						const dAlign = num(tuning.draftAlignDot, DEFAULTS.draftAlignDot);
						const dMinSpd = num(tuning.draftMinSpeed, DEFAULTS.draftMinSpeed);
						const span = Math.max(0.001, dMax - dMin);
						for (const t of all) {
							let best = 0;
							// Only draft while actually moving forward at a real clip (this
							// also keeps the lined-up stationary grid from false-triggering).
							const tFwd =
								t.body.velocity.x * t.hx + t.body.velocity.z * t.hz;
							if (!preLaunch && tFwd >= dMinSpd && !t.combat.isOut(now)) {
								for (const l of all) {
									if (l === t || l.combat.isOut(now)) continue;
									const dx = l.body.position.x - t.body.position.x;
									const dz = l.body.position.z - t.body.position.z;
									// Forward distance to the leader along the trailer's heading.
									const ahead = dx * t.hx + dz * t.hz;
									if (ahead < dMin || ahead > dMax) continue;
									// Perpendicular offset: leader must sit in the wake corridor,
									// not off to one side (a car crossing your path).
									const lateral = Math.abs(dx * -t.hz + dz * t.hx);
									if (lateral > dHalf) continue;
									// Headings roughly agree, so an oncoming or crossing car is
									// never a tow (dot < 0 is oncoming, ~0 is crossing).
									const align = t.hx * l.hx + t.hz * l.hz;
									if (align < dAlign) continue;
									// Strength grows as the trailer tucks closer + more centered.
									const distF = (dMax - ahead) / span;
									const latF = 1 - lateral / dHalf;
									const f = Math.max(0, Math.min(1, distF)) * Math.max(0, Math.min(1, latF));
									if (f > best) best = f;
								}
							}
							t.drafting = best > 0;
							t.draftFactor = best;
							// Engage cue on the rising edge, player only (a sustained state
							// would spam if fired for the whole AI pack; the HUD cue is
							// player-only anyway). The EFFECT still applies to everyone.
							if (t === player && t.drafting && !t.draftPrev)
								draftSfx(t.body.position.x, t.body.position.z);
							t.draftPrev = t.drafting;
							if (t === player) hud.drafting = t.drafting;
						}
					}

					// -- Per-vehicle pipeline: identical for player and AI --
					for (const rig of all) {
						const body = rig.body;
						const recovered = rig.combat.tick(now);
						if (recovered === 'recovered') {
							// The RACE full heal restores all three pools, so the
							// bodywork comes back whole too: plates on, mount live.
							restoreRigCondition(rig);
							if (rig === player) flash('BACK IN — all systems restored');
						}

						// Panel baseline x this rig's build multipliers: the garage is
						// how a VEHICLE deviates from the global tuning surface.
						const bs = rig.buildStats;
						const mass = num(tuning.chassisMass, DEFAULTS.chassisMass) * bs.chassisMass;
						if (body.mass !== mass) {
							body.mass = mass;
							body.updateMassProperties();
						}
						for (const w of rig.vehicle.wheelInfos) {
							w.suspensionStiffness =
								num(tuning.suspensionStiffness, DEFAULTS.suspensionStiffness) *
								bs.suspensionStiffness;
							w.dampingCompression = num(tuning.dampingCompression, DEFAULTS.dampingCompression);
							w.dampingRelaxation = num(tuning.dampingRelaxation, DEFAULTS.dampingRelaxation);
							w.suspensionRestLength = num(
								tuning.suspensionRestLength,
								DEFAULTS.suspensionRestLength
							);
							w.maxSuspensionTravel = num(
								tuning.maxSuspensionTravel,
								DEFAULTS.maxSuspensionTravel
							);
							// Grip Surge ability multiplies tire bite for its window (1 when
							// inactive), on top of the build's frictionSlip multiplier.
							w.frictionSlip =
								num(tuning.frictionSlip, DEFAULTS.frictionSlip) *
								bs.frictionSlip *
								rig.abilityState.gripMulNow(now);
							w.rollInfluence = num(tuning.rollInfluence, DEFAULTS.rollInfluence);
						}

						// Heading + speed
						tmpQuat.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
						fwdWorld.set(1, 0, 0).applyQuaternion(tmpQuat);
						const flatLen = Math.hypot(fwdWorld.x, fwdWorld.z) || 1;
						rig.hx = fwdWorld.x / flatLen;
						rig.hz = fwdWorld.z / flatLen;
						const vel = body.velocity;
						const forwardSpeed = vel.x * fwdWorld.x + vel.y * fwdWorld.y + vel.z * fwdWorld.z;
						const rawSpeed = Math.hypot(vel.x, vel.y, vel.z);
						// Pre-step velocity snapshot: the ram check runs after
						// world.step, when the solver has already eaten the impact.
						rig.preVx = vel.x;
						rig.preVz = vel.z;

						// Controls: player from input, AI from its driver.
						let sIn: number;
						let thr: number;
						let brk: number;
						let hbk = false;
						// player.ai is null in normal play (keyboard/gamepad input); the
						// headless stress runner attaches an AiDriver so the player rig
						// becomes a 4th AI racer for AI-only races.
						if (rig === player && !player.ai) {
							if (debugHold) {
								sIn = debugHold.steer;
								thr = debugHold.thr;
								brk = debugHold.brk;
								hbk = debugHold.hbk;
							} else {
								sIn = steerInput;
								thr = throttle;
								brk = brakeInput;
								hbk = handbrake;
							}
						} else {
							const c = rig.ai!.drive(
								{
									x: body.position.x,
									z: body.position.z,
									hx: rig.hx,
									hz: rig.hz,
									speed: rawSpeed,
									warmIdx: rig.warmIdx,
									onRibbon: rig.lastOnRibbon,
									nowMs: now,
									dtMs: dt * 1000
								},
								aiTuningForRig(rig, aiT)
							);
							sIn = c.steer;
							thr = c.throttle;
							brk = c.brake;
						}

						// Race-start control lock: until GO, zero every control for
						// every vehicle. Nothing produces drive force, so the cars sit
						// at rest on the flat grid (physics stays live).
						if (preLaunch) {
							sIn = 0;
							thr = 0;
							brk = 0;
							hbk = false;
						}

						// Combat drive modifiers: disruption / down / eliminated scale
						// or zero the controls the same way for every vehicle.
						const mods = driveMods(rig.combat, ct, now);
						thr *= mods.engineScale;
						sIn *= mods.steerScale;
						if (rig.combat.isOut(now) && rig === player) brk = 0;
						// Oil slick traction loss: slicked tires on every wheel (the
						// handbrake's own grip cut still multiplies on top below).
						if (mods.tractionScale !== 1) {
							for (const w of rig.vehicle.wheelInfos) w.frictionSlip *= mods.tractionScale;
						}

						const falloff =
							num(tuning.steerSpeedFalloff, DEFAULTS.steerSpeedFalloff) * bs.steerFalloff;
						const effSteer =
							(num(tuning.maxSteer, DEFAULTS.maxSteer) * bs.maxSteer) /
							(1 + rawSpeed * Math.max(0, falloff));
						const steerTarget = sIn * effSteer;
						rig.steerCurrent += (steerTarget - rig.steerCurrent) * Math.min(1, dt * 10);
						rig.vehicle.setSteeringValue(rig.steerCurrent, 0);
						rig.vehicle.setSteeringValue(rig.steerCurrent, 1);

						let engine = 0;
						let brake = 0;
						// Nitro Boost ability multiplies engine force for its window (1
						// when inactive), on top of the build's engineForce multiplier;
						// a boost-pad window (Phase 8a zones) stacks the same way.
						const engineMax =
							num(tuning.engineForce, DEFAULTS.engineForce) *
							bs.engineForce *
							rig.abilityState.nitroMulNow(now) *
							(now < rig.boostUntilMs ? rig.boostMul : 1);

						// ---- TRACTION LIMITING (Phase 9-fix-e) ----
						// The AI has fed its commanded throttle through this cap since
						// 9d-i; the player's real input never did, so a VELOCITY build
						// still spun itself out of a standing start. Same formula, applied
						// here in the SHARED force path so both drivers of the same car
						// meet the same physical limit.
						//
						// `driveAccel * throttle` is the acceleration being demanded and
						// `dragDecel * v^2` is what aero is already absorbing, so the
						// surplus reaching the contact patch has to stay inside the tires'
						// budget. Two properties make it safe unconditionally. It CANNOT
						// cost a vehicle its top speed: at terminal, drag alone consumes
						// the whole drive force, so the cap has risen past 1 long before
						// (VELOCITY is back to full throttle above ~44 m/s). And it does
						// nothing at all to a car whose power its tires already handle.
						//
						// TWO DELIBERATE DIFFERENCES FROM THE AI PORT:
						//
						// 1. It scales the DRIVE FORCE, not the input. `throttle` (and the
						//    HUD, the gamepad axis, the held-key state) is never touched,
						//    so nothing downstream sees a clipped pedal — the accelerator
						//    still works as hard as the driver pushes it, and what changes
						//    is how much of that reaches the road. An input clamp would
						//    read as a dead zone at the top of the pedal travel; this
						//    reads as tires slipping and hooking up, because that is what
						//    it is modelling.
						//
						// 2. It is EASED, not applied instantly. The AI re-decides its
						//    throttle from scratch every frame off a step function, so a
						//    hard cap costs it nothing; a human holding a key feels every
						//    discontinuity. Ramping means the launch delivers full power
						//    for the first instants, loses it as the tires break away, and
						//    settles onto what they can hold.
						//
						// The cap is measured against the BASE drive force, deliberately
						// excluding the Nitro and boost-pad multipliers already folded
						// into engineMax. Those are burst abilities with a meter cost and
						// a tuned launch feel (Phase 5a measured Nitro's top-speed gain
						// against this exact pipeline); limiting them here would silently
						// re-tune an ability this pass has no business touching. A driver
						// who spends Nitro off the line can still light the tires up, and
						// that is a choice they made rather than a car they cannot drive.
						{
							const mass =
								num(tuning.chassisMass, DEFAULTS.chassisMass) * bs.chassisMass;
							const baseDriveAccel =
								(num(tuning.engineForce, DEFAULTS.engineForce) * bs.engineForce) /
								Math.max(1, mass);
							const dragDecel =
								(num(tuning.aeroDrag, DEFAULTS.aeroDrag) * bs.aeroDrag) / Math.max(1, mass);
							const tractionBudget =
								num(tuning.tractionAccel, DEFAULTS.tractionAccel) * bs.frictionSlip;
							// Fraction of full throttle the tires can take right now.
							const cap =
								baseDriveAccel > 0
									? (tractionBudget + dragDecel * rawSpeed * rawSpeed) / baseDriveAccel
									: Infinity;
							const floor = num(tuning.tractionFloor, DEFAULTS.tractionFloor);
							const allowed = Math.min(thr, Math.max(floor, cap));
							// The limiter as a FACTOR on demand, so lifting off is always
							// instant (demand drops to 0 regardless of the eased factor)
							// and only the grip loss itself is smoothed.
							const target = thr > 0.001 ? allowed / thr : 1;
							const rate =
								target < rig.tractionEase
									? num(tuning.tractionEngageRate, DEFAULTS.tractionEngageRate)
									: num(tuning.tractionReleaseRate, DEFAULTS.tractionReleaseRate);
							rig.tractionEase += (target - rig.tractionEase) * Math.min(1, rate * dt);
							// Snap home so an unlimited car can never be left sitting on a
							// 0.9999 factor by float drift after a limited stretch.
							if (rig.tractionEase > 0.9995) rig.tractionEase = 1;
							if (rig.tractionEase < 1) testStats.tractionLimitedFrames++;
						}
						const driveThr = thr * rig.tractionEase;

						if (thr > 0) engine = driveThr * engineMax;
						if (brk > 0 && !rig.combat.isOut(now)) {
							if (forwardSpeed > 0.5)
								brake = brk * num(tuning.brakeForce, DEFAULTS.brakeForce) * bs.brakeForce;
							else engine = -brk * engineMax * 0.55;
						}
						// Engine force is the TOTAL drive force, split across the two
						// driven wheels; applying it per wheel doubled it and flipped
						// the car under launch.
						rig.vehicle.applyEngineForce(engine / 2, 2);
						rig.vehicle.applyEngineForce(engine / 2, 3);
						for (let i = 0; i < 4; i++) rig.vehicle.setBrake(brake, i);
						// Handbrake drift (Phase 9a): a per-rig engagement scalar eases
						// toward the held state (fast in, slower out) so grip fades
						// rather than snapping. The rear axle loses grip deeply and the
						// front mildly, both scaled by engagement, and the rear lock
						// brake ramps the same way. This replaced the old instant binary
						// rear-only cut that read as a twitch sideways. frictionSlip is
						// recomputed fresh above each frame, so multiplying by the ramped
						// factor here restores full grip cleanly as engagement decays.
						{
							const hbTarget = hbk ? 1 : 0;
							const hbRate = hbk
								? num(tuning.handbrakeEngageRate, DEFAULTS.handbrakeEngageRate)
								: num(tuning.handbrakeReleaseRate, DEFAULTS.handbrakeReleaseRate);
							rig.hbEngage += (hbTarget - rig.hbEngage) * Math.min(1, hbRate * dt);
							if (rig.hbEngage < 0.001) rig.hbEngage = 0;
							if (rig.hbEngage > 0) {
								const e = rig.hbEngage;
								const hb = num(tuning.handbrakeForce, DEFAULTS.handbrakeForce);
								const rearCut = Math.max(0.05, num(tuning.handbrakeGrip, DEFAULTS.handbrakeGrip));
								const frontCut = Math.max(
									0.05,
									num(tuning.handbrakeFrontGrip, DEFAULTS.handbrakeFrontGrip)
								);
								// Rear lock brake ramps in; never below the regular brake so
								// braking + handbrake together can't reduce stopping power.
								const rearBrake = Math.max(brake, hb * e);
								rig.vehicle.setBrake(rearBrake, 2);
								rig.vehicle.setBrake(rearBrake, 3);
								// Grip fades from full (1) toward each axle's cut as e rises.
								const frontMul = 1 - (1 - frontCut) * e;
								const rearMul = 1 - (1 - rearCut) * e;
								rig.vehicle.wheelInfos[0].frictionSlip *= frontMul;
								rig.vehicle.wheelInfos[1].frictionSlip *= frontMul;
								rig.vehicle.wheelInfos[2].frictionSlip *= rearMul;
								rig.vehicle.wheelInfos[3].frictionSlip *= rearMul;
								// Handbrake YAW AUTHORITY (Phase 9-fix-d). Cutting rear grip
								// removes the only thing damping rotation, while the FRONT
								// keeps full grip (frictionSlip 5) at a very large steering
								// angle (steerSpeedFalloff is only 0.04, so the wheels are
								// still turned ~30deg at 22 m/s and ~49deg at walking pace).
								// The front therefore generates far more yaw torque than the
								// slid rear can resist, and nothing bounded the result:
								// MEASURED peak yaw from a single 300ms tap was 37 deg/s at
								// 4 m/s, 182 at 14, 217 at 18 and 408 deg/s at 22 m/s, which
								// is what put 140deg of rotation on the car from one tap.
								//
								// This is NOT the 9a grip-transition problem (that ramp is
								// working; hbEngage is what scales this term) and it is not
								// literally worse at low speed -- the spike GROWS with speed.
								// What makes it read as a low-speed spin is that around
								// 20-25 m/s the car has grip enough to convert the whole tap
								// into rotation but too little momentum to keep travelling,
								// so it pirouettes on the spot instead of carving an arc.
								//
								// Fix: bleed only the yaw rate ABOVE a drift-shaped ceiling,
								// mirroring the pitchDamp anti-wheelie term directly above
								// (which deliberately left yaw alone -- this is the scoped
								// exception, and it applies ONLY while the handbrake is
								// engaged). Damping the EXCESS rather than clamping means the
								// rotation still builds naturally and just stops running
								// away; scaling the rate by `e` means it fades out on the
								// same release ramp as the grip cut, so nothing snaps.
								const hbYawMax = num(tuning.handbrakeYawMax, DEFAULTS.handbrakeYawMax);
								const hbYawDamp = num(tuning.handbrakeYawDamp, DEFAULTS.handbrakeYawDamp);
								if (hbYawMax > 0 && hbYawDamp > 0) {
									tmpQuat.set(
										body.quaternion.x,
										body.quaternion.y,
										body.quaternion.z,
										body.quaternion.w
									);
									upWorld.set(0, 1, 0).applyQuaternion(tmpQuat);
									const av = body.angularVelocity;
									const yawRate = av.x * upWorld.x + av.y * upWorld.y + av.z * upWorld.z;
									const excess = Math.abs(yawRate) - hbYawMax;
									if (excess > 0) {
										const bleed =
											Math.sign(yawRate) * excess * Math.min(1, hbYawDamp * e * dt);
										av.x -= upWorld.x * bleed;
										av.y -= upWorld.y * bleed;
										av.z -= upWorld.z * bleed;
									}
								}
							}
						}

						// Anti-wheelie: bleed LOCAL pitch rate (rotation about the
						// car's right axis) so drive torque can never backflip a
						// light build; steering yaw is deliberately untouched.
						const pd = num(tuning.pitchDamp, DEFAULTS.pitchDamp);
						if (pd > 0) {
							rightWorld.set(0, 0, 1).applyQuaternion(tmpQuat);
							const av = body.angularVelocity;
							const pitchRate =
								av.x * rightWorld.x + av.y * rightWorld.y + av.z * rightWorld.z;
							const bleed = pitchRate * Math.min(1, pd * dt);
							av.x -= rightWorld.x * bleed;
							av.y -= rightWorld.y * bleed;
							av.z -= rightWorld.z * bleed;
						}

						// Quadratic aero drag caps top speed (~sqrt(engine/drag)).
						// Slipstream reduces this same term for a vehicle tucked in another's
						// wake, so a higher top speed follows with no new force/impulse; it
						// scales with how tightly the trailer is tucked in (draftFactor) and
						// stacks cleanly with Nitro's engineForce lift (independent terms).
						let drag = num(tuning.aeroDrag, DEFAULTS.aeroDrag) * bs.aeroDrag;
						if (rig.drafting)
							drag *=
								1 - num(tuning.draftDragReduction, DEFAULTS.draftDragReduction) * rig.draftFactor;
						if (drag > 0 && rawSpeed > 0.1) {
							body.applyForce(
								new CANNON.Vec3(
									-drag * rawSpeed * vel.x,
									-drag * rawSpeed * vel.y,
									-drag * rawSpeed * vel.z
								),
								new CANNON.Vec3(0, 0, 0)
							);
						}

						// Aerodynamic downforce (Phase 9-fix-a): a real v^2 downward force
						// on the chassis (see DEFAULTS.aeroDownforce). It compresses the
						// suspension -> raises wheel normal load -> raises the friction
						// cannon-es already bounds by it, so grip is physical, not a
						// frictionSlip trick. Applied FRONT-BIASED at the two axle offsets so
						// it ALSO makes a nose-down pitch moment that grows with v^2 — the
						// specific fix for acceleration/Nitro front lift, which no COM force
						// could correct. numWheelsOnGround is last step's value (a 1-frame
						// lag, fine); zero wheels = fully airborne = downforce off, so jumps
						// and Air Correction are untouched, while a wheelie (rears down)
						// still gets the nose pushed back.
						const downCoef = num(tuning.aeroDownforce, DEFAULTS.aeroDownforce) * bs.aeroDown;
						if (downCoef > 0 && rawSpeed > 0.1 && rig.vehicle.numWheelsOnGround > 0) {
							const totalDown = downCoef * rawSpeed * rawSpeed;
							const bias = num(tuning.downforceFrontBias, DEFAULTS.downforceFrontBias);
							const arm = num(tuning.downforceArm, DEFAULTS.downforceArm);
							// fwdWorld is the chassis forward set this frame (before the Air
							// Correction block reuses it). For a purely-vertical force only the
							// application point's HORIZONTAL offset makes pitch torque, so
							// fwdWorld * arm is the correct front (+) / rear (-) point.
							body.applyForce(
								new CANNON.Vec3(0, -totalDown * bias, 0),
								new CANNON.Vec3(fwdWorld.x * arm, fwdWorld.y * arm, fwdWorld.z * arm)
							);
							body.applyForce(
								new CANNON.Vec3(0, -totalDown * (1 - bias), 0),
								new CANNON.Vec3(-fwdWorld.x * arm, -fwdWorld.y * arm, -fwdWorld.z * arm)
							);
						}

						// Track surface + soft boundaries (the swappable block): extra
						// drag off the ribbon, capped spring + damper past a wall.
						const surf = surfaceState(
							rt,
							body.position.x,
							body.position.z,
							rig.warmIdx,
							rig.warmPath
						);
						rig.warmIdx = surf.warmIndex;
						rig.warmPath = surf.path;
						// Route telemetry: paths beyond 0 are branch spurs, in the
						// order the runtime built them from surface.branches. Only a
						// real branch is ever recorded — returning to the main line
						// does NOT clear it, because the question being answered is
						// "did this driver use the shortcut", not "where are they now".
						if (surf.path > 0) {
							const branch = track.surface.branches?.[surf.path - 1];
							if (branch) rig.routeUsed = branch.id;
						}
						rig.lastOnRibbon = surf.state.onRibbon;
						if (rig === player) hud.offTrack = !surf.state.onRibbon;
						if (!surf.state.onRibbon && rawSpeed > 0.1) {
							const gd = num(tuning.grassDrag, DEFAULTS.grassDrag) * bs.grassDrag;
							body.applyForce(
								new CANNON.Vec3(-gd * rawSpeed * vel.x, 0, -gd * rawSpeed * vel.z),
								new CANNON.Vec3(0, 0, 0)
							);
						}
						const viol = surf.state.violation;
						if (viol) {
							const k = num(tuning.wallSpring, DEFAULTS.wallSpring);
							const c = num(tuning.wallDamp, DEFAULTS.wallDamp);
							const vOut = -(vel.x * viol.pushX + vel.z * viol.pushZ);
							// Depth is capped so a deep breach shoves the car back gently
							// instead of slingshotting it across the track.
							const f = Math.min(
								k * Math.min(viol.depth, 2.5) + (vOut > 0 ? c * vOut : 0),
								25000
							);
							body.applyForce(
								new CANNON.Vec3(viol.pushX * f, 0, viol.pushZ * f),
								new CANNON.Vec3(0, 0, 0)
							);
						}

						// Wheel-contact bookkeeping (Phase 8d). One pass over the
						// RaycastVehicle's own wheel state, which is the authoritative
						// ground answer for this vehicle model — the chassis box never
						// touches the ribbon (no Box-vs-Trimesh narrowphase), so wheels
						// are the only ground interface there is.
					{
							// CANNON-ES TRAP, measured here: `wheelInfo.isInContact` is
							// NOT readable outside the solver. `updateWheelTransformWorld`
							// sets it FALSE on entry, and the per-frame
							// `vehicle.updateWheelTransform(i)` call that syncs the wheel
							// MESHES (see the render block) runs after the step — so by the
							// time any game code looks, all four wheels read false even
							// with the car sitting still on the ground (verified: 4 wheels
							// "not in contact" at a steady 55 m/s). The vehicle's own
							// `numWheelsOnGround` is the durable signal: `updateFriction`
							// recomputes it each step from `raycastResult.body`, and
							// nothing clobbers it afterwards.
							const contacts = rig.vehicle.numWheelsOnGround;
							rig.wheelContacts = contacts;
							if (contacts === 0) {
								rig.airborneSec += dt;
								rig.groundedSec = 0;
							} else {
								rig.groundedSec += dt;
								rig.airborneSec = 0;
							}
						}

						// Air Correction (Phase 8d): ONGOING attitude control, so the
						// work happens here every frame the window is open rather than
						// once at activation. Landing closes the window immediately
						// (the ability is meaningless with the wheels down, and leaving
						// it open would be a hidden way to torque a grounded car);
						// otherwise the driver's own steer / throttle input becomes
						// torque about the chassis axes.
						if (rig.abilityState.airActive(now)) {
							if (rig.groundedSec >= GROUNDED_END_SEC) {
								rig.abilityState.endAirControl();
								if (rig === player) flash('AIR CORRECTION — landed');
							} else {
								// Local axes: forward = +x (roll), right = +z (pitch),
								// matching the RaycastVehicle index axes configured on
								// every rig and the pitchDamp block below.
								fwdWorld.set(1, 0, 0).applyQuaternion(tmpQuat);
								rightWorld.set(0, 0, 1).applyQuaternion(tmpQuat);
								// Steer input rolls, throttle/brake pitches. Both read the
								// SAME control values the grounded car uses, so no new
								// bindings and no special-casing in the input layer.
								const roll = -sIn * rig.abilityState.airRollTorque;
								const pitch = (brk - thr) * rig.abilityState.airPitchTorque;
								if (roll !== 0 || pitch !== 0) {
									body.wakeUp();
									body.torque.x += fwdWorld.x * roll + rightWorld.x * pitch;
									body.torque.y += fwdWorld.y * roll + rightWorld.y * pitch;
									body.torque.z += fwdWorld.z * roll + rightWorld.z * pitch;
								}
							}
						}

						// Flip recovery (same swappable-block spirit as the soft walls):
						// a chassis resting with its local up vector at or below the
						// horizon while nearly stationary can never recover on its own,
						// because the wheels are off the ground and no drive or AI
						// reverse produces force. After the tunable delay, re-seat it
						// upright at its current yaw, a wheel-drop above the ground,
						// velocities zeroed. Eliminated wrecks stay where they died.
						upWorld.set(0, 1, 0).applyQuaternion(tmpQuat);
						const flipped =
							!rig.combat.eliminated &&
							upWorld.y < num(tuning.flipUpY, DEFAULTS.flipUpY) &&
							rawSpeed < num(tuning.flipMaxSpeed, DEFAULTS.flipMaxSpeed);
						if (flipped) {
							rig.flipAcc += dt;
							if (rig.flipAcc >= num(tuning.flipDelaySec, DEFAULTS.flipDelaySec)) {
								rig.flipAcc = 0;
								testStats.flips++;
								testStats.flipsByRig[rig.id] = (testStats.flipsByRig[rig.id] ?? 0) + 1;
								// hx/hz are the forward vector's flat projection, so the
								// yaw survives the roll; quatFor's convention (0 = +x,
								// CCW positive) means yaw = atan2(-hz, hx).
								const yawDeg = (Math.atan2(-rig.hz, rig.hx) * 180) / Math.PI;
								// Re-seat at the LOCAL surface height (flat tracks: the
								// old SPAWN_Y exactly), so a flip on an elevated span
								// never re-seats under the ribbon.
								body.position.y = seatY(body.position.x, body.position.z, rig.warmIdx);
								body.quaternion.copy(quatFor(yawDeg));
								body.velocity.setZero();
								body.angularVelocity.setZero();
								rig.steerCurrent = 0;
								spawnRing(
									body.position.x,
									body.position.z,
									0x00ff41,
									4,
									320,
									0.45,
									body.position.y - 0.4
								);
								if (rig === player) flash('FLIPPED — vehicle righted');
							}
						} else if (rig.flipAcc !== 0) {
							rig.flipAcc = 0;
						}

						// Fall recovery (Phase 8a, the flip-watchdog pattern; relief
						// tracks only). A car far BELOW the local track surface drove
						// off an elevated edge and is now on the catch plane with no
						// drivable route back up. (Sinking THROUGH the ribbon is no
						// longer one of the ways to get here: the chassis floor
						// immediately below catches that first, within its band.)
						// After a short grace it re-seats on the nearest
						// centerline point, upright along the track, velocities
						// zeroed. Deliberately Lakitu-style: anywhere deeper than the
						// drop threshold under the local surface recovers, including
						// the ground strip BESIDE an elevated span.
						if (rt.hasRelief) {
							const surfY = surfaceYAt(
								rt,
								body.position.x,
								body.position.z,
								rig.warmIdx,
								rig.warmPath
							);
							// Chassis floor (Phase 9-fix-c). The wheels stay the only
							// DRIVING interface with the ribbon; this is purely the floor
							// they stand on, for the moments no wheel can reach it.
							// MEASURED before the fix, on Terminal Nine's 13.5 m deck: a
							// car rolled onto its roof drops the full 13.5 m in ~1.4 s
							// (the flip watchdog's 2 s delay can never fire in time), and
							// a landing above ~15 m/s vertical punches straight through.
							//
							// Three gates, each earning its place: (1) the ribbon has to be
							// meaningfully ABOVE the catch plane, because at ground level
							// the plane already stops the chassis through a real
							// narrowphase and doing it here too would nudge every hard
							// landing on flat ground (measured: 119 of 127 near-floor
							// frames on a clean lap were flat, none of them a problem);
							// (2) the vehicle has to be over the ribbon corridor; and
							// (3) it has to be within the band, because a car BESIDE or
							// far UNDER an elevated span reads that same clamped surface
							// height and would otherwise be flung 13 m into the air
							// instead of left to the fall watchdog.
							//
							// The chassis AABB's lower bound is the exact lowest VERTEX of
							// the oriented box, so an inverted, rolled, or pitched car is
							// handled by the same test with no special cases; only
							// downward velocity is killed, so being stood up never adds
							// energy.
							if (surfY > CHASSIS_FLOOR_MIN_RISE && surf.state.onRibbon) {
								body.updateAABB();
								const under = surfY - body.aabb.lowerBound.y;
								if (under > 0 && under < num(tuning.chassisFloorBand, DEFAULTS.chassisFloorBand)) {
									body.position.y += under;
									if (body.velocity.y < 0) body.velocity.y = 0;
									body.aabbNeedsUpdate = true;
									testStats.floorCatches++;
								}
							}
							if (
								!rig.combat.eliminated &&
								surfY - body.position.y >
									num(tuning.fallRecoverDrop, DEFAULTS.fallRecoverDrop)
							) {
								rig.fallAcc += dt;
								if (
									rig.fallAcc >=
									num(tuning.fallRecoverDelaySec, DEFAULTS.fallRecoverDelaySec)
								) {
									rig.fallAcc = 0;
									testStats.falls++;
									const ri2 = rig.warmIdx;
									const rp = rt.center[ri2];
									const rp2 = rt.center[(ri2 + 1) % nC];
									const yawDeg =
										(Math.atan2(-(rp2.z - rp.z), rp2.x - rp.x) * 180) / Math.PI;
									body.position.set(rp.x, seatY(rp.x, rp.z, ri2), rp.z);
									body.quaternion.copy(quatFor(yawDeg));
									body.velocity.setZero();
									body.angularVelocity.setZero();
									rig.steerCurrent = 0;
									// No phantom motion segment for the lap tracker: the
									// re-seat is a teleport, not travel.
									rig.prevX = rp.x;
									rig.prevZ = rp.z;
									spawnRing(rp.x, rp.z, 0x00ff41, 4, 320, 0.45, body.position.y - 0.4);
									if (rig === player) flash('OFF THE EDGE — recovered');
								}
							} else if (rig.fallAcc !== 0) {
								rig.fallAcc = 0;
							}
						}

						// Trigger zones (schema v2): boost pads + hazards, entry-edge
						// per vehicle (zoneEntries updates rig.zoneInside in place); a
						// per-zone rearm window keeps boundary jitter from
						// re-triggering. Locked during the countdown like weapons.
						if (rt.zones.length && !preLaunch && !rig.combat.isOut(now)) {
							for (const zi of zoneEntries(
								rt.zones,
								body.position.x,
								body.position.z,
								rig.zoneInside
							)) {
								if (now < rig.zoneRearmMs[zi]) continue;
								rig.zoneRearmMs[zi] = now + ZONE_REARM_SEC * 1000;
								const zn = rt.zones[zi];
								if (zn.type === 'boost') {
									testStats.zone.boost++;
									rig.boostMul = zn.strength ?? BOOST_STRENGTH;
									rig.boostUntilMs = now + (zn.durationSec ?? BOOST_DURATION_SEC) * 1000;
									// Instant kick worth BOOST_KICK_MPS of forward speed
									// (mass-scaled so every build feels the same shove);
									// the engine window above sustains it.
									body.applyImpulse(
										new CANNON.Vec3(
											rig.hx * body.mass * BOOST_KICK_MPS,
											0,
											rig.hz * body.mass * BOOST_KICK_MPS
										),
										new CANNON.Vec3()
									);
									spawnRing(zn.x, zn.z, 0x2ae57e, 6, 380, 0.55, body.position.y - 0.3);
									spawnSparks(
										body.position.x,
										body.position.y + 0.3,
										body.position.z,
										14,
										0x8fffc4,
										10,
										400
									);
									zoneSfx('boost', zn.x, zn.z);
									if (rig === player) {
										addTrauma(0.15);
										flash('BOOST');
									}
								} else if (zn.type === 'hazard') {
									// hazard kind 'oil': the deployed-slick traction cut,
									// resist-scaled like a real slick, never consumed.
									testStats.zone.hazard++;
									rig.combat.applyOiled(ct, now);
									spawnSparks(
										body.position.x,
										body.position.y + 0.4,
										body.position.z,
										12,
										0xb47cff,
										7,
										420
									);
									spawnRing(
										zn.x,
										zn.z,
										0x8f5fff,
										zn.radius * 1.5,
										300,
										0.4,
										body.position.y - 0.3
									);
									if (rig === player) {
										addTrauma(0.25);
										flash('OIL PATCH — TRACTION LOST');
									}
								} else if (zn.type === 'pit' && rig === player) {
									// Pit zone is not an entry effect (the repair is the
									// continuous, stop-gated block below); the entry edge just
									// cues the player that stopping here repairs.
									flash('PIT BOX — STOP TO REPAIR');
								}
							}

							// Pit repair (Phase 9c): CONTINUOUS while genuinely stopped in
							// a pit box, not an entry effect. `rig.zoneInside` was refreshed
							// for every zone by the zoneEntries call above, so this reads
							// live occupancy. Healing scales with dwell because it is applied
							// per frame; VehicleCombat.repair() clamps each pool at max, so a
							// long stop simply fills up and further time does nothing.
							{
								const speed = Math.hypot(body.velocity.x, body.velocity.z);
								for (let zi = 0; zi < rt.zones.length; zi++) {
									const zn = rt.zones[zi];
									if (zn.type !== 'pit' || !rig.zoneInside[zi]) continue;
									if (speed > (zn.stopSpeed ?? PIT_STOP_SPEED)) continue;
									const healed = rig.combat.repair(
										(zn.repairPerSec ?? PIT_REPAIR_PER_SEC) * dt
									);
									const total = healed.armor + healed.chassis + healed.mount;
									if (total <= 0) continue;
									// The heal may have refilled plates or revived a dead mount:
									// reconcile the bodywork with the restored pools, quietly.
									if (healed.mount > 0) setMountDead(rig, rig.combat.mountDown);
									if (healed.armor > 0) syncArmorPlates(rig, undefined, undefined, true);
									// Throttled green repair pulse (a few per second), player only.
									if (rig === player && now >= rig.pitFxMs) {
										rig.pitFxMs = now + 240;
										spawnRing(
											body.position.x,
											body.position.z,
											GL.green,
											3.2,
											360,
											0.45,
											body.position.y + 0.2
										);
										flash('PIT — REPAIRING');
									}
								}
							}
						}

						// Status tint + scorch, in the brand palette: dead steel when
						// out, charred amber while down (down IS an impact state),
						// amber-warm blink on hit, wet-black flicker while oiled;
						// otherwise the archetype's chrome tone chars toward cold
						// charcoal as CHASSIS (the life pool) drops. Armor/mount
						// damage reads through plate strips and the dead mount, not
						// the hull scorch.
						const hpFrac = Math.max(
							0,
							Math.min(1, rig.combat.chassisHealth / Math.max(1, rig.combat.maxChassis))
						);
						const tint = rig.combat.eliminated
							? 0x252d34
							: rig.combat.isDown(now)
								? 0x8a5c16
								: rig.flashUntil > now
									? GL.amberWarm
									: rig.combat.isOiled(now) && Math.floor(now / 130) % 2 === 0
										? 0x0d1114
										: tmpColA
												.setHex(rig.baseColor)
												.lerp(tmpColB.setHex(0x101214), (1 - hpFrac) * 0.75)
												.getHex();
						if (rig.bodyMat.color.getHex() !== tint) rig.bodyMat.color.setHex(tint);
						// Livery decal body (Phase 6b): the map already carries the
						// full-color livery, so the material color is a MULTIPLIER over it
						// — white when clean, the same state tints on hit/down/oiled/out,
						// but the neutral scorch lerps from WHITE (not the base color) so
						// the map darkens toward charcoal exactly like the plates do.
						if (rig.bodyDecalMat) {
							const decalTint = rig.combat.eliminated
								? 0x252d34
								: rig.combat.isDown(now)
									? 0x8a5c16
									: rig.flashUntil > now
										? GL.amberWarm
										: rig.combat.isOiled(now) && Math.floor(now / 130) % 2 === 0
											? 0x0d1114
											: tmpColA
													.setHex(0xffffff)
													.lerp(tmpColB.setHex(0x101214), (1 - hpFrac) * 0.75)
													.getHex();
							if (rig.bodyDecalMat.color.getHex() !== decalTint)
								rig.bodyDecalMat.color.setHex(decalTint);
						}

						// Crumple stages at 75/50/25% health; heal/reset restores.
						const dentStage = hpFrac <= 0.25 ? 3 : hpFrac <= 0.5 ? 2 : hpFrac <= 0.75 ? 1 : 0;
						if (dentStage !== rig.dentStage) applyDentStage(rig, dentStage);

						// Damage smoke off the hood, escalating; wrecks burn heavy,
						// critical hulls also spit the odd ember.
						rig.smokeAcc += dt;
						let smokeEvery = 0;
						let smokeColor = 0x3a3a3a;
						let smokeSize = 0.9;
						if (rig.combat.eliminated) {
							smokeEvery = 0.09;
							smokeColor = 0x141414;
							smokeSize = 1.7;
						} else if (hpFrac <= 0.25) {
							smokeEvery = 0.07;
							smokeColor = 0x1f1f1f;
							smokeSize = 1.25;
						} else if (hpFrac <= 0.5) {
							smokeEvery = 0.17;
						}
						if (smokeEvery > 0 && rig.smokeAcc >= smokeEvery) {
							rig.smokeAcc = 0;
							spawnSmoke(
								body.position.x + rig.hx * 1.1,
								body.position.y + 0.75,
								body.position.z + rig.hz * 1.1,
								smokeColor,
								smokeSize,
								1300,
								1.9,
								0.5
							);
						}
						if (!rig.combat.eliminated && hpFrac <= 0.25 && Math.random() < dt * 2.5) {
							spawnSparks(body.position.x, body.position.y + 0.6, body.position.z, 4, GL.amberWarm, 5, 350);
						}

						// Dead mount: continuous electrical sputter and the odd smoke
						// wisp off the hardpoints themselves, the at-a-glance
						// "weapon down" read on any vehicle without checking a
						// number. Sparks pick a random socket each tick so every
						// charred hardpoint sputters, not just one.
						if (rig.mountDead && !rig.combat.eliminated) {
							if (Math.random() < dt * 7) {
								const socks = rig.parts.mount.children;
								const pick = socks.length
									? socks[Math.floor(Math.random() * socks.length)]
									: rig.parts.mount;
								const mp = pick.getWorldPosition(tmpWorld);
								spawnSparks(mp.x, mp.y + 0.15, mp.z, 2, GL.coolRim, 4, 240);
							}
							if (Math.random() < dt * 1.4) {
								const mp = rearSocketWorld(rig);
								spawnSmoke(mp.x, mp.y + 0.2, mp.z, 0x1c1c1c, 0.5, 800, 1.1, 0.4);
							}
						}

						// Oil drip trail while the tires are slicked.
						if (rig.combat.isOiled(now)) {
							rig.dripAcc += dt;
							if (rig.dripAcc >= 0.09) {
								rig.dripAcc = 0;
								spawnSmoke(
									body.position.x - rig.hx * 1.4,
									0.25,
									body.position.z - rig.hz * 1.4,
									0x120f1e,
									0.4,
									520,
									0.15,
									0.6
								);
							}
						}

						// Tire dust: grit kicked off the worn tarmac under slip --
						// sideways travel, handbrake, hard launches, oiled tires --
						// heavier off the ribbon. Emission scales with slip so clean
						// fast laps stay clean; the dust pool is separate from the
						// smoke pool so this can never evict a wreck's smoke column.
						if (!rig.combat.isOut(now) && rawSpeed > 1.5) {
							const latSpeed = Math.abs(vel.x * -rig.hz + vel.z * rig.hx);
							const launch = thr > 0.6 && rawSpeed < 8 ? 0.7 : 0;
							const slip =
								latSpeed * 0.14 +
								(hbk && rawSpeed > 4 ? 0.9 : 0) +
								launch +
								(mods.tractionScale < 1 ? 0.6 : 0);
							if (slip > 0.3) {
								rig.dustAcc += dt * Math.min(3, slip);
								if (rig.dustAcc >= 0.055) {
									rig.dustAcc = 0;
									// Alternate the two rear (driven) wheels.
									rig.dustWheel = rig.dustWheel === 2 ? 3 : 2;
									const wm = rig.wheelMeshes[rig.dustWheel];
									const off = !rig.lastOnRibbon;
									spawnDust(
										wm.position.x - rig.hx * 0.4 + (Math.random() - 0.5) * 0.3,
										0.16,
										wm.position.z - rig.hz * 0.4 + (Math.random() - 0.5) * 0.3,
										off ? 0x8d8672 : 0x777c80,
										off ? 0.8 : 0.55,
										off ? 750 : 550,
										0.75,
										off ? 0.34 : 0.26
									);
								}
							} else if (rig.dustAcc > 0) {
								rig.dustAcc = Math.max(0, rig.dustAcc - dt);
							}
						}

						// Drift meter: sustained lateral slip banks the shared ability
						// meter. `driftIntensity` reads sideways speed (velocity
						// perpendicular to the heading) vs forward speed, so straight
						// driving and near-stops charge nothing; a wide slide or a
						// committed handbrake turn charges fast. Gated on being in the
						// race (not the pre-launch lock) and alive.
						if (!preLaunch && !rig.combat.isOut(now)) {
							const lat = Math.abs(vel.x * -rig.hz + vel.z * rig.hx);
							rig.abilityState.charge(driftIntensity(lat, rawSpeed, hbk), dt);
						}

						if (rig === player) {
							// Physics is metric (rawSpeed is m/s); the HUD reads mph.
							// Display-layer conversion only: 1 m/s = 2.236936 mph.
							speedMph = Math.round(rawSpeed * 2.236936);
						}
					}

					// -- Weapons: player triggers + AI decisions, one shared path --
					// Arming is PER VEHICLE and POSITIONAL (weaponsArmed): a car stays
					// disarmed until it has actually crossed the start/finish line, so a
					// packed grid can never trade fire before anyone has moved and the
					// staggered rows arm in the order they launch, not all on one frame.
					// One array, computed once per frame, gates every path below: the
					// player's queued presses, guided-lock acquisition, the AI weapon and
					// ability decisions, and the self-firing Auto-Turret.
					const armed = all.map((r) => weaponsArmed(r, now));
					chud.armed = armed[0];
					if (!armed[0]) {
						firePrimaryQueued = false;
						fireSecondaryQueued = false;
						abilityPrimaryQueued = false;
						abilitySecondaryQueued = false;
					}
					{
						if (abilityPrimaryQueued) {
							abilityPrimaryQueued = false;
							performAbility(player, 'abilityPrimary');
						}
						if (abilitySecondaryQueued) {
							abilitySecondaryQueued = false;
							performAbility(player, 'abilitySecondary');
						}
						if (firePrimaryQueued) {
							firePrimaryQueued = false;
							performWeaponFire(player, 'weaponPrimary');
						}
						if (fireSecondaryQueued) {
							fireSecondaryQueued = false;
							performWeaponFire(player, 'weaponSecondary');
						}
						const combatants = all.map(combatantOf);
						// Guided-weapon lock acquisition, every rig, every frame:
						// passive and continuous while the slot is ready, so the HUD
						// can show progress and the fire press launches instantly off
						// a complete lock. A slot on cooldown (or a dead mount) holds
						// no lock at all — and neither does a car that has not launched
						// yet, so nobody rolls off the grid with a lock already banked.
						for (let ri = 0; ri < all.length; ri++) {
							const rig = all[ri];
							for (const slot of WEAPON_SLOTS) {
								const def = weaponById(rig.weapons[slot]);
								if (!def?.guided || rig.combat.isOut(now) || !armed[ri]) {
									rig.locks[slot] = null;
									continue;
								}
								if (!rig.combat.canUseSlot(slot, now, effSlotCooldown(rig, def.cooldownSec))) {
									rig.locks[slot] = null;
									continue;
								}
								// An AI orders its acquisition by target VALUE (Phase
								// 9d-ii-a); the player keeps the nearest-first default,
								// so a human's lock behaves exactly as it always has.
								const ai = rig.ai;
								rig.locks[slot] = updateWeaponLock(
									rig.locks[slot],
									combatants[ri],
									combatants,
									slot,
									def,
									dt,
									now,
									ai ? (t) => ai.lockPreference(combatants[ri], t, def, now) : undefined
								);
							}
						}
						// Every AI-driven rig makes weapon decisions. In normal play the
						// player has no AiDriver so it is skipped here (player fires via
						// input above); the stress runner's AI-player is included.
						// Every equipped weapon is a candidate — the whole 13-weapon roster,
						// including EMP / oil / hook since Phase 8g — decided by one loop.
						for (let ri = 0; ri < all.length; ri++) {
							const rig = all[ri];
							if (!rig.ai || rig.combat.isOut(now) || !armed[ri]) continue;
							const self = combatants[ri];
							for (const slot of WEAPON_SLOTS) {
								const def = weaponById(rig.weapons[slot]);
								if (!def) continue;
								// A guided weapon only launches off a COMPLETE lock.
								if (def.guided && !(rig.locks[slot] && rig.locks[slot].progress >= 1)) continue;
								// The Auto-Turret fires itself in the turret tick and the
								// Radar Jammer is passive: neither has an AI fire decision.
								if (def.category === 'turret' || (def.category === 'defensive' && def.jammer))
									continue;
								const cdScale = rig.buildStats.weaponCooldown;
								// Pick the decision by shape: area weapons drop behind,
								// blades toggle when a rival is close, the shield is a panic
								// button, everything else aims its forward cone.
								let want: boolean;
								if (def.category === 'area')
									want = rig.ai.wantsAreaDrop(self, combatants, slot, def, aiT, now, cdScale);
								else if (def.category === 'melee')
									want = rig.ai.wantsBlades(self, combatants, slot, def, aiT, now, cdScale);
								else if (def.category === 'defensive' && def.shield)
									want = rig.ai.wantsShield(self, combatants, slot, def, aiT, now, cdScale);
								// The locked target id is threaded through for guided weapons:
								// a launch goes where the LOCK points, so that is the car the
								// decision has to be scored against.
								else
									want = rig.ai.wantsWeaponFire(
										self,
										combatants,
										slot,
										def,
										aiT,
										now,
										cdScale,
										rig.locks[slot]?.targetId ?? null
									);
								if (!want) continue;
								if (performWeaponFire(rig, slot)) {
									rig.ai.scheduleSlotUse(slot, now, def.cooldownSec * cdScale, aiT);
									break;
								}
							}
							// The former fixed-tool chain (EMP / tether / oil) is gone (Phase 8g):
							// those are equipped weapons now, decided by the same loop above
							// (wantsWeaponFire for the EMP/hook forward cones, wantsAreaDrop for
							// the oil drop), so there is no separate fixed-tool chain.
						}
						// Abilities: every AI-driven rig decides ONE ability per frame,
						// meter permitting. The shared drift meter both slots draw from
						// is checked by abilityState.ready(); the AI adds a tactical
						// trigger per category (hurt -> repair, chasing/chased -> nitro,
						// cornering -> grip, upside-down -> flip). Jump is never AI-used
						// (no ramps yet). Simple by design; real tactics are Phase 9.
						for (let ri = 0; ri < all.length; ri++) {
							const rig = all[ri];
							if (!rig.ai || rig.combat.isOut(now) || !armed[ri]) continue;
							const self = combatants[ri];
							for (const slot of ABILITY_SLOTS) {
								const def = abilityById(rig.abilities[slot]);
								if (!def) continue;
								if (!rig.abilityState.ready(slot, def, now)) continue;
								if (!rig.ai.abilitySlotReady(slot, now)) continue;
								let want = false;
								if (def.category === 'repair') want = rig.ai.wantsRepair(self, now);
								else if (def.category === 'nitro') want = rig.ai.wantsNitro(self, combatants, now);
								else if (def.category === 'grip') want = rig.ai.wantsGrip(now);
								else if (def.category === 'aircontrol')
									want = rig.ai.wantsAirControl(rigAirborne(rig));
								else if (def.category === 'flip') {
									const upY = rig.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y;
									want = upY < num(tuning.flipUpY, DEFAULTS.flipUpY);
								}
								if (!want) continue;
								if (performAbility(rig, slot)) {
									rig.ai.scheduleAbilitySlot(slot, now);
									break;
								}
							}
						}
						// Auto-Turret: every vehicle carrying one auto-fires on its own
						// cooldown at the nearest target in the 360-minus-blind-arc ring. No
						// trigger, no aim, no AI decision - player and AI tick the identical
						// check; the forward blind arc is the vehicle's own chassis.
						for (let ri = 0; ri < all.length; ri++) {
							const rig = all[ri];
							if (rig.combat.isOut(now) || !armed[ri]) continue;
							for (const slot of WEAPON_SLOTS) {
								const def = weaponById(rig.weapons[slot]);
								if (def?.category !== 'turret') continue;
								const res = updateTurret(combatants[ri], combatants, slot, def, mode, ct, now, {
									damageScale: rig.buildStats.damageDealt,
									cooldownScale: rig.buildStats.weaponCooldown
								});
								if (!res.fired) continue;
								testStats.fire.turret++;
								const sp = rig.body.position;
								spawnSparks(sp.x + rig.hx * 1.2, sp.y + 0.7, sp.z + rig.hz * 1.2, 3, 0xffe0a0, 8, 160);
								weaponSfx('turret-fire', sp.x, sp.z);
								if (res.hit) {
									const hit = res.hit;
									testStats.hit.turret++;
									const target = all.find((r) => r.id === hit.targetId);
									if (target) {
										target.flashUntil = now + 110;
										const a = hitAnchor(target, sp.x, sp.z, hit.result.zone);
										spawnSparks(a.x, a.y + 0.2, a.z, 6, GL.amberWarm, 7, 260);
										weaponSfx('turret-hit', a.x, a.z);
										if (target === player) addTrauma(0.08);
										afterDamage(target, hit.result, rig.label, sp.x, sp.z);
									}
								}
							}
						}
					}

					world.step(1 / 60, dt, 4);

					// Flat-ground dyno (verification only): hold the player at the
					// anchor x/z, keeping y / orientation / velocity, so it runs in
					// place at true terminal speed on a flat track. Suspension/wheel
					// state is unchanged because only the horizontal position moves.
					if (dynoOn) {
						if (!dynoAnchor) dynoAnchor = { x: player.body.position.x, z: player.body.position.z };
						player.body.position.x = dynoAnchor.x;
						player.body.position.z = dynoAnchor.z;
						player.body.velocity.z = 0;
						player.prevX = dynoAnchor.x;
						player.prevZ = dynoAnchor.z;
					}

					// -- Shockwave rams: chassis contacts queued during the step,
					// evaluated on pre-step velocities, resolved with impulses --
					if (ramGrace) {
						// Ram-only suppression through the countdown + post-GO grace window:
						// drop queued contacts WITHOUT calling tryRam, so no damage, stun,
						// knockback, or cooldown is spent. Movement and steering are untouched,
						// and once the window passes ram behaves exactly as before.
						pendingRams = [];
					} else if (pendingRams.length) {
						for (const pr of pendingRams) {
							const { a, b } = pr;
							const dx = b.body.position.x - a.body.position.x;
							const dz = b.body.position.z - a.body.position.z;
							const d = Math.hypot(dx, dz) || 1;
							const ux = dx / d;
							const uz = dz / d;
							const res = tryRam(
								{
									a: combatantOf(a),
									b: combatantOf(b),
									closingSpeed: (a.preVx - b.preVx) * ux + (a.preVz - b.preVz) * uz,
									frontalityA: a.hx * ux + a.hz * uz,
									frontalityB: -(b.hx * ux + b.hz * uz)
								},
								mode,
								ct,
								now
							);
							if (!res.triggered) continue;
							testStats.ram++;
							const imp = ct.ramImpulse;
							const pop = ct.ramPopUp;
							a.body.applyImpulse(new CANNON.Vec3(-ux * imp, pop, -uz * imp));
							b.body.applyImpulse(new CANNON.Vec3(ux * imp, pop, uz * imp));
							a.flashUntil = now + 220;
							b.flashUntil = now + 220;
							const mx = (a.body.position.x + b.body.position.x) / 2;
							const mz = (a.body.position.z + b.body.position.z) / 2;
							spawnRing(mx, mz, 0xffb347, 14, 440, 0.6, 0.7);
							spawnRing(mx, mz, 0xfff2c0, 7, 300, 0.7, 0.9);
							spawnSparks(mx, 1, mz, 46, 0xffb347, 15, 700);
							spawnSparks(mx, 1, mz, 20, 0xfff2c0, 20, 450);
							spawnDebris(mx, 0.9, mz, 5, 0, 0, 6);
							for (let k = 0; k < 4; k++) {
								spawnSmoke(
									mx + (Math.random() - 0.5) * 1.6,
									1,
									mz + (Math.random() - 0.5) * 1.6,
									0x2a2a2a,
									1.2,
									900,
									1.6,
									0.5
								);
							}
							if (a === player || b === player) {
								addTrauma(0.85);
								const mine = a === player ? res.damageA : res.damageB;
								const theirs = a === player ? res.damageB : res.damageA;
								flash(`SHOCKWAVE RAM — you -${mine} / them -${theirs}`);
							} else {
								addTraumaAt(mx, mz, 0.6);
							}
							// Each side's zone came from its own frontality: nose-first
							// eats armor, a punted tail eats the mount.
							afterDamage(a, res.resultA, b.label, b.body.position.x, b.body.position.z);
							afterDamage(b, res.resultB, a.label, a.body.position.x, a.body.position.z);
						}
						// Deployable Blades run over the SAME contacts, both directions
						// (either car may have blades out), with their own lenient gating.
						for (const pr of pendingRams) {
							bladeContact(pr.a, pr.b, now);
							bladeContact(pr.b, pr.a, now);
						}
						pendingRams = [];
					}

					// -- Guided projectiles: steer, advance, resolve hits/expiry --
					if (projectiles.length) {
						const res = updateProjectiles(projectiles, all.map(combatantOf), mode, ct, dt, now);
						for (const hit of res.hits) {
							const target = all.find((r) => r.id === hit.targetId);
							removeProjectileVis(hit.projectile.id);
							if (!target) continue;
							const p = hit.projectile;
							const isCluster = p.weaponId === 'cluster-missile';
							if (isCluster) testStats.hit.cluster++;
							else testStats.hit.rocket++;
							target.flashUntil = now + 220;
							// Cluster bursts wider: bigger ring/spark scatter reads as
							// an area detonation, not a single-point rocket hit.
							spawnRing(p.x, p.z, 0xffb347, isCluster ? 12 : 7, isCluster ? 460 : 380, 0.6, 0.7);
							spawnSparks(p.x, p.y + 0.2, p.z, isCluster ? 42 : 30, 0xffb347, isCluster ? 15 : 12, 600);
							spawnDebris(p.x, p.y, p.z, isCluster ? 6 : 4, p.hx, p.hz, 6);
							for (let k = 0; k < (isCluster ? 4 : 3); k++) {
								spawnSmoke(p.x + (Math.random() - 0.5) * 1.2, p.y + 0.3, p.z + (Math.random() - 0.5) * 1.2, 0x232323, 1.1, 1000, 1.5, 0.5);
							}
							weaponSfx(isCluster ? 'cluster-hit' : 'rocket-hit', p.x, p.z);
							if (target === player) {
								addTrauma(0.55);
								flash(`${isCluster ? 'CLUSTER' : 'ROCKET'} HIT — -${hit.damage}`);
							} else {
								addTraumaAt(p.x, p.z, 0.35);
								if (p.ownerId === 'player') flash(`${isCluster ? 'CLUSTER' : 'ROCKET'} HIT ${target.label} -${hit.damage}`);
							}
							const owner = all.find((r) => r.id === p.ownerId);
							afterDamage(target, hit.result, owner?.label ?? p.ownerId, p.x - p.hx * 4, p.z - p.hz * 4);
							// Cluster splash: every OTHER vehicle caught in the burst
							// takes reduced damage, rendered off the returned sub-hits.
							for (const sh of hit.splash) {
								const st = all.find((r) => r.id === sh.targetId);
								if (!st) continue;
								testStats.hit.clusterSplash++;
								st.flashUntil = now + 180;
								const stp = st.body.position;
								spawnSparks(stp.x, stp.y + 0.3, stp.z, 14, 0xffb347, 9, 420);
								spawnRing(stp.x, stp.z, 0xffb347, 4, 320, 0.4, 0.5);
								if (st === player) {
									addTrauma(0.32);
									flash(`CLUSTER SPLASH — -${sh.damage}`);
								} else if (p.ownerId === 'player') {
									flash(`SPLASH ${st.label} -${sh.damage}`);
								}
								// Source point is the blast center so armor plates/debris
								// kick away from the detonation, not toward it.
								afterDamage(st, sh.result, owner?.label ?? p.ownerId, p.x, p.z);
							}
						}
						for (const p of res.expired) {
							// Fizzle: a dodged/expired rocket dies quietly where it was.
							removeProjectileVis(p.id);
							spawnSparks(p.x, p.y, p.z, 6, 0x9fb0bd, 5, 300);
							spawnSmoke(p.x, p.y, p.z, 0x2a2a2a, 0.6, 600, 1.0, 0.4);
						}
						// Live rockets: mesh follows the fact, plus a motor trail.
						for (const p of projectiles) {
							const mesh = projVis.get(p.id);
							if (!mesh) continue;
							mesh.position.set(p.x, p.y, p.z);
							mesh.rotation.y = Math.atan2(-p.hz, p.hx);
							if (Math.random() < dt * 30) {
								spawnSparks(p.x - p.hx * 0.5, p.y, p.z - p.hz * 0.5, 1, GL.amberWarm, 2, 220);
							}
						}
					}

					// -- Oil slicks: trigger checks + puddle lifecycle --
					{
						const fresh = all.map(combatantOf);
						const oilEvents = updateOilSlicks(slicks, fresh, ct, now);
						for (const ev of oilEvents) {
							const victim = all.find((r) => r.id === ev.targetId);
							if (!victim) continue;
							testStats.hit.oil++;
							const vp = victim.body.position;
							spawnSparks(vp.x, vp.y + 0.4, vp.z, 14, 0xb47cff, 7, 450);
							for (let k = 0; k < 4; k++) {
								spawnSmoke(vp.x, 0.35, vp.z, 0x11101c, 0.8, 700, 0.7, 0.55);
							}
							spawnRing(ev.slick.x, ev.slick.z, 0x8f5fff, (weaponById(ev.slick.weaponId)?.oil?.radius ?? 3.2) * 1.6, 300, 0.4, 0.15);
							if (victim === player) {
								addTrauma(0.3);
								flash('OILED — TRACTION LOST');
							} else if (ev.slick.ownerId === 'player') {
								flash(`${victim.label} HIT YOUR OIL`);
							}
						}
						for (let i = slicks.length - 1; i >= 0; i--) {
							const s = slicks[i];
							const vis = slickVis.get(s.id);
							if (!vis) {
								slicks.splice(i, 1);
								continue;
							}
							const scaleIn = Math.min(1, (now - s.createdMs) / 260);
							let r = (weaponById(s.weaponId)?.oil?.radius ?? 3.2) * (0.25 + 0.75 * scaleIn);
							let alpha = 1;
							let done = false;
							if (s.consumedBy !== null) {
								const t = (now - s.consumedMs) / 450;
								done = t >= 1;
								r *= Math.max(0, 1 - t);
								alpha = Math.max(0, 1 - t);
							} else if (now >= s.expiresMs) {
								const t = (now - s.expiresMs) / 600;
								done = t >= 1;
								alpha = Math.max(0, 1 - t);
							}
							if (done) {
								removeSlickVis(s.id);
								slicks.splice(i, 1);
								continue;
							}
							vis.group.scale.set(Math.max(0.01, r), 1, Math.max(0.01, r));
							vis.discMat.opacity = 0.92 * alpha;
							vis.rimMat.opacity = (0.6 + 0.25 * Math.sin(now / 180 + s.id)) * alpha;
						}
					}

					// -- Caltrops: persistent multi-trigger fields + spike-field lifecycle --
					{
						const fresh = all.map(combatantOf);
						const caltropEvents = updateCaltropFields(caltropFields, fresh, mode, ct, now);
						for (const ev of caltropEvents) {
							const victim = all.find((r) => r.id === ev.targetId);
							if (!victim) continue;
							testStats.hit.caltrops++;
							const vp = victim.body.position;
							victim.flashUntil = now + 140;
							spawnSparks(vp.x, vp.y + 0.2, vp.z, 9, 0xffd27f, 6, 320);
							weaponSfx('caltrops-hit', vp.x, vp.z);
							if (victim === player) {
								addTrauma(0.16);
								flash(`CALTROPS — -${ev.damage}`);
							} else if (ev.field.ownerId === 'player') {
								flash(`${victim.label} HIT YOUR CALTROPS`);
							}
							const owner = all.find((r) => r.id === ev.field.ownerId);
							afterDamage(victim, ev.result, owner?.label ?? ev.field.ownerId, ev.field.x, ev.field.z);
						}
						for (let i = caltropFields.length - 1; i >= 0; i--) {
							const f = caltropFields[i];
							const vis = caltropVis.get(f.id);
							if (!vis) {
								caltropFields.splice(i, 1);
								continue;
							}
							const scaleIn = Math.max(0.01, Math.min(1, (now - f.createdMs) / 300));
							let alpha = 1;
							const fadeStart = f.expiresMs - 900;
							if (now >= f.expiresMs) {
								removeCaltropVis(f.id);
								caltropFields.splice(i, 1);
								continue;
							} else if (now >= fadeStart) {
								alpha = Math.max(0, 1 - (now - fadeStart) / 900);
							}
							vis.group.scale.set(scaleIn, 1, scaleIn);
							vis.patchMat.opacity = 0.7 * alpha;
							vis.spikeMat.opacity = alpha;
						}
					}

					// -- Tethers: hold check, pull forces, cable + hook visuals --
					for (let i = tethers.length - 1; i >= 0; i--) {
						const tv = tethers[i];
						const shooter = all.find((r) => r.id === tv.t.shooterId);
						const target = all.find((r) => r.id === tv.t.targetId);
						if (!shooter || !target) {
							removeTetherVis(tv);
							tethers.splice(i, 1);
							continue;
						}
						const status = tetherStatus(tv.t, combatantOf(shooter), combatantOf(target), now);
						if (status !== 'active') {
							const hp = tv.hook.position;
							spawnSparks(hp.x, hp.y, hp.z, 8, 0xc8ff00, 5, 350);
							removeTetherVis(tv);
							tethers.splice(i, 1);
							continue;
						}
						const sp = shooter.body.position;
						const tp = target.body.position;
						const pdx = sp.x - tp.x;
						const pdz = sp.z - tp.z;
						const dist = Math.hypot(pdx, pdz);
						// The yank: pull the target off its line toward the shooter,
						// with a fraction of the reaction dragging the shooter back.
						// Slack inside the near radius so the pair never orbit-slams.
						const th = weaponById(tv.t.weaponId)?.tether;
						if (th && dist > th.slackDist) {
							const f = th.force;
							const ux = pdx / dist;
							const uz = pdz / dist;
							target.body.applyForce(new CANNON.Vec3(ux * f, 0, uz * f), new CANNON.Vec3());
							shooter.body.applyForce(
								new CANNON.Vec3(-ux * f * 0.25, 0, -uz * f * 0.25),
								new CANNON.Vec3()
							);
						}
						placeCable(tv.cable, sp.x, sp.y + 0.5, sp.z, tp.x, tp.y + 0.6, tp.z);
						tv.hook.position.set(tp.x, tp.y + 0.7, tp.z);
						const pulse = 1 + 0.25 * Math.sin(now / 60);
						tv.hook.scale.set(pulse, pulse, pulse);
						tv.cableMat.opacity = 0.75 + 0.2 * Math.sin(now / 45);
					}

					// -- Lap logic: every rig tracks its own laps and checkpoints --
					const lapTarget = Math.max(1, Math.round(num(tuning.lapTarget, DEFAULTS.lapTarget)));
					for (const rig of all) {
						const rx = rig.body.position.x;
						const rz = rig.body.position.z;
						const events = rig.tracker.update(
							rt,
							{ x: rig.prevX, z: rig.prevZ },
							{ x: rx, z: rz },
							prevMs,
							now
						);
						rig.prevX = rx;
						rig.prevZ = rz;
						for (const ev of events) {
							if (ev.type === 'timing-started') rig.raceStartMs = ev.atMs;
							// Branch decision, once per lap (Phase 8b): an AI picks the
							// route it will drive as it crosses the line, so a field
							// with mixed aggression splits across the main line and the
							// shortcut. No-op on tracks with a single route.
							//
							// Pit heuristic (Phase 9c, deliberately simple — real strategy
							// is 9d's job): if chassis is below PIT_AI_HEALTH_FRAC and the
							// track has a pit lane, take it to repair; otherwise fall back
							// to the normal risk/reward route choice.
							if (
								rig.ai &&
								(ev.type === 'lap' || ev.type === 'timing-started') &&
								rt.routes.length > 1
							) {
								// A DESTROYED MOUNT is its own reason to pit (Phase 9-fix-d).
								// The chassis fraction alone missed it entirely, which meant the
								// pit lane -- the designed counterplay for being disarmed --
								// never once fired for that reason: measured races ended with
								// most of the field's weapons permanently offline while every
								// car still drove past a repair box it had no rule to enter.
								// `repair()` revives a dead mount, so the box already fixes it.
								const hurt =
									rig.combat.chassisHealth / Math.max(1, rig.combat.maxChassis) <
										PIT_AI_HEALTH_FRAC || rig.combat.mountDown;
								if (hurt && rt.pitRoutes.length > 0) rig.ai.setRoute(rt.pitRoutes[0]);
								else rig.ai.chooseRoute(num(tuning.aiAggression, DEFAULTS.aiAggression));
							}
							if (rig === player) {
								if (ev.type === 'timing-started') {
									playerRaceStartMs = ev.atMs;
									flash('LAP TIMER STARTED');
								} else if (ev.type === 'lap')
									flash(
										ev.best ? `NEW BEST ${formatLapMs(ev.lapMs)}` : `LAP ${formatLapMs(ev.lapMs)}`
									);
								else if (ev.type === 'rejected' && ev.reason === 'out-of-order')
									flash(`${ev.gateId.toUpperCase()} IGNORED (out of order)`);
							}
							// RACE finishing order: first to complete the lap target.
							if (
								ev.type === 'lap' &&
								mode === 'race' &&
								!rig.finished &&
								rig.tracker.lapsCompleted >= lapTarget
							) {
								rig.finished = true;
								rig.finishAtMs = ev.atMs;
								finishOrder.push(rig);
								rig.finishPos = finishOrder.length;
								if (rig === player) {
									roundOver = true;
									banner = `YOU FINISHED P${rig.finishPos}/${all.length}`;
									if (!finishReported) {
										finishReported = true;
										onFinish?.({
											finishPosition: rig.finishPos,
											totalTimeMs:
												playerRaceStartMs !== null ? Math.round(ev.atMs - playerRaceStartMs) : null,
											bestLapMs:
												player.tracker.bestLapMs !== null ? Math.round(player.tracker.bestLapMs) : null,
											laps: lapTarget,
											route: player.routeUsed
										});
									}
								} else {
									flash(`${rig.label} FINISHED P${rig.finishPos}`);
								}
							}
						}
						if (rig === player && events.length) {
							syncHud();
							styleGates(player.tracker.nextCheckpoint);
						}
					}
					hud.currentMs = player.tracker.currentLapMs(now);
					prevMs = now;

					// -- Sync meshes --
					for (const rig of all) {
						rig.carGroup.position.set(rig.body.position.x, rig.body.position.y, rig.body.position.z);
						rig.carGroup.quaternion.set(
							rig.body.quaternion.x,
							rig.body.quaternion.y,
							rig.body.quaternion.z,
							rig.body.quaternion.w
						);
						for (let i = 0; i < rig.wheelMeshes.length; i++) {
							rig.vehicle.updateWheelTransform(i);
							const t = rig.vehicle.wheelInfos[i].worldTransform;
							rig.wheelMeshes[i].position.set(t.position.x, t.position.y, t.position.z);
							rig.wheelMeshes[i].quaternion.set(
								t.quaternion.x,
								t.quaternion.y,
								t.quaternion.z,
								t.quaternion.w
							);
						}
						// Energy Shield field: the translucent bubble wraps the whole
						// vehicle exactly while the absorb pool is up (break or
						// timeout hides it the same frame). Slow breathing spin so
						// the film reads as live energy, not a glass shell.
						const shielded = rig.combat.shieldActive(now) && !rig.combat.eliminated;
						rig.shieldBubble.visible = shielded;
						if (shielded) rig.shieldBubble.rotation.y += dt * 0.6;

						// Stun crackle ring: flicker + spin while disrupted, with the
						// odd cool-rim arc of sparks so a stun reads at a glance.
						const stunned = rig.combat.isDisrupted(now) && !rig.combat.eliminated;
						rig.stunRing.visible = stunned;
						if (stunned) {
							rig.stunMat.opacity = 0.22 + Math.random() * 0.3;
							rig.stunRing.rotation.z += 0.15;
							if (Math.random() < 0.12) {
								spawnSparks(
									rig.body.position.x,
									rig.body.position.y + 0.7,
									rig.body.position.z,
									3,
									GL.coolRim,
									6,
									250
								);
							}
						}

						// Overhead health bar (AI only): follow, face camera, fill.
						// Primary fill reads CHASSIS; the thin sliver under it is the
						// armor pool, and the amber dot means weapons offline.
						if (rig.bar) {
							rig.bar.group.position.set(
								rig.body.position.x,
								rig.body.position.y + 2.2,
								rig.body.position.z
							);
							rig.bar.group.lookAt(camera.position);
							const frac = Math.max(
								0,
								rig.combat.chassisHealth / Math.max(1, rig.combat.maxChassis)
							);
							rig.bar.fg.scale.x = Math.max(0.001, frac);
							rig.bar.fg.position.x = -(1 - frac) * 1.2;
							// Steel-white while healthy; low hull goes amber (the
							// reserved impact color); eliminated goes dead steel.
							rig.bar.fgMat.color.setHex(
								rig.combat.eliminated ? 0x39454f : frac > 0.35 ? GL.chromeMid : GL.amber
							);
							const afrac = Math.max(
								0,
								rig.combat.armorHealth / Math.max(1, rig.combat.maxArmor)
							);
							rig.bar.arm.scale.x = Math.max(0.001, afrac);
							rig.bar.arm.position.x = -(1 - afrac) * 1.2;
							rig.bar.armMat.color.setHex(rig.combat.eliminated ? 0x39454f : GL.coolRim);
							rig.bar.mnt.visible = rig.combat.mountDown && !rig.combat.eliminated;
						}
					}

					// -- Transient FX: rings, probe beams, sparks, smoke --
					for (let i = fxList.length - 1; i >= 0; i--) {
						const fx = fxList[i];
						const age = (now - fx.born) / fx.life;
						if (age >= 1) {
							scene.remove(fx.mesh);
							(fx.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();
							fxList.splice(i, 1);
							continue;
						}
						const r = 1.5 + age * fx.maxR;
						fx.mesh.scale.set(r, 1, r);
						(fx.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity =
							fx.baseOpacity * (1 - age);
					}
					for (let i = beams.length - 1; i >= 0; i--) {
						const bm = beams[i];
						const age = (now - bm.born) / bm.life;
						if (age >= 1) {
							scene.remove(bm.mesh);
							bm.mat.dispose();
							beams.splice(i, 1);
							continue;
						}
						bm.mat.opacity = 0.7 * (1 - age);
					}
					updateSparks(now, dt);
					updateSmoke(now, dt);
					updateDebris(now, dt);
					updateDust(now, dt);
					// -- Weather: precipitation follows the camera; storm flashes --
					if (ENV.precip) updateRain(dt);
					if (ENV.lightning) {
						const lg = ENV.lightning;
						if (now >= nextFlashAtMs) {
							flashStartMs = now;
							nextFlashAtMs =
								now + (lg.minGapSec + Math.random() * (lg.maxGapSec - lg.minGapSec)) * 1000;
						}
						// Double-strobe decay: a bright stab, a dimmer echo, gone in
						// ~400ms. Cheap and reads as lightning without a sky shader.
						const age = (now - flashStartMs) / 400;
						flashLight.intensity =
							age >= 0 && age < 1
								? lg.intensity * Math.max(0, (1 - age) * (0.55 + 0.45 * Math.cos(age * 22)))
								: 0;
					}
					// Trigger-zone markers breathe gently (empty on zone-less tracks).
					for (const zp of zonePulse) {
						zp.mat.opacity = zp.base * (0.75 + 0.25 * Math.sin(now / 420 + zp.phase));
					}

					// -- Chase camera (player) --
					const flatFwd = new THREE.Vector3(player.hx, 0, player.hz);
					const carPos = player.carGroup.position;
					// Speed-scaled pull-back: linear in speed, clamped at camSpeedRef
					// (see DEFAULTS). The active VIEW then scales the target distance and
					// height; the lerp below still smooths the result, so the camera eases
					// out and back in rather than snapping, at any view.
					const camSpeed = Math.hypot(
						player.body.velocity.x,
						player.body.velocity.y,
						player.body.velocity.z
					);
					const camT = Math.min(1, camSpeed / Math.max(1, num(tuning.camSpeedRef, DEFAULTS.camSpeedRef)));
					const view = CAMERA_VIEWS[camViewIdx];
					const dist =
						(num(tuning.camDistance, DEFAULTS.camDistance) +
							camT * num(tuning.camDistanceGain, DEFAULTS.camDistanceGain)) *
						view.distMul;
					const height =
						(num(tuning.camHeight, DEFAULTS.camHeight) +
							camT * num(tuning.camHeightGain, DEFAULTS.camHeightGain)) *
						view.heightMul;
					
					// Look-back glance: eases toward the held state, then the camera swings
					// from behind (lb 0) to in front looking back over the tail (lb 1),
					// arcing UP at the midpoint so it clears the car instead of clipping it.
					lookBackF +=
						((lookBackHeld ? 1 : 0) - lookBackF) *
						Math.min(1, num(tuning.camLookBackRate, DEFAULTS.camLookBackRate) * dt);
					if (lookBackF < 0.0005) lookBackF = 0;
					// Free-look eases back to neutral once the drag ends (never mid-drag).
					if (!panDragging) {
						const rec = 1 - Math.exp(-num(tuning.camPanRecenter, DEFAULTS.camPanRecenter) * dt);
						panYaw += (0 - panYaw) * rec;
						panPitch += (0 - panPitch) * rec;
					}
					
					const lb = lookBackF;
					const fwdOffset = dist * (-1 + 2 * lb);
					const arch = num(tuning.camLookBackArch, DEFAULTS.camLookBackArch) * Math.sin(Math.PI * lb);
					// Base offset from the car (behind + up), before free-look orbit.
					const offX = flatFwd.x * fwdOffset;
					const offZ = flatFwd.z * fwdOffset;
					const offY = height + arch + panPitch;
					// Free-look: orbit the horizontal offset around the world up axis.
					const cy = Math.cos(panYaw);
					const sy = Math.sin(panYaw);
					const desired = carPos
						.clone()
						.add(new THREE.Vector3(offX * cy - offZ * sy, offY, offX * sy + offZ * cy));
					// Look target: ahead normally, behind when looking back; blended toward
					// the car as free-look grows so an orbit actually shows the car's flanks.
					const lookFwd = 6 * (1 - 2 * lb);
					const yawMax = Math.max(0.001, num(tuning.camPanYawMax, DEFAULTS.camPanYawMax));
					const panMag = Math.min(1, Math.abs(panYaw) / yawMax);
					const lookTarget = carPos
						.clone()
						.addScaledVector(flatFwd, lookFwd)
						.add(new THREE.Vector3(0, 1.2, 0))
						.lerp(carPos.clone().add(new THREE.Vector3(0, 1.2, 0)), panMag * 0.85);
					const s = 1 - Math.exp(-num(tuning.camStiffness, DEFAULTS.camStiffness) * dt);
					camPos.lerp(desired, s);
					camLook.lerp(lookTarget, s);
					camera.position.copy(camPos);
					camera.lookAt(camLook);

					// -- Screen shake: shake = trauma^2, layered sines, plus roll --
					trauma = Math.max(0, trauma - num(tuning.shakeDecay, DEFAULTS.shakeDecay) * dt);
					if (trauma > 0.001) {
						const mag = trauma * trauma * num(tuning.shakeMax, DEFAULTS.shakeMax);
						const tSec = now / 1000;
						camera.position.x += mag * (Math.sin(tSec * 91.7) * 0.6 + Math.sin(tSec * 47.3 + 1.7) * 0.4);
						camera.position.y += mag * (Math.sin(tSec * 83.1 + 0.9) * 0.6 + Math.sin(tSec * 39.7 + 2.6) * 0.4);
						camera.position.z += mag * (Math.sin(tSec * 71.9 + 2.1) * 0.6 + Math.sin(tSec * 55.3 + 0.4) * 0.4);
						camera.rotation.z += mag * 0.06 * Math.sin(tSec * 67.3);
					}

					// -- Countdown overlay: 3 - 2 - 1 during the lock, GO briefly after --
					{
						const toGo = raceStartAtMs - now;
						const next =
							toGo > 0
								? String(Math.min(COUNTDOWN_SEC, Math.ceil(toGo / 1000)))
								: now - raceStartAtMs < GO_HOLD_SEC * 1000
									? 'GO'
									: '';
						if (next !== countText) countText = next;
					}

					// -- HUD state --
					pose.x = player.body.position.x;
					pose.z = player.body.position.z;
					pose.hx = player.hx;
					pose.hz = player.hz;
					for (let i = 0; i < ais.length; i++) {
						const p = aiPoses[i];
						if (!p) continue;
						p.x = ais[i].body.position.x;
						p.z = ais[i].body.position.z;
						p.hx = ais[i].hx;
						p.hz = ais[i].hz;
						p.out = ais[i].combat.isOut(now);
					}

					chud.hp = Math.round(player.combat.chassisHealth);
					chud.max = player.combat.maxChassis;
					chud.armor = Math.max(0, Math.round(player.combat.armorHealth));
					chud.armorMax = player.combat.maxArmor;
					chud.mount = Math.max(0, Math.round(player.combat.mountHealth));
					chud.mountMax = player.combat.maxMount;
					chud.mountDown = player.combat.mountDown;
					chud.status = player.combat.eliminated
						? 'ELIMINATED'
						: player.combat.isDown(now)
							? 'DOWN'
							: player.combat.isDisrupted(now)
								? 'DISRUPTED'
								: '';
					chud.downLeft = player.combat.isDown(now)
						? Math.max(0, (player.combat.downUntilMs - now) / 1000)
						: 0;
					chud.oiled = player.combat.isOiled(now);
					chud.tethered = tethers.some((tv) => tv.t.targetId === player.id);
					// Ram is the only fixed always-on tool left (Phase 8g); EMP / oil /
					// tether are equipped weapons now and show in the slot cells below.
					chud.ready.ram = cooldownRemaining(player.combat, 'ram', combatTuning().ramCooldownSec, now);
					// Equipped-weapon cells: primary always, secondary when equipped.
					// Key labels read the live (remappable) bindings.
					{
						const cells: SlotHudCell[] = [];
						for (const slot of WEAPON_SLOTS) {
							const def = weaponById(player.weapons[slot]);
							if (!def) continue;
							const lock = player.locks[slot];
							const active = def.shield
								? player.combat.shieldActive(now)
								: def.melee
									? player.combat.bladesActive(now)
									: false;
							cells.push({
								slot,
								short: def.shortName,
								key: `${keyLabel(controlSettings.keyboard[slot === 'weaponPrimary' ? 'fireWeaponPrimary' : 'fireWeaponSecondary'])}`,
								ready: slotCooldownRemaining(player.combat, slot, effSlotCooldown(player, def.cooldownSec), now),
								offline: player.combat.mountDown,
								lock: lock ? { progress: lock.progress, locked: lock.progress >= 1 } : null,
								active,
								passive: !!def.jammer
							});
						}
						chud.slots = cells;
						chud.shieldPct = player.combat.shieldActive(now)
							? player.combat.shieldHealth / Math.max(1, player.combat.maxShield)
							: 0;
					}
					// Ability cells + the shared drift meter. Key labels read the live
					// (remappable) bindings, like the weapon cells.
					chud.meter = player.abilityState.meter;
					{
						const acells: AbilityHudCell[] = [];
						for (const slot of ABILITY_SLOTS) {
							const def = abilityById(player.abilities[slot]);
							if (!def) continue;
							const active =
								(def.category === 'nitro' && player.abilityState.nitroActive(now)) ||
								(def.category === 'grip' && player.abilityState.gripActive(now)) ||
							(def.category === 'aircontrol' && player.abilityState.airActive(now));
							acells.push({
								slot,
								short: def.shortName,
								key: keyLabel(
									controlSettings.keyboard[
										slot === 'abilityPrimary' ? 'useAbilityPrimary' : 'useAbilitySecondary'
									]
								),
								ready: player.abilityState.ready(slot, def, now) && !player.combat.isOut(now),
								active,
								cooldown: player.abilityState.cooldownRemaining(slot, def, now),
								needMeter: player.abilityState.meter < def.meterCost - 1e-6
							});
						}
						chud.abilities = acells;
					}
					// Passive jammer hum (player only), re-armed on its interval.
					{
						const hasJammer = WEAPON_SLOTS.some(
							(sl) => weaponById(player.weapons[sl])?.jammer
						);
						if (hasJammer && !player.combat.isOut(now) && now - lastJammerHumMs > 1200) {
							lastJammerHumMs = now;
							weaponSfx('jammer-hum');
						}
					}
					// Lock reticle on the player's locked target (primary slot wins
					// the ring if both somehow hold guided locks), plus the one-time
					// lock-complete cue on the rising edge.
					{
						const lock = player.locks.weaponPrimary ?? player.locks.weaponSecondary;
						const target = lock ? all.find((r) => r.id === lock.targetId) : undefined;
						if (lock && target) {
							const locked = lock.progress >= 1;
							lockRing.visible = true;
							const tp = target.body.position;
							lockRing.position.set(tp.x, 0.28, tp.z);
							// The ring tightens onto the target as the dwell completes.
							const r = locked ? 2.1 : 3.6 - 1.5 * lock.progress;
							lockRing.scale.set(r, 1, r);
							lockRing.rotation.y += locked ? 0 : dt * 2.4;
							lockRingMat.color.setHex(locked ? GL.green : GL.coolRim);
							lockRingMat.opacity = locked ? 0.75 : 0.3 + 0.25 * Math.sin(now / 90);
							if (locked && !playerLockedPrev) weaponSfx('lock-on');
							playerLockedPrev = locked;
						} else {
							lockRing.visible = false;
							playerLockedPrev = false;
						}
					}
					if (
						mode === 'elimination' &&
						player.combat.eliminated &&
						!roundOver &&
						!banner.startsWith('YOU ARE ELIMINATED')
					) {
						banner = 'YOU ARE ELIMINATED — press R to reset the round';
					}

					// Standings (~5 Hz): laps > checkpoints > distance to next gate;
					// finished vehicles hold their finishing position, eliminated sink.
					if (frame % 12 === 0) {
						const score = (r: Rig) => {
							if (r.combat.eliminated) return -1e12 + r.tracker.lapsCompleted;
							if (r.finished) return 1e12 - r.finishPos;
							const g =
								r.tracker.nextCheckpoint < rt.checkpoints.length
									? rt.checkpoints[r.tracker.nextCheckpoint]
									: rt.startFinish;
							const d = Math.hypot(
								g.gate.x - r.body.position.x,
								g.gate.z - r.body.position.z
							);
							return (
								(r.tracker.timing ? 1e9 : 0) +
								r.tracker.lapsCompleted * 1e7 +
								r.tracker.nextCheckpoint * 1e5 -
								d
							);
						};
						standings = [...all]
							.sort((a, b) => score(b) - score(a))
							.map((r, i) => ({
								pos: i + 1,
								label: r.label,
								arch: r.archetype.slice(0, 3).toUpperCase(),
								laps: r.tracker.lapsCompleted,
								cp: r.tracker.nextCheckpoint,
								hp: Math.max(0, Math.round(r.combat.chassisHealth)),
								note: r.combat.eliminated
									? 'OUT'
									: r.finished
										? `FIN P${r.finishPos}`
										: r.combat.isDown(now)
											? 'DOWN'
											: ''
							}));
					}

					renderer.render(scene, camera);
					// Frame-cost instrumentation (Phase 8c). CPU time for the whole
					// tick: simulation, AI, FX, and the render SUBMIT. GPU work is
					// asynchronous and is NOT included, so read this as "how much of
					// the 16.7ms budget the main thread spends", which is the side the
					// grid size actually scales.
					perfSamples[perfIdx] = performance.now() - frameT0;
					perfIdx = (perfIdx + 1) % perfSamples.length;
					if (perfFilled < perfSamples.length) perfFilled++;
					perfFrames++;
				};
				renderer.setAnimationLoop(tick);

				// ?glheadless=1 (the VANGUARD ?vgheadless pattern): pump the loop
				// off a MessageChannel so the sim keeps stepping in a hidden or
				// headless tab, where requestAnimationFrame never fires. Scripted
				// console drives against __greenline depend on this.
				let headlessStop: (() => void) | null = null;
				if (new URLSearchParams(window.location.search).has('glheadless')) {
					renderer.setAnimationLoop(null);
					const ch = new MessageChannel();
					let stopped = false;
					let lastTick = 0;
					ch.port1.onmessage = () => {
						if (stopped) return;
						// Real clock: this paces the pump itself, not the simulation.
						const t = performance.now();
						if (t - lastTick >= 1000 / 60) {
							lastTick = t;
							tick();
						}
						ch.port2.postMessage(0);
					};
					ch.port2.postMessage(0);
					headlessStop = () => {
						stopped = true;
						ch.port1.onmessage = null;
					};
				}

				cleanup = () => {
					headlessStop?.();
					renderer.setAnimationLoop(null);
					ro.disconnect();
					clearProjectiles();
					clearCaltrops();
					projGeo.dispose();
					projMat.dispose();
					caltropSpikeGeo.dispose();
					caltropPatchGeo.dispose();
					lockRingGeo.dispose();
					lockRingMat.dispose();
					shieldBubbleGeo.dispose();
					shieldBubbleMat.dispose();
					clearTimeout(flashTimer);
					window.removeEventListener('keydown', onKeyDown);
					window.removeEventListener('keyup', onKeyUp);
					window.removeEventListener('blur', onBlur);
					stage.removeEventListener('pointerdown', onPointerDown);
					stage.removeEventListener('pointermove', onPointerMove);
					stage.removeEventListener('pointerup', endPointer);
					stage.removeEventListener('pointercancel', endPointer);
					stage.removeEventListener('pointerleave', endPointer);
					delete (window as unknown as Record<string, unknown>).__greenline;
					rigVis.dispose();
					renderer.dispose();
					renderer.domElement.remove();
				};
				if (disposed) cleanup();
			} catch (e) {
				bootError = e instanceof Error ? e.message : 'Could not start the movement prototype.';
			}
		})();

		return () => {
			disposed = true;
			cleanup?.();
		};
	});
</script>

<div class="gl-root">
	<div class="gl-stage" bind:this={stage}></div>

	{#if bootError}
		<div class="gl-error">{bootError}</div>
	{/if}

	{#if banner}
		<div class="gl-banner">{banner}</div>
	{/if}

	{#if countText}
		<div class="glb gl-countdown" class:go={countText === 'GO'}>
			<span class="gl-count-num">{countText}</span>
		</div>
	{/if}

	<div class="glb gl-hud">
		<div class="gl-tag">
			<span class="gl-tag-line" aria-hidden="true"></span>
			<span class="gl-tag-mark">GREENLINE</span>
			<span class="gl-tag-meta">{track.name.toUpperCase()} · {mode.toUpperCase()}</span>
		</div>

		<div class="gl-cluster">
			<div class="gl-speed">{speedMph}<span class="gl-unit">MPH</span></div>

			<div class="gl-health-bar">
				<div
					class="gl-health-fill"
					class:low={chud.hp / Math.max(1, chud.max) <= 0.35}
					style:width="{Math.max(0, (chud.hp / Math.max(1, chud.max)) * 100)}%"
				></div>
			</div>
			<div class="gl-health-line">CHASSIS {chud.hp}/{chud.max}</div>
			<div class="gl-pools">
				<div class="gl-pool" class:gone={chud.armor <= 0}>
					<span class="gl-pool-name">ARM</span>
					<span class="gl-pool-track"
						><span
							class="gl-pool-fill"
							style:width="{Math.max(0, (chud.armor / Math.max(1, chud.armorMax)) * 100)}%"
						></span></span
					>
					<span class="gl-pool-num">{chud.armor <= 0 ? 'GONE' : chud.armor}</span>
				</div>
				<div class="gl-pool" class:dead={chud.mountDown}>
					<span class="gl-pool-name">MNT</span>
					<span class="gl-pool-track"
						><span
							class="gl-pool-fill"
							style:width="{Math.max(0, (chud.mount / Math.max(1, chud.mountMax)) * 100)}%"
						></span></span
					>
					<span class="gl-pool-num">{chud.mountDown ? 'DOWN' : chud.mount}</span>
				</div>
			</div>
			<div class="gl-status-row">
				{#if chud.status === 'DISRUPTED'}<span class="gl-st gl-st-disrupted">DISRUPTED</span>{/if}
				{#if chud.status === 'DOWN'}<span class="gl-st gl-st-down">DOWN {chud.downLeft.toFixed(1)}s</span>{/if}
				{#if chud.status === 'ELIMINATED'}<span class="gl-st gl-st-elim">ELIMINATED</span>{/if}
				{#if chud.mountDown && chud.status !== 'ELIMINATED'}<span class="gl-st gl-st-weapon">WEAPON DOWN</span>{/if}
				{#if chud.oiled}<span class="gl-st gl-st-oiled">OILED</span>{/if}
				{#if chud.tethered}<span class="gl-st gl-st-tether">TETHERED</span>{/if}
				{#if chud.shieldPct > 0}<span class="gl-st gl-st-shield">SHIELD {Math.round(chud.shieldPct * 100)}%</span>{/if}
				{#if !chud.armed}<span class="gl-st gl-st-safe">WEAPONS SAFE / CROSS THE LINE</span>{/if}
				{#if hud.offTrack}<span class="gl-st gl-st-offtrack">OFF TRACK</span>{/if}
				{#if hud.drafting}<span class="gl-st gl-st-draft">DRAFT</span>{/if}
				{#each chud.slots.filter((w) => w.lock) as w (w.slot)}
					{#if w.lock?.locked}
						<span class="gl-st gl-st-locked">LOCKED — {w.short} READY</span>
					{:else}
						<span class="gl-st gl-st-locking">LOCKING {Math.round((w.lock?.progress ?? 0) * 100)}%</span>
					{/if}
				{/each}
			</div>

			<div class="gl-weapons">
				{#each chud.slots as w (w.slot)}
					<div
						class="gl-wcell"
						class:ready={chud.armed && !w.offline && w.ready <= 0 && !w.lock}
						class:offline={w.offline}
						class:safe={!chud.armed && !w.offline}
						class:locking={!w.offline && !!w.lock && !w.lock.locked}
						class:locked={!w.offline && !!w.lock?.locked}
						class:active={!w.offline && w.active}
						class:passive={w.passive}
					>
						<span class="gl-wname">{w.short}</span>
						<span class="gl-wstate"
							>{w.offline
								? 'OFFLINE'
								: !chud.armed
									? 'SAFE'
									: w.passive
										? 'ON'
										: w.active
											? 'ACTIVE'
											: w.ready > 0
												? `${w.ready.toFixed(1)}s`
												: w.lock
													? w.lock.locked
														? 'LOCKED'
														: `LOCK ${Math.round(w.lock.progress * 100)}%`
													: 'READY'}</span
						>
						<span class="gl-wkey">{w.key}</span>
					</div>
				{/each}
				<!-- EMP / oil / tether are equipped weapons now (Phase 8g); they render
				     in the slot cells above. Ram is the last fixed always-on tool. -->
				<div class="gl-wcell" class:ready={chud.ready.ram <= 0}>
					<span class="gl-wname">RAM</span>
					<span class="gl-wstate">{chud.ready.ram <= 0 ? 'ARMED' : `${chud.ready.ram.toFixed(1)}s`}</span>
					<span class="gl-wkey">NOSE HIT</span>
				</div>
			</div>

			<div class="gl-meter" class:charged={chud.meter >= 0.999}>
				<span class="gl-meter-label">DRIFT</span>
				<span class="gl-meter-track"
					><span class="gl-meter-fill" style:width="{Math.round(chud.meter * 100)}%"></span></span
				>
				<span class="gl-meter-num">{Math.round(chud.meter * 100)}%</span>
			</div>

			{#if chud.abilities.length}
				<div class="gl-abilities">
					{#each chud.abilities as a (a.slot)}
						<div
							class="gl-acell"
							class:ready={chud.armed && a.ready && !a.active}
							class:active={a.active}
							class:safe={!chud.armed}
							class:charge={chud.armed && !a.ready && !a.active && a.needMeter}
						>
							<span class="gl-wname">{a.short}</span>
							<span class="gl-wstate"
								>{!chud.armed
									? 'SAFE'
									: a.active
										? 'ACTIVE'
										: a.cooldown > 0
											? `${a.cooldown.toFixed(1)}s`
											: a.ready
												? 'READY'
												: 'CHARGE'}</span
							>
							<span class="gl-wkey">{a.key}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if standings.length}
			<div class="gl-standings">
				{#each standings as s (s.label)}
					<div class="gl-stand-row" class:me={s.label === 'YOU'}>
						<span class="gl-stand-pos">P{s.pos}</span>
						<span class="gl-stand-label">{s.label}</span>
						<span class="gl-stand-arch">{s.arch}</span>
						<span class="gl-stand-note">{s.note || `L${s.laps} · CP${s.cp}`}</span>
						<span class="gl-stand-hp" class:low={s.hp <= 35}>{s.hp}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="glb gl-timing">
		{#if hud.timing}
			<div class="gl-timing-strip">
				<span class="gl-t-cell"><span class="gl-t-label">LAP</span><span class="gl-t-val">{hud.lap}</span></span>
				<span class="gl-t-cell"><span class="gl-t-label">CP</span><span class="gl-t-val">{hud.cp}/{hud.total}</span></span>
				<span class="gl-t-cell"><span class="gl-t-label">TIME</span><span class="gl-t-val">{formatLapMs(hud.currentMs)}</span></span>
				<span class="gl-t-cell"><span class="gl-t-label">LAST</span><span class="gl-t-val dim">{formatLapMs(hud.lastMs)}</span></span>
				<span class="gl-t-cell"><span class="gl-t-label">BEST</span><span class="gl-t-val best">{formatLapMs(hud.bestMs)}</span></span>
			</div>
		{:else}
			<div class="gl-timing-idle">CROSS THE START LINE TO BEGIN TIMING</div>
		{/if}
		{#if lapFlash}
			<div class="gl-flash">{lapFlash}</div>
		{/if}
	</div>

	<div class="glb gl-controls">
		{padName ? `PAD: ${padName}` : 'KEYBOARD'} · {keyHint} · ESC PAUSE
	</div>

	<div class="gl-map">
		<Minimap runtime={rt} {pose} nextCheckpoint={hud.cp} others={aiPoses} />
	</div>

	{#if paused}
		<!-- Pause menu (Phase 8e). The sim is frozen on its own clock behind
		     this (see the pause block up top), so nothing ages while it is open.
		     Escape steps back out, matching the settings-overlay convention. -->
		<div class="glb gl-pause" role="dialog" aria-label="Paused" aria-modal="true">
			<div class="gl-pause-panel">
				<div class="gl-pause-title">PAUSED</div>
				<div class="gl-pause-sub">{track.name.toUpperCase()} · LAP {hud.lap}</div>
				<div class="gl-pause-actions">
					<button class="gl-pause-btn gl-pause-primary" onclick={() => setPaused(false)}>
						RESUME
					</button>
					<button
						class="gl-pause-btn"
						onclick={() => {
							resetRound();
							setPaused(false);
						}}
					>
						RESTART ROUND
					</button>
					{#if onFeedback}
						<button class="gl-pause-btn" onclick={onFeedback}>SEND FEEDBACK</button>
					{/if}
					{#if onQuit}
						<button class="gl-pause-btn gl-pause-quit" onclick={onQuit}>QUIT TO GARAGE</button>
					{/if}
				</div>
				<div class="gl-pause-hint">ESC RESUMES</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.gl-root {
		position: fixed;
		inset: 0;
		background: #04060a;
		font-family: 'Saira Condensed', sans-serif;
		color: #dfe8ee;
		z-index: 10;
	}
	.gl-stage {
		position: absolute;
		inset: 0;
	}
	.gl-stage :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.gl-error {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: #ffd9a0;
		background: rgba(7, 10, 14, 0.94);
		border: 1px solid rgba(255, 176, 46, 0.6);
		padding: 1rem 1.5rem;
	}

	/* ------------------------------------------------------------------ */
	/* Race HUD. Legibility under motion comes first: solid dark plates,  */
	/* hairline steel borders, mono digits for anything that ticks, no    */
	/* blur or glow effects over the moving scene. Green marks only the   */
	/* player (YOU row, best lap, READY) and amber only impact states.    */
	/* ------------------------------------------------------------------ */
	.gl-banner {
		position: absolute;
		top: 22%;
		left: 50%;
		transform: translateX(-50%);
		color: var(--glb-chrome-hi);
		background: rgba(4, 7, 11, 0.88);
		border: 1px solid var(--glb-line-strong);
		border-bottom: 2px solid rgba(42, 229, 126, 0.75);
		padding: 0.6rem 1.6rem;
		font: 600 1rem var(--glb-font-ui);
		letter-spacing: 0.22em;
		white-space: nowrap;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
	}
	/* Start countdown: same dark-plate + mono-digit language as the timing */
	/* strip, just scaled up and centered. Steel border while counting, the */
	/* signature green on GO (green = go/ready everywhere in this HUD).      */
	.gl-countdown {
		position: absolute;
		top: 38%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 5.5rem;
		padding: 0.5rem 1.4rem 0.6rem;
		background: rgba(4, 7, 11, 0.82);
		border: 1px solid var(--glb-line-strong);
		border-bottom: 2px solid var(--glb-steel);
		border-radius: 2px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
		pointer-events: none;
	}
	.gl-count-num {
		font-family: var(--glb-font-data);
		font-size: 3.4rem;
		line-height: 1;
		letter-spacing: 0.06em;
		color: var(--glb-chrome-hi);
	}
	.gl-countdown.go {
		border-bottom-color: var(--glb-green);
	}
	.gl-countdown.go .gl-count-num {
		color: var(--glb-green-ui);
	}
	.gl-hud {
		position: absolute;
		top: 1rem;
		left: 1rem;
		pointer-events: none;
	}
	.gl-tag {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.5rem;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
	}
	.gl-tag-line {
		width: 1.4rem;
		height: 2px;
		background: linear-gradient(90deg, rgba(42, 229, 126, 0.2), #2ae57e);
	}
	.gl-tag-mark {
		font-family: var(--glb-font-display);
		font-size: 0.7rem;
		letter-spacing: 0.02em;
		transform: skewX(-7deg);
		color: var(--glb-chrome-mid);
	}
	.gl-tag-meta {
		font: 600 0.62rem var(--glb-font-ui);
		letter-spacing: 0.2em;
		color: var(--glb-ink-dim);
	}
	.gl-cluster {
		width: 15.5rem;
		background: rgba(4, 7, 11, 0.72);
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		padding: 0.55rem 0.65rem 0.6rem;
	}
	.gl-speed {
		font-family: var(--glb-font-data);
		font-size: 2.5rem;
		line-height: 1;
		color: var(--glb-chrome-hi);
	}
	.gl-unit {
		font: 600 0.7rem var(--glb-font-ui);
		margin-left: 0.4rem;
		letter-spacing: 0.18em;
		color: var(--glb-ink-dim);
	}
	.gl-health-bar {
		margin-top: 0.55rem;
		height: 0.5rem;
		background: rgba(13, 19, 25, 0.9);
		border: 1px solid var(--glb-line-strong);
	}
	.gl-health-fill {
		height: 100%;
		background: linear-gradient(180deg, #eef4f8, #93a3b0);
		transition: width 120ms linear;
	}
	.gl-health-fill.low {
		background: linear-gradient(180deg, #ffd9a0, #ffb02e);
	}
	.gl-health-line {
		margin-top: 0.25rem;
		font: 600 0.66rem var(--glb-font-ui);
		letter-spacing: 0.16em;
		color: var(--glb-ink-dim);
	}
	/* Secondary pools: compact ARM / MNT pips under the chassis bar. Steel
	   while intact; a dead pool flips its label amber (impact color). */
	.gl-pools {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.3rem;
	}
	.gl-pool {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.gl-pool-name {
		font: 600 0.54rem var(--glb-font-ui);
		letter-spacing: 0.12em;
		color: var(--glb-ink-faint);
	}
	.gl-pool-track {
		flex: 1;
		height: 0.28rem;
		background: rgba(13, 19, 25, 0.9);
		border: 1px solid var(--glb-line);
	}
	.gl-pool-fill {
		display: block;
		height: 100%;
		background: #78a5cd;
		transition: width 120ms linear;
	}
	.gl-pool-num {
		min-width: 1.9rem;
		text-align: right;
		font-family: var(--glb-font-data);
		font-size: 0.6rem;
		color: var(--glb-steel);
	}
	.gl-pool.gone .gl-pool-num,
	.gl-pool.dead .gl-pool-num {
		color: var(--glb-amber);
	}
	.gl-pool.dead .gl-pool-name {
		color: var(--glb-amber);
	}
	.gl-st-weapon {
		color: #170d00;
		background: var(--glb-amber);
		border-color: #ffd9a0;
	}
	.gl-wcell.offline {
		border-color: rgba(255, 176, 46, 0.55);
	}
	.gl-wcell.offline .gl-wstate {
		color: var(--glb-amber);
	}
	.gl-status-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		min-height: 0;
		margin-top: 0.3rem;
	}
	.gl-st {
		font: 700 0.66rem var(--glb-font-ui);
		letter-spacing: 0.14em;
		padding: 0.12rem 0.4rem;
		border: 1px solid;
		border-radius: 1px;
		background: rgba(4, 7, 11, 0.9);
	}
	.gl-st-disrupted {
		color: #9cc4e8;
		border-color: rgba(120, 165, 205, 0.7);
	}
	.gl-st-down,
	.gl-st-elim {
		color: #170d00;
		background: #ffb02e;
		border-color: #ffd9a0;
	}
	.gl-st-oiled {
		color: #c9b2ff;
		border-color: rgba(180, 124, 255, 0.6);
	}
	.gl-st-tether {
		color: #ffd9a0;
		border-color: rgba(255, 217, 160, 0.55);
	}
	.gl-st-offtrack {
		color: #c9a15f;
		border-color: rgba(201, 161, 95, 0.55);
	}
	/* Weapons safe (on the grid / not yet over the line): steel, deliberately
	   NOT amber — this is a normal race-start state, not an impact or a fault. */
	.gl-st-safe {
		color: var(--glb-steel);
		border-color: var(--glb-line-strong);
	}
	/* Draft is a beneficial player state (free top-speed tow), so the signature
	   green, in line with weapon-READY / best-lap. Amber stays impact-only. */
	.gl-st-draft {
		color: #052b16;
		background: #8fffc4;
		border-color: #2ae57e;
	}
	.gl-st-shield {
		color: #052b16;
		background: #6fd3ff;
		border-color: #bfeeff;
	}
	/* Up to six cells now (primary + secondary + the four fixed tools):
	   three per row keeps every cell readable at the same width. */
	.gl-weapons {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.3rem;
		margin-top: 0.5rem;
	}
	.gl-wcell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.28rem 0.1rem 0.24rem;
		background: rgba(13, 19, 25, 0.75);
		border: 1px solid var(--glb-line);
		border-radius: 1px;
	}
	.gl-wname {
		font: 600 0.56rem var(--glb-font-ui);
		letter-spacing: 0.12em;
		color: var(--glb-ink-dim);
	}
	.gl-wstate {
		font-family: var(--glb-font-data);
		font-size: 0.7rem;
		line-height: 1;
		color: var(--glb-steel);
	}
	.gl-wcell.ready {
		border-color: rgba(42, 229, 126, 0.45);
	}
	.gl-wcell.ready .gl-wstate {
		color: var(--glb-green-ui);
	}
	/* Guided-weapon lock states: cool-rim while acquiring, green when the
	   lock completes (green = ready, the HUD's one meaning for it). */
	.gl-wcell.locking {
		border-color: rgba(120, 165, 205, 0.55);
	}
	.gl-wcell.locking .gl-wstate {
		color: #9cc4e8;
	}
	.gl-wcell.locked {
		border-color: rgba(42, 229, 126, 0.75);
	}
	.gl-wcell.locked .gl-wstate {
		color: var(--glb-green-ui);
	}
	/* Shield/blades deployed (an active timed window) reads cyan; a passive
	   jammer reads a steady dim on-state (no cooldown, no trigger). */
	.gl-wcell.active {
		border-color: rgba(111, 211, 255, 0.7);
	}
	.gl-wcell.active .gl-wstate {
		color: #6fd3ff;
	}
	.gl-wcell.passive {
		border-color: rgba(120, 165, 205, 0.4);
	}
	.gl-wcell.passive .gl-wstate {
		color: #9cc4e8;
	}
	/* Disarmed until this car crosses the start line: dimmed steel, so a cell
	   never reads READY for something that would not actually fire. */
	.gl-wcell.safe .gl-wstate,
	.gl-acell.safe .gl-wstate {
		color: var(--glb-steel-dim);
	}
	.gl-wcell.safe .gl-wname,
	.gl-acell.safe .gl-wname {
		opacity: 0.7;
	}
	.gl-st-locking {
		color: #9cc4e8;
		border-color: rgba(120, 165, 205, 0.7);
	}
	.gl-st-locked {
		color: #052b16;
		background: var(--glb-green);
		border-color: #c8ffe2;
	}
	.gl-wkey {
		font: 500 0.5rem var(--glb-font-ui);
		letter-spacing: 0.08em;
		color: var(--glb-ink-faint);
	}
	/* Drift meter: the shared ability resource. Green fill (it powers YOUR
	   abilities), brightening to a glow when fully charged. */
	.gl-meter {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}
	.gl-meter-label {
		font: 600 0.56rem var(--glb-font-ui);
		letter-spacing: 0.16em;
		color: var(--glb-ink-faint);
	}
	.gl-meter-track {
		flex: 1;
		height: 0.4rem;
		background: rgba(13, 19, 25, 0.9);
		border: 1px solid var(--glb-line-strong);
	}
	.gl-meter-fill {
		display: block;
		height: 100%;
		background: linear-gradient(180deg, #8fffc4, #2ae57e);
		transition: width 90ms linear;
	}
	.gl-meter.charged .gl-meter-fill {
		box-shadow: 0 0 8px rgba(42, 229, 126, 0.8);
	}
	.gl-meter-num {
		min-width: 2.3rem;
		text-align: right;
		font-family: var(--glb-font-data);
		font-size: 0.66rem;
		color: var(--glb-steel);
	}
	.gl-meter.charged .gl-meter-num {
		color: var(--glb-green-ui);
	}
	/* Ability cells: same chrome as the weapon cells. READY (meter + cooldown
	   satisfied) reads green; an ACTIVE nitro/grip window reads bright green;
	   CHARGE (meter still filling) reads a dim steel. */
	.gl-abilities {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.3rem;
		margin-top: 0.3rem;
	}
	.gl-acell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.28rem 0.1rem 0.24rem;
		background: rgba(13, 19, 25, 0.75);
		border: 1px solid var(--glb-line);
		border-radius: 1px;
	}
	.gl-acell.ready {
		border-color: rgba(42, 229, 126, 0.45);
	}
	.gl-acell.ready .gl-wstate {
		color: var(--glb-green-ui);
	}
	.gl-acell.active {
		border-color: rgba(42, 229, 126, 0.8);
		box-shadow: inset 0 0 8px rgba(42, 229, 126, 0.25);
	}
	.gl-acell.active .gl-wstate {
		color: #8fffc4;
	}
	.gl-acell.charge .gl-wstate {
		color: var(--glb-ink-faint);
	}
	.gl-standings {
		margin-top: 0.5rem;
		width: 15.5rem;
		background: rgba(4, 7, 11, 0.72);
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		padding: 0.3rem 0;
	}
	.gl-stand-row {
		position: relative;
		display: grid;
		grid-template-columns: 1.7rem 3.4rem 2.4rem 1fr 1.8rem;
		gap: 0.3rem;
		align-items: baseline;
		font-size: 0.72rem;
		color: var(--glb-ink-dim);
		padding: 0.1rem 0.55rem;
	}
	.gl-stand-pos {
		font-family: var(--glb-font-data);
		color: var(--glb-steel);
	}
	.gl-stand-label {
		font-weight: 600;
		letter-spacing: 0.08em;
		color: var(--glb-ink);
	}
	.gl-stand-arch {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: var(--glb-ink-faint);
	}
	.gl-stand-note {
		font-family: var(--glb-font-data);
		font-size: 0.64rem;
		color: var(--glb-ink-faint);
	}
	.gl-stand-hp {
		font-family: var(--glb-font-data);
		font-size: 0.66rem;
		text-align: right;
		color: var(--glb-steel);
	}
	.gl-stand-hp.low {
		color: var(--glb-amber);
	}
	.gl-stand-row.me {
		color: var(--glb-green-ui);
	}
	.gl-stand-row.me::before {
		content: '';
		position: absolute;
		left: 0;
		top: 2px;
		bottom: 2px;
		width: 2px;
		background: #2ae57e;
		box-shadow: 0 0 6px rgba(42, 229, 126, 0.8);
	}
	.gl-stand-row.me .gl-stand-label,
	.gl-stand-row.me .gl-stand-pos,
	.gl-stand-row.me .gl-stand-hp,
	.gl-stand-row.me .gl-stand-note {
		color: var(--glb-green-ui);
	}
	.gl-timing {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		pointer-events: none;
	}
	.gl-timing-strip {
		display: flex;
		gap: 1rem;
		background: rgba(4, 7, 11, 0.72);
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		padding: 0.4rem 0.9rem;
		white-space: nowrap;
	}
	.gl-t-cell {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
	}
	.gl-t-label {
		font: 600 0.58rem var(--glb-font-ui);
		letter-spacing: 0.18em;
		color: var(--glb-ink-faint);
	}
	.gl-t-val {
		font-family: var(--glb-font-data);
		font-size: 0.95rem;
		line-height: 1;
		color: var(--glb-chrome-hi);
	}
	.gl-t-val.dim {
		color: var(--glb-steel);
	}
	.gl-t-val.best {
		color: var(--glb-green-ui);
	}
	.gl-timing-idle {
		background: rgba(4, 7, 11, 0.72);
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		padding: 0.4rem 0.9rem;
		font: 600 0.66rem var(--glb-font-ui);
		letter-spacing: 0.24em;
		color: var(--glb-ink-dim);
		white-space: nowrap;
	}
	.gl-flash {
		background: rgba(4, 7, 11, 0.85);
		border: 1px solid var(--glb-line-strong);
		border-left: 2px solid #2ae57e;
		border-radius: 1px;
		padding: 0.28rem 0.8rem;
		font: 600 0.78rem var(--glb-font-ui);
		letter-spacing: 0.12em;
		color: var(--glb-ink);
		white-space: nowrap;
	}
	.gl-controls {
		position: absolute;
		bottom: 0.7rem;
		left: 50%;
		transform: translateX(-50%);
		max-width: min(92vw, 60rem);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: 500 0.6rem var(--glb-font-ui);
		letter-spacing: 0.14em;
		color: var(--glb-ink-faint);
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
		pointer-events: none;
	}
	.gl-map {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
	}

	/* ---- Pause menu (Phase 8e) ---- */
	.gl-pause {
		position: absolute;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Solid dark plate, no blur: the HUD legibility-first rule applies to
		   the pause scrim too, and a backdrop-filter over a live WebGL canvas
		   is exactly the cost the aging-desktop budget cannot spare. */
		background: rgba(2, 3, 4, 0.72);
	}
	.gl-pause-panel {
		min-width: min(88vw, 19rem);
		padding: 1.1rem 1.3rem 0.9rem;
		text-align: center;
		background: linear-gradient(180deg, #0b1016 0%, #05080b 100%);
		border: 1px solid var(--glb-line-strong);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.08),
			0 30px 80px rgba(0, 0, 0, 0.6);
	}
	.gl-pause-title {
		font-family: var(--glb-font-display);
		font-size: 1.5rem;
		letter-spacing: -0.01em;
		transform: skewX(-7deg);
		background: var(--glb-chrome-grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		user-select: none;
	}
	.gl-pause-sub {
		margin-top: 0.15rem;
		color: var(--glb-ink-faint);
		font-family: var(--glb-font-data);
		font-size: 0.64rem;
		letter-spacing: 0.16em;
	}
	.gl-pause-actions {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0.9rem 0 0.6rem;
	}
	.gl-pause-btn {
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		color: var(--glb-steel);
		font: 600 0.74rem var(--glb-font-ui);
		letter-spacing: 0.18em;
		padding: 0.45rem 1rem;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}
	.gl-pause-btn:hover,
	.gl-pause-btn:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line-strong);
		outline: none;
	}
	/* Green is surgical here, per the brand doctrine: the one action that puts
	   you back on the track gets the signature thread, nothing else does. */
	.gl-pause-primary {
		color: var(--glb-chrome-mid);
		border-color: var(--glb-line-strong);
	}
	.gl-pause-primary:hover,
	.gl-pause-primary:focus-visible {
		color: #8fffc4;
		border-color: rgba(42, 229, 126, 0.7);
		box-shadow: 0 0 14px rgba(42, 229, 126, 0.25);
	}
	/* Amber is impact, and abandoning a race is the destructive option here. */
	.gl-pause-quit:hover,
	.gl-pause-quit:focus-visible {
		color: var(--glb-amber);
		border-color: rgba(255, 176, 46, 0.55);
	}
	.gl-pause-hint {
		color: var(--glb-ink-faint);
		font-family: var(--glb-font-data);
		font-size: 0.58rem;
		letter-spacing: 0.2em;
	}
</style>
