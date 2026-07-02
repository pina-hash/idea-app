<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion, isCoarsePointer } from './motion';

	/**
	 * VIEWPORT ambient scene: a volumetric CAD space behind all GAUNTLET content.
	 * A real three.js scene on the graphite-black base: a floating hero machined
	 * part (solid PBR metal with a faint green tessellation-edge overlay; three
	 * geometries from hero-parts.ts cycle with ~26s fades), studio-ish key/rim
	 * lighting over a RoomEnvironment map, exponential fog for depth falloff,
	 * fine drifting particulate at several depths plus a few oversized soft
	 * bokeh motes near the lens, gentle mouse parallax via camera offset, and a
	 * slight CSS soft-focus on the canvas so the whole scene reads as a
	 * defocused backdrop that never competes with foreground text (the content
	 * scrim lives in .gt-vignette). The old scrolling isometric grid is retired;
	 * do not reintroduce it.
	 *
	 * Purely decorative: pointer-events none, aria-hidden, single rAF loop
	 * paused when the tab is hidden, one static frame under reduced motion, and
	 * a silent fallback to the flat void base if WebGL is unavailable. three is
	 * browser-only, so every import is dynamic inside onMount (SSR-safe).
	 */

	let canvas: HTMLCanvasElement;

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | null = null;

		(async () => {
			let THREE: typeof import('three');
			let renderer: import('three').WebGLRenderer;
			try {
				THREE = await import('three');
				if (disposed || !canvas) return;
				renderer = new THREE.WebGLRenderer({
					canvas,
					antialias: true,
					alpha: false,
					powerPreference: 'low-power'
				});
			} catch {
				// No WebGL (or three failed to load): the CSS void base + vignette
				// stand alone as the background.
				return;
			}
			const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
			const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
			const { heroPartGeometries } = await import('./hero-parts');
			if (disposed) {
				renderer.dispose();
				return;
			}

			const styles = getComputedStyle(canvas);
			const token = (name: string, fallback: string) =>
				styles.getPropertyValue(name).trim() || fallback;
			const VOID = new THREE.Color(token('--void', '#04070a'));
			const GREEN = new THREE.Color(token('--green', '#00ff41'));

			const reduced = prefersReducedMotion();

			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 0.95;
			renderer.setClearColor(VOID, 1);

			const scene = new THREE.Scene();
			// Exponential fog: the depth falloff that makes the space read as deep.
			scene.fog = new THREE.FogExp2(VOID, 0.045);

			const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
			camera.position.set(0, 0, 10);

			// Studio-ish rig: cool key, steel-cyan rim, a faint green brand wash
			// from below, over an environment map so the metal actually reflects.
			const pmrem = new THREE.PMREMGenerator(renderer);
			const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
			scene.environment = envTex;
			const key = new THREE.DirectionalLight(0xdfeaf2, 1.15);
			key.position.set(3, 6, 4);
			scene.add(key);
			const rim = new THREE.DirectionalLight(0x88ddff, 0.9);
			rim.position.set(-4, 1, -6);
			scene.add(rim);
			const wash = new THREE.DirectionalLight(GREEN, 0.22);
			wash.position.set(-2, -3, 2);
			scene.add(wash);

			// ---------------------------------------------------------------
			// Hero parts: solid machined metal + a faint green edge overlay.
			// One group per part; the active one fades via material opacity.
			// ---------------------------------------------------------------
			const metal = new THREE.MeshStandardMaterial({
				color: 0x8fa3b0,
				metalness: 0.85,
				roughness: 0.35,
				envMapIntensity: 0.9,
				transparent: true,
				opacity: 0,
				// Push faces back a hair so the coplanar green edge overlay wins
				// the depth test instead of z-fighting into invisibility.
				polygonOffset: true,
				polygonOffsetFactor: 1,
				polygonOffsetUnits: 1
			});
			const edgeMat = new THREE.LineBasicMaterial({
				color: GREEN,
				transparent: true,
				opacity: 0
			});
			const geos = heroPartGeometries(THREE, mergeGeometries);
			const anchor = new THREE.Group();
			scene.add(anchor);
			const groups = geos.map((geo) => {
				const g = new THREE.Group();
				const mesh = new THREE.Mesh(geo, metal);
				g.add(mesh);
				const edges = new THREE.EdgesGeometry(geo, 28);
				g.add(new THREE.LineSegments(edges, edgeMat));
				g.visible = false;
				anchor.add(g);
				return { group: g, edges };
			});

			// ---------------------------------------------------------------
			// Particulate: fine dust across the volume (fog fades the deep
			// layer), plus a few oversized soft motes near the lens that read
			// as out-of-focus bokeh, selling the depth of field.
			// ---------------------------------------------------------------
			const softTex = (() => {
				const c = document.createElement('canvas');
				c.width = c.height = 64;
				const g = c.getContext('2d')!;
				const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
				grad.addColorStop(0, 'rgba(255,255,255,1)');
				grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
				grad.addColorStop(1, 'rgba(255,255,255,0)');
				g.fillStyle = grad;
				g.fillRect(0, 0, 64, 64);
				return new THREE.CanvasTexture(c);
			})();

			const makeCloud = (
				count: number,
				range: { x: number; y: number; z: [number, number] },
				size: number,
				color: number,
				opacity: number
			) => {
				const pos = new Float32Array(count * 3);
				const vel = new Float32Array(count);
				for (let i = 0; i < count; i++) {
					pos[i * 3] = (Math.random() * 2 - 1) * range.x;
					pos[i * 3 + 1] = (Math.random() * 2 - 1) * range.y;
					pos[i * 3 + 2] = range.z[0] + Math.random() * (range.z[1] - range.z[0]);
					vel[i] = 0.05 + Math.random() * 0.12;
				}
				const geo = new THREE.BufferGeometry();
				geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
				const mat = new THREE.PointsMaterial({
					color,
					size,
					map: softTex,
					transparent: true,
					opacity,
					sizeAttenuation: true,
					depthWrite: false,
					blending: THREE.AdditiveBlending
				});
				const pts = new THREE.Points(geo, mat);
				scene.add(pts);
				return { geo, mat, pos, vel, count, yRange: range.y };
			};
			const dust = makeCloud(420, { x: 14, y: 7, z: [-18, 4] }, 0.11, 0x9fd8ff, 0.55);
			const motes = makeCloud(14, { x: 9, y: 5, z: [4, 7.5] }, 2.4, 0x88ddff, 0.07);
			const clouds = [dust, motes];

			// ---------------------------------------------------------------
			// Layout + loop.
			// ---------------------------------------------------------------
			const CYCLE = 26000; // ms per part
			const FADE = 2200; // fade in/out at each end of a cycle
			const easeInOut = (t: number) => t * t * (3 - 2 * t);

			let W = 0;
			let H = 0;
			let raf = 0;
			// Parallax: target from the mouse, eased actual offset.
			let tx = 0;
			let ty = 0;
			let ox = 0;
			let oy = 0;
			let last = 0;

			const layout = () => {
				W = window.innerWidth;
				H = window.innerHeight;
				renderer.setSize(W, H, false);
				camera.aspect = W / H;
				camera.updateProjectionMatrix();
				// Anchor the part upper-right (out of the content column), sized
				// like the old wireframe: a modest presence, not a centerpiece.
				const halfH = Math.tan((camera.fov * Math.PI) / 360) * 11.5; // at part depth
				const halfW = halfH * camera.aspect;
				anchor.position.set(halfW * 0.56, halfH * 0.5, -1.5);
				const s = Math.min(halfH, halfW) * 0.3;
				anchor.scale.setScalar(s);
			};

			const onMouse = (e: MouseEvent) => {
				tx = (e.clientX / W - 0.5) * 2;
				ty = (e.clientY / H - 0.5) * 2;
			};

			const draw = (time: number) => {
				// Which part, and its fade envelope inside this cycle.
				const idx = reduced ? 0 : Math.floor(time / CYCLE) % groups.length;
				const phase = reduced ? CYCLE / 2 : time % CYCLE;
				const envelope = reduced
					? 1
					: phase < FADE
						? easeInOut(phase / FADE)
						: phase > CYCLE - FADE
							? easeInOut((CYCLE - phase) / FADE)
							: 1;
				groups.forEach((g, i) => (g.group.visible = i === idx && envelope > 0.01));
				metal.opacity = envelope;
				edgeMat.opacity = 0.5 * envelope;

				const active = groups[idx].group;
				active.rotation.y = reduced ? 0.7 : time * 0.00022;
				active.rotation.x = -0.28;
				active.position.y = reduced ? 0 : Math.sin(time * 0.0004) * 0.06;

				camera.position.x = ox * 0.5;
				camera.position.y = -oy * 0.32;
				camera.lookAt(0, 0, 0);

				renderer.render(scene, camera);
			};

			const drift = (dt: number) => {
				for (const c of clouds) {
					for (let i = 0; i < c.count; i++) {
						let y = c.pos[i * 3 + 1] + c.vel[i] * dt * 0.001;
						if (y > c.yRange) y = -c.yRange;
						c.pos[i * 3 + 1] = y;
					}
					c.geo.attributes.position.needsUpdate = true;
				}
			};

			const loop = (time: number) => {
				const dt = last ? Math.min(time - last, 100) : 16;
				last = time;
				ox += (tx - ox) * 0.04;
				oy += (ty - oy) * 0.04;
				drift(dt);
				draw(time);
				raf = requestAnimationFrame(loop);
			};

			const onVisibility = () => {
				if (reduced) return;
				if (document.hidden) {
					cancelAnimationFrame(raf);
					raf = 0;
				} else if (!raf) {
					last = 0;
					raf = requestAnimationFrame(loop);
				}
			};

			const onResize = () => {
				layout();
				if (reduced) draw(0);
			};

			// If the GPU context is lost, stop; resume drawing when it returns.
			const onLost = (e: Event) => {
				e.preventDefault();
				cancelAnimationFrame(raf);
				raf = 0;
			};
			const onRestored = () => {
				if (!reduced && !raf) raf = requestAnimationFrame(loop);
				else if (reduced) draw(0);
			};

			layout();
			window.addEventListener('resize', onResize);
			canvas.addEventListener('webglcontextlost', onLost);
			canvas.addEventListener('webglcontextrestored', onRestored);
			if (reduced) {
				draw(0); // one static frame: no loop, no parallax, no drift
			} else {
				if (!isCoarsePointer()) window.addEventListener('mousemove', onMouse);
				document.addEventListener('visibilitychange', onVisibility);
				raf = requestAnimationFrame(loop);
			}

			cleanup = () => {
				cancelAnimationFrame(raf);
				window.removeEventListener('resize', onResize);
				window.removeEventListener('mousemove', onMouse);
				document.removeEventListener('visibilitychange', onVisibility);
				canvas.removeEventListener('webglcontextlost', onLost);
				canvas.removeEventListener('webglcontextrestored', onRestored);
				geos.forEach((g) => g.dispose());
				groups.forEach((g) => g.edges.dispose());
				clouds.forEach((c) => {
					c.geo.dispose();
					c.mat.dispose();
				});
				softTex.dispose();
				metal.dispose();
				edgeMat.dispose();
				envTex.dispose();
				pmrem.dispose();
				renderer.dispose();
			};
		})();

		return () => {
			disposed = true;
			cleanup?.();
		};
	});
