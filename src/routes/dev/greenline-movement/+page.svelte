<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * GREENLINE movement prototype (dev-only harness).
	 *
	 * Pure vehicle-feel testbed: a flat gridded plane, a placeholder box car on
	 * a cannon-es RaycastVehicle, a chase camera, and a live tuning panel. Every
	 * physics value in the panel is applied to the running vehicle each frame,
	 * so driving feel can be hand-tuned without a redeploy. No track, combat,
	 * or art; this route is throwaway while the design solidifies.
	 *
	 * Controls: W/Up throttle, S/Down brake (reverse from standstill), A/D or
	 * Left/Right steer, Space handbrake (rear wheels, for drift), R reset car.
	 * Gamepad (standard mapping): left stick X steer, RT throttle, LT brake,
	 * A handbrake.
	 */

	const DEFAULTS = {
		engineForce: 2200,
		brakeForce: 900,
		handbrakeForce: 600,
		handbrakeGrip: 0.65,
		aeroDrag: 1.8,
		maxSteer: 0.55,
		chassisMass: 180,
		gravity: 14,
		suspensionStiffness: 35,
		dampingCompression: 4.4,
		dampingRelaxation: 2.3,
		suspensionRestLength: 0.4,
		maxSuspensionTravel: 0.3,
		frictionSlip: 2.5,
		rollInfluence: 0.01,
		steerSpeedFalloff: 0.04,
		camDistance: 9,
		camHeight: 3.5,
		camStiffness: 5
	};

	const tuning = $state({ ...DEFAULTS });

	let speedKmh = $state(0);
	let speedMs = $state(0);
	let padName = $state('');
	let bootError = $state('');
	let resetCar: () => void = () => {};

	let stage: HTMLDivElement;

	// A panel input momentarily empty while the user types reads NaN; fall back
	// to the default so the sim never ingests a non-finite value.
	const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);

	const resetTuning = () => Object.assign(tuning, DEFAULTS);

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | null = null;

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
				camera.position.set(-12, 6, 0);
				camera.lookAt(0, 0, 0);

				scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1408, 0.9));
				const sun = new THREE.DirectionalLight(0xffffff, 1.4);
				sun.position.set(80, 120, 40);
				scene.add(sun);

				// ---- Ground: 600-unit plane with a 10-unit grid + pylons so speed reads ----
				const groundMesh = new THREE.Mesh(
					new THREE.PlaneGeometry(600, 600),
					new THREE.MeshStandardMaterial({ color: 0x07120a, roughness: 1 })
				);
				groundMesh.rotation.x = -Math.PI / 2;
				scene.add(groundMesh);

				const grid = new THREE.GridHelper(600, 60, 0x2f8f4f, 0x14351f);
				grid.position.y = 0.02;
				scene.add(grid);

				const pylonGeo = new THREE.ConeGeometry(0.7, 2.4, 8);
				const pylonMat = new THREE.MeshStandardMaterial({ color: 0xb8a11c, roughness: 0.7 });
				for (let x = -250; x <= 250; x += 50) {
					for (let z = -250; z <= 250; z += 50) {
						if (Math.abs(x) < 25 && Math.abs(z) < 25) continue;
						const pylon = new THREE.Mesh(pylonGeo, pylonMat);
						pylon.position.set(x, 1.2, z);
						scene.add(pylon);
					}
				}

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

				// ---- Vehicle: box chassis, nose toward local +X ----
				// The collision box is offset UP relative to the body origin so the
				// center of mass sits low; without this the drive torque wheelies the
				// car onto its back under full throttle.
				const COM_DROP = 0.25;
				const chassisBody = new CANNON.Body({ mass: tuning.chassisMass });
				chassisBody.addShape(
					new CANNON.Box(new CANNON.Vec3(1.9, 0.4, 0.85)),
					new CANNON.Vec3(0, COM_DROP, 0)
				);
				// Spawn at rest ride height; dropping the car in from above slams the
				// suspension hard enough to bounce it onto its side.
				const SPAWN_Y = 0.9;
				chassisBody.position.set(0, SPAWN_Y, 0);

				const vehicle = new CANNON.RaycastVehicle({
					chassisBody,
					indexForwardAxis: 0,
					indexUpAxis: 1,
					indexRightAxis: 2
				});

				const WHEEL_RADIUS = 0.45;
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

				// Order matters below: 0/1 front (steered), 2/3 rear (driven).
				const connections = [
					[1.25, -0.1, 0.95],
					[1.25, -0.1, -0.95],
					[-1.25, -0.1, 0.95],
					[-1.25, -0.1, -0.95]
				];
				for (const [x, y, z] of connections) {
					wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(x, y, z);
					vehicle.addWheel(wheelOptions);
				}
				vehicle.addToWorld(world);

				// ---- Placeholder car meshes ----
				const carGroup = new THREE.Group();
				const bodyMesh = new THREE.Mesh(
					new THREE.BoxGeometry(3.8, 0.8, 1.7),
					new THREE.MeshStandardMaterial({ color: 0x0e6b2f, metalness: 0.3, roughness: 0.55 })
				);
				bodyMesh.position.y = COM_DROP;
				carGroup.add(bodyMesh);
				const cabinMesh = new THREE.Mesh(
					new THREE.BoxGeometry(1.4, 0.5, 1.3),
					new THREE.MeshStandardMaterial({ color: 0x0a1f12, roughness: 0.4 })
				);
				cabinMesh.position.set(-0.35, 0.6 + COM_DROP, 0);
				carGroup.add(cabinMesh);
				const noseStripe = new THREE.Mesh(
					new THREE.BoxGeometry(0.12, 0.84, 1.74),
					new THREE.MeshStandardMaterial({ color: 0xc8ff00, emissive: 0x445500 })
				);
				noseStripe.position.set(1.5, COM_DROP, 0);
				carGroup.add(noseStripe);
				scene.add(carGroup);

				const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.35, 24);
				wheelGeo.rotateX(Math.PI / 2);
				const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
				const wheelMeshes = connections.map(() => {
					const m = new THREE.Mesh(wheelGeo, wheelMat);
					scene.add(m);
					return m;
				});

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

				resetCar = () => {
					chassisBody.position.set(0, SPAWN_Y, 0);
					chassisBody.quaternion.set(0, 0, 0, 1);
					chassisBody.velocity.setZero();
					chassisBody.angularVelocity.setZero();
				};

				const onKeyDown = (e: KeyboardEvent) => {
					if (e.target instanceof HTMLInputElement) return;
					if (e.code === 'KeyR') {
						resetCar();
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
				const camPos = new THREE.Vector3().copy(camera.position);
				const camLook = new THREE.Vector3();
				const fwdWorld = new THREE.Vector3();
				const tmpQuat = new THREE.Quaternion();

				let steerCurrent = 0;
				let lastT = performance.now();

				// Dev-only debug handle for poking the sim from the console.
				(window as unknown as Record<string, unknown>).__greenline = {
					world,
					vehicle,
					chassisBody,
					resetCar
				};

				const tick = () => {
					const now = performance.now();
					const dt = Math.min((now - lastT) / 1000, 0.05);
					lastT = now;

					// -- Resolve inputs (keyboard + first connected gamepad) --
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
					} else if (padName) {
						padName = '';
					}

					// -- Apply live tuning to the running vehicle --
					world.gravity.set(0, -num(tuning.gravity, DEFAULTS.gravity), 0);
					const mass = num(tuning.chassisMass, DEFAULTS.chassisMass);
					if (chassisBody.mass !== mass) {
						chassisBody.mass = mass;
						chassisBody.updateMassProperties();
					}
					for (const w of vehicle.wheelInfos) {
						w.suspensionStiffness = num(tuning.suspensionStiffness, DEFAULTS.suspensionStiffness);
						w.dampingCompression = num(tuning.dampingCompression, DEFAULTS.dampingCompression);
						w.dampingRelaxation = num(tuning.dampingRelaxation, DEFAULTS.dampingRelaxation);
						w.suspensionRestLength = num(
							tuning.suspensionRestLength,
							DEFAULTS.suspensionRestLength
						);
						w.maxSuspensionTravel = num(tuning.maxSuspensionTravel, DEFAULTS.maxSuspensionTravel);
						w.frictionSlip = num(tuning.frictionSlip, DEFAULTS.frictionSlip);
						w.rollInfluence = num(tuning.rollInfluence, DEFAULTS.rollInfluence);
					}

					// -- Drive: steer front, power rear, brake all, handbrake rear --
					tmpQuat.set(
						chassisBody.quaternion.x,
						chassisBody.quaternion.y,
						chassisBody.quaternion.z,
						chassisBody.quaternion.w
					);
					fwdWorld.set(1, 0, 0).applyQuaternion(tmpQuat);
					const vel = chassisBody.velocity;
					const forwardSpeed = vel.x * fwdWorld.x + vel.y * fwdWorld.y + vel.z * fwdWorld.z;

					// Speed-sensitive steering: full lock at standstill, tightening as
					// speed rises, so a flick at speed doesn't roll the car. Zero the
					// falloff in the panel to disable.
					const rawSpeed = Math.hypot(vel.x, vel.y, vel.z);
					const falloff = num(tuning.steerSpeedFalloff, DEFAULTS.steerSpeedFalloff);
					const effSteer =
						num(tuning.maxSteer, DEFAULTS.maxSteer) / (1 + rawSpeed * Math.max(0, falloff));
					const steerTarget = steerInput * effSteer;
					steerCurrent += (steerTarget - steerCurrent) * Math.min(1, dt * 10);
					vehicle.setSteeringValue(steerCurrent, 0);
					vehicle.setSteeringValue(steerCurrent, 1);

					let engine = 0;
					let brake = 0;
					const engineMax = num(tuning.engineForce, DEFAULTS.engineForce);
					if (throttle > 0) engine = throttle * engineMax;
					if (brakeInput > 0) {
						if (forwardSpeed > 0.5) brake = brakeInput * num(tuning.brakeForce, DEFAULTS.brakeForce);
						else engine = -brakeInput * engineMax * 0.55;
					}
					// Engine force is the TOTAL drive force, split across the two
					// driven wheels; applying it per wheel doubled it and flipped
					// the car under launch.
					vehicle.applyEngineForce(engine / 2, 2);
					vehicle.applyEngineForce(engine / 2, 3);
					for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);
					if (handbrake) {
						// Arcade handbrake: moderate rear brake plus reduced rear grip
						// so the tail slides out instead of the full-grip lockup
						// flipping the car at speed.
						const hb = num(tuning.handbrakeForce, DEFAULTS.handbrakeForce);
						const gripCut = Math.max(0.05, num(tuning.handbrakeGrip, DEFAULTS.handbrakeGrip));
						vehicle.setBrake(hb, 2);
						vehicle.setBrake(hb, 3);
						vehicle.wheelInfos[2].frictionSlip *= gripCut;
						vehicle.wheelInfos[3].frictionSlip *= gripCut;
					}

					// Quadratic aero drag caps top speed (~sqrt(engine/drag)).
					const drag = num(tuning.aeroDrag, DEFAULTS.aeroDrag);
					if (drag > 0) {
						const sp = Math.hypot(vel.x, vel.y, vel.z);
						if (sp > 0.1) {
							chassisBody.applyForce(
								new CANNON.Vec3(-drag * sp * vel.x, -drag * sp * vel.y, -drag * sp * vel.z),
								new CANNON.Vec3(0, 0, 0)
							);
						}
					}

					world.step(1 / 60, dt, 4);

					// -- Sync meshes --
					carGroup.position.set(
						chassisBody.position.x,
						chassisBody.position.y,
						chassisBody.position.z
					);
					carGroup.quaternion.set(
						chassisBody.quaternion.x,
						chassisBody.quaternion.y,
						chassisBody.quaternion.z,
						chassisBody.quaternion.w
					);
					for (let i = 0; i < wheelMeshes.length; i++) {
						vehicle.updateWheelTransform(i);
						const t = vehicle.wheelInfos[i].worldTransform;
						wheelMeshes[i].position.set(t.position.x, t.position.y, t.position.z);
						wheelMeshes[i].quaternion.set(
							t.quaternion.x,
							t.quaternion.y,
							t.quaternion.z,
							t.quaternion.w
						);
					}

					// -- Chase camera: trail behind the heading, smoothed, no snapping --
					const flatFwd = fwdWorld.clone();
					flatFwd.y = 0;
					if (flatFwd.lengthSq() > 1e-6) flatFwd.normalize();
					const dist = num(tuning.camDistance, DEFAULTS.camDistance);
					const height = num(tuning.camHeight, DEFAULTS.camHeight);
					const stiff = num(tuning.camStiffness, DEFAULTS.camStiffness);
					const desired = carGroup.position
						.clone()
						.addScaledVector(flatFwd, -dist)
						.add(new THREE.Vector3(0, height, 0));
					const s = 1 - Math.exp(-stiff * dt);
					camPos.lerp(desired, s);
					camLook.lerp(
						carGroup.position.clone().addScaledVector(flatFwd, 6).add(new THREE.Vector3(0, 1.2, 0)),
						s
					);
					camera.position.copy(camPos);
					camera.lookAt(camLook);

					// -- HUD --
					speedMs = Math.round(rawSpeed * 10) / 10;
					speedKmh = Math.round(rawSpeed * 3.6);

					renderer.render(scene, camera);
				};
				renderer.setAnimationLoop(tick);

				cleanup = () => {
					renderer.setAnimationLoop(null);
					ro.disconnect();
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

	<div class="gl-hud">
		<div class="gl-title">GREENLINE // movement prototype</div>
		<div class="gl-speed">{speedKmh}<span class="gl-unit">km/h</span></div>
		<div class="gl-sub">{speedMs} m/s</div>
		<div class="gl-pad">{padName ? `pad: ${padName}` : 'pad: none (keyboard)'}</div>
		<div class="gl-keys">
			W/S throttle+brake · A/D steer · Space handbrake · R reset
		</div>
	</div>

	<div class="gl-panel">
		<div class="gl-panel-head">TUNING (live)</div>

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

		<div class="gl-section">camera</div>
		<label>distance <input type="number" step="0.5" bind:value={tuning.camDistance} /></label>
		<label>height <input type="number" step="0.5" bind:value={tuning.camHeight} /></label>
		<label>stiffness <input type="number" step="0.5" bind:value={tuning.camStiffness} /></label>

		<div class="gl-actions">
			<button onclick={() => resetCar()}>reset car (R)</button>
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
	.gl-panel input:focus {
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
