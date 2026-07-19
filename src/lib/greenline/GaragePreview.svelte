<script lang="ts">
	import { onMount } from 'svelte';
	import type { Loadout } from './loadout';
	import {
		COM_DROP,
		createRigVisuals,
		visualKeyFor,
		WHEEL_CONNECTIONS,
		WHEEL_RADIUS
	} from './rig-visual';

	/**
	 * Isolated 3D preview of the resolved build for the garage: its own small
	 * three.js scene, camera, and renderer (NOT the live race world), just the
	 * machine on a dark pedestal in the brand's night/chrome identity. The
	 * vehicle is assembled through the SAME shared rig-visual builder the race
	 * scene uses (same named part groups, same chrome env, same geometry
	 * caches), so what renders here is by construction what appears on track.
	 * Rebuilds live whenever the archetype or any equipped part changes.
	 *
	 * OrbitControls per the StlViewer pattern: drag to orbit, scroll/pinch to
	 * zoom, distance and polar clamps so the camera can never enter the model
	 * or sink under the floor; slow auto-orbit until first interaction, off
	 * entirely under reduced motion. three is browser-only, so every import is
	 * dynamic inside onMount (SSR-safe).
	 */
	const { loadout }: { loadout: Loadout } = $props();

	let host: HTMLDivElement;
	let bootError = $state('');

	// Assigned in onMount once the scene exists; the effect below re-runs it on
	// every loadout change (both garage call sites replace the object).
	let applyBuild: ((l: Loadout) => void) | null = null;
	$effect(() => {
		const l = loadout;
		applyBuild?.(l);
	});

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | null = null;

		(async () => {
			try {
				const THREE = await import('three');
				const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
				if (disposed || !host) return;

				const width = host.clientWidth || 480;
				const height = host.clientHeight || 320;
				const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
				renderer.setSize(width, height);
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				// Shop exposure: the SAME materials as the race, displayed a
				// stop brighter so the chrome reads while orbiting (metals take
				// almost nothing from diffuse fill; a display transform is the
				// only even brightener that doesn't fork the material recipe).
				renderer.toneMapping = THREE.LinearToneMapping;
				renderer.toneMappingExposure = 1.35;
				host.appendChild(renderer.domElement);

				// Transparent clear: the CSS night-gradient stage shows through.
				const scene = new THREE.Scene();

				const rigVis = createRigVisuals(THREE, renderer);

				// The key art's dual-tone rig pushed to product-shot levels (the
				// machine must READ here, unlike the murky race night): cool
				// primary key one side, warm counter the other, a steel-cyan rim
				// wrapping the silhouette from behind, and the race's hemisphere
				// fill. Chrome banding comes from the shared env map.
				const key = new THREE.DirectionalLight(0xd7e8fa, 1.8);
				key.position.set(4.5, 5.5, 3.5);
				scene.add(key);
				const counter = new THREE.DirectionalLight(0xffdcae, 0.85);
				counter.position.set(-4.5, 2.5, -3.5);
				scene.add(counter);
				const rim = new THREE.DirectionalLight(0x88ddff, 0.9);
				rim.position.set(-1, 1.4, -5);
				scene.add(rim);
				scene.add(new THREE.HemisphereLight(0x8fb6dc, 0x0b0e12, 0.6));

				// Dark shop pedestal with the green signature line around its rim:
				// this previews YOUR machine, and green marks exactly that.
				const pedestalMat = new THREE.MeshStandardMaterial({
					color: 0x10151a,
					metalness: 0.15,
					roughness: 0.95
				});
				const pedestal = new THREE.Mesh(
					new THREE.CylinderGeometry(2.95, 3.2, 0.18, 48),
					pedestalMat
				);
				pedestal.position.y = -0.09;
				scene.add(pedestal);
				const ringMat = new THREE.MeshStandardMaterial({
					color: 0x0a3d24,
					emissive: 0x2ae57e,
					emissiveIntensity: 1.1,
					metalness: 0.2,
					roughness: 0.5
				});
				const ring = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.016, 6, 72), ringMat);
				ring.rotation.x = -Math.PI / 2;
				ring.position.y = 0.012;
				scene.add(ring);

				// The vehicle: the same named part groups + wheel meshes a race
				// rig carries, posed at the race's resting geometry (body center
				// at the spawn height, wheels radius-on-ground at the suspension
				// connection points).
				const BODY_Y = 0.9;
				const carGroup = new THREE.Group();
				carGroup.position.y = BODY_Y;
				const partChassis = new THREE.Group();
				partChassis.position.y = COM_DROP;
				const partArmor = new THREE.Group();
				partArmor.position.y = COM_DROP;
				const partMount = new THREE.Group();
				carGroup.add(partChassis, partArmor, partMount);
				const wheels = WHEEL_CONNECTIONS.map(([x, , z]) => {
					const m = new THREE.Mesh();
					m.position.set(x, WHEEL_RADIUS - BODY_Y, z);
					carGroup.add(m);
					return m;
				});
				scene.add(carGroup);

				const hullMat = rigVis.makeHullMat();
				const mountMat = rigVis.makeMountMat();
				// Dev-only debug handle (the __greenline convention, scoped to
				// this element): lets the harness probe materials from console.
				if (import.meta.env.DEV) {
					(host as unknown as Record<string, unknown>).__ggp = { scene, hullMat, renderer, rigVis };
				}

				let bodyMesh: InstanceType<typeof THREE.Mesh> | null = null;
				// Phase 6b livery decals (pattern + number materials/textures); ours
				// to dispose on each rebuild + teardown, like the hull clone.
				let cosmeticDisposables: { dispose(): void }[] = [];
				let lastKey = '';
				applyBuild = (l: Loadout) => {
					if (visualKeyFor(l) === lastKey) return;
					// The previous per-vehicle hull clone + livery decals are ours to dispose.
					bodyMesh?.geometry.dispose();
					for (const d of cosmeticDisposables) d.dispose();
					const built = rigVis.build(
						{
							chassis: partChassis,
							armor: partArmor,
							mount: partMount,
							wheels,
							hullMat,
							mountMat,
							accent: 'green'
						},
						l
					);
					bodyMesh = built.bodyMesh;
					cosmeticDisposables = built.cosmeticDisposables;
					lastKey = built.key;
				};
				applyBuild(loadout);

				// Long lens 3/4 hero framing, orbit clamped to sane bounds.
				const camera = new THREE.PerspectiveCamera(34, width / Math.max(1, height), 0.1, 100);
				// Low 3/4 hero angle: the chrome flanks and silhouette carry the
				// read; a high angle shows mostly the dark canopy roof.
				camera.position.set(5.5, 2.0, 5.7);
				const controls = new OrbitControls(camera, renderer.domElement);
				controls.target.set(0, 0.75, 0);
				controls.enableDamping = true;
				controls.enablePan = false;
				controls.minDistance = 4.2;
				controls.maxDistance = 12;
				controls.minPolarAngle = 0.3;
				controls.maxPolarAngle = 1.45;
				controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				controls.autoRotateSpeed = 0.9;
				controls.addEventListener('start', () => {
					controls.autoRotate = false;
				});
				controls.update();

				let raf = 0;
				const tick = () => {
					controls.update();
					renderer.render(scene, camera);
					raf = requestAnimationFrame(tick);
				};
				tick();

				const resize = () => {
					if (!host) return;
					const w = host.clientWidth || width;
					const h = host.clientHeight || height;
					renderer.setSize(w, h);
					camera.aspect = w / Math.max(1, h);
					camera.updateProjectionMatrix();
				};
				const ro = new ResizeObserver(resize);
				ro.observe(host);

				cleanup = () => {
					cancelAnimationFrame(raf);
					ro.disconnect();
					controls.dispose();
					applyBuild = null;
					bodyMesh?.geometry.dispose();
					for (const d of cosmeticDisposables) d.dispose();
					hullMat.dispose();
					mountMat.dispose();
					pedestal.geometry.dispose();
					pedestalMat.dispose();
					ring.geometry.dispose();
					ringMat.dispose();
					rigVis.dispose();
					renderer.dispose();
					renderer.domElement.remove();
				};
				if (disposed) cleanup();
			} catch (e) {
				bootError = e instanceof Error ? e.message : 'Could not start the 3D preview.';
			}
		})();

		return () => {
			disposed = true;
			cleanup?.();
		};
	});
</script>

<div class="ggp-stage" bind:this={host}>
	{#if bootError}
		<div class="ggp-error">{bootError}</div>
	{/if}
</div>

<style>
	.ggp-stage {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 14rem;
		overflow: hidden;
		/* Night stage: a cool overhead pool and a faint green floor wash over
		   the brand's near-black base, behind the transparent renderer. */
		background:
			radial-gradient(90% 70% at 50% 30%, rgba(120, 165, 205, 0.09), transparent 62%),
			radial-gradient(120% 60% at 50% 108%, rgba(42, 229, 126, 0.05), transparent 55%),
			linear-gradient(180deg, #0a0f14 0%, #04060a 72%);
	}
	.ggp-stage :global(canvas) {
		display: block;
		cursor: grab;
	}
	.ggp-stage :global(canvas:active) {
		cursor: grabbing;
	}
	.ggp-error {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #d9906a;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		padding: 1rem;
		text-align: center;
	}
</style>
