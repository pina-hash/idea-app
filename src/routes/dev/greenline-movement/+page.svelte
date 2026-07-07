<script lang="ts">
	import { onMount } from 'svelte';
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
		tryFire,
		VehicleCombat,
		type Combatant,
		type CombatTuning,
		type GreenlineMode
	} from '$lib/greenline/combat';
	import Minimap from '$lib/greenline/Minimap.svelte';
	import testLoopJson from '$lib/greenline/tracks/test-loop.json';

	/**
	 * GREENLINE movement + track + combat prototype (dev-only harness).
	 *
	 * Vehicle-feel testbed on the v1 track format: cannon-es RaycastVehicle
	 * cars (the player and a scripted dummy run through the IDENTICAL
	 * per-vehicle pipeline: controls -> combat drive modifiers -> physics ->
	 * meshes), the test-loop track with ordered-checkpoint lap timing and soft
	 * boundaries, health + the forward EMP disruption weapon, and the
	 * RACE / ELIMINATION mode flag. Combat rules live in
	 * $lib/greenline/combat.ts (pure, vehicle-agnostic); the zero-health mode
	 * branch is VehicleCombat.applyDamage. Everything numeric is in the live
	 * tuning panel. No art; throwaway while the design solidifies.
	 *
	 * Controls: W/S throttle+brake (reverse from standstill), A/D steer,
	 * Space handbrake, F fire EMP, R reset round. Gamepad: left stick steer,
	 * RT throttle, LT brake, A handbrake, RB fire.
	 */

	const DEFAULTS = {
		engineForce: 2300,
		brakeForce: 50,
		handbrakeForce: 50,
		handbrakeGrip: 0.65,
		aeroDrag: 1.8,
		maxSteer: 1,
		steerSpeedFalloff: 0.04,
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
		camDistance: 9,
		camHeight: 3.5,
		camStiffness: 5,
		...COMBAT_DEFAULTS,
		lapTarget: 3
	};

	const tuning = $state({ ...DEFAULTS });

	const track = parseTrack(testLoopJson);
	const rt = buildRuntime(track);

	let mode = $state<GreenlineMode>('race');
	let speedKmh = $state(0);
	let speedMs = $state(0);
	let padName = $state('');
	let bootError = $state('');
	let banner = $state('');
	let resetRound: () => void = () => {};

	const pose = $state({ x: track.spawn.x, z: track.spawn.z, hx: 1, hz: 0 });
	const dummyPose = $state({ x: 0, z: 0, hx: 1, hz: 0, out: false });
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
		downLeft: 0,
		ready: 0,
		dummyHp: COMBAT_DEFAULTS.maxHealth,
		dummyStatus: '' as '' | 'DISRUPTED' | 'DOWN' | 'ELIMINATED'
	});
	let lapFlash = $state('');

	let stage: HTMLDivElement;

	// A panel input momentarily empty while the user types reads NaN; fall back
	// to the default so the sim never ingests a non-finite value.
	const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);

	const resetTuning = () => Object.assign(tuning, DEFAULTS);

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

				// ---- Ground: plane + grid + pylons kept off the road ----
				const groundMesh = new THREE.Mesh(
					new THREE.PlaneGeometry(600, 600),
					new THREE.MeshStandardMaterial({ color: 0x07120a, roughness: 1 })
				);
				groundMesh.rotation.x = -Math.PI / 2;
				scene.add(groundMesh);

				const grid = new THREE.GridHelper(600, 60, 0x2f8f4f, 0x14351f);
				grid.position.y = 0.02;
				scene.add(grid);

				const nearTrack = (x: number, z: number, margin: number) =>
					rt.center.some((p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < margin * margin);
				const pylonGeo = new THREE.ConeGeometry(0.7, 2.4, 8);
				const pylonMat = new THREE.MeshStandardMaterial({ color: 0xb8a11c, roughness: 0.7 });
				for (let x = -250; x <= 250; x += 50) {
					for (let z = -250; z <= 250; z += 50) {
						if (Math.abs(x) < 25 && Math.abs(z) < 25) continue;
						if (nearTrack(x, z, rt.halfWidth + 8)) continue;
						const pylon = new THREE.Mesh(pylonGeo, pylonMat);
						pylon.position.set(x, 1.2, z);
						scene.add(pylon);
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

				interface Rig {
					id: string;
					body: InstanceType<typeof CANNON.Body>;
					vehicle: InstanceType<typeof CANNON.RaycastVehicle>;
					carGroup: InstanceType<typeof THREE.Group>;
					bodyMat: InstanceType<typeof THREE.MeshStandardMaterial>;
					baseColor: number;
					wheelMeshes: InstanceType<typeof THREE.Mesh>[];
					combat: VehicleCombat;
					warmIdx: number;
					steerCurrent: number;
					hx: number;
					hz: number;
					flashUntil: number;
					spawn: { x: number; z: number; headingDeg: number };
				}

				const quatFor = (headingDeg: number) => {
					const q = new CANNON.Quaternion();
					q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), (headingDeg * Math.PI) / 180);
					return q;
				};

				const makeRig = (
					id: string,
					baseColor: number,
					spawn: { x: number; z: number; headingDeg: number }
				): Rig => {
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

					return {
						id,
						body,
						vehicle,
						carGroup,
						bodyMat,
						baseColor,
						wheelMeshes,
						combat: new VehicleCombat(id, num(tuning.maxHealth, DEFAULTS.maxHealth)),
						warmIdx: 0,
						steerCurrent: 0,
						hx: 1,
						hz: 0,
						flashUntil: 0,
						spawn
					};
				};

				// Player at the track spawn; dummy parked on the racing line ahead.
				const dummyIdx = 30;
				const dTan = rt.center[(dummyIdx + 1) % nC];
				const dummySpawn = {
					x: rt.center[dummyIdx].x,
					z: rt.center[dummyIdx].z,
					headingDeg:
						(Math.atan2(-(dTan.z - rt.center[dummyIdx].z), dTan.x - rt.center[dummyIdx].x) * 180) /
						Math.PI
				};
				const player = makeRig('player', 0x0e6b2f, { ...track.spawn });
				const dummy = makeRig('dummy', 0x8a6d1c, dummySpawn);
				dummy.warmIdx = dummyIdx;
				const rigs: Rig[] = [player, dummy];

				// Dummy overhead health bar (camera-facing, no-art)
				const barGroup = new THREE.Group();
				const barBg = new THREE.Mesh(
					new THREE.PlaneGeometry(2.4, 0.28),
					new THREE.MeshBasicMaterial({ color: 0x0a1410, transparent: true, opacity: 0.8 })
				);
				const barFgMat = new THREE.MeshBasicMaterial({ color: 0x00ff41 });
				const barFg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), barFgMat);
				barFg.position.z = 0.01;
				barGroup.add(barBg);
				barGroup.add(barFg);
				scene.add(barGroup);

				// ---- EMP burst effect pool (visual only) ----
				const fxList: { mesh: InstanceType<typeof THREE.Mesh>; born: number }[] = [];
				const fxGeo = new THREE.RingGeometry(0.82, 1, 40);
				fxGeo.rotateX(-Math.PI / 2);
				const spawnFx = (x: number, z: number) => {
					const mesh = new THREE.Mesh(
						fxGeo,
						new THREE.MeshBasicMaterial({
							color: 0x00f0ff,
							transparent: true,
							opacity: 0.55,
							side: THREE.DoubleSide,
							depthWrite: false
						})
					);
					mesh.position.set(x, 0.5, z);
					scene.add(mesh);
					fxList.push({ mesh, born: performance.now() });
				};

				// ---- Combat wiring (shared by player input and any scripted shooter) ----
				const combatTuning = (): CombatTuning => ({
					maxHealth: num(tuning.maxHealth, DEFAULTS.maxHealth),
					empDamage: num(tuning.empDamage, DEFAULTS.empDamage),
					empRange: num(tuning.empRange, DEFAULTS.empRange),
					empConeDeg: num(tuning.empConeDeg, DEFAULTS.empConeDeg),
					weaponCooldownSec: num(tuning.weaponCooldownSec, DEFAULTS.weaponCooldownSec),
					disruptionSec: num(tuning.disruptionSec, DEFAULTS.disruptionSec),
					disruptEngineCut: num(tuning.disruptEngineCut, DEFAULTS.disruptEngineCut),
					disruptSteerCut: num(tuning.disruptSteerCut, DEFAULTS.disruptSteerCut),
					spinKick: num(tuning.spinKick, DEFAULTS.spinKick),
					downSec: num(tuning.downSec, DEFAULTS.downSec)
				});

				const combatantOf = (r: Rig): Combatant => ({
					id: r.id,
					x: r.body.position.x,
					z: r.body.position.z,
					hx: r.hx,
					hz: r.hz,
					combat: r.combat
				});

				const performFire = (shooter: Rig) => {
					const ct = combatTuning();
					const now = performance.now();
					const result = tryFire(
						combatantOf(shooter),
						rigs.map(combatantOf),
						mode,
						ct,
						now
					);
					if (!result.fired) return result;
					spawnFx(shooter.body.position.x, shooter.body.position.z);
					for (const hit of result.hits) {
						const target = rigs.find((r) => r.id === hit.targetId);
						if (!target) continue;
						target.body.angularVelocity.y += ct.spinKick * hit.spinSign;
						target.flashUntil = now + 180;
						if (hit.outcome === 'eliminated') {
							banner =
								target === player
									? 'YOU ARE ELIMINATED — press R to reset the round'
									: 'DUMMY ELIMINATED — last vehicle running: YOU WIN';
						} else if (hit.outcome === 'down') {
							flash(`${hit.targetId.toUpperCase()} DOWN — recovering`);
						} else {
							flash(`HIT ${hit.targetId.toUpperCase()} -${hit.damage}`);
						}
					}
					return result;
				};

				// ---- Lap + surface tracking (player only) ----
				const tracker = new LapTracker();
				let prevX = track.spawn.x;
				let prevZ = track.spawn.z;
				let prevMs = performance.now();
				let raceDone = false;

				const syncHud = () => {
					hud.timing = tracker.timing;
					hud.lap = tracker.lapsCompleted + 1;
					hud.cp = tracker.nextCheckpoint;
					hud.lastMs = tracker.lastLapMs;
					hud.bestMs = tracker.bestLapMs;
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
				let prevPadFire = false;

				resetRound = () => {
					const maxHp = num(tuning.maxHealth, DEFAULTS.maxHealth);
					for (const r of rigs) {
						r.combat.reset(maxHp);
						r.body.position.set(r.spawn.x, SPAWN_Y, r.spawn.z);
						r.body.quaternion.copy(quatFor(r.spawn.headingDeg));
						r.body.velocity.setZero();
						r.body.angularVelocity.setZero();
						r.steerCurrent = 0;
						r.flashUntil = 0;
					}
					player.warmIdx = 0;
					dummy.warmIdx = dummyIdx;
					tracker.reset();
					raceDone = false;
					banner = '';
					prevX = track.spawn.x;
					prevZ = track.spawn.z;
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
				const tmpQuat = new THREE.Quaternion();

				let lastT = performance.now();

				// Dev-only debug handle for poking the sim from the console.
				const teleport = (x: number, z: number, headingDeg: number, speed = 0) => {
					const d = headingToDir(headingDeg);
					player.body.position.set(x, SPAWN_Y, z);
					player.body.quaternion.copy(quatFor(headingDeg));
					player.body.velocity.set(d.x * speed, 0, d.z * speed);
					player.body.angularVelocity.setZero();
				};
				(window as unknown as Record<string, unknown>).__greenline = {
					world,
					rigs,
					player,
					dummy,
					rt,
					tracker,
					teleport,
					resetRound: () => resetRound(),
					fire: (rigId: 'player' | 'dummy' = 'player') =>
						performFire(rigId === 'player' ? player : dummy),
					getMode: () => mode
				};

				const tick = () => {
					const now = performance.now();
					const dt = Math.min((now - lastT) / 1000, 0.05);
					lastT = now;
					const ct = combatTuning();

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
					} else {
						if (padName) padName = '';
						prevPadFire = false;
					}

					// -- Global physics tuning --
					world.gravity.set(0, -num(tuning.gravity, DEFAULTS.gravity), 0);

					// -- Per-vehicle pipeline: identical for player and dummy --
					for (const rig of rigs) {
						const body = rig.body;
						const recovered = rig.combat.tick(ct, now);
						if (recovered === 'recovered') {
							flash(`${rig.id.toUpperCase()} BACK IN — health restored`);
						}

						const mass = num(tuning.chassisMass, DEFAULTS.chassisMass);
						if (body.mass !== mass) {
							body.mass = mass;
							body.updateMassProperties();
						}
						for (const w of rig.vehicle.wheelInfos) {
							w.suspensionStiffness = num(
								tuning.suspensionStiffness,
								DEFAULTS.suspensionStiffness
							);
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
							w.frictionSlip = num(tuning.frictionSlip, DEFAULTS.frictionSlip);
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

						// Controls: the player from input, the dummy from its follow
						// script (steer at a point a little way down the centerline).
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
							const target = rt.center[(rig.warmIdx + 4) % nC];
							const dx = target.x - body.position.x;
							const dz = target.z - body.position.z;
							const cross = rig.hx * dz - rig.hz * dx;
							const dot = rig.hx * dx + rig.hz * dz;
							// Positive steer turns left (-z of heading); aim at the target.
							sIn = Math.max(-1, Math.min(1, -Math.atan2(cross, Math.max(dot, 0.001)) * 1.2));
							thr = 0.4;
							brk = 0;
						}

						// Combat drive modifiers: disruption / down / eliminated scale
						// or zero the controls the same way for every vehicle.
						const mods = driveMods(rig.combat, ct, now);
						thr *= mods.engineScale;
						sIn *= mods.steerScale;
						if (rig.combat.isOut(now)) brk = 0;

						const falloff = num(tuning.steerSpeedFalloff, DEFAULTS.steerSpeedFalloff);
						const effSteer =
							num(tuning.maxSteer, DEFAULTS.maxSteer) / (1 + rawSpeed * Math.max(0, falloff));
						const steerTarget = sIn * effSteer;
						rig.steerCurrent += (steerTarget - rig.steerCurrent) * Math.min(1, dt * 10);
						rig.vehicle.setSteeringValue(rig.steerCurrent, 0);
						rig.vehicle.setSteeringValue(rig.steerCurrent, 1);

						let engine = 0;
						let brake = 0;
						const engineMax = num(tuning.engineForce, DEFAULTS.engineForce);
						if (thr > 0) engine = thr * engineMax;
						if (brk > 0) {
							if (forwardSpeed > 0.5) brake = brk * num(tuning.brakeForce, DEFAULTS.brakeForce);
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

						// Quadratic aero drag caps top speed (~sqrt(engine/drag)).
						const drag = num(tuning.aeroDrag, DEFAULTS.aeroDrag);
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
						if (rig === player) hud.offTrack = !surf.state.onRibbon;
						if (!surf.state.onRibbon && rawSpeed > 0.1) {
							const gd = num(tuning.grassDrag, DEFAULTS.grassDrag);
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

						// Status tint: gray when out, cyan blink on hit, base otherwise.
						const tint = rig.combat.eliminated
							? 0x3a4440
							: rig.combat.isDown(now)
								? 0x6b5a1c
								: rig.flashUntil > now
									? 0x00b8c8
									: rig.baseColor;
						if (rig.bodyMat.color.getHex() !== tint) rig.bodyMat.color.setHex(tint);

						if (rig === player) {
							speedMs = Math.round(rawSpeed * 10) / 10;
							speedKmh = Math.round(rawSpeed * 3.6);
						}
					}

					// -- Firing (player trigger; scripted shooters use the same path) --
					if (fireQueued) {
						fireQueued = false;
						performFire(player);
					}

					world.step(1 / 60, dt, 4);

					// -- Lap logic (player) --
					const px = player.body.position.x;
					const pz = player.body.position.z;
					const events = tracker.update(rt, { x: prevX, z: prevZ }, { x: px, z: pz }, prevMs, now);
					for (const ev of events) {
						if (ev.type === 'timing-started') flash('LAP TIMER STARTED');
						else if (ev.type === 'lap') {
							flash(ev.best ? `NEW BEST ${formatLapMs(ev.lapMs)}` : `LAP ${formatLapMs(ev.lapMs)}`);
							const target = Math.max(1, Math.round(num(tuning.lapTarget, DEFAULTS.lapTarget)));
							if (mode === 'race' && !raceDone && tracker.lapsCompleted >= target) {
								raceDone = true;
								banner = `RACE COMPLETE — ${tracker.lapsCompleted} laps, best ${formatLapMs(tracker.bestLapMs)}`;
							}
						} else if (ev.type === 'rejected' && ev.reason === 'out-of-order')
							flash(`${ev.gateId.toUpperCase()} IGNORED (out of order)`);
					}
					if (events.length) {
						syncHud();
						styleGates(tracker.nextCheckpoint);
					}
					hud.currentMs = tracker.currentLapMs(now);
					prevX = px;
					prevZ = pz;
					prevMs = now;

					// -- Sync meshes --
					for (const rig of rigs) {
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
					}

					// Dummy overhead bar: follow + face camera + fill by health
					barGroup.position.set(dummy.body.position.x, dummy.body.position.y + 2.2, dummy.body.position.z);
					barGroup.lookAt(camera.position);
					const dummyFrac = Math.max(0, dummy.combat.health / Math.max(1, ct.maxHealth));
					barFg.scale.x = Math.max(0.001, dummyFrac);
					barFg.position.x = -(1 - dummyFrac) * 1.2;
					barFgMat.color.setHex(
						dummy.combat.eliminated ? 0x4a4f4a : dummyFrac > 0.35 ? 0x00ff41 : 0xffb347
					);

					// -- EMP effects --
					for (let i = fxList.length - 1; i >= 0; i--) {
						const fx = fxList[i];
						const age = (now - fx.born) / 320;
						if (age >= 1) {
							scene.remove(fx.mesh);
							(fx.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();
							fxList.splice(i, 1);
							continue;
						}
						const r = 1.5 + age * ct.empRange;
						fx.mesh.scale.set(r, 1, r);
						(fx.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity =
							0.55 * (1 - age);
					}

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

					// -- HUD state --
					pose.x = px;
					pose.z = pz;
					pose.hx = player.hx;
					pose.hz = player.hz;
					dummyPose.x = dummy.body.position.x;
					dummyPose.z = dummy.body.position.z;
					dummyPose.hx = dummy.hx;
					dummyPose.hz = dummy.hz;
					dummyPose.out = dummy.combat.isOut(now);

					const statusOf = (c: VehicleCombat): '' | 'DISRUPTED' | 'DOWN' | 'ELIMINATED' =>
						c.eliminated ? 'ELIMINATED' : c.isDown(now) ? 'DOWN' : c.isDisrupted(now) ? 'DISRUPTED' : '';
					chud.hp = Math.round(player.combat.health);
					chud.max = ct.maxHealth;
					chud.status = statusOf(player.combat);
					chud.downLeft = player.combat.isDown(now)
						? Math.max(0, (player.combat.downUntilMs - now) / 1000)
						: 0;
					chud.ready = cooldownRemaining(player.combat, ct.weaponCooldownSec, now);
					chud.dummyHp = Math.round(dummy.combat.health);
					chud.dummyStatus = statusOf(dummy.combat);
					if (
						mode === 'elimination' &&
						player.combat.eliminated &&
						!banner.startsWith('YOU ARE ELIMINATED')
					) {
						banner = 'YOU ARE ELIMINATED — press R to reset the round';
					}

					renderer.render(scene, camera);
				};
				renderer.setAnimationLoop(tick);

				cleanup = () => {
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

<svelte:head>
	<title>GREENLINE movement prototype (dev)</title>
</svelte:head>

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
			</div>
			<div class="gl-health-line dim2">
				EMP {chud.ready <= 0 ? 'READY (F / RB)' : `${chud.ready.toFixed(1)}s`}
				· dummy {chud.dummyHp} hp{chud.dummyStatus ? ` · ${chud.dummyStatus}` : ''}
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
		<div class="gl-pad">{padName ? `pad: ${padName}` : 'pad: none (keyboard)'}</div>
		<div class="gl-keys">
			W/S throttle+brake · A/D steer · Space handbrake · F fire · R reset round
		</div>
	</div>

	<div class="gl-map">
		<Minimap runtime={rt} {pose} nextCheckpoint={hud.cp} others={[dummyPose]} />
	</div>

	<div class="gl-panel">
		<div class="gl-panel-head">TUNING (live)</div>

		<div class="gl-section">mode</div>
		<label class="gl-select-row"
			>mode
			<select bind:value={mode} onchange={() => resetRound()}>
				<option value="race">RACE</option>
				<option value="elimination">ELIMINATION</option>
			</select></label
		>
		<label>lap target (race) <input type="number" step="1" bind:value={tuning.lapTarget} /></label>

		<div class="gl-section">combat</div>
		<label>max health <input type="number" step="10" bind:value={tuning.maxHealth} /></label>
		<label>EMP damage <input type="number" step="5" bind:value={tuning.empDamage} /></label>
		<label>EMP range <input type="number" step="5" bind:value={tuning.empRange} /></label>
		<label>EMP cone (deg) <input type="number" step="5" bind:value={tuning.empConeDeg} /></label>
		<label
			>cooldown (s) <input type="number" step="0.1" bind:value={tuning.weaponCooldownSec} /></label
		>
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
		<label>down time (s, race) <input type="number" step="0.5" bind:value={tuning.downSec} /></label>

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

		<div class="gl-section">camera</div>
		<label>distance <input type="number" step="0.5" bind:value={tuning.camDistance} /></label>
		<label>height <input type="number" step="0.5" bind:value={tuning.camHeight} /></label>
		<label>stiffness <input type="number" step="0.5" bind:value={tuning.camStiffness} /></label>

		<div class="gl-actions">
			<button onclick={() => resetRound()}>reset round (R)</button>
			<button onclick={resetTuning}>reset tuning</button>
		</div>
	</div>
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
	.gl-health-line.dim2 {
		color: #5f7f6a;
		font-size: 0.72rem;
	}
	.gl-st-disrupted {
		color: #00f0ff;
		margin-left: 0.5rem;
	}
	.gl-st-down {
		color: #ffb347;
		margin-left: 0.5rem;
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
