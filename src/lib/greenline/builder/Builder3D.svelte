<script lang="ts">
	import { onMount } from 'svelte';
	import type { BufferAttribute, BufferGeometry } from 'three';
	import type { CompiledTrack } from './pieces';

	/**
	 * Live 3D preview of the compiled track: its own small three.js scene (the
	 * GaragePreview convention — dynamic browser-only imports, own renderer,
	 * OrbitControls with clamps, full disposal on unmount). One ribbon mesh per
	 * runtime PATH, built straight from that path's `leftEdge3`/`rightEdge3`
	 * sweep — the exact geometry the game's physics trimesh and visual ribbon
	 * build from — so the preview cannot drift from what would ship, on the
	 * main line or on a branch. A dim grid marks the y=0 catch plane, which is
	 * the whole point of the banked-ribbon authoring rule: banked pieces must
	 * visibly sit ON it, never through it.
	 *
	 * The render loop is rAF-or-timeout (the DrawingViewer throttled-window
	 * rule): a background or automated tab that never ticks rAF still renders
	 * via a slow interval, and `probe()` renders synchronously before reading
	 * pixels, so the preview is verifiable headless.
	 */
	const {
		compiled,
		selected = null,
		onready
	}: {
		compiled: CompiledTrack;
		selected?: number | null;
		onready?: (api: {
			renderOnce: () => void;
			reframe: () => void;
			probe: (
				cols?: number,
				rows?: number
			) => {
				width: number;
				height: number;
				nonBg: number;
				green: number;
				zonePixels: { boost: number; hazard: number; pit: number };
				topColors: string[];
				selVerts: number;
				pathMeshes: number;
				grid?: string[];
				total: number;
			};
		}) => void;
	} = $props();

	let host: HTMLDivElement | undefined = $state();
	let bootError = $state('');
	let reframeFn: (() => void) | null = $state(null);

	let applyRef: ((c: CompiledTrack, sel: number | null) => void) | null = null;
	$effect(() => {
		const c = compiled;
		const s = selected;
		applyRef?.(c, s);
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
				const renderer = new THREE.WebGLRenderer({ antialias: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
				renderer.setSize(width, height);
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				renderer.setClearColor(0x04060a, 1);
				host.appendChild(renderer.domElement);

				const scene = new THREE.Scene();
				scene.add(new THREE.HemisphereLight(0x8fb6dc, 0x0b0e12, 0.95));
				const key = new THREE.DirectionalLight(0xd7e8fa, 1.35);
				key.position.set(180, 300, 120);
				scene.add(key);

				// The y=0 catch plane: a dim grid + a near-opaque floor slab so
				// geometry dipping below ground visibly disappears into it.
				const grid = new THREE.GridHelper(2400, 120, 0x2c3a45, 0x18242c);
				(grid.material as InstanceType<typeof THREE.Material>).transparent = true;
				(grid.material as InstanceType<typeof THREE.Material> & { opacity: number }).opacity = 0.5;
				scene.add(grid);
				const floorMat = new THREE.MeshBasicMaterial({
					color: 0x070b10,
					transparent: true,
					opacity: 0.88
				});
				const floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), floorMat);
				floor.rotation.x = -Math.PI / 2;
				floor.position.y = -0.03;
				scene.add(floor);

				const trackGroup = new THREE.Group();
				scene.add(trackGroup);
				// Dev-only debug handle (the GaragePreview `__ggp` convention,
				// scoped to this element): lets a scripted session inspect the
				// scene graph and camera without the component exporting them.
				if (import.meta.env.DEV) {
					(host as unknown as Record<string, unknown>).__b3d = { THREE, scene, trackGroup };
				}

				const camera = new THREE.PerspectiveCamera(46, width / Math.max(1, height), 0.5, 8000);
				if (import.meta.env.DEV) {
					const h = host as unknown as Record<string, Record<string, unknown>>;
					if (h.__b3d) h.__b3d.camera = camera;
				}
				const controls = new OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.maxPolarAngle = 1.5;
				controls.minDistance = 12;
				controls.maxDistance = 2400;
				let userMoved = false;
				controls.addEventListener('start', () => {
					userMoved = true;
				});

				const ribbonMat = new THREE.MeshStandardMaterial({
					vertexColors: true,
					roughness: 0.85,
					metalness: 0.12,
					side: THREE.DoubleSide
				});
				const edgeMat = new THREE.LineBasicMaterial({
					color: 0x8fa3b0,
					transparent: true,
					opacity: 0.75
				});
				const boundMat = new THREE.LineBasicMaterial({
					color: 0x39454f,
					transparent: true,
					opacity: 0.8
				});
				const islandMat = new THREE.LineBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.7 });
				const sfMat = new THREE.LineBasicMaterial({ color: 0xeaf4ff });
				const cpMat = new THREE.LineBasicMaterial({ color: 0x22d3ee });
				const cpGroupMat = new THREE.LineBasicMaterial({ color: 0xffb02e });
				const spawnMat = new THREE.MeshBasicMaterial({ color: 0x2ae57e });
				// Zone disc colors match the 2D canvas exactly, which is what
				// makes the framebuffer probe able to tell them apart by hue.
				const zoneMats = {
					boost: new THREE.MeshBasicMaterial({
						color: 0x2ae57e,
						transparent: true,
						opacity: 0.5,
						side: THREE.DoubleSide
					}),
					hazard: new THREE.MeshBasicMaterial({
						color: 0xa06eff,
						transparent: true,
						opacity: 0.5,
						side: THREE.DoubleSide
					}),
					pit: new THREE.MeshBasicMaterial({
						color: 0xffb02e,
						transparent: true,
						opacity: 0.5,
						side: THREE.DoubleSide
					})
				};

				let disposables: { dispose(): void }[] = [];
				/** One ribbon geometry per runtime path, in path order. */
				let ribbonGeos: BufferGeometry[] = [];
				let lastCompiled: CompiledTrack | null = null;

				const BASE = new THREE.Color(0x46525c);
				const BRANCH = new THREE.Color(0x3d5566);
				const BANKED = new THREE.Color(0x3f7fa0);
				const CLIFF = new THREE.Color(0x6b5340);
				const SELECTED = new THREE.Color(0x2ae57e);

				const sampleColor = (c: CompiledTrack, lane: number, i: number, sel: number | null) => {
					const s = c.lanes[lane]?.samples[i];
					if (!s) return BASE;
					if (sel !== null && s.pieceIdx === sel) return SELECTED;
					if (s.cliff) return CLIFF;
					const base = lane > 0 ? BRANCH : BASE;
					const b = Math.min(1, Math.abs(s.bankDeg) / 26);
					if (b > 0.08) return base.clone().lerp(BANKED, b);
					return base;
				};

				const recolor = (c: CompiledTrack, sel: number | null) => {
					ribbonGeos.forEach((geo, lane) => {
						const attr = geo.getAttribute('color') as BufferAttribute;
						if (!attr) return;
						const n = c.lanes[lane]?.samples.length ?? 0;
						for (let i = 0; i < n; i++) {
							const col = sampleColor(c, lane, i, sel);
							attr.setXYZ(2 * i, col.r, col.g, col.b);
							attr.setXYZ(2 * i + 1, col.r, col.g, col.b);
						}
						attr.needsUpdate = true;
					});
				};

				const rebuild = (c: CompiledTrack) => {
					trackGroup.clear();
					for (const d of disposables) d.dispose();
					disposables = [];
					ribbonGeos = [];
					const rt = c.runtime;
					if (!rt) return;

					rt.paths.forEach((path, pi) => {
						const n = path.leftEdge3.length;
						if (n < 2) return;
						const closed = c.lanes[pi]?.closed ?? false;
						// Ribbon: indexed quads over the runtime's own 3D sweep,
						// wound face-up like the race scene's ribbon.
						const pos = new Float32Array(n * 2 * 3);
						for (let i = 0; i < n; i++) {
							const L = path.leftEdge3[i];
							const R = path.rightEdge3[i];
							pos.set([L.x, L.y, L.z], i * 6);
							pos.set([R.x, R.y, R.z], i * 6 + 3);
						}
						const segs = closed ? n : n - 1;
						const idx = new Uint32Array(segs * 6);
						for (let i = 0; i < segs; i++) {
							const a = 2 * i;
							const b = 2 * i + 1;
							const cN = 2 * ((i + 1) % n);
							const dN = 2 * ((i + 1) % n) + 1;
							idx.set([a, cN, b, b, cN, dN], i * 6);
						}
						const geo = new THREE.BufferGeometry();
						geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
						geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
						geo.setIndex(new THREE.BufferAttribute(idx, 1));
						geo.computeVertexNormals();
						disposables.push(geo);
						ribbonGeos[pi] = geo;
						trackGroup.add(new THREE.Mesh(geo, ribbonMat));

						// Edge rails.
						for (const edge of [path.leftEdge3, path.rightEdge3]) {
							const pts = edge.map((p) => new THREE.Vector3(p.x, p.y + 0.06, p.z));
							if (closed) pts.push(pts[0].clone());
							const g = new THREE.BufferGeometry().setFromPoints(pts);
							disposables.push(g);
							trackGroup.add(new THREE.Line(g, edgeMat));
						}
					});

					// Boundaries flat on the ground; islands highlighted.
					for (const b of rt.boundaries) {
						const pts = b.points.map((p) => new THREE.Vector3(p.x, 0.05, p.z));
						if (b.closed && pts.length) pts.push(pts[0].clone());
						const g = new THREE.BufferGeometry().setFromPoints(pts);
						disposables.push(g);
						trackGroup.add(
							new THREE.Line(g, b.id === 'outer' || b.id === 'infield' ? boundMat : islandMat)
						);
					}

					// Zone trigger discs, at their local surface height.
					for (const z of c.zones) {
						const lane = c.lanes[z.lane];
						for (const circ of z.circles) {
							const g = new THREE.CircleGeometry(circ.radius, 22);
							g.rotateX(-Math.PI / 2);
							disposables.push(g);
							const mesh = new THREE.Mesh(g, zoneMats[z.spec.kind]);
							// Nearest lane sample supplies the height; zones are
							// authored on the surface, so this is exact enough.
							let y = 0.12;
							if (lane) {
								let bestD = Infinity;
								for (const s of lane.samples) {
									const d = (s.x - circ.x) ** 2 + (s.z - circ.z) ** 2;
									if (d < bestD) {
										bestD = d;
										y = s.elev + 0.12;
									}
								}
							}
							mesh.position.set(circ.x, y, circ.z);
							trackGroup.add(mesh);
						}
					}

					// Gates at their local surface height.
					const gateBar = (
						gr: { ax: number; az: number; bx: number; bz: number },
						lane: number,
						sampleIdx: number,
						mat: InstanceType<typeof THREE.LineBasicMaterial>
					) => {
						const y = (c.lanes[lane]?.samples[sampleIdx]?.elev ?? 0) + 0.5;
						const g = new THREE.BufferGeometry().setFromPoints([
							new THREE.Vector3(gr.ax, y, gr.az),
							new THREE.Vector3(gr.bx, y, gr.bz)
						]);
						disposables.push(g);
						trackGroup.add(new THREE.Line(g, mat));
					};
					gateBar(rt.startFinish, 0, c.gates.sfIndex, sfMat);
					rt.checkpoints.forEach((g, k) => {
						const r = c.gates.resolved[k];
						gateBar(g, r?.lane ?? 0, r?.index ?? 0, r?.group ? cpGroupMat : cpMat);
					});

					// Spawn arrow.
					if (c.track) {
						const coneGeo = new THREE.ConeGeometry(1.5, 5, 10);
						coneGeo.rotateZ(-Math.PI / 2); // apex along local +x
						disposables.push(coneGeo);
						const cone = new THREE.Mesh(coneGeo, spawnMat);
						const sp = c.track.spawn;
						cone.position.set(sp.x, (c.lanes[0]?.samples[c.gates.spawnIndex]?.elev ?? 0) + 1.2, sp.z);
						cone.rotation.y = (sp.headingDeg * Math.PI) / 180;
						trackGroup.add(cone);
					}
				};

				// Fit the WHOLE track, derived from the bounds and the live FOV.
				// A fixed multiple of the span does not do this: at this panel's
				// aspect it pushed the near corner of the circuit outside the
				// frustum (found in the browser — the selected piece could be
				// off-screen). Solving distance against the TIGHTER of the two
				// half-FOVs guarantees the bounding sphere is inside the frame at
				// any panel size.
				const VIEW_DIR = new THREE.Vector3(0.42, 0.62, 0.5).normalize();
				const FIT_PAD = 1.12;
				const frame = (c: CompiledTrack) => {
					const b = c.bbox;
					const cx = (b.minX + b.maxX) / 2;
					const cz = (b.minZ + b.maxZ) / 2;
					const elevs = c.runtime?.elevations ?? [0];
					const loY = Math.min(...elevs, 0);
					const hiY = Math.max(...elevs, 0);
					const midY = (loY + hiY) / 2;
					const radius = Math.max(
						40,
						0.5 * Math.hypot(b.maxX - b.minX, hiY - loY, b.maxZ - b.minZ)
					);
					const vHalf = (camera.fov * Math.PI) / 360;
					const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
					const dist = (radius / Math.sin(Math.min(vHalf, hHalf))) * FIT_PAD;
					controls.target.set(cx, midY, cz);
					camera.position.copy(controls.target).addScaledVector(VIEW_DIR, dist);
					controls.update();
				};

				applyRef = (c, sel) => {
					if (c !== lastCompiled) {
						rebuild(c);
						if (!userMoved) frame(c);
						lastCompiled = c;
					}
					recolor(c, sel);
				};
				applyRef(compiled, selected);
				frame(compiled);

				let lastFrameAt = 0;
				const renderOnce = () => {
					controls.update();
					renderer.render(scene, camera);
					lastFrameAt = performance.now();
				};
				let raf = 0;
				const tick = () => {
					renderOnce();
					raf = requestAnimationFrame(tick);
				};
				tick();
				// rAF does not tick in throttled/automated tabs; keep rendering.
				const iv = setInterval(() => {
					if (performance.now() - lastFrameAt > 400) renderOnce();
				}, 300);

				const reframe = () => {
					userMoved = false;
					if (lastCompiled) frame(lastCompiled);
				};
				reframeFn = reframe;

				/**
				 * Read the real framebuffer back. WebGL canvases cannot be
				 * screenshotted through the preview pane (it hangs), so this is
				 * the verification surface for the 3D panel: pixel counts, a
				 * hue split for the three zone colors, a color histogram, and a
				 * coarse occupancy grid that can be printed as ASCII and
				 * compared against the 2D layout.
				 */
				const probe = (cols = 0, rows = 0) => {
					renderOnce();
					const gl = renderer.getContext();
					const w = gl.drawingBufferWidth;
					const h = gl.drawingBufferHeight;
					const buf = new Uint8Array(w * h * 4);
					gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
					let nonBg = 0;
					let green = 0;
					const zonePixels = { boost: 0, hazard: 0, pit: 0 };
					const hist = new Map<string, number>();
					for (let i = 0; i < buf.length; i += 4) {
						const r = buf[i];
						const g = buf[i + 1];
						const bl = buf[i + 2];
						if (r + g + bl > 60) {
							nonBg++;
							const kk = `${r >> 5},${g >> 5},${bl >> 5}`;
							hist.set(kk, (hist.get(kk) ?? 0) + 1);
						}
						if (g > 90 && g > r + 25 && g > bl + 12) {
							green++;
							zonePixels.boost++;
						}
						// Violet oil vs amber pit: both are bright, split by hue.
						if (bl > 110 && bl > g + 35 && r > g + 20) zonePixels.hazard++;
						if (r > 130 && g > 70 && g < r - 25 && bl < g - 20) zonePixels.pit++;
					}
					const topColors = [...hist.entries()]
						.sort((a, b) => b[1] - a[1])
						.slice(0, 8)
						.map(([k, n]) => `${k}:${n}`);
					let selVerts = 0;
					for (const geo of ribbonGeos) {
						const cAttr = geo?.getAttribute('color');
						if (!cAttr) continue;
						for (let i = 0; i < cAttr.count; i++)
							if (cAttr.getY(i) > 0.6 && cAttr.getX(i) < 0.4) selVerts++;
					}
					let grid: string[] | undefined;
					if (cols > 0 && rows > 0) {
						const cell = new Array(cols * rows).fill(0);
						for (let y = 0; y < h; y++) {
							const gy = Math.min(rows - 1, Math.floor(((h - 1 - y) / h) * rows));
							for (let x = 0; x < w; x++) {
								const i = (y * w + x) * 4;
								if (buf[i] + buf[i + 1] + buf[i + 2] > 150)
									cell[gy * cols + Math.min(cols - 1, Math.floor((x / w) * cols))]++;
							}
						}
						const per = (w / cols) * (h / rows);
						const ramp = ' .:-=+*#%@';
						grid = [];
						for (let r2 = 0; r2 < rows; r2++) {
							let line = '';
							for (let cc = 0; cc < cols; cc++) {
								const f = Math.min(1, cell[r2 * cols + cc] / (per * 0.35));
								line += f <= 0.001 ? ' ' : ramp[Math.min(9, Math.max(1, Math.round(f * 9)))];
							}
							grid.push(line);
						}
					}
					return {
						width: w,
						height: h,
						nonBg,
						green,
						zonePixels,
						topColors,
						selVerts,
						pathMeshes: ribbonGeos.filter(Boolean).length,
						grid,
						total: w * h
					};
				};
				onready?.({ renderOnce, reframe, probe });

				const resize = () => {
					if (!host) return;
					const w = host.clientWidth || width;
					const h = host.clientHeight || height;
					renderer.setSize(w, h);
					camera.aspect = w / Math.max(1, h);
					camera.updateProjectionMatrix();
					// The fit distance depends on aspect, so a resize refits
					// (unless the user has taken the camera).
					if (!userMoved && lastCompiled) frame(lastCompiled);
				};
				const ro = new ResizeObserver(resize);
				ro.observe(host);

				cleanup = () => {
					cancelAnimationFrame(raf);
					clearInterval(iv);
					ro.disconnect();
					controls.dispose();
					applyRef = null;
					reframeFn = null;
					for (const d of disposables) d.dispose();
					ribbonMat.dispose();
					edgeMat.dispose();
					boundMat.dispose();
					islandMat.dispose();
					sfMat.dispose();
					cpMat.dispose();
					cpGroupMat.dispose();
					spawnMat.dispose();
					zoneMats.boost.dispose();
					zoneMats.hazard.dispose();
					zoneMats.pit.dispose();
					floor.geometry.dispose();
					floorMat.dispose();
					grid.geometry.dispose();
					(grid.material as InstanceType<typeof THREE.Material>).dispose();
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

<div class="b3d-stage" bind:this={host}>
	{#if bootError}
		<div class="b3d-error">{bootError}</div>
	{:else}
		<div class="b3d-hud">
			<button class="b3d-btn" onclick={() => reframeFn?.()}>REFRAME</button>
			<span class="b3d-note">orbit drag · wheel zoom · grid = y0 catch plane</span>
		</div>
	{/if}
</div>

<style>
	.b3d-stage {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 14rem;
		overflow: hidden;
		background: #04060a;
		border: 1px solid rgba(147, 163, 176, 0.28);
	}
	.b3d-stage :global(canvas) {
		display: block;
		cursor: grab;
	}
	.b3d-stage :global(canvas:active) {
		cursor: grabbing;
	}
	.b3d-hud {
		position: absolute;
		left: 0.5rem;
		bottom: 0.5rem;
		display: flex;
		gap: 0.6rem;
		align-items: center;
		pointer-events: none;
	}
	.b3d-btn {
		pointer-events: auto;
		background: rgba(4, 7, 11, 0.85);
		border: 1px solid rgba(147, 163, 176, 0.4);
		color: #8fffc4;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.b3d-btn:hover {
		border-color: #2ae57e;
	}
	.b3d-note {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: rgba(143, 163, 176, 0.6);
	}
	.b3d-error {
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
