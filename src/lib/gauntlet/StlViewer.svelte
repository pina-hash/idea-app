<script lang="ts">
	/**
	 * Reusable 3D part preview. Loads an STL straight from its Storage URL with
	 * three.js + STLLoader (no model-viewer, no GLB conversion), orbit controls
	 * on. Shape only: a neutral machined-metal material under a studio
	 * environment map (RoomEnvironment via PMREM), ACES tone mapping, a soft
	 * contact shadow on a faint steel grid, and a slow auto-orbit that stops on
	 * first interaction (disabled under reduced motion). Camera auto-fits the
	 * model bounding box on load. Intentionally has NO measurement, dimension
	 * readout, or download control. This replaces the isometric view that used
	 * to live on the drawing.
	 *
	 * three is browser-only, so every import is dynamic inside onMount (SSR-safe).
	 */
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from '$lib/gauntlet/viewport/motion';

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
				const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
				if (disposed || !host) return;

				const width = host.clientWidth || 480;
				const scene = new THREE.Scene();

				const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
				renderer.setSize(width, height);
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				renderer.toneMapping = THREE.ACESFilmicToneMapping;
				renderer.toneMappingExposure = 1.05;
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFSoftShadowMap;
				host.appendChild(renderer.domElement);

				const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);

				// Studio environment (image-based lighting) + a shadow-casting key
				// light and a cool rim so machined surfaces read crisp, not flat.
				const pmrem = new THREE.PMREMGenerator(renderer);
				const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
				scene.environment = envTex;
				const key = new THREE.DirectionalLight(0xffffff, 1.4);
				key.castShadow = true;
				key.shadow.mapSize.set(1024, 1024);
				scene.add(key);
				const rim = new THREE.DirectionalLight(0x88ddff, 0.35);
				rim.position.set(-1, -0.4, -1);
				scene.add(rim);
				scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x0a1014, 0.35));

				const controls = new OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.enablePan = false;
				// Slow presentation orbit until the user takes over.
				controls.autoRotate = !prefersReducedMotion();
				controls.autoRotateSpeed = 1.1;
				controls.addEventListener('start', () => {
					controls.autoRotate = false;
				});

				const geometry = await new Promise<any>((resolve, reject) => {
					new STLLoader().load(url, resolve, undefined, reject);
				});
				if (disposed) {
					geometry.dispose?.();
					pmrem.dispose();
					renderer.dispose();
					return;
				}

				geometry.computeVertexNormals();
				const material = new THREE.MeshStandardMaterial({
					color: 0xaab4bd,
					metalness: 0.35,
					roughness: 0.42,
					envMapIntensity: 0.9,
					flatShading: false
				});
				const mesh = new THREE.Mesh(geometry, material);
				mesh.castShadow = true;
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

				// Key light + shadow frustum scaled to the model.
				key.position.set(radius * 1.6, radius * 2.4, radius * 1.2);
				key.shadow.camera.left = -radius * 2;
				key.shadow.camera.right = radius * 2;
				key.shadow.camera.top = radius * 2;
				key.shadow.camera.bottom = -radius * 2;
				key.shadow.camera.near = radius * 0.1;
				key.shadow.camera.far = radius * 8;
				key.shadow.camera.updateProjectionMatrix();

				// Soft contact shadow + a faint steel reference grid under the part
				// (pedestal presentation; the part itself stays untouched).
				const floorY = box.min.y - center.y - radius * 0.02;
				const ground = new THREE.Mesh(
					new THREE.PlaneGeometry(radius * 10, radius * 10),
					new THREE.ShadowMaterial({ opacity: 0.26 })
				);
				ground.rotation.x = -Math.PI / 2;
				ground.position.y = floorY;
				ground.receiveShadow = true;
				scene.add(ground);
				const grid = new THREE.GridHelper(radius * 6, 18, 0x3b6e8f, 0x3b6e8f);
				(grid.material as any).transparent = true;
				(grid.material as any).opacity = 0.14;
				grid.position.y = floorY;
				scene.add(grid);

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
					ground.geometry.dispose();
					(ground.material as any).dispose();
					grid.geometry.dispose();
					(grid.material as any).dispose();
					envTex.dispose();
					pmrem.dispose();
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
