<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { buildRuntime, type TrackRuntime } from '../track-runtime';
	import { parseTrack } from '../track-schema';
	import {
		buildBoundaryGeometry,
		buildGatePane,
		buildRibbonGeometry,
		edgeLinePoints
	} from '../track-visual';
	import { previewTrack, type ChainDoc } from './chain-doc';
	import type { ChainDiagnostics } from '../track-pieces';

	/**
	 * Live 3D preview for the piece-chain builder: an orbitable view of the road
	 * the chain actually compiles to.
	 *
	 * Numbers alone do not answer "what does this corkscrew LOOK like" — that is
	 * the gap this closes, and it is why the camera is free (orbit + zoom +
	 * pan) rather than a fixed top-down or chase angle. Bank and spiral read
	 * only from an angle you choose.
	 *
	 * ONE pipeline, no second implementation: the document compiles through
	 * `diagnoseChain` (already the builder's source of truth), those exact
	 * arrays go to `buildRuntime`, and the meshes come from the SHARED
	 * `track-visual` builders the race scene itself mounts. Nothing here
	 * recomputes a pose, a sweep, an elevation or a bank.
	 *
	 * Rebuilt on COMMIT (piece added, edited, reordered, removed), not per
	 * keystroke: the parent bumps `rev` and the whole scene is rebuilt from
	 * scratch. At a chain's scale a full recompute is cheaper than any
	 * incremental diffing would be to maintain.
	 *
	 * three is browser-only, so every import is dynamic inside onMount (SSR-safe,
	 * the GaragePreview convention), and the whole scene is disposed on teardown.
	 */
	const {
		doc,
		diag,
		rev,
		selected = -1
	}: { doc: ChainDoc; diag: ChainDiagnostics; rev: number; selected?: number } = $props();

	let host: HTMLDivElement;
	/** Re-frame on demand (the camera is otherwise the author's to keep). */
	let refit: (() => void) | null = null;
	let bootError = $state('');
	let status = $state('');
	/**
	 * Pieces the compiler could not generate at all (params out of range), so
	 * they contribute NO geometry and cannot be tinted. Saying so is the honest
	 * version of "flagged in 3D": the road really does not exist there, and an
	 * author staring at a gap deserves to be told which piece left it.
	 */
	let undrawn = $state<number[]>([]);

	/** Assigned once the scene exists; re-run on every committed revision. */
	let applyTrack: ((doc: ChainDoc, diag: ChainDiagnostics, selected: number) => void) | null = null;
	$effect(() => {
		// `rev` and `selected` are the ONLY triggers. `doc`/`diag` are read inside
		// `untrack` on purpose: reading a prop in an effect SUBSCRIBES to it, and
		// both change on every keystroke of a number field, which would rebuild
		// the scene exactly as often as the commit model exists to prevent.
		const r = rev;
		const sel = selected;
		void r;
		untrack(() => applyTrack?.(doc, diag, sel));
	});

	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | null = null;

		(async () => {
			try {
				const THREE = await import('three');
				const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
				if (disposed || !host) return;

				const width = host.clientWidth || 640;
				const height = host.clientHeight || 420;
				const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
				renderer.setSize(width, height);
				renderer.outputColorSpace = THREE.SRGBColorSpace;
				host.appendChild(renderer.domElement);

				const scene = new THREE.Scene();
				// Readable authoring light, deliberately NOT the race's murky
				// floodlit night: an author is inspecting shape, not atmosphere.
				scene.add(new THREE.HemisphereLight(0xbcd4e8, 0x0a0e13, 1.15));
				const key = new THREE.DirectionalLight(0xdceaf8, 1.25);
				key.position.set(0.6, 1, 0.4);
				scene.add(key);
				const fill = new THREE.DirectionalLight(0xffd9a8, 0.45);
				fill.position.set(-0.7, 0.5, -0.5);
				scene.add(fill);

				// The y = 0 catch plane, the surface every banked section has to
				// stay above. Drawn as a grid so a raised deck reads as raised.
				const grid = new THREE.GridHelper(1200, 120, 0x1d2b38, 0x121b24);
				const gridMat = grid.material as InstanceType<typeof THREE.LineBasicMaterial>;
				gridMat.transparent = true;
				gridMat.opacity = 0.5;
				scene.add(grid);

				const camera = new THREE.PerspectiveCamera(45, width / Math.max(1, height), 0.5, 8000);
				const controls = new OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.enablePan = true;
				controls.maxPolarAngle = Math.PI * 0.495; // never sink under the plane
				camera.position.set(120, 90, 120);
				controls.target.set(0, 0, 0);
				controls.update();

				/** Everything a rebuild owns and must dispose. */
				const trackGroup = new THREE.Group();
				scene.add(trackGroup);
				const disposables: { dispose(): void }[] = [];
				const clearTrack = () => {
					trackGroup.clear();
					for (const d of disposables.splice(0)) d.dispose();
				};

				// Materials are rebuilt per apply (they are cheap and few); the
				// GEOMETRY is what comes from the shared builders.
				let framed = false;
				applyTrack = (d: ChainDoc, dg: ChainDiagnostics, sel: number) => {
					clearTrack();
					undrawn = d.pieces
						.map((_, i) => i)
						.filter(
							(i) =>
								!dg.pieces.some((p) => p.index === i) &&
								dg.issues.some((x) => x.pieceIndex === i)
						);
					const data = previewTrack(d, dg);
					if (!data) {
						status = 'Add pieces to preview the road.';
						return;
					}
					let rt: TrackRuntime;
					try {
						rt = buildRuntime(parseTrack(data));
					} catch (e) {
						status = e instanceof Error ? e.message : 'Could not build the preview.';
						return;
					}
					status = '';

					// --- the road: the SHARED swept surface, per path ---
					const gates = [...rt.checkpoints, rt.startFinish];
					for (const path of rt.paths) {
						const geo = buildRibbonGeometry(THREE, path, gates);
						// Violation + selection read on the SURFACE, not just in the
						// list: the per-sample `color` attribute the shared builder
						// already writes is overwritten across the offending piece's
						// own sample range. Same geometry, same builder — only the
						// vertex tint differs, and the state comes straight from
						// diagnoseChain rather than from a second check.
						const col = geo.getAttribute('color') as InstanceType<typeof THREE.BufferAttribute>;
						const nP = path.center.length;
						const paint = (from: number, to: number, r: number, g: number, b: number) => {
							for (let i = from; i <= to; i++) {
								for (const ring of i === 0 ? [0, nP] : [i]) {
									if (ring * 2 + 1 >= col.count) continue;
									col.setXYZ(ring * 2, r, g, b);
									col.setXYZ(ring * 2 + 1, r, g, b);
								}
							}
						};
						// Only the main path carries piece ranges (a preview chain is
						// linear; branches are ribbon-only territory).
						if (path === rt.paths[0]) {
							for (const p of dg.pieces) {
								const broken = dg.issues.some((x) => x.pieceIndex === p.index);
								if (broken) paint(p.start, p.end, 3.2, 1.5, 0.25);
								else if (p.index === sel) paint(p.start, p.end, 0.55, 2.6, 1.3);
							}
						}
						col.needsUpdate = true;
						// Lighter than the race's night asphalt on purpose: shading is
						// the only cue an author has for grade and bank, so the
						// surface has to hold a visible gradient rather than sit at
						// the bottom of the range where every angle reads black.
						const mat = new THREE.MeshStandardMaterial({
							color: 0x707d88,
							vertexColors: true,
							roughness: 0.9,
							metalness: 0.02
						});
						disposables.push(geo, mat);
						trackGroup.add(new THREE.Mesh(geo, mat));

						// Painted edges: the corridor's breathing and, on a banked
						// section, the two edges at visibly different heights.
						const edgeMat = new THREE.LineBasicMaterial({
							color: 0xc6d6e2,
							transparent: true,
							opacity: 0.85
						});
						disposables.push(edgeMat);
						for (const line of edgeLinePoints(path)) {
							const g = new THREE.BufferGeometry().setFromPoints(
								line.map((p) => new THREE.Vector3(p.x, p.y, p.z))
							);
							disposables.push(g);
							trackGroup.add(new THREE.Line(g, edgeMat));
						}
					}

					// --- boundaries + gates: the same builders the race mounts ---
					const wallMat = new THREE.MeshBasicMaterial({
						color: 0x2ae57e,
						transparent: true,
						opacity: 0.12,
						side: THREE.DoubleSide,
						depthWrite: false
					});
					disposables.push(wallMat);
					for (const b of rt.boundaries) {
						const g = buildBoundaryGeometry(THREE, b);
						disposables.push(g);
						trackGroup.add(new THREE.Mesh(g, wallMat));
					}
					const postGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.6, 10);
					disposables.push(postGeo);
					for (const g of rt.checkpoints) {
						const built = buildGatePane(THREE, rt, g, 0x2ae57e, 0.14, postGeo);
						disposables.push(built.mat, built.postMat);
						trackGroup.add(built.group);
					}
					const sf = buildGatePane(THREE, rt, rt.startFinish, 0xc8ff00, 0.26, postGeo);
					disposables.push(sf.mat, sf.postMat);
					trackGroup.add(sf.group);

					// --- frame the whole track once, then leave the camera alone:
					// an author who has orbited to inspect a corkscrew must not be
					// yanked back on the next edit.
					if (!framed) {
						frame(rt);
						framed = true;
					}
				};

				/** Fit-to-bounds solve against the tighter of the two half-FOVs. */
				const frame = (rt: TrackRuntime) => {
					const box = new THREE.Box3();
					for (const p of rt.paths)
						for (const e of [p.leftEdge3, p.rightEdge3])
							for (const v of e) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z));
					if (box.isEmpty()) return;
					const sphere = box.getBoundingSphere(new THREE.Sphere());
					const vFov = (camera.fov * Math.PI) / 180;
					const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
					const dist = (sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
					controls.target.copy(sphere.center);
					camera.position.set(
						sphere.center.x + dist * 0.55,
						sphere.center.y + dist * 0.6,
						sphere.center.z + dist * 0.6
					);
					camera.far = Math.max(4000, dist * 6);
					camera.updateProjectionMatrix();
					controls.update();
				};
				refit = () => {
					const data = previewTrack(doc, diag);
					if (!data) return;
					try {
						frame(buildRuntime(parseTrack(data)));
					} catch {
						/* an invalid chain simply keeps the current camera */
					}
				};

				applyTrack(doc, diag, selected);

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

				if (import.meta.env.DEV)
					(window as unknown as Record<string, unknown>).__glPreview3D = {
						scene,
						camera,
						controls,
						trackGroup,
						renderer,
						get meshCount() {
							return trackGroup.children.length;
						}
					};

				cleanup = () => {
					cancelAnimationFrame(raf);
					ro.disconnect();
					controls.dispose();
					applyTrack = null;
					refit = null;
					clearTrack();
					gridMat.dispose();
					grid.geometry.dispose();
					renderer.dispose();
					renderer.domElement.remove();
					if (import.meta.env.DEV)
						delete (window as unknown as Record<string, unknown>).__glPreview3D;
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

<div class="p3-wrap">
	<div class="p3-stage" bind:this={host}>
		{#if bootError}
			<div class="p3-msg err">{bootError}</div>
		{:else if status}
			<div class="p3-msg">{status}</div>
		{/if}
		{#if undrawn.length}
			<div class="p3-undrawn" data-testid="p3-undrawn">
				not drawn (params out of range): piece {undrawn.join(', ')}
			</div>
		{/if}
	</div>
	<div class="p3-bar">
		<span class="p3-hint">drag orbit · wheel zoom · right-drag pan</span>
		<span class="p3-key"><i class="sw sel"></i> selected</span>
		<span class="p3-key"><i class="sw bad"></i> guardrail broken</span>
		<button data-testid="p3-refit" onclick={() => refit?.()}>Refit</button>
	</div>
</div>

<style>
	.p3-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.p3-stage {
		position: relative;
		width: 100%;
		height: clamp(18rem, 42vh, 30rem);
		overflow: hidden;
		border: 1px solid #16212c;
		background:
			radial-gradient(80% 60% at 50% 20%, rgba(120, 165, 205, 0.08), transparent 60%),
			linear-gradient(180deg, #0a0f14 0%, #04060a 75%);
	}
	.p3-stage :global(canvas) {
		display: block;
		cursor: grab;
	}
	.p3-stage :global(canvas:active) {
		cursor: grabbing;
	}
	.p3-msg {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		font-size: 0.72rem;
		color: #6d8090;
	}
	.p3-msg.err {
		color: #ffb02e;
	}
	.p3-undrawn {
		position: absolute;
		left: 0.4rem;
		bottom: 0.4rem;
		right: 0.4rem;
		background: rgba(4, 6, 10, 0.82);
		border-left: 2px solid #ffb02e;
		color: #ffb02e;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		padding: 0.22rem 0.4rem;
	}
	.p3-bar {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		color: #6d8090;
	}
	.p3-key {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
	}
	.sw {
		width: 0.6rem;
		height: 0.6rem;
		display: inline-block;
	}
	.sw.sel {
		background: #2ae57e;
	}
	.sw.bad {
		background: #ffb02e;
	}
	.p3-hint {
		margin-right: auto;
	}
	button {
		background: #0d1620;
		border: 1px solid #24333f;
		color: #cfe2ef;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		padding: 0.15rem 0.45rem;
		cursor: pointer;
	}
	button:hover {
		border-color: #2ae57e;
		color: #8fffc4;
	}
</style>
