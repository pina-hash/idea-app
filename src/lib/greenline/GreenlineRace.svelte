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
	}

	/**
	 * The subset of the live tuning DEFAULTS that the garage's hero numbers read,
	 * exported so a standalone garage screen (the real portal route) can show the
	 * same figures without mounting the tuning panel. Kept in lock-step with
	 * DEFAULTS below (health = COMBAT_DEFAULTS.maxHealth).
	 */
	export const GARAGE_BASELINE = { health: 100, mass: 180, engine: 2300, drag: 1.8 };
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { parseTrack } from '$lib/greenline/track-schema';
	import {
		buildRuntime,
		formatLapMs,
		headingToDir,
		LapTracker,
		surfaceState
	} from '$lib/greenline/track-runtime';
	import {
		COMBAT_DEFAULTS,
		cooldownRemaining,
		driveMods,
		slotCooldownRemaining,
		splitPools,
		TETHER_SLACK_DIST,
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
		type WeaponLock,
		type WeaponSlotId
	} from '$lib/greenline/combat';
	import { AI_DEFAULTS, AiDriver, type AiTuning } from '$lib/greenline/ai';
	import { NIGHT_ENV } from '$lib/greenline/environment';
	import {
		archetypeById,
		defaultLoadout,
		neutralStats,
		parseLoadout,
		resolveLoadout,
		sanitizeLoadoutWeapons,
		serializeLoadout,
		type ArchetypeId,
		type Loadout,
		type PartSlot,
		type ResolvedStats
	} from '$lib/greenline/loadout';
	import { audioEngine } from '$lib/greenline/audio-engine';
	import {
		COM_DROP,
		createRigVisuals,
		GL,
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
	 * standstill), A/D steer, Space handbrake, F fire EMP, E drop oil,
	 * Q fire tether, R reset round. Gamepad: left stick steer, RT throttle,
	 * LT brake, A handbrake, RB fire, X oil, LB tether.
	 */

	const {
		loadout,
		onFinish
	}: {
		/**
		 * The build to race. When omitted the component owns its loadout locally
		 * (the dev harness: seeded from / persisted to localStorage). The real
		 * portal route always passes one, chosen in its own garage screen.
		 */
		loadout?: Loadout;
		/** Called once when the player completes a RACE. */
		onFinish?: (outcome: RaceOutcome) => void;
	} = $props();

	const DEFAULTS = {
		engineForce: 2300,
		brakeForce: 50,
		handbrakeForce: 50,
		handbrakeGrip: 0.65,
		aeroDrag: 1.8,
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
		camDistance: 9,
		camHeight: 3.5,
		camStiffness: 5,
		...COMBAT_DEFAULTS,
		/** Screen shake amplitude at full trauma, world units. */
		shakeMax: 0.6,
		/** Trauma decay per second (higher = shake dies faster). */
		shakeDecay: 1.6,
		/** Particle count multiplier for every burst. */
		fxDensity: 1,
		lapTarget: 3,
		aiCount: 3,
		aiTopSpeed: AI_DEFAULTS.topSpeed,
		aiCorner: AI_DEFAULTS.cornerAccel,
		aiAggression: AI_DEFAULTS.aggression
	};

	const tuning = $state({ ...DEFAULTS });

	const track = parseTrack(provingGroundJson);
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
		playerLoadout = sanitizeLoadoutWeapons({ ...playerLoadout, archetype: id });
		persistLoadout();
	};
	const equipPart = (slot: PartSlot, partId: string) => {
		playerLoadout = sanitizeLoadoutWeapons({
			...playerLoadout,
			parts: { ...playerLoadout.parts, [slot]: partId }
		});
		persistLoadout();
	};

	let speedMph = $state(0);
	let padName = $state('');
	let bootError = $state('');
	let banner = $state('');
	let resetRound: () => void = () => {};

	// The bottom controls hint reflects the CURRENT (remappable) key bindings.
	const keyHint = $derived(
		[
			`${keyLabel(controlSettings.keyboard.accelerate)}/${keyLabel(controlSettings.keyboard.brake)} DRIVE`,
			`${keyLabel(controlSettings.keyboard.steerLeft)}/${keyLabel(controlSettings.keyboard.steerRight)} STEER`,
			`${keyLabel(controlSettings.keyboard.handbrake)} HANDBRAKE`,
			`${keyLabel(controlSettings.keyboard.fireWeaponPrimary)} PRIMARY`,
			`${keyLabel(controlSettings.keyboard.fireWeaponSecondary)} SECONDARY`,
			`${keyLabel(controlSettings.keyboard.fire)} EMP`,
			`${keyLabel(controlSettings.keyboard.oil)} OIL`,
			`${keyLabel(controlSettings.keyboard.tether)} TETHER`,
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
		offTrack: false
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
		ready: { emp: 0, oil: 0, tether: 0, ram: 0 },
		/** Equipped-weapon cells (primary always; secondary only when equipped). */
		slots: [] as SlotHudCell[]
	});
	let lapFlash = $state('');
	// Race-start countdown text ('3' | '2' | '1' | 'GO' | ''), driven by the loop.
	let countText = $state('');

	let stage: HTMLDivElement;

	// A tuning value can momentarily read NaN (e.g. a bad stored loadout); fall
	// back to the default so the sim never ingests a non-finite value.
	const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);

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
				// (environment.ts). A future day/night or weather system swaps the
				// preset; nothing in here hardcodes a time of day.
				const ENV = NIGHT_ENV;

				const scene = new THREE.Scene();
				scene.background = new THREE.Color(ENV.sky.base);
				scene.fog = new THREE.FogExp2(ENV.fog.color, ENV.fog.density);

				const camera = new THREE.PerspectiveCamera(
					70,
					stage.clientWidth / Math.max(1, stage.clientHeight),
					0.1,
					1000
				);

				scene.add(
					new THREE.HemisphereLight(ENV.hemisphere.sky, ENV.hemisphere.ground, ENV.hemisphere.intensity)
				);
				for (const kl of ENV.keyLights) {
					const dl = new THREE.DirectionalLight(kl.color, kl.intensity);
					dl.position.set(kl.position.x, kl.position.y, kl.position.z);
					scene.add(dl);
				}

				// Deterministic RNG for every generated texture / scatter detail, so
				// the yard looks identical run to run (and headless drives stay
				// reproducible; Math.random stays out of world building).
				let texSeed = 1337;
				const trand = () => {
					texSeed = (texSeed * 16807) % 2147483647;
					return texSeed / 2147483647;
				};

				// ---- Sky: gradient dome from the preset (no shader) ----
				{
					const c = document.createElement('canvas');
					c.width = 512;
					c.height = 256;
					const g2 = c.getContext('2d')!;
					const grad = g2.createLinearGradient(0, 0, 0, 256);
					grad.addColorStop(0, ENV.sky.top);
					grad.addColorStop(0.34, ENV.sky.high);
					grad.addColorStop(0.47, ENV.sky.horizon);
					grad.addColorStop(0.5, ENV.sky.glow);
					grad.addColorStop(0.55, ENV.sky.base);
					grad.addColorStop(1, ENV.sky.base);
					g2.fillStyle = grad;
					g2.fillRect(0, 0, 512, 512);
					// Motivated horizon glows: warm one heading, cool the opposite.
					g2.globalCompositeOperation = 'lighter';
					for (const [u, col] of [
						[0.22, ENV.sky.warmGlow],
						[0.68, ENV.sky.coolGlow]
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
					const skyTex = new THREE.CanvasTexture(c);
					skyTex.colorSpace = THREE.SRGBColorSpace;
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
				const propRuns = new Map<
					string,
					{ buckets: Record<string, PropGeo>; list: { x: number; z: number; hd: number }[] }
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
					run.list.push({ x, z, hd });
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
							p: [1.14, headY + 0.28, off],
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
					const cone: PropPart[] = HEAD_OFFSETS.map((off) => ({
						g: new THREE.ConeGeometry(3.1, hgt + 3, 14, 1, true),
						p: [4.9, hgt / 2 - 0.6, off],
						r: [0, 0, -0.5]
					}));
					const pool: PropPart[] = HEAD_OFFSETS.map((off) => ({
						g: new THREE.CircleGeometry(3.4, 20),
						p: [9.4, 0.03, off],
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
						disc.position.set(prop.x, 0.018, prop.z);
						scene.add(disc);
					} else if (prop.type === 'lightTower') {
						const hgt = prop.height ?? 15;
						placeProp(`tower:${hgt}`, prop.x, prop.z, prop.headingDeg, towerTpl(hgt));
						const head = worldOf(prop.x, prop.z, prop.headingDeg, 0.9, 0);
						addHalo('flood', head.x, hgt + 1.05, head.z, 6);
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
							prop.h * 1.05,
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
						const m = Math.min(prop.inner.length, prop.outer.length);
						const verts = new Float32Array(m * 2 * 3);
						const uvs = new Float32Array(m * 2 * 2);
						let along = 0;
						for (let i = 0; i < m; i++) {
							if (i > 0)
								along += Math.hypot(
									prop.inner[i].x - prop.inner[i - 1].x,
									prop.inner[i].z - prop.inner[i - 1].z
								);
							verts.set([prop.inner[i].x, 0.05, prop.inner[i].z], i * 6);
							verts.set([prop.outer[i].x, prop.height, prop.outer[i].z], i * 6 + 3);
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
						// Cap rail + posts, merged into one draw call (world-space).
						const railParts: PropPart[] = [];
						for (let i = 0; i < m - 1; i++) {
							const a = prop.outer[i];
							const b = prop.outer[i + 1];
							const len = Math.hypot(b.x - a.x, b.z - a.z);
							const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
							railParts.push({
								g: uBox,
								p: [(a.x + b.x) / 2, prop.height + 0.42, (a.z + b.z) / 2],
								s: [len + 0.15, 0.16, 0.3],
								r: [0, yaw, 0]
							});
							if (i % 2 === 0)
								railParts.push({
									g: uBox,
									p: [a.x, prop.height + 0.14, a.z],
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
								iv.set(t.x, 0, t.z);
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
						for (let i = 0; i < count; i++) {
							const p = pts[(i * step) % pts.length];
							im.makeTranslation(p.x, 1.3, p.z);
							posts.setMatrixAt(i, im);
						}
						scene.add(posts);
						const railPts = [...pts, pts[0]].map((p) => new THREE.Vector3(p.x, 2.55, p.z));
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
				{
					// Cumulative distance along the centerline drives the ribbon's
					// texture tiling and the braking-zone wear ramps. The last
					// cross-section is duplicated (with the end-of-loop u) so the
					// closing quad doesn't smear the whole texture backwards.
					const cum: number[] = [0];
					for (let i = 1; i < nC; i++)
						cum[i] =
							cum[i - 1] +
							Math.hypot(rt.center[i].x - rt.center[i - 1].x, rt.center[i].z - rt.center[i - 1].z);
					const total =
						cum[nC - 1] +
						Math.hypot(rt.center[0].x - rt.center[nC - 1].x, rt.center[0].z - rt.center[nC - 1].z);
					// Rubbered-in braking zones: the surface darkens on the approach
					// to every gate and briefly past it. Purely visual.
					const gates = [...rt.checkpoints, rt.startFinish];
					const gateS = gates.map((g) => {
						let best = 0;
						let bd = Infinity;
						for (let i = 0; i < nC; i++) {
							const d =
								(rt.center[i].x - g.gate.x) ** 2 + (rt.center[i].z - g.gate.z) ** 2;
							if (d < bd) {
								bd = d;
								best = i;
							}
						}
						return cum[best];
					});
					const wearAt = (s: number) => {
						let w = 0;
						for (const gs of gateS) {
							const d = (((gs - s) % total) + total) % total;
							if (d < 30) w = Math.max(w, 1 - d / 30);
							else if (total - d < 9) w = Math.max(w, (1 - (total - d) / 9) * 0.5);
						}
						return w;
					};
					const verts = new Float32Array((nC + 1) * 2 * 3);
					const uvs = new Float32Array((nC + 1) * 2 * 2);
					const cols = new Float32Array((nC + 1) * 2 * 3);
					const tile = 13.5;
					for (let i = 0; i <= nC; i++) {
						const j = i % nC;
						const s = i === nC ? total : cum[i];
						verts.set([rt.leftEdge[j].x, 0.03, rt.leftEdge[j].z], i * 6);
						verts.set([rt.rightEdge[j].x, 0.03, rt.rightEdge[j].z], i * 6 + 3);
						uvs.set([s / tile, 0], i * 4);
						uvs.set([s / tile, 1], i * 4 + 2);
						const tone = 1 - 0.5 * wearAt(s);
						cols.set([tone, tone, tone], i * 6);
						cols.set([tone, tone, tone], i * 6 + 3);
					}
					const idx: number[] = [];
					for (let i = 0; i < nC; i++) {
						idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
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
						stain.position.set(g.gate.x - d.x * back, 0.045, g.gate.z - d.z * back);
						stain.scale.set(size, size * 0.7, 1);
						scene.add(stain);
					}
				}
				// Painted edge lines: with a variable-width ribbon the corridor's
				// breathing (wide pad, narrow yard) must read at speed. Cool worn
				// white, per the steel-not-green night palette.
				for (const edge of [rt.leftEdge, rt.rightEdge]) {
					const pts = [...edge, edge[0]].map((p) => new THREE.Vector3(p.x, 0.06, p.z));
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
						post.position.set(px, 1.3, pz);
						group.add(post);
					}
					const pane = new THREE.Mesh(new THREE.PlaneGeometry(g.gate.halfWidth * 2, 2.6), mat);
					pane.position.set(g.gate.x, 1.3, g.gate.z);
					pane.rotation.y = Math.atan2(g.dx, g.dz);
					group.add(pane);
					scene.add(group);
					return { mat, postMat };
				};
				const cpMats = rt.checkpoints.map((g) => paneFor(g, 0x00ff41, 0.1));
				paneFor(rt.startFinish, 0xc8ff00, 0.2);
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

				// ---- Vehicle rigs: ONE pipeline for every vehicle ----
				// (COM_DROP / WHEEL_RADIUS / WHEEL_CONNECTIONS come from
				// rig-visual.ts, shared with the garage preview's static pose.)
				const SPAWN_Y = 0.9;

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
					/** The archetype's chrome-ramp body tone (scorch lerps from it). */
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
					/** Crumple state: 0 pristine .. 3 wrecked; drives vertex jitter. */
					dentStage: number;
					/** Pristine hull-geometry positions, restored on heal/reset. */
					dentBase: Float32Array;
					/** Cyan crackle ring shown while disrupted (inside carGroup). */
					stunMat: InstanceType<typeof THREE.MeshBasicMaterial>;
					stunRing: InstanceType<typeof THREE.Mesh>;
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
					warmIdx: number;
					lastOnRibbon: boolean;
					steerCurrent: number;
					hx: number;
					hz: number;
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
				// Starting grid: slot 0 is the player, alone on the line. The AI fill
				// staggered rows of two behind it, alternating right/left of the
				// centerline. Rows step back GRID_ROW_STEP_PTS centerline points (~8m,
				// well over a 3.8m car length) and the two columns sit 2 x GRID_LATERAL
				// = 6m apart (car half-width 0.85m), so a normal launch never puts
				// neighbouring slots in contact. The countdown + ram grace are the
				// primary guards; this spacing is the structural one, so cars are not
				// already touching the instant controls unlock.
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
					rig.dentBase = built.dentBase;
					rig.baseColor = built.tone;
					rig.visualKey = built.key;
					// Fresh geometry is pristine; the frame loop re-applies whatever
					// stage the rig's current health calls for.
					rig.dentStage = 0;
				};

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
					body.position.set(spawn.x, SPAWN_Y, spawn.z);
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
						dentStage: 0,
						dentBase: new Float32Array(0),
						stunMat,
						stunRing,
						mountMat: rigMountMat,
						mountDead: false,
						smokeAcc: 0,
						dripAcc: 0,
						dustAcc: 0,
						dustWheel: 2,
						preVx: 0,
						preVz: 0,
						flipAcc: 0,
						warmIdx: spawn.warmIdx,
						lastOnRibbon: true,
						steerCurrent: 0,
						hx: 1,
						hz: 0,
						prevX: spawn.x,
						prevZ: spawn.z,
						flashUntil: 0,
						finished: false,
						finishPos: 0,
						raceStartMs: null,
						finishAtMs: null,
						spawn
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

				// World-space anchor for a hit's feedback: the actual zone struck
				// (nose, the flank facing the attacker, or the mount socket itself
				// for rear hits), never the generic rig center.
				const hitAnchor = (rig: Rig, srcX: number, srcZ: number, zone: HitZone) => {
					const p = rig.body.position;
					if (zone === 'front') {
						return { x: p.x + rig.hx * 1.8, y: p.y + 0.5, z: p.z + rig.hz * 1.8 };
					}
					if (zone === 'rear') {
						const mp = rig.parts.mount.getWorldPosition(tmpWorld);
						return { x: mp.x, y: mp.y + 0.15, z: mp.z };
					}
					const px = -rig.hz;
					const pz = rig.hx;
					const side = (srcX - p.x) * px + (srcZ - p.z) * pz >= 0 ? 1 : -1;
					return { x: p.x + px * side, y: p.y + 0.55, z: p.z + pz * side };
				};

				// Dead-mount visual state: the socket chars dark and sits knocked
				// askew; the per-frame sputter sparks key off rig.mountDead.
				const setMountDead = (rig: Rig, dead: boolean) => {
					if (rig.mountDead === dead) return;
					rig.mountDead = dead;
					rig.mountMat.color.setHex(dead ? 0x0a0c0e : 0x1a2128);
					rig.mountMat.roughness = dead ? 0.9 : 0.5;
					rig.parts.mount.rotation.z = dead ? 0.22 : 0;
				};

				// Reconcile visible armor plates with the AGGREGATE armor pool (one
				// pool per vehicle, deliberately not per-plate tracking): the plate
				// count tracks the pool fraction, and each strip detaches the
				// visible plate nearest the hit, so the battered side goes bare
				// first and exposes the hull underneath. `silent` skips the burst
				// FX for non-hit reconciles (garage swaps, heals).
				const syncArmorPlates = (rig: Rig, hitX?: number, hitZ?: number, silent = false) => {
					const plates = rig.parts.armor.children;
					if (!plates.length) return;
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
				};

				// Full-heal restore (RACE recovery, round reset): every plate back
				// on, the mount back online. The pools themselves are the caller's.
				const restoreRigCondition = (rig: Rig) => {
					for (const p of rig.parts.armor.children) p.visible = true;
					setMountDead(rig, false);
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
					const l = sanitizeLoadoutWeapons(rawLoadout);
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
				// AIs cycle the four archetypes (stock parts) so every round has
				// build variety to race and fight against: AI-1 armor, AI-2
				// velocity, AI-3 handling, AI-4 systems, then repeat. Identity is
				// carried by the archetype bodywork itself, not a color array.
				const AI_ARCHS: ArchetypeId[] = ['armor', 'velocity', 'handling', 'systems'];
				// Weapon fits cycle alongside the archetypes (each respects its
				// archetype's mount capacity: armor 4, velocity 2, handling 4,
				// systems 5), so combat testing runs against both weapons and
				// against a rocket-primary build.
				const AI_WEAPONS: [string, string][] = [
					['auto-turret', 'deployable-blades'], // armor (4): 2 + 2
					['radar-jammer', 'shotgun-burst'], // velocity (2): 1 + 1
					['energy-shield', 'caltrops'], // handling (4): 3 + 1
					['railgun', 'homing-rocket'] // systems (5): 3 + 2
				];
				const aiLoadoutFor = (k: number): Loadout => {
					const l = defaultLoadout(AI_ARCHS[(k - 1) % AI_ARCHS.length]);
					const [wp, ws] = AI_WEAPONS[(k - 1) % AI_WEAPONS.length];
					l.parts.weaponPrimary = wp;
					l.parts.weaponSecondary = ws;
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
					const n = Math.max(1, Math.min(6, Math.round(count)));
					for (let k = 1; k <= n; k++) {
						const arch = AI_ARCHS[(k - 1) % AI_ARCHS.length];
						const rig = makeRig(`ai-${k}`, `AI-${k}`, arch, slotPose(k));
						rig.ai = new AiDriver(rt);
						rig.bar = makeBar();
						applyLoadoutToRig(rig, aiLoadoutFor(k));
						ais.push(rig);
						aiPoses.push({ x: rig.spawn.x, z: rig.spawn.z, hx: 1, hz: 0, out: false });
					}
				};
				buildAis(num(tuning.aiCount, DEFAULTS.aiCount));

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
					fxList.push({ mesh, born: performance.now(), life: lifeMs, maxR, baseOpacity });
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
					const now = performance.now();
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
					const now = performance.now();
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
						p.born = performance.now();
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
				const applyDentStage = (rig: Rig, stage: number) => {
					rig.dentStage = stage;
					const attr = rig.bodyMesh.geometry.getAttribute('position') as InstanceType<
						typeof THREE.BufferAttribute
					>;
					const arr = attr.array as Float32Array;
					arr.set(rig.dentBase);
					for (let pass = 1; pass <= stage; pass++) {
						const amp = 0.05 * pass;
						for (let v = 0; v < arr.length; v += 3) {
							arr[v] += (Math.random() - 0.5) * amp;
							arr[v + 1] += (Math.random() - 0.5) * amp;
							arr[v + 2] += (Math.random() - 0.5) * amp;
						}
					}
					attr.needsUpdate = true;
					rig.bodyMesh.geometry.computeVertexNormals();
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
				const combatTuning = (): CombatTuning => ({
					maxHealth: num(tuning.maxHealth, DEFAULTS.maxHealth),
					empDamage: num(tuning.empDamage, DEFAULTS.empDamage),
					empRange: num(tuning.empRange, DEFAULTS.empRange),
					empConeDeg: num(tuning.empConeDeg, DEFAULTS.empConeDeg),
					empCooldownSec: num(tuning.empCooldownSec, DEFAULTS.empCooldownSec),
					disruptionSec: num(tuning.disruptionSec, DEFAULTS.disruptionSec),
					disruptEngineCut: num(tuning.disruptEngineCut, DEFAULTS.disruptEngineCut),
					disruptSteerCut: num(tuning.disruptSteerCut, DEFAULTS.disruptSteerCut),
					spinKick: num(tuning.spinKick, DEFAULTS.spinKick),
					downSec: num(tuning.downSec, DEFAULTS.downSec),
					oilRadius: num(tuning.oilRadius, DEFAULTS.oilRadius),
					oilLifeSec: num(tuning.oilLifeSec, DEFAULTS.oilLifeSec),
					oilSlipSec: num(tuning.oilSlipSec, DEFAULTS.oilSlipSec),
					oilTractionCut: num(tuning.oilTractionCut, DEFAULTS.oilTractionCut),
					oilCooldownSec: num(tuning.oilCooldownSec, DEFAULTS.oilCooldownSec),
					tetherRange: num(tuning.tetherRange, DEFAULTS.tetherRange),
					tetherConeDeg: num(tuning.tetherConeDeg, DEFAULTS.tetherConeDeg),
					tetherSec: num(tuning.tetherSec, DEFAULTS.tetherSec),
					tetherForce: num(tuning.tetherForce, DEFAULTS.tetherForce),
					tetherDamage: num(tuning.tetherDamage, DEFAULTS.tetherDamage),
					tetherCooldownSec: num(tuning.tetherCooldownSec, DEFAULTS.tetherCooldownSec),
					ramMinClosingSpeed: num(tuning.ramMinClosingSpeed, DEFAULTS.ramMinClosingSpeed),
					ramDamage: num(tuning.ramDamage, DEFAULTS.ramDamage),
					ramImpulse: num(tuning.ramImpulse, DEFAULTS.ramImpulse),
					ramPopUp: num(tuning.ramPopUp, DEFAULTS.ramPopUp),
					ramStunSec: num(tuning.ramStunSec, DEFAULTS.ramStunSec),
					ramCooldownSec: num(tuning.ramCooldownSec, DEFAULTS.ramCooldownSec)
				});
				// Per-shooter effective combat tuning: the build's OFFENSE side
				// (damage out, EMP reach, tool cooldowns). Defense lives on the
				// TARGET's VehicleCombat.resist, so the pure weapon functions stay
				// single-tuning. The ram is passive; its anti-machine-gun cooldown
				// stays global on purpose.
				const ctFor = (rig: Rig): CombatTuning => {
					const s = rig.buildStats;
					const ct = combatTuning();
					return {
						...ct,
						empDamage: Math.round(ct.empDamage * s.damageDealt),
						tetherDamage: Math.round(ct.tetherDamage * s.damageDealt),
						empRange: ct.empRange * s.empRange,
						empCooldownSec: ct.empCooldownSec * s.weaponCooldown,
						oilCooldownSec: ct.oilCooldownSec * s.weaponCooldown,
						tetherCooldownSec: ct.tetherCooldownSec * s.weaponCooldown
					};
				};

				const aiTuning = (): AiTuning => ({
					topSpeed: num(tuning.aiTopSpeed, DEFAULTS.aiTopSpeed),
					cornerAccel: num(tuning.aiCorner, DEFAULTS.aiCorner),
					brakeAccel: AI_DEFAULTS.brakeAccel,
					steerGain: AI_DEFAULTS.steerGain,
					aggression: num(tuning.aiAggression, DEFAULTS.aiAggression)
				});

				// The AI DRIVER's targets scale with its vehicle's build, so an
				// armor AI drives like a truck and a velocity AI like a missile:
				// allowed speed tracks the drag-terminal proxy sqrt(engine/drag),
				// corner budget tracks grip.
				const aiTuningFor = (rig: Rig, base: AiTuning): AiTuning => {
					const s = rig.buildStats;
					return {
						...base,
						topSpeed: base.topSpeed * Math.sqrt(s.engineForce / Math.max(0.01, s.aeroDrag)),
						cornerAccel: base.cornerAccel * s.frictionSlip
					};
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
					flipsByRig: {} as Record<string, number>
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
						flash(
							target === player
								? 'ARMOR STRIPPED — hull exposed'
								: `${target.label} ARMOR STRIPPED`
						);
					}
					if (res.mountDisabled) {
						setMountDead(target, true);
						const mp = hitAnchor(target, srcX, srcZ, 'rear');
						spawnSparks(mp.x, mp.y, mp.z, 26, GL.amber, 10, 650);
						spawnDebris(mp.x, mp.y, mp.z, 8, -target.hx, -target.hz, 6);
						spawnSmoke(mp.x, mp.y + 0.2, mp.z, 0x141414, 1.1, 1400, 1.6, 0.55);
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

				const performFire = (shooter: Rig) => {
					const ct = ctFor(shooter);
					const now = performance.now();
					const result = tryFire(combatantOf(shooter), rigsAll().map(combatantOf), mode, ct, now);
					if (!result.fired) return result;
					testStats.fire.emp++;
					if (result.hits.length) testStats.hit.emp++;
					spawnRing(shooter.body.position.x, shooter.body.position.z, 0x00f0ff, ct.empRange);
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

				const performOil = (shooter: Rig): boolean => {
					const ct = ctFor(shooter);
					const now = performance.now();
					const slick = tryDeployOil(combatantOf(shooter), ct, now, slickSeq);
					if (!slick) return false;
					slickSeq++;
					slicks.push(slick);
					testStats.fire.oil++;
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

				const performTether = (shooter: Rig) => {
					const ct = ctFor(shooter);
					const now = performance.now();
					const res = tryTether(combatantOf(shooter), rigsAll().map(combatantOf), mode, ct, now);
					if (!res.fired) return res;
					testStats.fire.tether++;
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
						const reach = ct.tetherRange * 0.55;
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
						t: { shooterId: shooter.id, targetId: target.id, untilMs: now + ct.tetherSec * 1000 },
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
						| 'no-lock',
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
					else audioEngine.playTone('ui', { freq: 220, durationMs: 120, type: 'sine', gain: 0.12 });
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
					const now = performance.now();
					const opts = {
						damageScale: shooter.buildStats.damageDealt,
						cooldownScale: shooter.buildStats.weaponCooldown
					};
					const ct = combatTuning();
					const sp = shooter.body.position;
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
				// On spawn and every reset, NO throttle/steer/brake/weapon input
				// registers for ANY vehicle (player or AI) until GO. Physics stays
				// live so the cars simply sit at rest on the flat grid. After GO,
				// RAM damage/knockback is additionally suppressed for a short grace
				// window so a tight launch pack cannot trade contact damage before
				// real driving begins (EMP / oil / tether are unaffected).
				const COUNTDOWN_SEC = 3; // 3 - 2 - 1 then GO
				const GO_HOLD_SEC = 0.7; // how long the GO flash stays on screen
				const RAM_GRACE_SEC = 1.5; // ram-only suppression window after GO
				// Absolute performance.now() ms at which controls unlock (GO). Set
				// here for the initial launch and re-armed by resetRound each round.
				let raceStartAtMs = performance.now() + COUNTDOWN_SEC * 1000;

				// ---- Round state ----
				let finishOrder: Rig[] = [];
				// The player's timing-start stamp (first start/finish crossing), so
				// total race time = finishing-lap atMs - this. Reset each round.
				let playerRaceStartMs: number | null = null;
				let finishReported = false;
				let prevMs = performance.now();

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
				let fireQueued = false;
				let oilQueued = false;
				let tetherQueued = false;
				let firePrimaryQueued = false;
				let fireSecondaryQueued = false;
				const prevPadEdge: Partial<Record<ControlAction, boolean>> = {};

				resetRound = () => {
					const wantAis = Math.max(1, Math.min(6, Math.round(num(tuning.aiCount, DEFAULTS.aiCount))));
					if (wantAis !== ais.length) buildAis(wantAis);
					for (const r of rigsAll()) {
						r.combat.reset(poolsForBuild(r.archetype, r.buildStats));
						restoreRigCondition(r);
						r.tracker.reset();
						r.body.position.set(r.spawn.x, SPAWN_Y, r.spawn.z);
						r.body.quaternion.copy(quatFor(r.spawn.headingDeg));
						r.body.velocity.setZero();
						r.body.angularVelocity.setZero();
						r.steerCurrent = 0;
						r.flashUntil = 0;
						r.smokeAcc = 0;
						r.dripAcc = 0;
						r.dustAcc = 0;
						r.preVx = 0;
						r.preVz = 0;
						r.flipAcc = 0;
						if (r.dentStage !== 0) applyDentStage(r, 0);
						r.warmIdx = r.spawn.warmIdx;
						r.lastOnRibbon = true;
						r.prevX = r.spawn.x;
						r.prevZ = r.spawn.z;
						r.finished = false;
						r.finishPos = 0;
						r.raceStartMs = null;
						r.finishAtMs = null;
						r.locks = { weaponPrimary: null, weaponSecondary: null };
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
					raceStartAtMs = performance.now() + COUNTDOWN_SEC * 1000;
					countText = '';
				};

				const onKeyDown = (e: KeyboardEvent) => {
					if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
						return;
					const action = actionForKey(e.code);
					if (!action) return;
					// Any BOUND key is swallowed (a remapped Space or '/' must not
					// scroll or open the browser's quick find).
					e.preventDefault();
					if (ACTION_KIND[action] === 'edge') {
						if (action === 'resetRound') resetRound();
						else if (!e.repeat) {
							if (action === 'fire') fireQueued = true;
							else if (action === 'oil') oilQueued = true;
							else if (action === 'tether') tetherQueued = true;
							else if (action === 'fireWeaponPrimary') firePrimaryQueued = true;
							else if (action === 'fireWeaponSecondary') fireSecondaryQueued = true;
						}
						return;
					}
					keys.add(e.code);
				};
				const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
				const onBlur = () => keys.clear();
				window.addEventListener('keydown', onKeyDown);
				window.addEventListener('keyup', onKeyUp);
				window.addEventListener('blur', onBlur);

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

				let lastT = performance.now();
				let frame = 0;

				// Dev-only debug handle for poking the sim from the console.
				const teleportRig = (rig: Rig, x: number, z: number, headingDeg: number, speed = 0) => {
					const d = headingToDir(headingDeg);
					rig.body.position.set(x, SPAWN_Y, z);
					rig.body.quaternion.copy(quatFor(headingDeg));
					rig.body.velocity.set(d.x * speed, 0, d.z * speed);
					rig.body.angularVelocity.setZero();
					rig.flipAcc = 0;
				};
				(window as unknown as Record<string, unknown>).__greenline = {
					world,
					player,
					getAis: () => ais,
					getRigs: () => rigsAll(),
					rt,
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
						r.body.position.y = 0.8;
						r.body.velocity.setZero();
						r.body.angularVelocity.setZero();
						return true;
					},
					// World Y of a rig's local up axis (1 upright, -1 upside down).
					upY: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? r.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y : null;
					},
					fire: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? performFire(r) : null;
					},
					oil: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? performOil(r) : false;
					},
					tether: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						return r ? performTether(r) : null;
					},
					damage: (rigId: string, amount: number, zone: HitZone = 'front') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const res = r.combat.applyDamage(
							amount,
							'debug',
							mode,
							combatTuning(),
							performance.now(),
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
					setMode: (m: GreenlineMode) => {
						mode = m;
						resetRound();
						return mode;
					},
					getSlicks: () => slicks,
					getTethers: () => tethers.map((tv) => tv.t),
					getLoadout: () => playerLoadout,
					setArchetype: (id: ArchetypeId) => selectArchetype(id),
					equip: (slot: PartSlot, partId: string) => equipPart(slot, partId),
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
					getProjectiles: () => projectiles.map((p) => ({ ...p })),
					getCaltrops: () => caltropFields.map((f) => ({ ...f, nextHitMs: { ...f.nextHitMs } })),
					// Defensive-weapon state for the 4b-ii verification drives: shield
					// pool + active window, blades active window, and the jammer's
					// lock-rate multiplier applied against this vehicle.
					getDefense: (rigId = 'player') => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const c = r.combat;
						const nowMs = performance.now();
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
						// Per-round weapon / flip counters (reset by resetRound).
						getTelemetry: () => ({
							fire: { ...testStats.fire },
							hit: { ...testStats.hit },
							ram: testStats.ram,
							flips: testStats.flips,
							flipsByRig: { ...testStats.flipsByRig }
						}),
						// A full snapshot of the field: per-rig progress, finish
						// state, exact total race time, best lap, and upright-ness.
						raceState: () => {
							const now = performance.now();
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
									z: Math.round(r.body.position.z * 100) / 100,
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

				const tick = () => {
					const now = performance.now();
					const dt = Math.min((now - lastT) / 1000, 0.05);
					lastT = now;
					frame++;
					const ct = combatTuning();
					const aiT = aiTuning();
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
						for (const a of PAD_EDGE_ACTIONS) {
							const down = padBindingHeld(pad, gp[a]);
							if (down && !prevPadEdge[a]) {
								if (a === 'fire') fireQueued = true;
								else if (a === 'oil') oilQueued = true;
								else if (a === 'tether') tetherQueued = true;
								else if (a === 'fireWeaponPrimary') firePrimaryQueued = true;
								else if (a === 'fireWeaponSecondary') fireSecondaryQueued = true;
								else if (a === 'resetRound') resetRound();
							}
							prevPadEdge[a] = down;
						}
					} else {
						if (padName) padName = '';
						for (const a of PAD_EDGE_ACTIONS) prevPadEdge[a] = false;
					}

					// -- Global physics tuning --
					world.gravity.set(0, -num(tuning.gravity, DEFAULTS.gravity), 0);

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
							w.frictionSlip = num(tuning.frictionSlip, DEFAULTS.frictionSlip) * bs.frictionSlip;
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
							sIn = steerInput;
							thr = throttle;
							brk = brakeInput;
							hbk = handbrake;
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
								aiTuningFor(rig, aiT)
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
						const engineMax = num(tuning.engineForce, DEFAULTS.engineForce) * bs.engineForce;
						if (thr > 0) engine = thr * engineMax;
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
						if (hbk) {
							const hb = num(tuning.handbrakeForce, DEFAULTS.handbrakeForce);
							const gripCut = Math.max(0.05, num(tuning.handbrakeGrip, DEFAULTS.handbrakeGrip));
							rig.vehicle.setBrake(hb, 2);
							rig.vehicle.setBrake(hb, 3);
							rig.vehicle.wheelInfos[2].frictionSlip *= gripCut;
							rig.vehicle.wheelInfos[3].frictionSlip *= gripCut;
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
						const drag = num(tuning.aeroDrag, DEFAULTS.aeroDrag) * bs.aeroDrag;
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

						// Track surface + soft boundaries (the swappable block): extra
						// drag off the ribbon, capped spring + damper past a wall.
						const surf = surfaceState(rt, body.position.x, body.position.z, rig.warmIdx);
						rig.warmIdx = surf.warmIndex;
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
								body.position.y = SPAWN_Y;
								body.quaternion.copy(quatFor(yawDeg));
								body.velocity.setZero();
								body.angularVelocity.setZero();
								rig.steerCurrent = 0;
								spawnRing(body.position.x, body.position.z, 0x00ff41, 4, 320, 0.45);
								if (rig === player) flash('FLIPPED — vehicle righted');
							}
						} else if (rig.flipAcc !== 0) {
							rig.flipAcc = 0;
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
						// wisp off the socket itself, the at-a-glance "weapon down"
						// read on any vehicle without checking a number.
						if (rig.mountDead && !rig.combat.eliminated) {
							if (Math.random() < dt * 7) {
								const mp = rig.parts.mount.getWorldPosition(tmpWorld);
								spawnSparks(mp.x, mp.y + 0.15, mp.z, 2, GL.coolRim, 4, 240);
							}
							if (Math.random() < dt * 1.4) {
								const mp = rig.parts.mount.getWorldPosition(tmpWorld);
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

						if (rig === player) {
							// Physics is metric (rawSpeed is m/s); the HUD reads mph.
							// Display-layer conversion only: 1 m/s = 2.236936 mph.
							speedMph = Math.round(rawSpeed * 2.236936);
						}
					}

					// -- Weapons: player triggers + AI decisions, one shared path --
					// Weapons unlock at GO along with controls. During the countdown any
					// player weapon press is discarded and the AI does not fire, so nothing
					// can be launched at a locked, stationary pack.
					if (preLaunch) {
						fireQueued = false;
						oilQueued = false;
						tetherQueued = false;
						firePrimaryQueued = false;
						fireSecondaryQueued = false;
					} else {
						if (fireQueued) {
							fireQueued = false;
							performFire(player);
						}
						if (oilQueued) {
							oilQueued = false;
							performOil(player);
						}
						if (tetherQueued) {
							tetherQueued = false;
							performTether(player);
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
						// no lock at all.
						for (let ri = 0; ri < all.length; ri++) {
							const rig = all[ri];
							for (const slot of WEAPON_SLOTS) {
								const def = weaponById(rig.weapons[slot]);
								if (!def?.guided || rig.combat.isOut(now)) {
									rig.locks[slot] = null;
									continue;
								}
								if (!rig.combat.canUseSlot(slot, now, effSlotCooldown(rig, def.cooldownSec))) {
									rig.locks[slot] = null;
									continue;
								}
								rig.locks[slot] = updateWeaponLock(
									rig.locks[slot],
									combatants[ri],
									combatants,
									slot,
									def,
									dt,
									now
								);
							}
						}
						// Every AI-driven rig makes weapon decisions. In normal play the
						// player has no AiDriver so it is skipped here (player fires via
						// input above); the stress runner's AI-player is included.
						// Equipped weapons come first (they are the build's actual
						// firepower), then the fixed-tool chain.
						for (const rig of all) {
							if (!rig.ai || rig.combat.isOut(now)) continue;
							const self = combatants[all.indexOf(rig)];
							let acted = false;
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
								else want = rig.ai.wantsWeaponFire(self, combatants, slot, def, aiT, now, cdScale);
								if (!want) continue;
								if (performWeaponFire(rig, slot)) {
									rig.ai.scheduleSlotUse(slot, now, def.cooldownSec * cdScale, aiT);
									acted = true;
									break;
								}
							}
							if (acted) continue;
							// The AI decides with ITS OWN build's ranges and cooldowns.
							const rct = ctFor(rig);
							if (rig.ai.wantsFire(self, combatants, rct, aiT, now)) {
								const res = performFire(rig);
								if (res.fired) rig.ai.scheduleNextUse('emp', now, rct.empCooldownSec, aiT);
							} else if (rig.ai.wantsTether(self, combatants, rct, aiT, now)) {
								const res = performTether(rig);
								if (res.fired) rig.ai.scheduleNextUse('tether', now, rct.tetherCooldownSec, aiT);
							} else if (rig.ai.wantsOil(self, combatants, rct, aiT, now)) {
								if (performOil(rig)) rig.ai.scheduleNextUse('oil', now, rct.oilCooldownSec, aiT);
							}
						}
						// Auto-Turret: every vehicle carrying one auto-fires on its own
						// cooldown at the nearest target in the 360-minus-blind-arc ring. No
						// trigger, no aim, no AI decision - player and AI tick the identical
						// check; the forward blind arc is the vehicle's own chassis.
						for (let ri = 0; ri < all.length; ri++) {
							const rig = all[ri];
							if (rig.combat.isOut(now)) continue;
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
							spawnRing(ev.slick.x, ev.slick.z, 0x8f5fff, ct.oilRadius * 1.6, 300, 0.4, 0.15);
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
							let r = ct.oilRadius * (0.25 + 0.75 * scaleIn);
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
						const status = tetherStatus(tv.t, combatantOf(shooter), combatantOf(target), ct, now);
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
						if (dist > TETHER_SLACK_DIST) {
							const f = ct.tetherForce;
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
											laps: lapTarget
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

					// -- Chase camera (player) --
					const flatFwd = new THREE.Vector3(player.hx, 0, player.hz);
					const dist = num(tuning.camDistance, DEFAULTS.camDistance);
					const height = num(tuning.camHeight, DEFAULTS.camHeight);
					const stiff = num(tuning.camStiffness, DEFAULTS.camStiffness);
					const desired = player.carGroup.position
						.clone()
						.addScaledVector(flatFwd, -dist)
						.add(new THREE.Vector3(0, height, 0));
					const s = 1 - Math.exp(-stiff * dt);
					camPos.lerp(desired, s);
					camLook.lerp(
						player.carGroup.position
							.clone()
							.addScaledVector(flatFwd, 6)
							.add(new THREE.Vector3(0, 1.2, 0)),
						s
					);
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
					const pct = ctFor(player);
					chud.ready.emp = cooldownRemaining(player.combat, 'emp', pct.empCooldownSec, now);
					chud.ready.oil = cooldownRemaining(player.combat, 'oil', pct.oilCooldownSec, now);
					chud.ready.tether = cooldownRemaining(player.combat, 'tether', pct.tetherCooldownSec, now);
					chud.ready.ram = cooldownRemaining(player.combat, 'ram', pct.ramCooldownSec, now);
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
					clearTimeout(flashTimer);
					window.removeEventListener('keydown', onKeyDown);
					window.removeEventListener('keyup', onKeyUp);
					window.removeEventListener('blur', onBlur);
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
				{#if hud.offTrack}<span class="gl-st gl-st-offtrack">OFF TRACK</span>{/if}
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
						class:ready={!w.offline && w.ready <= 0 && !w.lock}
						class:offline={w.offline}
						class:locking={!w.offline && !!w.lock && !w.lock.locked}
						class:locked={!w.offline && !!w.lock?.locked}
						class:active={!w.offline && w.active}
						class:passive={w.passive}
					>
						<span class="gl-wname">{w.short}</span>
						<span class="gl-wstate"
							>{w.passive
								? 'ON'
								: w.active
									? 'ACTIVE'
									: w.offline
										? 'OFFLINE'
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
				<div class="gl-wcell" class:ready={!chud.mountDown && chud.ready.emp <= 0} class:offline={chud.mountDown}>
					<span class="gl-wname">EMP</span>
					<span class="gl-wstate">{chud.mountDown ? 'OFFLINE' : chud.ready.emp <= 0 ? 'READY' : `${chud.ready.emp.toFixed(1)}s`}</span>
					<span class="gl-wkey">F / RB</span>
				</div>
				<div class="gl-wcell" class:ready={!chud.mountDown && chud.ready.oil <= 0} class:offline={chud.mountDown}>
					<span class="gl-wname">OIL</span>
					<span class="gl-wstate">{chud.mountDown ? 'OFFLINE' : chud.ready.oil <= 0 ? 'READY' : `${chud.ready.oil.toFixed(1)}s`}</span>
					<span class="gl-wkey">E / X</span>
				</div>
				<div class="gl-wcell" class:ready={!chud.mountDown && chud.ready.tether <= 0} class:offline={chud.mountDown}>
					<span class="gl-wname">TETHER</span>
					<span class="gl-wstate">{chud.mountDown ? 'OFFLINE' : chud.ready.tether <= 0 ? 'READY' : `${chud.ready.tether.toFixed(1)}s`}</span>
					<span class="gl-wkey">Q / LB</span>
				</div>
				<div class="gl-wcell" class:ready={chud.ready.ram <= 0}>
					<span class="gl-wname">RAM</span>
					<span class="gl-wstate">{chud.ready.ram <= 0 ? 'ARMED' : `${chud.ready.ram.toFixed(1)}s`}</span>
					<span class="gl-wkey">NOSE HIT</span>
				</div>
			</div>
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
		{padName ? `PAD: ${padName}` : 'KEYBOARD'} · {keyHint}
	</div>

	<div class="gl-map">
		<Minimap runtime={rt} {pose} nextCheckpoint={hud.cp} others={aiPoses} />
	</div>

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
</style>
