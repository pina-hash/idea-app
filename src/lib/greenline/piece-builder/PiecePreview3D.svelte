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
		jumpSolidMesh,
		edgeLinePoints,
		toGeometry
	} from '../track-visual';
	import { previewTrack, type ChainDoc } from './chain-doc';
	import {
		handlesForPiece,
		type HandleContext,
		type HandleRay,
		type PieceHandle
	} from './handles';
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
		onparam,
		onselect,
		onreorder
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
		/**
		 * Click a piece's road surface to select it. Writes the parent's OWN
		 * `selected`, the same state the list rows drive, so picking in 3D and
		 * clicking a row are one selection — the row expands to its edit form and
		 * the shape handles appear, whichever surface did the picking. -1 =
		 * cleared (a click on empty space).
		 */
		onselect?: (index: number) => void;
		/**
		 * Drag a piece's road surface onto another piece to reorder. Same
		 * semantics as the list's own drag-drop (`reorderPiece(from, to)`): the
		 * dragged piece TAKES the position of whatever it is dropped on.
		 */
		onreorder?: (from: number, to: number) => void;
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
	/** Live readout for road picking / reordering ('' = none). Handles outrank it. */
	let pickStatus = $state('');
	/**
	 * OPEN-chain chip: the road renders as it actually is — ending at the last
	 * exit — with the distance still to close shown as a number. The retired
	 * behavior bridged the gap with a straight-line ghost ribbon that clipped
	 * through everything it crossed; the real bridge is the closer piece.
	 */
	let openStatus = $state('');

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
				 *   MIDDLE drag            rotate, about the point UNDER THE CURSOR
				 *   shift/ctrl + MIDDLE    pan
				 *   wheel                  zoom
				 *   arrows                 nudge the view 15 deg (shift: 90)
				 * LEFT and RIGHT are deliberately left UNBOUND: in SolidWorks they
				 * select and open the context menu, and here the left button owns
				 * the direct-manipulation HANDLES and road PICKING (see below).
				 *
				 * Both shift+MMB (as specified) and ctrl+MMB (stock SolidWorks,
				 * where shift+MMB is zoom) pan, so muscle memory lands either way.
				 *
				 * EVERY mouse button is unbound on OrbitControls and the middle
				 * button is driven by hand below. Two reasons, both load-bearing:
				 *
				 *  1. OrbitControls applies its OWN modifier swap — a MIDDLE mapped
				 *     to PAN with shift held is turned back into ROTATE. The old
				 *     code resolved the modifier into `mouseButtons.MIDDLE` first,
				 *     so shift+MMB was swapped TWICE and came out as rotate — the
				 *     pan gesture was unreachable, measured on real hardware.
				 *     Owning the button outright removes the class of bug rather
				 *     than re-tuning around it.
				 *  2. OrbitControls can only ever orbit `controls.target`, which
				 *     `update()` re-aims the camera at every frame. Rotating about
				 *     an arbitrary picked pivot is therefore not expressible
				 *     through it at all (see `applyRotate`).
				 *
				 * OrbitControls is kept for what it is still exactly right for:
				 * wheel zoom, damping, and the `update()` that re-aims the camera
				 * at the target each frame.
				 */
				controls.mouseButtons = {
					LEFT: null,
					MIDDLE: null,
					RIGHT: null
				} as unknown as typeof controls.mouseButtons;

				// Chrome opens its autoscroll widget on a middle press otherwise.
				const onMiddleDefault = (e: MouseEvent) => {
					if (e.button === 1) e.preventDefault();
				};
				renderer.domElement.addEventListener('mousedown', onMiddleDefault);
				renderer.domElement.addEventListener('auxclick', onMiddleDefault);

				/* ---------------- camera drag (middle button) ---------------- */

				const UP = new THREE.Vector3(0, 1, 0);
				/** Marks the pivot a rotate drag is turning about, while it lasts. */
				const pivotMark = new THREE.Mesh(
					new THREE.SphereGeometry(1, 12, 10),
					new THREE.MeshBasicMaterial({
						color: 0xc8ff00,
						transparent: true,
						opacity: 0.85,
						depthTest: false
					})
				);
				pivotMark.renderOrder = 40;
				pivotMark.visible = false;
				scene.add(pivotMark);

				let camDrag: {
					mode: 'rotate' | 'pan';
					pointerId: number;
					x: number;
					y: number;
					pivot: InstanceType<typeof THREE.Vector3>;
				} | null = null;

				/**
				 * Rotate about `pivot` by rigidly turning BOTH the camera and the
				 * orbit target around it. Because the pair moves as one body, the
				 * view direction stays consistent and `controls.update()`'s
				 * `lookAt(target)` still produces the right orientation — so
				 * nothing jumps at drag start even though the pivot is off-centre.
				 * (Just moving `target` to the pivot would snap the pivot to the
				 * middle of the screen, which is why that is not what happens.)
				 *
				 * Rates match OrbitControls' own (2*PI per viewport height), so the
				 * gesture feels exactly as it did.
				 */
				const applyRotate = (dx: number, dy: number, pivot: InstanceType<typeof THREE.Vector3>) => {
					const h = Math.max(1, host.clientHeight || 420);
					const yaw = (-2 * Math.PI * dx) / h;
					const pitch = (-2 * Math.PI * dy) / h;
					const camOff = camera.position.clone().sub(pivot);
					const tgtOff = controls.target.clone().sub(pivot);
					// The camera's own right vector; rotating about it tilts the view.
					const axis = new THREE.Vector3().crossVectors(UP, camera.position.clone().sub(controls.target));
					const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
					if (axis.lengthSq() > 1e-8)
						q.multiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), pitch));
					const nextCam = camOff.clone().applyQuaternion(q).add(pivot);
					const nextTgt = tgtOff.clone().applyQuaternion(q).add(pivot);
					// Reject the pitch component if it would tip past a pole or drop
					// the camera under the ground plane; the yaw always survives, so
					// a steep drag still turns instead of locking up entirely.
					const phi = new THREE.Spherical().setFromVector3(nextCam.clone().sub(nextTgt)).phi;
					if (phi < 0.02 || phi > controls.maxPolarAngle - 0.01 || nextCam.y < 0.5) {
						const qy = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
						camera.position.copy(camOff.applyQuaternion(qy).add(pivot));
						controls.target.copy(tgtOff.applyQuaternion(qy).add(pivot));
					} else {
						camera.position.copy(nextCam);
						controls.target.copy(nextTgt);
					}
					controls.update();
				};

				/** Screen-space pan: translate camera and target together. */
				const applyPan = (dx: number, dy: number) => {
					const h = Math.max(1, host.clientHeight || 420);
					camera.updateMatrix();
					const dist = camera.position.distanceTo(controls.target);
					const reach = dist * Math.tan(((camera.fov / 2) * Math.PI) / 180);
					const m = camera.matrix.elements;
					const right = new THREE.Vector3(m[0], m[1], m[2]).multiplyScalar((-2 * dx * reach) / h);
					const up = new THREE.Vector3(m[4], m[5], m[6]).multiplyScalar((2 * dy * reach) / h);
					const move = right.add(up);
					camera.position.add(move);
					controls.target.add(move);
					controls.update();
				};

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
				 * MOUSE ARBITRATION (the part that must not be wrong), in strict
				 * priority order on a left press: a HANDLE if one is under the
				 * cursor, else the ROAD (select / reorder), else nothing. The
				 * middle button is the camera's alone and is never contested.
				 * A handle drag additionally sets `controls.enabled = false` —
				 * OrbitControls' pointerdown checks `enabled` on its first line
				 * and no-ops — which freezes wheel zoom for the drag's duration
				 * so the constraint solve never fights a moving camera.
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
					canvas.style.cursor = camDrag
						? camDrag.mode === 'pan'
							? 'move'
							: 'grabbing'
						: drag || pieceDrag?.moved
							? 'grabbing'
							: hoverId || hoverPiece >= 0
								? 'grab'
								: '';
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
					const hpx = host.clientHeight || 420;
					const half = Math.tan((camera.fov * Math.PI) / 360);
					const sizeAt = (o: { position: InstanceType<typeof THREE.Vector3> }, px: number) =>
						Math.max(0.02, (px * 2 * half * camera.position.distanceTo(o.position)) / hpx);
					if (pivotMark.visible) pivotMark.scale.setScalar(sizeAt(pivotMark, 5));
					for (const lh of liveHandles) lh.root.scale.setScalar(sizeAt(lh.root, HANDLE_RADIUS_PX));
				};

				const clearHandles = () => {
					handleGroup.clear();
					liveHandles = [];
				};
				/**
				 * How wide the road really is where an angle handle sits, read off
				 * the REAL swept path rather than re-deriving the width blend: an
				 * angle handle rides the road EDGE, so a guessed half-width would
				 * float it off the surface it is supposed to be grabbing. Set with
				 * the rest of the scene in applyTrack; null before the first build.
				 */
				let halfWidths: number[] | null = null;
				let centres: { x: number; y: number; z: number }[] | null = null;
				const handleCtx = (start: number, end: number): HandleContext | undefined => {
					const hw = halfWidths;
					const c = centres;
					if (!hw?.length || !c?.length) return undefined;
					const at = (t: number, n: number) =>
						Math.min(n - 1, Math.max(0, Math.round(start + (end - start) * Math.min(1, Math.max(0, t)))));
					return {
						halfWidthAt: (t) => hw[at(t, hw.length)],
						centreAt: (t) => c[at(t, c.length)]
					};
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
					for (const def of handlesForPiece(piece, pd.entry, pd.exit, handleCtx(pd.start, pd.end))) {
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
					// A hover belongs to the handles that WERE there. Selecting another
					// piece swaps the whole set, so a stale id would keep naming a
					// handle this piece does not have ("radius" over a corkscrew).
					if (!drag && hoverId && !liveHandles.some((l) => l.def.id === hoverId)) {
						hoverId = null;
						updateCursor();
						updateHandleStatus();
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

				/* ---------------- road picking ----------------
				 * The main path's ribbon is ONE indexed mesh whose vertices run two
				 * per centerline sample (left edge, right edge), which is what makes
				 * a hit resolvable back to a piece with no extra bookkeeping: a
				 * face's first vertex index / 2 is the sample, and every piece
				 * diagnostic already carries its own `start`..`end` sample range.
				 * No second geometry, no per-piece meshes, no picking proxy.
				 */
				type PieceRange = { index: number; start: number; end: number; broken: boolean };
				let mainRibbon: {
					mesh: InstanceType<typeof THREE.Mesh>;
					geo: InstanceType<typeof THREE.BufferGeometry>;
					/** The builder's own vertex tones, restored before every repaint. */
					base: Float32Array;
					nP: number;
					ranges: PieceRange[];
				} | null = null;
				/** Meshes a rotate pivot may land on: the road and its deck structure. */
				let pivotTargets: InstanceType<typeof THREE.Mesh>[] = [];

				/** Authored piece index under the ray castPointer just armed, or -1. */
				const pickPiece = (): number => {
					const R = mainRibbon;
					if (!R) return -1;
					R.mesh.updateMatrixWorld(true);
					const hit = raycaster.intersectObject(R.mesh, false)[0];
					if (!hit?.face) return -1;
					const sample = Math.floor(hit.face.a / 2) % R.nP;
					return R.ranges.find((r) => sample >= r.start && sample <= r.end)?.index ?? -1;
				};

				/**
				 * Piece state read on the SURFACE, by overwriting the per-sample
				 * `color` attribute the shared ribbon builder already writes. Same
				 * geometry, same builder, one attribute write — never a second
				 * mesh. The builder's own tones are restored first, so repainting
				 * is idempotent and the gate wear ramps survive.
				 *
				 * Priority is deliberate: while a reorder drag is live its feedback
				 * outranks everything, because that is the question being asked at
				 * that moment; otherwise a broken guardrail outranks selection,
				 * which outranks hover.
				 */
				const paintPieces = () => {
					const R = mainRibbon;
					if (!R) return;
					const col = R.geo.getAttribute('color') as InstanceType<typeof THREE.BufferAttribute>;
					(col.array as Float32Array).set(R.base);
					const paint = (from: number, to: number, r: number, g: number, b: number) => {
						for (let i = from; i <= to; i++)
							for (const ring of i === 0 ? [0, R.nP] : [i]) {
								if (ring * 2 + 1 >= col.count) continue;
								col.setXYZ(ring * 2, r, g, b);
								col.setXYZ(ring * 2 + 1, r, g, b);
							}
					};
					for (const p of R.ranges) {
						if (pieceDrag?.moved && p.index === pieceDrag.from) paint(p.start, p.end, 0.35, 0.4, 0.5);
						else if (pieceDrag?.moved && p.index === pieceDrag.to) paint(p.start, p.end, 1.6, 3.2, 2);
						else if (p.broken) paint(p.start, p.end, 3.2, 1.5, 0.25);
						else if (p.index === selIndex) paint(p.start, p.end, 0.55, 2.6, 1.3);
						else if (p.index === hoverPiece) paint(p.start, p.end, 1.5, 1.9, 2.3);
					}
					col.needsUpdate = true;
				};

				/**
				 * Where a rotate drag should turn about: the road under the cursor,
				 * else where the ray meets the ground plane, else the current orbit
				 * target. Grabbing empty sky therefore still rotates rather than
				 * doing nothing.
				 */
				const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
				const pickPivot = (): InstanceType<typeof THREE.Vector3> => {
					if (pivotTargets.length) {
						const hit = raycaster.intersectObjects(pivotTargets, false)[0];
						if (hit) return hit.point.clone();
					}
					const p = new THREE.Vector3();
					if (raycaster.ray.intersectPlane(groundPlane, p)) return p;
					return controls.target.clone();
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

				/* ---------------- road select + drag-to-reorder ----------------
				 * Clicking a piece's road selects it — the SAME `selected` the list
				 * rows drive, so the row expands and its handles appear.
				 *
				 * Dragging one piece's road onto another reorders, with exactly the
				 * list's own drop semantics (`reorderPiece(from, to)`: the dragged
				 * piece takes the position of what it lands on), which is why a
				 * mouse can move between the two surfaces without relearning what a
				 * drop means. The chain is deliberately NOT mutated mid-drag: the
				 * geometry under the cursor stays the geometry the author aimed at,
				 * and one drag produces one undoable structural edit on release.
				 * A press that never travels past PICK_SLOP_PX is a click, so a
				 * slightly shaky select is still a select.
				 */
				const PICK_SLOP_PX = 5;
				let pieceDrag: { from: number; to: number; x: number; y: number; moved: boolean } | null =
					null;
				let hoverPiece = -1;

				const updatePickStatus = () => {
					if (pieceDrag?.moved)
						pickStatus =
							pieceDrag.to === pieceDrag.from
								? `piece ${pieceDrag.from} · drop on another piece to reorder`
								: `move piece ${pieceDrag.from} → position ${pieceDrag.to}`;
					else if (hoverPiece >= 0)
						pickStatus = `piece ${hoverPiece} · click to select, drag to reorder`;
					else pickStatus = '';
				};

				const onDown = (e: PointerEvent) => {
					// A mouse is ONE pointer, so a second button pressed mid-drag would
					// otherwise start a second, overlapping drag on the same id.
					// Whichever gesture began wins until it is released.
					if (e.button === 1) {
						middleDown = true;
						if (camDrag || drag || pieceDrag) return;
						castPointer(e);
						const mode = e.shiftKey || e.ctrlKey || e.metaKey ? 'pan' : 'rotate';
						camDrag = {
							mode,
							pointerId: e.pointerId,
							x: e.clientX,
							y: e.clientY,
							pivot: mode === 'rotate' ? pickPivot() : controls.target.clone()
						};
						if (mode === 'rotate') {
							pivotMark.position.copy(camDrag.pivot);
							pivotMark.visible = true;
						}
						try {
							canvas.setPointerCapture(e.pointerId);
						} catch {
							/* synthetic pointers (console drives) have no active id */
						}
						updateCursor();
						e.preventDefault();
						return;
					}
					if (e.button !== 0 || camDrag || drag || pieceDrag) return;
					const ray = castPointer(e);
					const def = onparam ? pickHandle() : null;
					if (def) {
						controls.enabled = false; // the arbitration boundary (see block comment)
						drag = {
							def,
							solve: def.beginDrag(ray),
							pointerId: e.pointerId,
							last: currentParamValue(def)
						};
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
						return;
					}
					// No handle: the road itself, or empty space (which clears).
					const idx = pickPiece();
					pieceDrag = { from: idx, to: idx, x: e.clientX, y: e.clientY, moved: false };
					try {
						canvas.setPointerCapture(e.pointerId);
					} catch {
						/* synthetic pointers have no active id */
					}
					e.preventDefault();
				};

				const onMove = (e: PointerEvent) => {
					if (camDrag) {
						if (e.pointerId !== camDrag.pointerId) return;
						const dx = e.clientX - camDrag.x;
						const dy = e.clientY - camDrag.y;
						camDrag.x = e.clientX;
						camDrag.y = e.clientY;
						if (camDrag.mode === 'rotate') applyRotate(dx, dy, camDrag.pivot);
						else applyPan(dx, dy);
						return;
					}
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
					if (pieceDrag) {
						if (
							!pieceDrag.moved &&
							Math.hypot(e.clientX - pieceDrag.x, e.clientY - pieceDrag.y) > PICK_SLOP_PX
						)
							// Only a piece can be dragged; a press on empty space that
							// travels is just a stray gesture, never a reorder.
							pieceDrag.moved = pieceDrag.from >= 0 && !!onreorder;
						if (pieceDrag.moved) {
							castPointer(e);
							const over = pickPiece();
							if (over >= 0 && over !== pieceDrag.to) {
								pieceDrag.to = over;
								paintPieces();
							}
							updatePickStatus();
						}
						return;
					}
					if (middleDown) return;
					castPointer(e);
					const id = liveHandles.length ? (pickHandle()?.id ?? null) : null;
					if (id !== hoverId) {
						hoverId = id;
						syncHandleTint();
						updateHandleStatus();
					}
					// Road hover only where a handle is not already claiming the cursor.
					const over = id ? -1 : pickPiece();
					if (over !== hoverPiece) {
						hoverPiece = over;
						paintPieces();
						updatePickStatus();
					}
					updateCursor();
				};

				const releaseCapture = (id: number) => {
					try {
						canvas.releasePointerCapture(id);
					} catch {
						/* was never captured */
					}
				};
				const endHandleDrag = (e: PointerEvent) => {
					if (!drag || e.pointerId !== drag.pointerId) return;
					drag = null;
					controls.enabled = true;
					releaseCapture(e.pointerId);
					syncHandleTint();
					updateCursor();
					updateHandleStatus();
				};
				const endPieceDrag = (e: PointerEvent, commit: boolean) => {
					if (!pieceDrag) return;
					const { from, to, moved } = pieceDrag;
					pieceDrag = null;
					releaseCapture(e.pointerId);
					if (commit) {
						if (moved && from >= 0 && to >= 0 && to !== from) onreorder?.(from, to);
						else if (!moved) onselect?.(from);
					}
					paintPieces();
					updatePickStatus();
					updateCursor();
				};
				const endCamDrag = (e: PointerEvent) => {
					if (!camDrag || e.pointerId !== camDrag.pointerId) return;
					camDrag = null;
					pivotMark.visible = false;
					releaseCapture(e.pointerId);
					updateCursor();
				};
				// Up/cancel live on WINDOW: with pointer capture they bubble here
				// anyway, and without it (synthetic drives, capture refusals) a
				// release outside the canvas still ends the drag instead of
				// leaving a stuck grab. A mouse is ONE pointer, so a button check
				// keeps an MMB release from ending an LMB handle drag.
				const onWinUp = (e: PointerEvent) => {
					if (e.button === 1) {
						middleDown = false;
						endCamDrag(e);
					}
					if (e.button === 0) {
						endHandleDrag(e);
						endPieceDrag(e, true);
					}
				};
				const onWinCancel = (e: PointerEvent) => {
					middleDown = false;
					endCamDrag(e);
					endHandleDrag(e);
					endPieceDrag(e, false);
				};
				canvas.addEventListener('pointerdown', onDown, true);
				canvas.addEventListener('pointermove', onMove);
				window.addEventListener('pointerup', onWinUp);
				window.addEventListener('pointercancel', onWinCancel);

				/** Everything a rebuild owns and must dispose. */
				const trackGroup = new THREE.Group();
				scene.add(trackGroup);
				const disposables: { dispose(): void }[] = [];
				const clearTrack = () => {
					trackGroup.clear();
					mainRibbon = null;
					halfWidths = null;
					centres = null;
					pivotTargets = [];
					for (const d of disposables.splice(0)) d.dispose();
				};

				// Materials are rebuilt per apply (they are cheap and few); the
				// GEOMETRY is what comes from the shared builders.
				let framed = false;
				/** The last TrackData the preview mounted (dev verification). */
				let lastPreviewData: ReturnType<typeof previewTrack> = null;
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
					lastPreviewData = data;
					if (!data) {
						status = 'Add pieces to preview the road.';
						openStatus = '';
						return;
					}
					// An unclosed chain previews OPEN: no wrap in the sweep, no
					// boundaries, no checkpoint panes — nothing bridges the gap.
					const open = data.surface.type === 'ribbon' && !data.surface.closed;
					openStatus =
						open && dg.chain.closure
							? `OPEN — ends ${dg.chain.closure.gapM.toFixed(1)} m from the start`
							: '';
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
						const mesh = new THREE.Mesh(geo, mat);
						trackGroup.add(mesh);
						pivotTargets.push(mesh);
						// Only the main path carries piece ranges (a preview chain is
						// linear; branches are ribbon-only territory), so it is the
						// only one that can be picked or tinted per piece. The
						// builder's own tones are snapshotted here and are what every
						// later repaint restores.
						if (path === rt.paths[0]) {
							halfWidths = path.halfWidths;
							// The swept centreline, carrying every catch-plane raise the
							// compiler applied — what an angle handle must pivot on.
							centres = path.center.map((p, i) => ({ x: p.x, y: path.elevations[i], z: p.z }));
							const col = geo.getAttribute('color') as InstanceType<typeof THREE.BufferAttribute>;
							mainRibbon = {
								mesh,
								geo,
								base: (col.array as Float32Array).slice(),
								nP: path.center.length,
								ranges: dg.pieces.map((p) => ({
									index: p.index,
									start: p.start,
									end: p.end,
									broken: dg.issues.some((x) => x.pieceIndex === p.index)
								}))
							};
						}

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
						// A jump's ramps are earthwork founded on the apron, so they get
						// their own warmer fill material — the mound reads as built up
						// from the ground rather than as more of the deck's structure.
						const rampMat = new THREE.MeshStandardMaterial({
							color: 0x585349,
							roughness: 0.97,
							side: THREE.DoubleSide
						});
						// The preview compiles to a verbatim ribbon, so the piece kinds
						// are not on the runtime — but they ARE in the diagnostics.
						const jumpSpans = dg.pieces
							.filter((p) => d.pieces[p.index]?.kind === 'jump')
							.map((p) => ({ start: p.start, end: p.end }));
						disposables.push(shoulderMat, slabMat, trestleMat, rampMat);
						for (const path of rt.paths)
							for (const [mesh, mat] of [
								[deckShoulderMesh(path), shoulderMat],
								[deckSlabMesh(path), slabMat],
								[deckSupportsMesh(path), trestleMat],
								[jumpSolidMesh(path, jumpSpans), rampMat]
							] as const) {
								if (!mesh) continue;
								const g = toGeometry(THREE, mesh);
								disposables.push(g);
								const m = new THREE.Mesh(g, mat);
								trackGroup.add(m);
								// Deck structure is solid ground too, so a rotate started
								// over a raised span pivots on the span, not through it.
								pivotTargets.push(m);
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
					// Checkpoint panes are finished-track furniture; an open chain
					// shows only the gold start pane, which deriveFurniture parks at
					// the true chain start — the "bring the road back here" marker.
					if (!open)
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
					// Hover is a pointer fact about the OLD geometry; a rebuild can
					// renumber every piece under a stationary cursor, so it is
					// dropped and re-derived on the next move rather than carried.
					hoverPiece = -1;
					paintPieces();
					updatePickStatus();
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
						/**
						 * Drive a whole middle-button camera gesture through the REAL
						 * pointer path. Returns what the drag resolved to plus the
						 * pivot it turned about, which is what makes "rotate, and
						 * about the thing under the cursor" checkable without hands.
						 */
						camDragBy: (
							dx: number,
							dy: number,
							mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
							at?: { clientX: number; clientY: number },
							steps = 8
						) => {
							const rect = canvas.getBoundingClientRect();
							const sx = at?.clientX ?? rect.left + rect.width / 2;
							const sy = at?.clientY ?? rect.top + rect.height / 2;
							const ev = (type: string, x: number, y: number, button: number, buttons: number) =>
								canvas.dispatchEvent(
									new PointerEvent(type, {
										clientX: x,
										clientY: y,
										button,
										buttons,
										pointerId: 8888,
										bubbles: true,
										cancelable: true,
										...mods
									})
								);
							ev('pointerdown', sx, sy, 1, 4);
							const mode = camDrag?.mode ?? null;
							const pivot = camDrag ? { ...camDrag.pivot } : null;
							for (let k = 1; k <= steps; k++)
								ev('pointermove', sx + (dx * k) / steps, sy + (dy * k) / steps, -1, 4);
							window.dispatchEvent(
								new PointerEvent('pointerup', {
									clientX: sx + dx,
									clientY: sy + dy,
									button: 1,
									buttons: 0,
									pointerId: 8888,
									bubbles: true
								})
							);
							return { mode, pivot };
						},
						get camDragMode() {
							return camDrag?.mode ?? null;
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
						},
						/* ---- road picking / reorder verification surface ---- */
						/** The REAL hit test at client coords: authored piece index or -1. */
						pickPieceAt: (clientX: number, clientY: number) => {
							castPointer({ clientX, clientY });
							return pickPiece();
						},
						/** Canvas-client coords of a point on a piece's own road surface. */
						pieceScreen: (index: number) => {
							const R = mainRibbon;
							const r = R?.ranges.find((x) => x.index === index);
							if (!R || !r) return null;
							const mid = Math.floor((r.start + r.end) / 2);
							const pos = R.geo.getAttribute('position') as InstanceType<
								typeof THREE.BufferAttribute
							>;
							const a = mid * 2;
							const b = mid * 2 + 1;
							if (b >= pos.count) return null;
							return worldToScreen({
								x: (pos.getX(a) + pos.getX(b)) / 2,
								y: (pos.getY(a) + pos.getY(b)) / 2,
								z: (pos.getZ(a) + pos.getZ(b)) / 2
							});
						},
						/** Click one piece's road through the REAL pointer path. */
						clickPiece: (index: number) => {
							const api = (window as unknown as Record<string, { pieceScreen(i: number): { x: number; y: number } | null }>)
								.__glPreview3D;
							const s = api.pieceScreen(index);
							if (!s) return false;
							const ev = (type: string, x: number, y: number, button: number, buttons: number) =>
								canvas.dispatchEvent(
									new PointerEvent(type, {
										clientX: x, clientY: y, button, buttons,
										pointerId: 6666, bubbles: true, cancelable: true
									})
								);
							ev('pointerdown', s.x, s.y, 0, 1);
							window.dispatchEvent(
								new PointerEvent('pointerup', {
									clientX: s.x, clientY: s.y, button: 0, buttons: 0, pointerId: 6666, bubbles: true
								})
							);
							return true;
						},
						/** Drag one piece's road onto another's through the REAL path. */
						dragPieceOnto: (from: number, to: number, steps = 10) => {
							const api = (window as unknown as Record<string, { pieceScreen(i: number): { x: number; y: number } | null }>)
								.__glPreview3D;
							const a = api.pieceScreen(from);
							const b = api.pieceScreen(to);
							if (!a || !b) return false;
							const ev = (type: string, x: number, y: number, button: number, buttons: number) =>
								canvas.dispatchEvent(
									new PointerEvent(type, {
										clientX: x, clientY: y, button, buttons,
										pointerId: 6667, bubbles: true, cancelable: true
									})
								);
							ev('pointerdown', a.x, a.y, 0, 1);
							for (let k = 1; k <= steps; k++)
								ev('pointermove', a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps, -1, 1);
							const landed = pieceDrag ? { from: pieceDrag.from, to: pieceDrag.to } : null;
							window.dispatchEvent(
								new PointerEvent('pointerup', {
									clientX: b.x, clientY: b.y, button: 0, buttons: 0, pointerId: 6667, bubbles: true
								})
							);
							return landed;
						},
						get pieceDrag() {
							return pieceDrag ? { ...pieceDrag } : null;
						},
						get hoverPiece() {
							return hoverPiece;
						},
						/* ---- open/closed preview verification surface ---- */
						/** The exact TrackData the preview last mounted. */
						get lastPreview() {
							return lastPreviewData;
						},
						/** Force a render (rAF never ticks in an automated tab). */
						renderNow: () => renderer.render(scene, camera),
						/** World point -> canvas client coords, for targeted probes. */
						toScreen: (p: { x: number; y: number; z: number }) => worldToScreen(p),
						/**
						 * Read back one framebuffer pixel at canvas client coords (renders
						 * first, so the drawing buffer is valid in the same task). This is
						 * how "no ghost geometry bridges the gap" is proven without a
						 * WebGL screenshot, which hangs the preview pane.
						 */
						readPixel: (clientX: number, clientY: number) => {
							renderer.render(scene, camera);
							const gl = renderer.getContext();
							const rect = canvas.getBoundingClientRect();
							const pr = renderer.getPixelRatio();
							const px = Math.max(0, Math.round((clientX - rect.left) * pr));
							const py = Math.max(0, Math.round((rect.height - (clientY - rect.top)) * pr));
							const buf = new Uint8Array(4);
							gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
							return [buf[0], buf[1], buf[2], buf[3]];
						}
					};

				cleanup = () => {
					cancelAnimationFrame(raf);
					ro.disconnect();
					renderer.domElement.removeEventListener('mousedown', onMiddleDefault);
					renderer.domElement.removeEventListener('auxclick', onMiddleDefault);
					renderer.domElement.removeEventListener('pointerdown', focusStage);
					renderer.domElement.removeEventListener('keydown', onKey);
					renderer.domElement.removeEventListener('pointerdown', onDown, true);
					renderer.domElement.removeEventListener('pointermove', onMove);
					window.removeEventListener('pointerup', onWinUp);
					window.removeEventListener('pointercancel', onWinCancel);
					controls.dispose();
					applyTrack = null;
					refit = null;
					clearTrack();
					clearHandles();
					pivotMark.geometry.dispose();
					(pivotMark.material as InstanceType<typeof THREE.Material>).dispose();
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
		{#if openStatus}
			<div class="p3-open" data-testid="p3-open">{openStatus}</div>
		{/if}
		{#if undrawn.length}
			<div class="p3-undrawn" data-testid="p3-undrawn">
				not drawn (params out of range): piece {undrawn.join(', ')}
			</div>
		{/if}
		{#if handleStatus || pickStatus}
			<div class="p3-handlestat" data-testid="p3-handle-status">{handleStatus || pickStatus}</div>
		{/if}
	</div>
	<div class="p3-bar">
		<span class="p3-hint" data-testid="p3-hint">
			LMB pick a piece, drag to reorder, drag handles · MMB rotate about the cursor ·
			shift/ctrl+MMB pan · wheel zoom · arrows nudge 15&deg; (shift 90&deg;)
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
	.p3-open {
		position: absolute;
		right: 0.4rem;
		top: 0.4rem;
		background: rgba(4, 6, 10, 0.82);
		border-left: 2px solid #8fa3b0;
		color: #cfe2ef;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		padding: 0.22rem 0.4rem;
		pointer-events: none;
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
