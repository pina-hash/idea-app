<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { buildRuntime, type TrackRuntime } from '../track-runtime';
	import { parseTrack } from '../track-schema';
	import {
		buildBoundaryGeometry,
		buildGatePane,
		buildRibbonGeometry,
		deckShoulderMesh,
		deckSlabMesh,
		deckSupportsMesh,
		edgeLinePoints,
		toGeometry
	} from '../track-visual';
	import { previewTrack, type ChainDoc } from './chain-doc';
	import { handlesForPiece, type HandleRay, type PieceHandle } from './handles';
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
		selected = -1,
		onparam
	}: {
		doc: ChainDoc;
		diag: ChainDiagnostics;
		rev: number;
		selected?: number;
		/**
		 * A handle drag's write path: MUST be the parent's own `setParams`, the
		 * same single mutation path the numeric fields use, so the field ticks
		 * live under a drag and a typed value moves the handle. No callback =
		 * no handles (there is nothing for them to write).
		 */
		onparam?: (index: number, key: string, value: number) => void;
	} = $props();

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
	/** Live readout while a handle is hovered or dragged ('' = none). */
	let handleStatus = $state('');

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

				/* ---------------- SolidWorks-style navigation ----------------
				 * The author lives in SolidWorks all day, so the view answers to
				 * SolidWorks' hands rather than to a generic orbit widget:
				 *   MIDDLE drag            rotate
				 *   shift/ctrl + MIDDLE    pan
				 *   wheel                  zoom
				 *   arrows                 nudge the view 15 deg (shift: 90)
				 * LEFT and RIGHT are deliberately left UNBOUND for the camera:
				 * in SolidWorks they select and open the context menu — and the
				 * left button now belongs to the direct-manipulation HANDLES
				 * (see the handles block below), which is exactly why keeping
				 * it off the camera mattered. Handle drags additionally set
				 * `controls.enabled = false` for their duration, so the
				 * camera/handle boundary holds even if this mapping ever
				 * changes.
				 *
				 * Both shift+MMB (as specified) and ctrl+MMB (stock SolidWorks,
				 * where shift+MMB is zoom) pan, so muscle memory lands either way.
				 */
				controls.mouseButtons = {
					LEFT: null,
					MIDDLE: THREE.MOUSE.ROTATE,
					RIGHT: null
				} as unknown as typeof controls.mouseButtons;

				// OrbitControls reads `mouseButtons.MIDDLE` inside its own
				// pointerdown handler, so the modifier has to be resolved into the
				// mapping BEFORE that runs — hence the capture phase.
				const onDownCapture = (e: PointerEvent) => {
					if (e.button !== 1) return;
					controls.mouseButtons.MIDDLE =
						e.shiftKey || e.ctrlKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
				};
				// Chrome opens its autoscroll widget on a middle press otherwise.
				const onMiddleDefault = (e: MouseEvent) => {
					if (e.button === 1) e.preventDefault();
				};
				renderer.domElement.addEventListener('pointerdown', onDownCapture, true);
				renderer.domElement.addEventListener('mousedown', onMiddleDefault);
				renderer.domElement.addEventListener('auxclick', onMiddleDefault);

				/** Orbit the camera about the target, SolidWorks' arrow-key nudge. */
				const nudge = (dTheta: number, dPhi: number) => {
					const off = camera.position.clone().sub(controls.target);
					const sph = new THREE.Spherical().setFromVector3(off);
					sph.theta += dTheta;
					sph.phi = Math.max(
						controls.minPolarAngle + 1e-3,
						Math.min(controls.maxPolarAngle - 1e-3, sph.phi + dPhi)
					);
					camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
					camera.lookAt(controls.target);
					controls.update();
				};
				const NUDGE_RAD = (15 * Math.PI) / 180;
				// Keys are handled on the STAGE, which is focusable: that is what
				// keeps arrow presses in a numeric param field from swinging the
				// camera instead of stepping the value.
				const onKey = (e: KeyboardEvent) => {
					const step = e.shiftKey ? Math.PI / 2 : NUDGE_RAD;
					if (e.key === 'ArrowLeft') nudge(-step, 0);
					else if (e.key === 'ArrowRight') nudge(step, 0);
					else if (e.key === 'ArrowUp') nudge(0, -step);
					else if (e.key === 'ArrowDown') nudge(0, step);
					else return;
					e.preventDefault();
				};
				// The CANVAS is the focusable surface, not the wrapper: it is the
				// thing actually being interacted with, and keeping focus (and so
				// the arrow-key handler) on it is what guarantees arrows pressed in
				// a param field step the number instead of swinging the camera.
				const canvas = renderer.domElement;
				canvas.tabIndex = 0;
				canvas.style.outline = 'none';
				const focusStage = () => canvas.focus({ preventScroll: true });
				canvas.addEventListener('keydown', onKey);
				canvas.addEventListener('pointerdown', focusStage);

				/* ---------------- direct-manipulation handles ----------------
				 * Grabbable points on the SELECTED piece that reshape one param
				 * by dragging (straight: length at the far end; curve: radius at
				 * mid-arc + sweep at the exit). All drag MATH lives in
				 * `handles.ts` (pure, console-testable); this layer only places
				 * meshes, hit-tests pointer rays, and writes solved values
				 * through `onparam` — the parent's own `setParams`, the exact
				 * pipeline the numeric fields use. One mutation path, so the
				 * field ticks live under a drag and a typed value moves the
				 * handle on the debounced rebuild.
				 *
				 * MOUSE ARBITRATION (the part that must not be wrong): a
				 * pointerdown that lands ON a handle starts a handle drag and
				 * must never also move the camera; anywhere else, the camera
				 * behaves exactly as before. This handler runs in the CAPTURE
				 * phase (the onDownCapture guarantee above: capture listeners at
				 * the target fire before OrbitControls' bubble-phase handler),
				 * and on a handle hit it sets `controls.enabled = false` —
				 * OrbitControls' pointerdown checks `enabled` on its first line
				 * and no-ops. Left is unbound on the camera anyway (SolidWorks
				 * scheme), so this is belt on top of braces, but it is what
				 * keeps the boundary airtight if the mapping ever changes, and
				 * it also freezes wheel/MMB for the duration of a drag so the
				 * constraint solve never fights a moving camera.
				 *
				 * Handle drags keep working through mid-drag scene rebuilds: the
				 * drag state holds the pure solver closure from `beginDrag`
				 * (constraints are captured at drag start and stay exact — see
				 * handles.ts), never a mesh reference, so `applyTrack` recreating
				 * the meshes under a live drag is invisible to it.
				 */
				const HANDLE_RADIUS_PX = 9;
				const handleGroup = new THREE.Group();
				scene.add(handleGroup);
				const ballGeo = new THREE.SphereGeometry(1, 16, 12);
				const diamondGeo = new THREE.OctahedronGeometry(1.15, 0);
				// Hit sphere: 1.6x the visible ball — forgiving, but a near-miss
				// beyond ~60% of the ball's radius stays a miss (and stays camera).
				const hitGeo = new THREE.SphereGeometry(1.6, 10, 8);
				// depthTest off: a handle is a gizmo and must never be buried in
				// the road it sits on.
				const handleMatBase = new THREE.MeshBasicMaterial({
					color: 0x2ae57e,
					transparent: true,
					opacity: 0.92,
					depthTest: false
				});
				const handleMatHover = new THREE.MeshBasicMaterial({ color: 0x8fffc4, depthTest: false });
				const handleMatActive = new THREE.MeshBasicMaterial({ color: 0xc8ff00, depthTest: false });
				const handleMatHit = new THREE.MeshBasicMaterial({
					transparent: true,
					opacity: 0,
					depthWrite: false,
					depthTest: false
				});

				type LiveHandle = {
					def: PieceHandle;
					root: InstanceType<typeof THREE.Group>;
					visual: InstanceType<typeof THREE.Mesh>;
					hit: InstanceType<typeof THREE.Mesh>;
				};
				let liveHandles: LiveHandle[] = [];
				/** Which piece the current handles belong to (the selection). */
				let selIndex = -1;
				let hoverId: string | null = null;
				/** MMB held = camera interaction; hover feedback stays out of it. */
				let middleDown = false;
				let drag: {
					def: PieceHandle;
					solve: (r: HandleRay) => number | null;
					pointerId: number;
					last: number;
				} | null = null;

				const matFor = (id: string) =>
					drag?.def.id === id ? handleMatActive : hoverId === id ? handleMatHover : handleMatBase;
				const syncHandleTint = () => {
					for (const lh of liveHandles) lh.visual.material = matFor(lh.def.id);
				};
				const updateCursor = () => {
					canvas.style.cursor = drag ? 'grabbing' : hoverId ? 'grab' : '';
				};
				const fmtHandleValue = (v: number) => (Math.round(v) === v ? String(v) : v.toFixed(1));
				const updateHandleStatus = () => {
					if (drag) handleStatus = `${drag.def.label} ${fmtHandleValue(drag.last)} ${drag.def.unit}`;
					else if (hoverId) {
						const d = liveHandles.find((l) => l.def.id === hoverId)?.def;
						handleStatus = d ? `${d.label} · drag to reshape` : '';
					} else handleStatus = '';
				};

				/** Screen-constant sizing: ~HANDLE_RADIUS_PX on screen at any zoom. */
				const scaleHandles = () => {
					if (!liveHandles.length) return;
					const hpx = host.clientHeight || 420;
					const half = Math.tan((camera.fov * Math.PI) / 360);
					for (const lh of liveHandles) {
						const dist = camera.position.distanceTo(lh.root.position);
						lh.root.scale.setScalar(Math.max(0.02, (HANDLE_RADIUS_PX * 2 * half * dist) / hpx));
					}
				};

				const clearHandles = () => {
					handleGroup.clear();
					liveHandles = [];
				};
				const rebuildHandles = (d: ChainDoc, dg: ChainDiagnostics, sel: number) => {
					clearHandles();
					selIndex = sel;
					const piece = sel >= 0 ? d.pieces[sel] : undefined;
					const pd = piece ? dg.pieces.find((p) => p.index === sel) : undefined;
					if (!piece || !pd || !onparam) {
						if (!drag) {
							hoverId = null;
							updateCursor();
							updateHandleStatus();
						}
						return;
					}
					for (const def of handlesForPiece(piece, pd.entry, pd.exit)) {
						const root = new THREE.Group();
						root.position.set(def.pos.x, def.pos.y, def.pos.z);
						const visual = new THREE.Mesh(def.shape === 'diamond' ? diamondGeo : ballGeo, matFor(def.id));
						visual.renderOrder = 30;
						const hit = new THREE.Mesh(hitGeo, handleMatHit);
						hit.userData.handleId = def.id;
						root.add(visual, hit);
						handleGroup.add(root);
						liveHandles.push({ def, root, visual, hit });
					}
					scaleHandles();
					syncHandleTint();
				};

				const raycaster = new THREE.Raycaster();
				const ndcV = new THREE.Vector2();
				/** Pointer event -> world ray (also arms `raycaster` for pickHandle). */
				const castPointer = (e: { clientX: number; clientY: number }): HandleRay => {
					const rect = canvas.getBoundingClientRect();
					ndcV.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
					ndcV.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
					// Explicit matrix refresh: pointer events must hit-test correctly
					// even in a tab whose rAF never ticks (the documented trap).
					camera.updateMatrixWorld();
					raycaster.setFromCamera(ndcV, camera);
					const o = raycaster.ray.origin;
					const dd = raycaster.ray.direction;
					return { origin: { x: o.x, y: o.y, z: o.z }, dir: { x: dd.x, y: dd.y, z: dd.z } };
				};
				/** Nearest handle under the ray castPointer just armed, or null. */
				const pickHandle = (): PieceHandle | null => {
					if (!liveHandles.length) return null;
					handleGroup.updateMatrixWorld(true);
					const hits = raycaster.intersectObjects(
						liveHandles.map((l) => l.hit),
						false
					);
					if (!hits.length) return null;
					const id = (hits[0].object.userData as { handleId?: string }).handleId;
					return liveHandles.find((l) => l.def.id === id)?.def ?? null;
				};

				/** World point -> canvas client coords (console drives + tests). */
				const worldToScreen = (p: { x: number; y: number; z: number }) => {
					camera.updateMatrixWorld();
					const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
					const rect = canvas.getBoundingClientRect();
					return {
						x: rect.left + ((v.x + 1) / 2) * rect.width,
						y: rect.top + ((1 - v.y) / 2) * rect.height
					};
				};

				const currentParamValue = (def: PieceHandle): number => {
					const piece = doc.pieces[selIndex] as unknown as Record<string, number> | undefined;
					const v = piece?.[def.paramKey];
					return typeof v === 'number' && Number.isFinite(v) ? v : def.min;
				};

				const onHandleDown = (e: PointerEvent) => {
					if (e.button === 1) middleDown = true;
					if (e.button !== 0 || !onparam || drag) return;
					const ray = castPointer(e);
					const def = pickHandle();
					if (!def) return; // empty viewport: the camera's, exactly as before
					controls.enabled = false; // the arbitration boundary (see block comment)
					drag = { def, solve: def.beginDrag(ray), pointerId: e.pointerId, last: currentParamValue(def) };
					hoverId = def.id;
					try {
						canvas.setPointerCapture(e.pointerId);
					} catch {
						/* synthetic pointers (console drives) have no active id */
					}
					syncHandleTint();
					updateCursor();
					updateHandleStatus();
					e.preventDefault();
				};
				const onHandleMove = (e: PointerEvent) => {
					if (drag) {
						if (e.pointerId !== drag.pointerId) return;
						const raw = drag.solve(castPointer(e));
						if (raw === null || !Number.isFinite(raw)) return;
						const q = drag.def.quantum;
						const v = Math.round(Math.min(drag.def.max, Math.max(drag.def.min, raw)) / q) * q;
						if (v !== drag.last) {
							drag.last = v;
							onparam?.(selIndex, drag.def.paramKey, v);
						}
						updateHandleStatus();
						return;
					}
					if (middleDown || !liveHandles.length) return;
					castPointer(e);
					const id = pickHandle()?.id ?? null;
					if (id !== hoverId) {
						hoverId = id;
						syncHandleTint();
						updateCursor();
						updateHandleStatus();
					}
				};
				const endHandleDrag = (e: PointerEvent) => {
					if (!drag || e.pointerId !== drag.pointerId) return;
					drag = null;
					controls.enabled = true;
					try {
						canvas.releasePointerCapture(e.pointerId);
					} catch {
						/* was never captured */
					}
					syncHandleTint();
					updateCursor();
					updateHandleStatus();
				};
				// Up/cancel live on WINDOW: with pointer capture they bubble here
				// anyway, and without it (synthetic drives, capture refusals) a
				// release outside the canvas still ends the drag instead of
				// leaving a stuck grab. A mouse is ONE pointer, so a button check
				// keeps an MMB release from ending an LMB handle drag.
				const onWinUp = (e: PointerEvent) => {
					if (e.button === 1) middleDown = false;
					if (e.button === 0) endHandleDrag(e);
				};
				const onWinCancel = (e: PointerEvent) => {
					middleDown = false;
					endHandleDrag(e);
				};
				canvas.addEventListener('pointerdown', onHandleDown, true);
				canvas.addEventListener('pointermove', onHandleMove);
				window.addEventListener('pointerup', onWinUp);
				window.addEventListener('pointercancel', onWinCancel);

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
					// Handles rebuild with the scene (an early return leaves none,
					// which is right: no road, nothing to grab).
					clearHandles();
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

					// --- deck structure: shoulder, slab, trestles ---
					// The same shared builders the race mounts, so an author sees the
					// real shape of a raised piece — thickness and what carries it —
					// not a floating ribbon. Null on a chain that never rises.
					{
						const shoulderMat = new THREE.MeshStandardMaterial({
							color: 0x4a545e,
							roughness: 0.95
						});
						const slabMat = new THREE.MeshStandardMaterial({
							color: 0x39424b,
							roughness: 0.9,
							side: THREE.DoubleSide
						});
						const trestleMat = new THREE.MeshStandardMaterial({
							color: 0x5a656f,
							roughness: 0.8,
							metalness: 0.3
						});
						disposables.push(shoulderMat, slabMat, trestleMat);
						for (const path of rt.paths)
							for (const [mesh, mat] of [
								[deckShoulderMesh(path), shoulderMat],
								[deckSlabMesh(path), slabMat],
								[deckSupportsMesh(path), trestleMat]
							] as const) {
								if (!mesh) continue;
								const g = toGeometry(THREE, mesh);
								disposables.push(g);
								trackGroup.add(new THREE.Mesh(g, mat));
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
						const g = buildBoundaryGeometry(THREE, b, 0.9, rt);
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

					rebuildHandles(d, dg, sel);
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
					scaleHandles();
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
						/** Drive the SolidWorks nav from the console for verification. */
						nudge,
						nudgeDeg: (dx: number, dy: number) =>
							nudge((dx * Math.PI) / 180, (dy * Math.PI) / 180),
						/** Resolve the modifier -> button mapping without a real MMB. */
						pressMiddle: (mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => {
							onDownCapture({ button: 1, ...mods } as PointerEvent);
							return controls.mouseButtons.MIDDLE;
						},
						get mouseButtons() {
							return controls.mouseButtons;
						},
						get meshCount() {
							return trackGroup.children.length;
						},
						/* ---- handle verification surface (the __greenline convention) ---- */
						/** Current handles with world + canvas-client screen positions. */
						handles: () =>
							liveHandles.map((l) => ({
								id: l.def.id,
								paramKey: l.def.paramKey,
								pos: { ...l.def.pos },
								screen: worldToScreen(l.root.position)
							})),
						/** The REAL hit test at client coords: handle id or null. */
						pickAt: (clientX: number, clientY: number) => {
							castPointer({ clientX, clientY });
							return pickHandle()?.id ?? null;
						},
						/**
						 * Drive a whole drag through the REAL pointer path (capture-phase
						 * grab, ray solves, onparam writes) with synthetic events on the
						 * canvas. dx/dy in screen pixels from the handle's center.
						 */
						dragHandleBy: (id: string, dx: number, dy: number, steps = 8) => {
							const lh = liveHandles.find((l) => l.def.id === id);
							if (!lh) return false;
							const s = worldToScreen(lh.root.position);
							const ev = (type: string, x: number, y: number, button: number, buttons: number) =>
								canvas.dispatchEvent(
									new PointerEvent(type, {
										clientX: x,
										clientY: y,
										button,
										buttons,
										pointerId: 7777,
										bubbles: true,
										cancelable: true
									})
								);
							ev('pointerdown', s.x, s.y, 0, 1);
							for (let k = 1; k <= steps; k++)
								ev('pointermove', s.x + (dx * k) / steps, s.y + (dy * k) / steps, -1, 1);
							ev('pointerup', s.x + dx, s.y + dy, 0, 0);
							return true;
						},
						get dragActive() {
							return drag !== null;
						},
						get hoverHandle() {
							return hoverId;
						},
						get controlsEnabled() {
							return controls.enabled;
						}
					};

				cleanup = () => {
					cancelAnimationFrame(raf);
					ro.disconnect();
					renderer.domElement.removeEventListener('pointerdown', onDownCapture, true);
					renderer.domElement.removeEventListener('mousedown', onMiddleDefault);
					renderer.domElement.removeEventListener('auxclick', onMiddleDefault);
					renderer.domElement.removeEventListener('pointerdown', focusStage);
					renderer.domElement.removeEventListener('keydown', onKey);
					renderer.domElement.removeEventListener('pointerdown', onHandleDown, true);
					renderer.domElement.removeEventListener('pointermove', onHandleMove);
					window.removeEventListener('pointerup', onWinUp);
					window.removeEventListener('pointercancel', onWinCancel);
					controls.dispose();
					applyTrack = null;
					refit = null;
					clearTrack();
					clearHandles();
					ballGeo.dispose();
					diamondGeo.dispose();
					hitGeo.dispose();
					handleMatBase.dispose();
					handleMatHover.dispose();
					handleMatActive.dispose();
					handleMatHit.dispose();
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
	<!-- The canvas inside is made focusable in JS and owns the arrow-key view
	     nudge; it may only act while it actually holds focus, so arrows in a
	     param field still step the number instead of swinging the camera. -->
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
		{#if handleStatus}
			<div class="p3-handlestat" data-testid="p3-handle-status">{handleStatus}</div>
		{/if}
	</div>
	<div class="p3-bar">
		<span class="p3-hint" data-testid="p3-hint">
			LMB drag handles · MMB rotate · shift/ctrl+MMB pan · wheel zoom · arrows nudge 15&deg; (shift
			90&deg;)
		</span>
		<span class="p3-key"><i class="sw hnd"></i> handle</span>
		<span class="p3-key"><i class="sw sel"></i> selected</span>
		<span class="p3-key"><i class="sw bad"></i> guardrail broken</span>
		<button data-testid="p3-refit" onclick={() => refit?.()}>Refit</button>
	</div>
</div>

<style>
	/* Fills whatever the dock gives it: in the docked split pane the parent has
	   a definite height and the stage takes all of it, so the preview stays
	   whole no matter how long the chain gets. `min-height` is the guard for an
	   auto-height parent (the stacked narrow layout), where flex has nothing to
	   divide and the stage would otherwise collapse to zero. */
	.p3-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		height: 100%;
		min-height: 0;
	}
	.p3-stage {
		position: relative;
		width: 100%;
		flex: 1 1 auto;
		min-height: 16rem;
		overflow: hidden;
		border: 1px solid #16212c;
		background:
			radial-gradient(80% 60% at 50% 20%, rgba(120, 165, 205, 0.08), transparent 60%),
			linear-gradient(180deg, #0a0f14 0%, #04060a 75%);
	}
	.p3-stage:focus-within {
		border-color: #2a3b4a;
	}
	/* No resting grab cursor: the left button does not orbit here (SolidWorks
	   scheme). It DOES grab the selected piece's shape handles, so the cursor
	   flips to grab/grabbing dynamically, only while actually over one. */
	.p3-stage :global(canvas) {
		display: block;
	}
	.p3-handlestat {
		position: absolute;
		left: 0.4rem;
		top: 0.4rem;
		background: rgba(4, 6, 10, 0.82);
		border-left: 2px solid #2ae57e;
		color: #8fffc4;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		padding: 0.22rem 0.4rem;
		pointer-events: none;
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
	.sw.hnd {
		background: #2ae57e;
		border-radius: 50%;
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