</script>

<div class="gt-viewport-bg" aria-hidden="true">
	<canvas bind:this={canvas}></canvas>
	<!-- Origin triad: crisp SVG overlay, outside the canvas soft-focus. -->
	<svg class="gt-triad" viewBox="0 0 120 110" width="120" height="110">
		<g stroke-width="1.6" font-family="'Share Tech Mono', monospace" font-size="10">
			<line x1="44" y1="72" x2="84" y2="87" stroke="var(--ax-x, #ff4d57)" />
			<text x="90" y="93" fill="var(--ax-x, #ff4d57)">X</text>
			<line x1="44" y1="72" x2="44" y2="28" stroke="var(--ax-y, #00ff41)" />
			<text x="41" y="20" fill="var(--ax-y, #00ff41)">Y</text>
			<line x1="44" y1="72" x2="14" y2="90" stroke="var(--ax-z, #3f8cff)" />
			<text x="4" y="99" fill="var(--ax-z, #3f8cff)">Z</text>
			<circle cx="44" cy="72" r="2.4" fill="var(--green, #00ff41)" stroke="none" />
		</g>
	</svg>
</div>

<style>
	.gt-viewport-bg {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		overflow: hidden;
	}
	.gt-viewport-bg canvas {
		display: block;
		width: 100%;
		height: 100%;
		/* Gentle depth of field: the whole backdrop sits just out of focus, so
		   foreground content always reads sharper than the space behind it.
		   Slightly oversized so the blur never bleeds a bright edge. */
		filter: blur(1.5px) saturate(1.05);
		transform: scale(1.02);
	}
	.gt-triad {
		position: absolute;
		left: 30px;
		bottom: 30px;
		opacity: 0.85;
	}
</style>
