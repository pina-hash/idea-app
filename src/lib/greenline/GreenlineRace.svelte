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
		TETHER_SLACK_DIST,
		tetherStatus,
		tryDeployOil,
		tryFire,
		tryRam,
		tryTether,
		updateOilSlicks,
		VehicleCombat,
		type ActiveTether,
		type Combatant,
		type CombatTuning,
		type DamageOutcome,
		type GreenlineMode,
		type OilSlick
	} from '$lib/greenline/combat';
	import { AI_DEFAULTS, AiDriver, type AiTuning } from '$lib/greenline/ai';
	import {
		defaultLoadout,
		neutralStats,
		parseLoadout,
		resolveLoadout,
		serializeLoadout,
		type ArchetypeId,
		type Loadout,
		type PartSlot,
		type ResolvedStats
	} from '$lib/greenline/loadout';
	import Garage from '$lib/greenline/Garage.svelte';
	import Minimap from '$lib/greenline/Minimap.svelte';
	import provingGroundJson from '$lib/greenline/tracks/proving-ground-07.json';
	import { browser } from '$app/environment';

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
	 * it. Everything numeric is in the live tuning panel. Track dressing (floodlight towers, gantries, yard
	 * blocks, skid-pad paint, the banked berm) renders generically from the
	 * track file's `props`; no final art, throwaway while the design
	 * solidifies.
	 *
	 * Four disruption tools, all vehicle-agnostic (AI uses them through the
	 * same paths): EMP burst (F / RB), oil slick dropped behind (E / X),
	 * tether yank at the nearest vehicle ahead (Q / LB), and the passive
	 * shockwave ram that triggers on nose-first contact above a closing-speed
	 * threshold. Combat facts live in $lib/greenline/combat.ts; this file owns
	 * every force and all the feedback: trauma-based screen shake, spark and
	 * smoke particle pools, escalating damage states on the placeholder mesh
	 * (scorch tint, crumpled vertices, hood smoke), oil puddles, the live
	 * tether cable, the stun crackle ring, and ram shockwave rings.
	 *
	 * Loadouts: G opens the garage ($lib/greenline/Garage.svelte over the
	 * $lib/greenline/loadout.ts catalog): one archetype (ARMOR / VELOCITY /
	 * HANDLING / SYSTEMS) plus one part per slot, resolved to per-rig stat
	 * MULTIPLIERS over the tuning-panel baseline and applied live to physics
	 * (engine, drag, brakes, steering, mass, grip, suspension, grass drag),
	 * health pool, incoming-effect resistances (VehicleCombat.resist), and
	 * offense (damage, EMP range, tool cooldowns via ctFor). AIs cycle the
	 * four archetypes so every round has build variety. Player loadout
	 * persists in localStorage; everything is unlocked (dev).
	 *
	 * Controls: W/S throttle+brake (reverse from standstill), A/D steer,
	 * Space handbrake, F fire EMP, E drop oil, Q fire tether, G garage,
	 * R reset round. Gamepad: left stick steer, RT throttle, LT brake,
	 * A handbrake, RB fire, X oil, LB tether.
	 */

	const {
		loadout,
		showDebug = false,
		onFinish
	}: {
		/**
		 * The build to race. When omitted the component owns its loadout locally
		 * (the dev harness: seeded from / persisted to localStorage, editable via
		 * the G-key garage overlay). The real portal route always passes one,
		 * chosen in its own garage screen.
		 */
		loadout?: Loadout;
		/** Render the live tuning panel + G-key garage overlay (dev / teacher). */
		showDebug?: boolean;
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
	// persisted to localStorage so the dev harness keeps its G-key garage. Parts
	// multiply the tuning-panel baseline, so the panel stays the global feel
	// surface. ----
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
	let garageOpen = $state(false);
	// Assigned in onMount once the player rig exists (the resetRound pattern).
	let applyPlayerLoadout: () => void = () => {};
	// Adopt a parent-supplied loadout when it changes (real-route hot-swap; inert
	// for the dev harness, which passes no prop).
	$effect(() => {
		if (loadout) playerLoadout = loadout;
	});
	// Re-apply the current build to the player rig whenever it changes. onMount
	// applies it once at spawn; this keeps it live through garage edits / swaps.
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
	const selectArchetype = (id: ArchetypeId) => {
		playerLoadout = { ...playerLoadout, archetype: id };
		persistLoadout();
	};
	const equipPart = (slot: PartSlot, partId: string) => {
		playerLoadout = { ...playerLoadout, parts: { ...playerLoadout.parts, [slot]: partId } };
		persistLoadout();
	};

	let speedKmh = $state(0);
	let speedMs = $state(0);
	let padName = $state('');
	let bootError = $state('');
	let banner = $state('');
	let resetRound: () => void = () => {};

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
	const chud = $state({
		hp: COMBAT_DEFAULTS.maxHealth,
		max: COMBAT_DEFAULTS.maxHealth,
		status: '' as '' | 'DISRUPTED' | 'DOWN' | 'ELIMINATED',
		oiled: false,
		tethered: false,
		downLeft: 0,
		ready: { emp: 0, oil: 0, tether: 0, ram: 0 }
	});
	let lapFlash = $state('');

	let stage: HTMLDivElement;

	// A panel input momentarily empty while the user types reads NaN; fall back
	// to the default so the sim never ingests a non-finite value.
	const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);

	const resetTuning = () => Object.assign(tuning, DEFAULTS);

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout>;
	const copyTuning = () => {
		const json = JSON.stringify(tuning, null, 2);
		navigator.clipboard.writeText(json).then(() => {
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 2000);
		});
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
				if (disposed || !stage) return;

				// ---- Renderer / scene ----
				const renderer = new THREE.WebGLRenderer({ antialias: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
				renderer.setSize(stage.clientWidth, stage.clientHeight, false);
				stage.appendChild(renderer.domElement);

				const scene = new THREE.Scene();
				scene.background = new THREE.Color(0x05090c);
				scene.fog = new THREE.Fog(0x05090c, 150, 520);

				const camera = new THREE.PerspectiveCamera(
					70,
					stage.clientWidth / Math.max(1, stage.clientHeight),
					0.1,
					1000
				);

				scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1408, 0.9));
				const sun = new THREE.DirectionalLight(0xffffff, 1.4);
				sun.position.set(80, 120, 40);
				scene.add(sun);

				// ---- Ground: plane + grid ----
				const groundMesh = new THREE.Mesh(
					new THREE.PlaneGeometry(600, 600),
					new THREE.MeshStandardMaterial({ color: 0x07120a, roughness: 1 })
				);
				groundMesh.rotation.x = -Math.PI / 2;
				scene.add(groundMesh);

				const grid = new THREE.GridHelper(600, 60, 0x2f8f4f, 0x14351f);
				grid.position.y = 0.02;
				scene.add(grid);

				// ---- Environmental dressing: props from the track data ----
				// Cheap primitives only (this is not the art pass): floodlight
				// towers, gantries, container/railcar/barrier blocks, skid-pad
				// paint, and the banked-oval berm. All presentation; gameplay
				// never reads any of it.
				const DEGR = Math.PI / 180;
				for (const prop of track.props ?? []) {
					if (prop.type === 'pad') {
						const disc = new THREE.Mesh(
							new THREE.CircleGeometry(prop.radius, 56),
							new THREE.MeshStandardMaterial({ color: 0x0a1512, roughness: 1 })
						);
						disc.rotation.x = -Math.PI / 2;
						disc.position.set(prop.x, 0.018, prop.z);
						scene.add(disc);
						for (const rr of prop.rings ?? []) {
							const ring = new THREE.Mesh(
								new THREE.RingGeometry(rr - 0.25, rr + 0.25, 72),
								new THREE.MeshBasicMaterial({
									color: 0x1f4433,
									transparent: true,
									opacity: 0.85,
									depthWrite: false
								})
							);
							ring.rotation.x = -Math.PI / 2;
							ring.position.set(prop.x, 0.024, prop.z);
							scene.add(ring);
						}
					} else if (prop.type === 'lightTower') {
						const g = new THREE.Group();
						const hgt = prop.height ?? 15;
						const steel = new THREE.MeshStandardMaterial({ color: 0x2c3438, roughness: 0.8 });
						const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, hgt, 8), steel);
						pole.position.y = hgt / 2;
						g.add(pole);
						const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 3.8), steel);
						arm.position.set(0.35, hgt - 0.4, 0);
						g.add(arm);
						const lampMat = new THREE.MeshStandardMaterial({
							color: 0x333322,
							emissive: 0xf8ffd8,
							emissiveIntensity: 1.7
						});
						for (const off of [-1.3, 0, 1.3]) {
							const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.95), lampMat);
							lamp.position.set(0.75, hgt - 0.4, off);
							lamp.rotation.z = -0.5;
							g.add(lamp);
						}
						const cone = new THREE.Mesh(
							new THREE.ConeGeometry(7.5, hgt + 3, 20, 1, true),
							new THREE.MeshBasicMaterial({
								color: 0xdfffc8,
								transparent: true,
								opacity: 0.05,
								side: THREE.DoubleSide,
								depthWrite: false,
								blending: THREE.AdditiveBlending
							})
						);
						cone.position.set(4.4, hgt / 2 - 0.8, 0);
						cone.rotation.z = -0.48;
						g.add(cone);
						const pool = new THREE.Mesh(
							new THREE.CircleGeometry(9.5, 28),
							new THREE.MeshBasicMaterial({
								color: 0xdfffc8,
								transparent: true,
								opacity: 0.05,
								depthWrite: false,
								blending: THREE.AdditiveBlending
							})
						);
						pool.rotation.x = -Math.PI / 2;
						pool.position.set(8.6, 0.028, 0);
						g.add(pool);
						g.position.set(prop.x, 0, prop.z);
						g.rotation.y = prop.headingDeg * DEGR;
						scene.add(g);
					} else if (prop.type === 'gantry') {
						const g = new THREE.Group();
						const steel = new THREE.MeshStandardMaterial({ color: 0x323a3e, roughness: 0.75 });
						for (const side of [-1, 1]) {
							const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6.4, 0.7), steel);
							post.position.set(0, 3.2, (side * prop.span) / 2);
							g.add(post);
						}
						const beam = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.15, prop.span + 1), steel);
						beam.position.y = 6.4;
						g.add(beam);
						const strip = new THREE.Mesh(
							new THREE.BoxGeometry(0.22, 0.22, prop.span * 0.8),
							new THREE.MeshStandardMaterial({
								color: 0x223311,
								emissive: 0xc8ff00,
								emissiveIntensity: 1.2
							})
						);
						strip.position.set(-0.5, 5.78, 0);
						g.add(strip);
						g.position.set(prop.x, 0, prop.z);
						g.rotation.y = prop.headingDeg * DEGR;
						scene.add(g);
					} else if (prop.type === 'block') {
						const palette =
							prop.kind === 'barrier'
								? [0x878d90]
								: prop.kind === 'railcar'
									? [0x3c4246, 0x46403a]
									: [0x7a3b2e, 0x2e4d6b, 0x3f5a3a, 0x6b6355];
						const hash = Math.abs(Math.round(prop.x * 7 + prop.z * 13));
						const mesh = new THREE.Mesh(
							new THREE.BoxGeometry(prop.l, prop.h, prop.w),
							new THREE.MeshStandardMaterial({
								color: palette[hash % palette.length],
								roughness: 0.9
							})
						);
						mesh.position.set(prop.x, prop.h / 2, prop.z);
						mesh.rotation.y = prop.headingDeg * DEGR;
						scene.add(mesh);
					} else if (prop.type === 'berm') {
						const m = Math.min(prop.inner.length, prop.outer.length);
						const verts = new Float32Array(m * 2 * 3);
						for (let i = 0; i < m; i++) {
							verts.set([prop.inner[i].x, 0.05, prop.inner[i].z], i * 6);
							verts.set([prop.outer[i].x, prop.height, prop.outer[i].z], i * 6 + 3);
						}
						const idx: number[] = [];
						for (let i = 0; i < m - 1; i++) {
							idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
						}
						const geo = new THREE.BufferGeometry();
						geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
						geo.setIndex(idx);
						geo.computeVertexNormals();
						scene.add(
							new THREE.Mesh(
								geo,
								new THREE.MeshStandardMaterial({
									color: 0x2c4436,
									roughness: 0.85,
									side: THREE.DoubleSide
								})
							)
						);
						const railPts = prop.outer.map(
							(p) => new THREE.Vector3(p.x, prop.height + 0.05, p.z)
						);
						scene.add(
							new THREE.Line(
								new THREE.BufferGeometry().setFromPoints(railPts),
								new THREE.LineBasicMaterial({ color: 0xb8a11c, transparent: true, opacity: 0.7 })
							)
						);
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
					const verts = new Float32Array(nC * 2 * 3);
					for (let i = 0; i < nC; i++) {
						verts.set([rt.leftEdge[i].x, 0.03, rt.leftEdge[i].z], i * 6);
						verts.set([rt.rightEdge[i].x, 0.03, rt.rightEdge[i].z], i * 6 + 3);
					}
					const idx: number[] = [];
					for (let i = 0; i < nC; i++) {
						const j = (i + 1) % nC;
						idx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
					}
					const geo = new THREE.BufferGeometry();
					geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
					geo.setIndex(idx);
					geo.computeVertexNormals();
					scene.add(
						new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x11201a, roughness: 0.95 }))
					);
				}
				// Painted edge lines: with a variable-width ribbon the corridor's
				// breathing (wide pad, narrow yard) must read at speed.
				for (const edge of [rt.leftEdge, rt.rightEdge]) {
					const pts = [...edge, edge[0]].map((p) => new THREE.Vector3(p.x, 0.06, p.z));
					scene.add(
						new THREE.Line(
							new THREE.BufferGeometry().setFromPoints(pts),
							new THREE.LineBasicMaterial({ color: 0x4a6b58, transparent: true, opacity: 0.9 })
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
				const COM_DROP = 0.25;
				const SPAWN_Y = 0.9;
				const WHEEL_RADIUS = 0.45;
				const connections = [
					[1.25, -0.1, 0.95],
					[1.25, -0.1, -0.95],
					[-1.25, -0.1, 0.95],
					[-1.25, -0.1, -0.95]
				];

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
					bodyMat: InstanceType<typeof THREE.MeshStandardMaterial>;
					bodyMesh: InstanceType<typeof THREE.Mesh>;
					baseColor: number;
					wheelMeshes: InstanceType<typeof THREE.Mesh>[];
					combat: VehicleCombat;
					tracker: LapTracker;
					ai: AiDriver | null;
					bar: {
						group: InstanceType<typeof THREE.Group>;
						fg: InstanceType<typeof THREE.Mesh>;
						fgMat: InstanceType<typeof THREE.MeshBasicMaterial>;
					} | null;
					/** Resolved build multipliers (archetype x parts), neutral = 1. */
					buildStats: ResolvedStats;
					archetype: ArchetypeId;
					/** Crumple state: 0 pristine .. 3 wrecked; drives vertex jitter. */
					dentStage: number;
					/** Pristine body-geometry positions, restored on heal/reset. */
					dentBase: Float32Array;
					/** Cyan crackle ring shown while disrupted (inside carGroup). */
					stunMat: InstanceType<typeof THREE.MeshBasicMaterial>;
					stunRing: InstanceType<typeof THREE.Mesh>;
					smokeAcc: number;
					dripAcc: number;
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

				// Starting grid: slot 0 is the track spawn (player); later slots sit
				// further behind the line, alternating left/right of the centerline.
				const slotPose = (k: number): RigSpawn => {
					if (k === 0) return { ...track.spawn, warmIdx: 0 };
					const idx = (((nC - Math.round((10 + 7 * k) / 4)) % nC) + nC) % nC;
					const p = rt.center[idx];
					const p2 = rt.center[(idx + 1) % nC];
					const tx = p2.x - p.x;
					const tz = p2.z - p.z;
					const tl = Math.hypot(tx, tz) || 1;
					const lat = k % 2 === 1 ? 2.4 : -2.4;
					return {
						x: p.x + (-tz / tl) * lat,
						z: p.z + (tx / tl) * lat,
						headingDeg: (Math.atan2(-tz, tx) * 180) / Math.PI,
						warmIdx: idx
					};
				};

				const makeBar = () => {
					const group = new THREE.Group();
					const bg = new THREE.Mesh(
						new THREE.PlaneGeometry(2.4, 0.28),
						new THREE.MeshBasicMaterial({ color: 0x0a1410, transparent: true, opacity: 0.8 })
					);
					const fgMat = new THREE.MeshBasicMaterial({ color: 0x00ff41 });
					const fg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), fgMat);
					fg.position.z = 0.01;
					group.add(bg);
					group.add(fg);
					scene.add(group);
					return { group, fg, fgMat };
				};

				const makeRig = (id: string, label: string, baseColor: number, spawn: RigSpawn): Rig => {
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
					for (const [x, y, z] of connections) {
						wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(x, y, z);
						vehicle.addWheel(wheelOptions);
					}
					vehicle.addToWorld(world);

					const carGroup = new THREE.Group();
					const bodyMat = new THREE.MeshStandardMaterial({
						color: baseColor,
						metalness: 0.3,
						roughness: 0.55
					});
					const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.8, 1.7), bodyMat);
					bodyMesh.position.y = COM_DROP;
					carGroup.add(bodyMesh);
					const cabin = new THREE.Mesh(
						new THREE.BoxGeometry(1.4, 0.5, 1.3),
						new THREE.MeshStandardMaterial({ color: 0x0a1f12, roughness: 0.4 })
					);
					cabin.position.set(-0.35, 0.6 + COM_DROP, 0);
					carGroup.add(cabin);
					const nose = new THREE.Mesh(
						new THREE.BoxGeometry(0.12, 0.84, 1.74),
						new THREE.MeshStandardMaterial({ color: 0xc8ff00, emissive: 0x445500 })
					);
					nose.position.set(1.5, COM_DROP, 0);
					carGroup.add(nose);
					scene.add(carGroup);

					const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.35, 24);
					wheelGeo.rotateX(Math.PI / 2);
					const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
					const wheelMeshes = connections.map(() => {
						const m = new THREE.Mesh(wheelGeo, wheelMat);
						scene.add(m);
						return m;
					});

					// Stun crackle ring: flickers around the hull while disrupted.
					const stunMat = new THREE.MeshBasicMaterial({
						color: 0x00f0ff,
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
						bodyMesh,
						baseColor,
						wheelMeshes,
						combat: new VehicleCombat(id, num(tuning.maxHealth, DEFAULTS.maxHealth)),
						tracker: new LapTracker(),
						ai: null,
						bar: null,
						buildStats: neutralStats(),
						archetype: 'handling',
						dentStage: 0,
						dentBase: new Float32Array(
							(bodyMesh.geometry.getAttribute('position') as InstanceType<
								typeof THREE.BufferAttribute
							>).array as Float32Array
						),
						stunMat,
						stunRing,
						smokeAcc: 0,
						dripAcc: 0,
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
						spawn
					};
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

				// Apply a resolved build to a rig: multipliers for the physics
				// pipeline, the combat resistances, and this vehicle's own health
				// pool (current health keeps its fraction, so a mid-run swap is
				// honest rather than a free heal).
				const applyLoadoutToRig = (rig: Rig, l: Loadout) => {
					const s = resolveLoadout(l);
					rig.buildStats = s;
					rig.archetype = l.archetype;
					const newMax = Math.max(
						1,
						Math.round(num(tuning.maxHealth, DEFAULTS.maxHealth) * s.maxHealth)
					);
					const frac =
						rig.combat.maxHealth > 0 ? rig.combat.health / rig.combat.maxHealth : 1;
					rig.combat.maxHealth = newMax;
					rig.combat.health = Math.round(Math.min(1, Math.max(0, frac)) * newMax);
					rig.combat.resist.disruption = s.disruptionTaken;
					rig.combat.resist.oilSlip = s.oilSlipTaken;
					rig.combat.resist.impactDamage = s.impactDamageTaken;
					rig.combat.resist.spinKick = s.spinKickTaken;
				};

				const player = makeRig('player', 'YOU', 0x0e6b2f, slotPose(0));
				applyLoadoutToRig(player, playerLoadout);
				applyPlayerLoadout = () => applyLoadoutToRig(player, playerLoadout);
				const AI_COLORS = [0x2f5f8f, 0x6f3f8f, 0x2f8f7f, 0x8f5f2f, 0x4f4f8f, 0x3f6f4f];
				// AIs cycle the four archetypes (stock parts) so every round has
				// build variety to race and fight against: AI-1 armor, AI-2
				// velocity, AI-3 handling, AI-4 systems, then repeat.
				const AI_ARCHS: ArchetypeId[] = ['armor', 'velocity', 'handling', 'systems'];
				let ais: Rig[] = [];
				const rigsAll = () => [player, ...ais];

				const disposeRig = (r: Rig) => {
					rigByBodyId.delete(r.body.id);
					r.vehicle.removeFromWorld(world);
					scene.remove(r.carGroup);
					r.wheelMeshes.forEach((m) => scene.remove(m));
					if (r.bar) scene.remove(r.bar.group);
				};

				const buildAis = (count: number) => {
					ais.forEach(disposeRig);
					ais = [];
					aiPoses.length = 0;
					const n = Math.max(1, Math.min(6, Math.round(count)));
					for (let k = 1; k <= n; k++) {
						const rig = makeRig(`ai-${k}`, `AI-${k}`, AI_COLORS[(k - 1) % AI_COLORS.length], slotPose(k));
						rig.ai = new AiDriver(rt);
						rig.bar = makeBar();
						applyLoadoutToRig(rig, defaultLoadout(AI_ARCHS[(k - 1) % AI_ARCHS.length]));
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

				// ---- Smoke pool: billboarded sprites (normal blending, so dark
				// smoke and oil drips actually read against the ground) ----
				const SMOKE_CAP = 90;
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
				const smokePool: Puff[] = [];
				for (let i = 0; i < SMOKE_CAP; i++) {
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
					smokePool.push({
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
				let smokeCursor = 0;
				const spawnSmoke = (
					x: number,
					y: number,
					z: number,
					color: number,
					size = 1,
					lifeMs = 1100,
					rise = 1.6,
					baseOpacity = 0.45
				) => {
					const p = smokePool[smokeCursor];
					smokeCursor = (smokeCursor + 1) % SMOKE_CAP;
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
				const updateSmoke = (now: number, dt: number) => {
					for (const p of smokePool) {
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

				// ---- Damage state: crumple the (per-rig) body geometry ----
				// Stage 0 pristine .. 3 wrecked. Each stage re-jitters from the
				// pristine base so healing (RACE recovery, reset) restores clean.
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

				// Shared aftermath for every damage source (EMP, tether, ram).
				const handleOutcome = (target: Rig, outcome: DamageOutcome, sourceLabel: string) => {
					if (outcome === 'eliminated') {
						explodeRig(target);
						if (target === player) {
							banner = 'YOU ARE ELIMINATED — press R to reset the round';
						} else {
							flash(`${target.label} ELIMINATED by ${sourceLabel}`);
						}
						checkLastStanding();
					} else if (outcome === 'down') {
						explodeRig(target);
						flash(`${target.label} DOWN — recovering`);
					}
				};

				const performFire = (shooter: Rig) => {
					const ct = ctFor(shooter);
					const now = performance.now();
					const result = tryFire(combatantOf(shooter), rigsAll().map(combatantOf), mode, ct, now);
					if (!result.fired) return result;
					spawnRing(shooter.body.position.x, shooter.body.position.z, 0x00f0ff, ct.empRange);
					if (shooter === player) addTrauma(0.15);
					for (const hit of result.hits) {
						const target = rigsAll().find((r) => r.id === hit.targetId);
						if (!target) continue;
						target.body.angularVelocity.y +=
							ct.spinKick * hit.spinSign * target.combat.resist.spinKick;
						target.flashUntil = now + 180;
						const tp = target.body.position;
						spawnSparks(tp.x, tp.y + 0.7, tp.z, 22, 0x00f0ff, 10, 500);
						if (target === player) addTrauma(0.4);
						else addTraumaAt(tp.x, tp.z, 0.25);
						if (hit.outcome === 'eliminated' || hit.outcome === 'down') {
							handleOutcome(target, hit.outcome, shooter.label);
						} else if (target === player || shooter === player) {
							flash(
								shooter === player
									? `HIT ${target.label} -${hit.damage}`
									: `${shooter.label} HIT YOU -${hit.damage}`
							);
						}
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
					spawnSparks(tp.x, tp.y + 0.7, tp.z, 16, 0xc8ff00, 9, 450);
					if (shooter === player || target === player) addTrauma(0.35);
					else addTraumaAt(tp.x, tp.z, 0.25);
					if (res.hit.outcome === 'eliminated' || res.hit.outcome === 'down') {
						handleOutcome(target, res.hit.outcome, shooter.label);
					} else if (shooter === player) {
						flash(`TETHER LATCHED ${target.label}`);
					} else if (target === player) {
						flash(`TETHERED by ${shooter.label}`);
					}
					return res;
				};

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
				const keys = new Set<string>();
				const TRACKED = new Set([
					'KeyW',
					'KeyA',
					'KeyS',
					'KeyD',
					'ArrowUp',
					'ArrowDown',
					'ArrowLeft',
					'ArrowRight',
					'Space'
				]);
				let fireQueued = false;
				let oilQueued = false;
				let tetherQueued = false;
				let prevPadFire = false;
				let prevPadOil = false;
				let prevPadTether = false;

				resetRound = () => {
					const wantAis = Math.max(1, Math.min(6, Math.round(num(tuning.aiCount, DEFAULTS.aiCount))));
					if (wantAis !== ais.length) buildAis(wantAis);
					const maxHp = num(tuning.maxHealth, DEFAULTS.maxHealth);
					for (const r of rigsAll()) {
						r.combat.reset(Math.max(1, Math.round(maxHp * r.buildStats.maxHealth)));
						r.tracker.reset();
						r.body.position.set(r.spawn.x, SPAWN_Y, r.spawn.z);
						r.body.quaternion.copy(quatFor(r.spawn.headingDeg));
						r.body.velocity.setZero();
						r.body.angularVelocity.setZero();
						r.steerCurrent = 0;
						r.flashUntil = 0;
						r.smokeAcc = 0;
						r.dripAcc = 0;
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
					}
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
				};

				const onKeyDown = (e: KeyboardEvent) => {
					if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
						return;
					if (e.code === 'KeyR') {
						resetRound();
						return;
					}
					if (e.code === 'KeyF') {
						if (!e.repeat) fireQueued = true;
						return;
					}
					if (e.code === 'KeyE') {
						if (!e.repeat) oilQueued = true;
						return;
					}
					if (e.code === 'KeyQ') {
						if (!e.repeat) tetherQueued = true;
						return;
					}
					if (e.code === 'KeyG') {
						if (!e.repeat) garageOpen = !garageOpen;
						return;
					}
					if (TRACKED.has(e.code)) {
						keys.add(e.code);
						e.preventDefault();
					}
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
					damage: (rigId: string, amount: number) => {
						const r = rigsAll().find((q) => q.id === rigId);
						if (!r) return null;
						const outcome = r.combat.applyDamage(
							amount,
							'debug',
							mode,
							combatTuning(),
							performance.now()
						);
						handleOutcome(r, outcome, 'DEBUG');
						return outcome;
					},
					getSlicks: () => slicks,
					getTethers: () => tethers.map((tv) => tv.t),
					getLoadout: () => playerLoadout,
					setArchetype: (id: ArchetypeId) => selectArchetype(id),
					equip: (slot: PartSlot, partId: string) => equipPart(slot, partId),
					getBuildStats: (rigId = 'player') =>
						rigsAll().find((q) => q.id === rigId)?.buildStats ?? null,
					getMode: () => mode,
					getFinishOrder: () => finishOrder.map((r) => r.id),
					isRoundOver: () => roundOver,
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

					// -- Player input (keyboard + first connected gamepad) --
					let steerInput =
						(keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) -
						(keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
					let throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
					let brakeInput = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
					let handbrake = keys.has('Space');

					const pads = navigator.getGamepads ? navigator.getGamepads() : [];
					const pad = Array.from(pads).find((p) => p && p.connected) ?? null;
					if (pad) {
						if (pad.id !== padName) padName = pad.id;
						const ax = pad.axes[0] ?? 0;
						const padSteer = Math.abs(ax) > 0.12 ? -ax : 0;
						if (Math.abs(padSteer) > Math.abs(steerInput)) steerInput = padSteer;
						throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
						brakeInput = Math.max(brakeInput, pad.buttons[6]?.value ?? 0);
						handbrake = handbrake || (pad.buttons[0]?.pressed ?? false);
						const padFire = pad.buttons[5]?.pressed ?? false;
						if (padFire && !prevPadFire) fireQueued = true;
						prevPadFire = padFire;
						const padOil = pad.buttons[2]?.pressed ?? false;
						if (padOil && !prevPadOil) oilQueued = true;
						prevPadOil = padOil;
						const padTether = pad.buttons[4]?.pressed ?? false;
						if (padTether && !prevPadTether) tetherQueued = true;
						prevPadTether = padTether;
					} else {
						if (padName) padName = '';
						prevPadFire = false;
						prevPadOil = false;
						prevPadTether = false;
					}

					// -- Global physics tuning --
					world.gravity.set(0, -num(tuning.gravity, DEFAULTS.gravity), 0);

					// -- Per-vehicle pipeline: identical for player and AI --
					for (const rig of all) {
						const body = rig.body;
						const recovered = rig.combat.tick(now);
						if (recovered === 'recovered' && rig === player) {
							flash('BACK IN — health restored');
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
						if (rig === player) {
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

						// Status tint + scorch: gray when out, gold when down, cyan
						// blink on hit, violet flicker while oiled; otherwise the base
						// color chars toward burnt charcoal as health drops.
						const hpFrac = Math.max(
							0,
							Math.min(1, rig.combat.health / Math.max(1, rig.combat.maxHealth))
						);
						const tint = rig.combat.eliminated
							? 0x3a4440
							: rig.combat.isDown(now)
								? 0x6b5a1c
								: rig.flashUntil > now
									? 0x00b8c8
									: rig.combat.isOiled(now) && Math.floor(now / 130) % 2 === 0
										? 0x4a3a7a
										: tmpColA
												.setHex(rig.baseColor)
												.lerp(tmpColB.setHex(0x141210), (1 - hpFrac) * 0.75)
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
							spawnSparks(body.position.x, body.position.y + 0.6, body.position.z, 4, 0xffcf7a, 5, 350);
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

						if (rig === player) {
							speedMs = Math.round(rawSpeed * 10) / 10;
							speedKmh = Math.round(rawSpeed * 3.6);
						}
					}

					// -- Weapons: player triggers + AI decisions, one shared path --
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
					const combatants = all.map(combatantOf);
					for (const rig of ais) {
						if (!rig.ai || rig.combat.isOut(now)) continue;
						const self = combatants[all.indexOf(rig)];
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

					world.step(1 / 60, dt, 4);

					// -- Shockwave rams: chassis contacts queued during the step,
					// evaluated on pre-step velocities, resolved with impulses --
					if (pendingRams.length) {
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
							handleOutcome(a, res.outcomeA, b.label);
							handleOutcome(b, res.outcomeB, a.label);
						}
						pendingRams = [];
					}

					// -- Oil slicks: trigger checks + puddle lifecycle --
					{
						const fresh = all.map(combatantOf);
						const oilEvents = updateOilSlicks(slicks, fresh, ct, now);
						for (const ev of oilEvents) {
							const victim = all.find((r) => r.id === ev.targetId);
							if (!victim) continue;
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
						// odd arc of cyan sparks so a stun reads at a glance.
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
									0x00f0ff,
									6,
									250
								);
							}
						}

						// Overhead health bar (AI only): follow, face camera, fill.
						if (rig.bar) {
							rig.bar.group.position.set(
								rig.body.position.x,
								rig.body.position.y + 2.2,
								rig.body.position.z
							);
							rig.bar.group.lookAt(camera.position);
							const frac = Math.max(0, rig.combat.health / Math.max(1, rig.combat.maxHealth));
							rig.bar.fg.scale.x = Math.max(0.001, frac);
							rig.bar.fg.position.x = -(1 - frac) * 1.2;
							rig.bar.fgMat.color.setHex(
								rig.combat.eliminated ? 0x4a4f4a : frac > 0.35 ? 0x00ff41 : 0xffb347
							);
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

					chud.hp = Math.round(player.combat.health);
					chud.max = player.combat.maxHealth;
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
								hp: Math.max(0, Math.round(r.combat.health)),
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
					clearTimeout(flashTimer);
					window.removeEventListener('keydown', onKeyDown);
					window.removeEventListener('keyup', onKeyUp);
					window.removeEventListener('blur', onBlur);
					delete (window as unknown as Record<string, unknown>).__greenline;
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

	<div class="gl-hud">
		<div class="gl-title">GREENLINE // movement prototype · {track.name} · {mode.toUpperCase()}</div>
		<div class="gl-speed">{speedKmh}<span class="gl-unit">km/h</span></div>
		<div class="gl-sub">{speedMs} m/s{hud.offTrack ? ' · OFF TRACK' : ''}</div>

		<div class="gl-health">
			<div class="gl-health-bar">
				<div
					class="gl-health-fill"
					class:low={chud.hp / Math.max(1, chud.max) <= 0.35}
					style:width="{Math.max(0, (chud.hp / Math.max(1, chud.max)) * 100)}%"
				></div>
			</div>
			<div class="gl-health-line">
				HP {chud.hp}/{chud.max}
				{#if chud.status === 'DISRUPTED'}<span class="gl-st-disrupted">DISRUPTED</span>{/if}
				{#if chud.status === 'DOWN'}<span class="gl-st-down"
						>DOWN {chud.downLeft.toFixed(1)}s</span
					>{/if}
				{#if chud.status === 'ELIMINATED'}<span class="gl-st-down">ELIMINATED</span>{/if}
				{#if chud.oiled}<span class="gl-st-oiled">OILED</span>{/if}
				{#if chud.tethered}<span class="gl-st-tether">TETHERED</span>{/if}
			</div>
			<div class="gl-weapons">
				<div class="gl-weapon-row">
					<span class="gl-wname">EMP</span>
					{chud.ready.emp <= 0 ? 'READY (F / RB)' : `${chud.ready.emp.toFixed(1)}s`}
				</div>
				<div class="gl-weapon-row">
					<span class="gl-wname">OIL</span>
					{chud.ready.oil <= 0 ? 'READY (E / X)' : `${chud.ready.oil.toFixed(1)}s`}
				</div>
				<div class="gl-weapon-row">
					<span class="gl-wname">TETHER</span>
					{chud.ready.tether <= 0 ? 'READY (Q / LB)' : `${chud.ready.tether.toFixed(1)}s`}
				</div>
				<div class="gl-weapon-row">
					<span class="gl-wname">RAM</span>
					{chud.ready.ram <= 0 ? 'ARMED (nose-first contact)' : `${chud.ready.ram.toFixed(1)}s`}
				</div>
			</div>
		</div>

		<div class="gl-lap">
			{#if hud.timing}
				<div class="gl-lap-big">LAP {hud.lap} · CP {hud.cp}/{hud.total}</div>
				<div class="gl-lap-line">time {formatLapMs(hud.currentMs)}</div>
				<div class="gl-lap-line">last {formatLapMs(hud.lastMs)} · best {formatLapMs(hud.bestMs)}</div>
			{:else}
				<div class="gl-lap-line">cross the start line to begin timing</div>
			{/if}
			{#if lapFlash}
				<div class="gl-lap-flash">{lapFlash}</div>
			{/if}
		</div>

		{#if standings.length}
			<div class="gl-standings">
				{#each standings as s (s.label)}
					<div class="gl-stand-row" class:me={s.label === 'YOU'}>
						P{s.pos} {s.label} [{s.arch}] · {s.note || `L${s.laps} CP${s.cp}`} · {s.hp}hp
					</div>
				{/each}
			</div>
		{/if}

		<div class="gl-pad">{padName ? `pad: ${padName}` : 'pad: none (keyboard)'}</div>
		<div class="gl-keys">
			W/S throttle+brake · A/D steer · Space handbrake · F EMP · E oil · Q tether · G garage · R
			reset round
		</div>
	</div>

	<div class="gl-map">
		<Minimap runtime={rt} {pose} nextCheckpoint={hud.cp} others={aiPoses} />
	</div>

	{#if showDebug && garageOpen}
		<Garage
			loadout={playerLoadout}
			baselineHealth={Number.isFinite(tuning.maxHealth) ? tuning.maxHealth : DEFAULTS.maxHealth}
			baselineMass={Number.isFinite(tuning.chassisMass) ? tuning.chassisMass : DEFAULTS.chassisMass}
			baselineEngine={Number.isFinite(tuning.engineForce)
				? tuning.engineForce
				: DEFAULTS.engineForce}
			baselineDrag={Number.isFinite(tuning.aeroDrag) ? tuning.aeroDrag : DEFAULTS.aeroDrag}
			onselect={selectArchetype}
			onequip={equipPart}
			onclose={() => (garageOpen = false)}
		/>
	{/if}

	{#if showDebug}
	<div class="gl-panel">
		<div class="gl-panel-head">TUNING (live)</div>

		<div class="gl-actions" style="margin-top: 0;">
			<button
				onclick={() => (garageOpen = true)}
				style="background: rgba(200, 255, 0, 0.1); border-color: rgba(200, 255, 0, 0.45); color: #c8ff00;"
			>
				garage / loadout (G) · {playerLoadout.archetype.toUpperCase()}
			</button>
		</div>

		<div class="gl-section">mode</div>
		<label class="gl-select-row"
			>mode
			<select bind:value={mode} onchange={() => resetRound()}>
				<option value="race">RACE</option>
				<option value="elimination">ELIMINATION</option>
			</select></label
		>
		<label>lap target (race) <input type="number" step="1" bind:value={tuning.lapTarget} /></label>

		<div class="gl-section">ai</div>
		<label>count (on reset) <input type="number" step="1" bind:value={tuning.aiCount} /></label>
		<label>top speed (m/s) <input type="number" step="0.5" bind:value={tuning.aiTopSpeed} /></label>
		<label>corner accel <input type="number" step="0.5" bind:value={tuning.aiCorner} /></label>
		<label
			>aggression (0-1) <input type="number" step="0.1" bind:value={tuning.aiAggression} /></label
		>

		<div class="gl-section">combat</div>
		<label>max health <input type="number" step="10" bind:value={tuning.maxHealth} /></label>
		<label>down time (s, race) <input type="number" step="0.5" bind:value={tuning.downSec} /></label>

		<div class="gl-section">emp</div>
		<label>damage <input type="number" step="5" bind:value={tuning.empDamage} /></label>
		<label>range <input type="number" step="5" bind:value={tuning.empRange} /></label>
		<label>cone (deg) <input type="number" step="5" bind:value={tuning.empConeDeg} /></label>
		<label>cooldown (s) <input type="number" step="0.1" bind:value={tuning.empCooldownSec} /></label>
		<label
			>disruption (s) <input type="number" step="0.1" bind:value={tuning.disruptionSec} /></label
		>
		<label
			>disrupt engine x <input type="number" step="0.05" bind:value={tuning.disruptEngineCut} /></label
		>
		<label
			>disrupt steer x <input type="number" step="0.05" bind:value={tuning.disruptSteerCut} /></label
		>
		<label>spin kick <input type="number" step="0.5" bind:value={tuning.spinKick} /></label>

		<div class="gl-section">oil slick</div>
		<label>cooldown (s) <input type="number" step="0.5" bind:value={tuning.oilCooldownSec} /></label>
		<label>radius <input type="number" step="0.2" bind:value={tuning.oilRadius} /></label>
		<label>puddle life (s) <input type="number" step="1" bind:value={tuning.oilLifeSec} /></label>
		<label>slip time (s) <input type="number" step="0.5" bind:value={tuning.oilSlipSec} /></label>
		<label
			>traction x (0-1) <input type="number" step="0.02" bind:value={tuning.oilTractionCut} /></label
		>

		<div class="gl-section">tether</div>
		<label
			>cooldown (s) <input type="number" step="0.5" bind:value={tuning.tetherCooldownSec} /></label
		>
		<label>range <input type="number" step="2" bind:value={tuning.tetherRange} /></label>
		<label>cone (deg) <input type="number" step="5" bind:value={tuning.tetherConeDeg} /></label>
		<label>pull force <input type="number" step="500" bind:value={tuning.tetherForce} /></label>
		<label>duration (s) <input type="number" step="0.05" bind:value={tuning.tetherSec} /></label>
		<label>damage <input type="number" step="2" bind:value={tuning.tetherDamage} /></label>

		<div class="gl-section">ram</div>
		<label
			>min speed (m/s) <input type="number" step="1" bind:value={tuning.ramMinClosingSpeed} /></label
		>
		<label>damage <input type="number" step="5" bind:value={tuning.ramDamage} /></label>
		<label>impulse <input type="number" step="200" bind:value={tuning.ramImpulse} /></label>
		<label>pop-up <input type="number" step="100" bind:value={tuning.ramPopUp} /></label>
		<label>stun (s) <input type="number" step="0.1" bind:value={tuning.ramStunSec} /></label>
		<label>cooldown (s) <input type="number" step="0.5" bind:value={tuning.ramCooldownSec} /></label>

		<div class="gl-section">feedback</div>
		<label>shake amount <input type="number" step="0.05" bind:value={tuning.shakeMax} /></label>
		<label>shake decay <input type="number" step="0.1" bind:value={tuning.shakeDecay} /></label>
		<label>fx density <input type="number" step="0.1" bind:value={tuning.fxDensity} /></label>

		<div class="gl-section">drive</div>
		<label>engine force <input type="number" step="100" bind:value={tuning.engineForce} /></label>
		<label>brake force <input type="number" step="50" bind:value={tuning.brakeForce} /></label>
		<label
			>handbrake force <input type="number" step="50" bind:value={tuning.handbrakeForce} /></label
		>
		<label
			>handbrake grip <input type="number" step="0.05" bind:value={tuning.handbrakeGrip} /></label
		>
		<label>aero drag <input type="number" step="0.1" bind:value={tuning.aeroDrag} /></label>
		<label>max steer (rad) <input type="number" step="0.05" bind:value={tuning.maxSteer} /></label>
		<label
			>steer falloff /(m/s)
			<input type="number" step="0.01" bind:value={tuning.steerSpeedFalloff} /></label
		>
		<label>pitch damp (anti-flip) <input type="number" step="0.5" bind:value={tuning.pitchDamp} /></label>

		<div class="gl-section">chassis</div>
		<label>mass (kg) <input type="number" step="10" bind:value={tuning.chassisMass} /></label>
		<label>gravity <input type="number" step="0.5" bind:value={tuning.gravity} /></label>

		<div class="gl-section">suspension</div>
		<label
			>stiffness <input type="number" step="1" bind:value={tuning.suspensionStiffness} /></label
		>
		<label
			>damping (comp) <input type="number" step="0.1" bind:value={tuning.dampingCompression} /></label
		>
		<label
			>damping (relax) <input type="number" step="0.1" bind:value={tuning.dampingRelaxation} /></label
		>
		<label
			>rest length <input type="number" step="0.05" bind:value={tuning.suspensionRestLength} /></label
		>
		<label
			>max travel <input type="number" step="0.05" bind:value={tuning.maxSuspensionTravel} /></label
		>

		<div class="gl-section">tires</div>
		<label>friction slip <input type="number" step="0.1" bind:value={tuning.frictionSlip} /></label>
		<label
			>roll influence <input type="number" step="0.01" bind:value={tuning.rollInfluence} /></label
		>

		<div class="gl-section">track</div>
		<label>grass drag <input type="number" step="0.5" bind:value={tuning.grassDrag} /></label>
		<label>wall spring <input type="number" step="100" bind:value={tuning.wallSpring} /></label>
		<label>wall damping <input type="number" step="50" bind:value={tuning.wallDamp} /></label>

		<div class="gl-section">flip recovery</div>
		<label>up-Y threshold <input type="number" step="0.05" bind:value={tuning.flipUpY} /></label>
		<label>delay (s) <input type="number" step="0.5" bind:value={tuning.flipDelaySec} /></label>
		<label
			>max speed (m/s) <input type="number" step="0.5" bind:value={tuning.flipMaxSpeed} /></label
		>

		<div class="gl-section">camera</div>
		<label>distance <input type="number" step="0.5" bind:value={tuning.camDistance} /></label>
		<label>height <input type="number" step="0.5" bind:value={tuning.camHeight} /></label>
		<label>stiffness <input type="number" step="0.5" bind:value={tuning.camStiffness} /></label>

		<div class="gl-actions">
			<button onclick={() => resetRound()}>reset round (R)</button>
			<button onclick={resetTuning}>reset tuning</button>
		</div>
		<div class="gl-actions" style="margin-top: 0.4rem;">
			<button onclick={copyTuning} style="background: rgba(0, 240, 255, 0.12); border-color: rgba(0, 240, 255, 0.4); color: #00f0ff;">
				{copied ? 'copied!' : 'copy tuning parameters'}
			</button>
		</div>
	</div>
	{/if}
</div>

<style>
	.gl-root {
		position: fixed;
		inset: 0;
		background: #05090c;
		font-family: 'Share Tech Mono', monospace;
		color: #e8ffe8;
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
		color: #ffb347;
		background: rgba(10, 14, 10, 0.9);
		border: 1px solid #ffb347;
		padding: 1rem 1.5rem;
	}
	.gl-banner {
		position: absolute;
		top: 1.2rem;
		left: 50%;
		transform: translateX(-50%);
		color: #c8ff00;
		background: rgba(6, 12, 8, 0.9);
		border: 1px solid rgba(200, 255, 0, 0.5);
		padding: 0.5rem 1.2rem;
		font-size: 1rem;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}
	.gl-hud {
		position: absolute;
		top: 1rem;
		left: 1rem;
		pointer-events: none;
		text-shadow: 0 0 8px rgba(0, 255, 65, 0.35);
	}
	.gl-title {
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		color: #00ff41;
		margin-bottom: 0.4rem;
	}
	.gl-speed {
		font-size: 3rem;
		line-height: 1;
		color: #00ff41;
	}
	.gl-unit {
		font-size: 1rem;
		margin-left: 0.4rem;
		color: #7fbf8f;
	}
	.gl-sub {
		color: #7fbf8f;
		margin-top: 0.2rem;
	}
	.gl-health {
		margin-top: 0.6rem;
		width: 15rem;
	}
	.gl-health-bar {
		height: 0.55rem;
		background: rgba(10, 20, 16, 0.9);
		border: 1px solid rgba(0, 255, 65, 0.35);
	}
	.gl-health-fill {
		height: 100%;
		background: #00ff41;
		transition: width 120ms linear;
	}
	.gl-health-fill.low {
		background: #ffb347;
	}
	.gl-health-line {
		margin-top: 0.25rem;
		font-size: 0.8rem;
		color: #b9d9c2;
	}
	.gl-st-disrupted {
		color: #00f0ff;
		margin-left: 0.5rem;
	}
	.gl-st-down {
		color: #ffb347;
		margin-left: 0.5rem;
	}
	.gl-st-oiled {
		color: #b47cff;
		margin-left: 0.5rem;
	}
	.gl-st-tether {
		color: #c8ff00;
		margin-left: 0.5rem;
	}
	.gl-weapons {
		margin-top: 0.35rem;
	}
	.gl-weapon-row {
		font-size: 0.72rem;
		color: #5f7f6a;
		margin-top: 0.12rem;
	}
	.gl-wname {
		display: inline-block;
		width: 3.6rem;
		color: #7fbf8f;
	}
	.gl-lap {
		margin-top: 0.7rem;
		border-left: 2px solid rgba(0, 255, 65, 0.35);
		padding-left: 0.6rem;
	}
	.gl-lap-big {
		color: #00f0ff;
		font-size: 1.05rem;
	}
	.gl-lap-line {
		color: #7fbf8f;
		font-size: 0.85rem;
		margin-top: 0.15rem;
	}
	.gl-lap-flash {
		color: #c8ff00;
		font-size: 0.95rem;
		margin-top: 0.3rem;
	}
	.gl-standings {
		margin-top: 0.6rem;
		border-left: 2px solid rgba(0, 240, 255, 0.3);
		padding-left: 0.6rem;
	}
	.gl-stand-row {
		font-size: 0.78rem;
		color: #7fbf8f;
		margin-top: 0.1rem;
	}
	.gl-stand-row.me {
		color: #00ff41;
	}
	.gl-pad {
		margin-top: 0.6rem;
		font-size: 0.72rem;
		color: #00f0ff;
		max-width: 22rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gl-keys {
		margin-top: 0.3rem;
		font-size: 0.72rem;
		color: #5f7f6a;
	}
	.gl-map {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
	}
	.gl-panel {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 15.5rem;
		max-height: calc(100% - 2rem);
		overflow-y: auto;
		background: rgba(6, 12, 8, 0.88);
		border: 1px solid rgba(0, 255, 65, 0.25);
		padding: 0.7rem 0.8rem;
		font-size: 0.72rem;
	}
	.gl-panel-head {
		color: #00ff41;
		letter-spacing: 0.14em;
		margin-bottom: 0.4rem;
	}
	.gl-section {
		color: #7fbf8f;
		letter-spacing: 0.1em;
		margin: 0.55rem 0 0.2rem;
		border-bottom: 1px solid rgba(0, 255, 65, 0.15);
	}
	.gl-panel label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0.18rem 0;
		color: #b9d9c2;
	}
	.gl-panel input {
		width: 5.2rem;
		background: #0a1410;
		border: 1px solid rgba(0, 255, 65, 0.3);
		color: #e8ffe8;
		font-family: inherit;
		font-size: 0.72rem;
		padding: 0.15rem 0.3rem;
	}
	.gl-panel select {
		width: 8rem;
		background: #0a1410;
		border: 1px solid rgba(0, 255, 65, 0.3);
		color: #e8ffe8;
		font-family: inherit;
		font-size: 0.72rem;
		padding: 0.15rem 0.3rem;
	}
	.gl-panel input:focus,
	.gl-panel select:focus {
		outline: 1px solid #00ff41;
	}
	.gl-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.7rem;
	}
	.gl-actions button {
		flex: 1;
		background: rgba(0, 255, 65, 0.1);
		border: 1px solid rgba(0, 255, 65, 0.4);
		color: #00ff41;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.3rem 0.2rem;
		cursor: pointer;
	}
	.gl-actions button:hover {
		background: rgba(0, 255, 65, 0.2);
	}
</style>
