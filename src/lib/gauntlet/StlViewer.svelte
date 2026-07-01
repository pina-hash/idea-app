<script lang="ts">
	/**
	 * Reusable 3D part preview. Loads an STL straight from its Storage URL with
	 * three.js + STLLoader (no model-viewer, no GLB conversion), orbit controls
	 * on. Shape only: a neutral single-color material and simple lighting, camera
	 * auto-fit to the model bounding box on load. Intentionally has NO measurement,
	 * dimension readout, or download control. This replaces the isometric view that
	 * used to live on the drawing.
	 *
	 * three is browser-only, so every import is dynamic inside onMount (SSR-safe).
	 */
	import { onMount } from 'svelte';

	let { url, height = 320, label = '3D preview (shape only)' }: {
		url: string;
		height?: number;
		label?: string;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let loading = $state(true);
	let loadError = $state('');

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | null = null;

		(async () => {
			try {
				const THREE = await import('three');
				const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
				const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
				if (disposed || !host) return;

				const width = host.clientWidth || 480;
				const scene = new THREE.Scene();

				const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
				renderer.setSize(width, height);
				host.appendChild(renderer.domElement);

				const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);

				// Simple, neutral lighting: soft ambient fill plus one key light.
				scene.add(new THREE.AmbientLight(0xffffff, 0.65));
				const key = new THREE.DirectionalLight(0xffffff, 0.9);
				key.position.set(1, 1.4, 1);
				scene.add(key);
				const rim = new THREE.DirectionalLight(0xffffff, 0.25);
				rim.position.set(-1, -0.6, -1);
				scene.add(rim);

				const controls = new OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.enablePan = false;

				const geometry = await new Promise<any>((resolve, reject) => {
					new STLLoader().load(url, resolve, undefined, reject);
				});
				if (disposed) {
					geometry.dispose?.();
					renderer.dispose();
					return;
				}

				geometry.computeVertexNormals();
				const material = new THREE.MeshStandardMaterial({
					color: 0x9aa3ad,
					metalness: 0.1,
					roughness: 0.65,
					flatShading: false
				});
				const mesh = new THREE.Mesh(geometry, material);
				scene.add(mesh);

				// Auto-fit the camera to the model bounding box: center the mesh at the
				// origin, then back the camera off far enough that the bounding sphere
				// fits the vertical field of view.
				geometry.computeBoundingBox();
				geometry.computeBoundingSphere();
				const box = geometry.boundingBox as any;
				const center = new THREE.Vector3();
				box.getCenter(center);
				mesh.position.sub(center);

				const radius = (geometry.boundingSphere as any)?.radius || 1;
				const fov = (camera.fov * Math.PI) / 180;
				const dist = (radius / Math.sin(fov / 2)) * 1.15;
				camera.position.set(dist * 0.7, dist * 0.5, dist * 0.9);
				camera.near = Math.max(dist / 1000, 0.01);
				camera.far = dist * 1000;
				camera.updateProjectionMatrix();
				controls.target.set(0, 0, 0);
				controls.maxDistance = dist * 6;
				controls.update();

				loading = false;

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
					renderer.setSize(w, height);
					camera.aspect = w / height;
					camera.updateProjectionMatrix();
				};
				const ro = new ResizeObserver(resize);
				ro.observe(host);

				cleanup = () => {
					cancelAnimationFrame(raf);
					ro.disconnect();
					controls.dispose();
					geometry.dispose();
					material.dispose();
					renderer.dispose();
					renderer.domElement.remove();
				};
			} catch (e) {
				if (!disposed) {
					loadError = e instanceof Error ? e.message : 'Could not load the 3D model.';
					loading = false;
				}
			}
		})();

		return () => {
			disposed = true;
			cleanup?.();
		};
	});
</script>

<div class="stl-viewer" style="height: {height}px">
	<div class="stl-canvas" bind:this={host}></div>
	{#if loading}
		<div class="stl-overlay"><span class="dim">Loading 3D model...</span></div>
	{:else if loadError}
		<div class="stl-overlay"><span class="warn">{loadError}</span></div>
	{/if}
	<span class="stl-tag">{label}</span>
</div>
