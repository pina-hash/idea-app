<script lang="ts">
	/**
	 * The 3D viewport. Until this file existed there was no canvas, no
	 * `WebGLRenderer`, no camera and no controls anywhere in the tree: what sat
	 * where the graphics area belongs was three CSS divs under a `rotateX`, and
	 * `geometry.ts` -- which builds real `LatheGeometry` and `ExtrudeGeometry`
	 * from the feature tree -- had zero importers. This is that wiring.
	 *
	 * THREE IS LOADED DYNAMICALLY, INSIDE `onMount`, AND THE WEBGL CHECK COMES
	 * FIRST. `geometry.ts` carries the one static `three` import in the tree, so
	 * importing it dynamically here is what keeps the library out of the main
	 * bundle for every page that never opens an editor. The context test runs
	 * BEFORE the import: a machine with no WebGL should not pay to download a
	 * renderer it cannot use, and the school's desktops are the budget this
	 * whole subsystem is written against.
	 *
	 * RENDER ON DEMAND. There is no animation loop. `invalidate()` schedules at
	 * most one frame and the viewport issues nothing at all while idle, which is
	 * what makes a frame-time measurement during a drag mean something: the
	 * renderer was doing nothing a moment before. The schedule is
	 * rAF-OR-TIMEOUT rather than rAF alone, because a backgrounded tab never
	 * ticks an animation frame and a first paint that never lands is a blank
	 * pane with nothing to report.
	 */
	import { onMount, untrack } from 'svelte';
	import type { Evaluation } from '../blade/evaluate';
	import type { Rotation } from '../blade/tree';
	import { SolidWorksControls } from './controls';
	import {
		cameraBasis,
		cameraPosition,
		fitted,
		spinArrowTurn,
		viewName,
		worldUnderCursor,
		type ViewportProbe
	} from './camera-rig';
	import { IDENTITY_QUATERNION, STANDARD_VIEWS, type CameraState } from './controls-math';

	let {
		evaluation,
		rotation = 'cw',
		label = '3D viewport',
		onFrame = undefined,
		onReady = undefined
	}: {
		evaluation: Evaluation;
		rotation?: Rotation;
		label?: string;
		/** Best-effort instrumentation. ABSENT means no measurement is taken at
		 *  all, which is the repo's own rule: the harness hands one in, the real
		 *  page does not, and the callback is wrapped so a throw inside somebody
		 *  else's probe can never reach the frame it is measuring. */
		onFrame?: (ms: number) => void;
		/** Handed the camera probe once the renderer is live. ABSENT is the real
		 *  page: nothing of the harness reaches production, and a surface that
		 *  supplies no probe simply has none. */
		onReady?: (probe: ViewportProbe) => void;
	} = $props();


	let host = $state<HTMLDivElement | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);
	/** `null` while the check has not run; `false` once it has and failed. */
	let webgl = $state<boolean | null>(null);
	let cam = $state<CameraState>({
		quaternion: STANDARD_VIEWS.Isometric,
		rotationCenter: { x: 0, y: 0, z: 0 },
		orthoZoom: 120,
		distance: 100,
		projection: 'orthographic'
	});
	let style = $state<'shaded-edges' | 'shaded' | 'wireframe'>('shaded-edges');
	let controls: SolidWorksControls | null = null;
	let redraw: (() => void) | null = null;
	let refit: (() => void) | null = null;
	let apply: ((s: CameraState, st: typeof style) => void) | null = null;

	const name = $derived(viewName(cam.quaternion));
	/** The triad's three axes, projected through the camera's own basis. A 2D
	 *  overlay rather than a second WebGL scene, so it stays crisp and themed. */
	const axes = $derived.by(() => {
		const b = cameraBasis(cam.quaternion);
		const to = (v: { x: number; y: number; z: number }) => ({
			x: v.x * b.right.x + v.y * b.right.y + v.z * b.right.z,
			y: -(v.x * b.up.x + v.y * b.up.y + v.z * b.up.z),
			/* Depth decides which axis paints over which. */
			z: v.x * b.forward.x + v.y * b.forward.y + v.z * b.forward.z
		});
		return [
			{ key: 'X', ...to({ x: 1, y: 0, z: 0 }) },
			{ key: 'Y', ...to({ x: 0, y: 1, z: 0 }) },
			{ key: 'Z', ...to({ x: 0, y: 0, z: 1 }) }
		].sort((a, b2) => a.z - b2.z);
	});

	/* The camera is re-applied whenever the state or the display style moves.
	   `apply` is set by the mount and is null until three has loaded, so a
	   cam change during the import is simply picked up by the first draw. */
	$effect(() => {
		const s = cam;
		const st = style;
		/* TRACK THE INPUTS, UNTRACK THE CALL -- and the call means the CALL, not
		   the read of the function. `untrack(() => apply)?.(s, st)` untracks only
		   the lookup and leaves the invocation inside the tracking context, so
		   everything the callee touches joins this effect's dependency set. */
		untrack(() => apply?.(s, st));
	});
	/* A new evaluation means new geometry. The rebuild is the mount's, reached
	   through a setter so this effect calls injected code inside `untrack`. */
	$effect(() => {
		const e = evaluation;
		/* The same correction, and here it was a real defect rather than a rule
		   followed loosely. `build()` reads the `rotation` PROP and ends in
		   `paint()`, which reads `cam` and `style` through its own defaults -- so
		   once an evaluation change armed this effect, every camera write during
		   a drag re-triggered a full geometry rebuild: a `LatheGeometry`, an
		   `ExtrudeGeometry` and three `EdgesGeometry` disposed and rebuilt per
		   frame. It never showed up in a measurement because the harness fixture
		   never changes the feature tree, so the effect never re-ran with
		   `rebuild` set. Found by re-reading the diff, not by the instrument. */
		untrack(() => rebuild?.(e));
	});
	let rebuild: ((e: Evaluation) => void) | null = null;

	onMount(() => {
		if (!canvas || !host) return;
		/* The check before the import, per the header. `failIfMajorPerformance
		   Caveat` is deliberately NOT set: a software rasteriser is slow and is
		   still a rendered model, which is better than a fallback panel on a
		   school machine with a tired driver. */
		const probe = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
		if (!probe) {
			webgl = false;
			return;
		}
		webgl = true;

		let disposed = false;
		let cleanup: (() => void) | null = null;

		(async () => {
			const THREE = await import('three');
			const { evaluationGeometries } = await import('../geometry');
			if (disposed || !canvas || !host) return;

			const token = (n: string, fallback: string) =>
				getComputedStyle(host!).getPropertyValue(n).trim() || fallback;
			/* Read once, at mount, from the HOST -- so a scoped room that
			   re-points the tokens paints the model in its own plate. */
			const ink = {
				ground: token('--surface-0', '#0a0c0b'),
				body: token('--ice', '#a9bcab'),
				blade: token('--text-2', '#9aa89b'),
				hex: token('--gear', '#75846f'),
				edge: token('--edge', '#0d120c'),
				fail: token('--crimson', '#d95f5f'),
				arrow: token('--cyan', '#67d8de')
			};

			const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
			renderer.setClearColor(new THREE.Color(ink.ground), 1);
			const scene = new THREE.Scene();

			/* A plain three-light rig: key, fill, rim. No environment map and no
			   tone mapping -- this is an engineering view, not a product shot. */
			const key = new THREE.DirectionalLight(0xffffff, 2.1);
			key.position.set(4, 6, 5);
			const fill = new THREE.DirectionalLight(0xffffff, 0.8);
			fill.position.set(-5, 1, 3);
			const rim = new THREE.DirectionalLight(0xffffff, 0.5);
			rim.position.set(0, -4, -6);
			scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.55));

			const model = new THREE.Group();
			scene.add(model);

			/* One material per role, shared across every instance -- draw calls
			   are the budget on the machines this targets. Lambert rather than a
			   PBR material for the same reason: matte faces, no roughness pass. */
			const bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(ink.body), side: THREE.DoubleSide });
			const hexMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(ink.hex) });
			const bladeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(ink.blade), side: THREE.DoubleSide });
			const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(ink.edge) });
			const failMat = new THREE.LineBasicMaterial({ color: new THREE.Color(ink.fail) });
			const arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ink.arrow) });

			/* The same 30 degrees `geometry.ts` uses for the blade's own edges.
			   Display edges for the body and the hex are a RENDERING decision --
			   `geometry.ts` translates a feature tree and returns the blade's
			   edges because that is the part with sharp ones. */
			const EDGE_ANGLE = 30;
			let owned: { dispose(): void }[] = [];
			let radius = 1;
			let anchor = new THREE.Vector3();
			let edgeLines: InstanceType<typeof THREE.LineSegments>[] = [];
			let meshes: InstanceType<typeof THREE.Mesh>[] = [];

			function build(e: Evaluation) {
				for (const o of owned) o.dispose();
				owned = [];
				edgeLines = [];
				meshes = [];
				model.clear();

				const g = evaluationGeometries(e);
				owned.push(g.body, g.hex, g.blade, g.edges);

				const bodyEdges = new THREE.EdgesGeometry(g.body, EDGE_ANGLE);
				const hexEdges = new THREE.EdgesGeometry(g.hex, EDGE_ANGLE);
				owned.push(bodyEdges, hexEdges);

				const bodyMesh = new THREE.Mesh(g.body, bodyMat);
				const bodyLine = new THREE.LineSegments(bodyEdges, edgeMat);
				model.add(bodyMesh, bodyLine);

				const bodyTop = e.geometry.stations.at(-1)?.z ?? 0;
				const hexMesh = new THREE.Mesh(g.hex, hexMat);
				hexMesh.position.y = bodyTop + e.geometry.hexHeight / 2;
				const hexLine = new THREE.LineSegments(hexEdges, edgeMat);
				hexLine.position.copy(hexMesh.position);
				model.add(hexMesh, hexLine);

				/* The blade is extruded in its own XY plane along +Z. Laid flat on
				   a rotor that spins about Y, its thickness is vertical: rotating
				   -90 degrees about X sends the extrusion to +Y and the planform
				   into the world XZ plane. The pattern is then a rotation about Y,
				   reusing one geometry and one material for every instance. */
				for (let i = 0; i < Math.max(1, g.instances); i++) {
					const arm = new THREE.Group();
					arm.rotation.y = (i / Math.max(1, g.instances)) * Math.PI * 2;
					const blade = new THREE.Mesh(g.blade, bladeMat);
					blade.rotation.x = -Math.PI / 2;
					blade.position.y = e.geometry.bladeZ;
					const line = new THREE.LineSegments(g.edges, edgeMat);
					line.rotation.copy(blade.rotation);
					line.position.copy(blade.position);
					arm.add(blade, line);
					model.add(arm);
					meshes.push(blade);
					edgeLines.push(line);
				}
				meshes.push(bodyMesh, hexMesh);
				edgeLines.push(bodyLine, hexLine);

				/* THE FIT IS TAKEN BEFORE THE ARROW IS ADDED, AND THAT ORDER IS THE
				   WHOLE POINT. The arrow is an annotation about the part, not part
				   of the part: measured with it inside the bound the radius came
				   out 3.519 against the model's own 2.17, so Zoom to Fit sized the
				   pane to an arrow. Nothing on screen reported it -- every
				   threshold passed and the model was simply small.

				   AND THE RADIUS IS TAKEN FROM THE VERTICES, NOT FROM THE BOX.
				   `Box3.getBoundingSphere` returns the sphere through the box's
				   CORNERS, which for a part shaped like this one -- a squat
				   cylinder, wider than it is tall -- is a diagonal nothing
				   occupies: 3.404 against a true 2.17, so a fitted model filled
				   28.7% of the pane's width where it should fill 55%. It is the
				   same failure twice over, and both were found by rasterizing and
				   looking rather than by any number the page reports. */
				const box = new THREE.Box3().setFromObject(model);
				anchor = box.getCenter(new THREE.Vector3());
				const v = new THREE.Vector3();
				let far = 0;
				model.traverse((o) => {
					const mesh = o as InstanceType<typeof THREE.Mesh>;
					if (!(mesh as { isMesh?: boolean }).isMesh) return;
					mesh.updateWorldMatrix(true, false);
					const pos = mesh.geometry.getAttribute('position');
					for (let i = 0; i < pos.count; i++) {
						v.fromBufferAttribute(pos as InstanceType<typeof THREE.BufferAttribute>, i)
							.applyMatrix4(mesh.matrixWorld);
						far = Math.max(far, v.distanceTo(anchor));
					}
				});
				radius = Math.max(far, 0.1);

				/* Which way it spins, drawn just above the hex: an arc with a head,
				   reversed for a counter-clockwise document. An ANNOTATION, so it
				   is sized against the part rather than to the part -- at the
				   body's own radius it was the loudest thing in the frame and read
				   as the subject. */
				const arcR = Math.max(0.35, (e.diameterIn / 2) * 0.42);
				const SWEEP = Math.PI * 1.35;
				const arc = new THREE.TorusGeometry(arcR, 0.022, 6, 24, SWEEP);
				const head = new THREE.ConeGeometry(0.075, 0.19, 10);
				owned.push(arc, head);
				const spin = new THREE.Group();
				const ring = new THREE.Mesh(arc, arrowMat);
				/* A torus lies in its own XY plane; this lays it flat, so the arc
				   parameter runs +X toward +Z. The Top view looks DOWN the +Y axis
				   with +Z painting downward, so that direction reads CLOCKWISE on
				   screen -- which is the sense `docs/prompts/0145-ideacad.md` line
				   356 defines: `rotation: 'cw' | 'ccw'  // viewed from above`. */
				ring.rotation.x = Math.PI / 2;
				/* The head sits ON the arc's end and points along its tangent.
				   Written as a mirrored coordinate it sat somewhere else entirely,
				   which no threshold could see and which reads as a stray cone. */
				const end = new THREE.Vector3(arcR * Math.cos(SWEEP), 0, arcR * Math.sin(SWEEP));
				const tangent = new THREE.Vector3(-Math.sin(SWEEP), 0, Math.cos(SWEEP));
				const tip = new THREE.Mesh(head, arrowMat);
				tip.position.copy(end);
				tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
				spin.add(ring, tip);
				spin.position.y = bodyTop + e.geometry.hexHeight + 0.2;
				spin.rotation.x = spinArrowTurn(rotation);
				model.add(spin);

				/* A rule failure is the ONE permitted use of crimson here, and it
				   is on the OUTLINE rather than the faces: the shape stays
				   readable and the refusal is unmistakable. It is never the only
				   signal -- the rail says which rule, in words, beside it. */
				const failing = e.rules.some((r) => !r.pass);
				for (const l of edgeLines) l.material = failing ? failMat : edgeMat;
				paint();
			}

			const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
			const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 4000);
			let camera: InstanceType<typeof THREE.Camera> = ortho;

			function box() {
				const r = host!.getBoundingClientRect();
				return { width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) };
			}

			/** Place the camera from the state. The frustum is the canvas in
			 *  PIXELS, which is what makes `camera.zoom` literally pixels per
			 *  world unit and `zoomOrthoAboutCursor`'s invariant hold against the
			 *  real camera rather than approximately. */
			function paint(s: CameraState = cam, st: typeof style = style) {
				const v = box();
				const perspective = s.projection === 'perspective';
				/* One zoom state drives both projections: the perspective
				   distance is the one at which the model subtends the same angle,
				   so the toggle is continuous and zoom-about-cursor stays exact at
				   the anchor's own depth. */
				const dist = perspective ? v.height / 2 / (s.orthoZoom * Math.tan((35 * Math.PI) / 360)) : s.distance;
				const rig = { ...s, distance: dist };
				const p = cameraPosition(rig, anchor);
				camera = perspective ? persp : ortho;
				if (perspective) {
					persp.aspect = v.width / v.height;
				} else {
					ortho.left = -v.width / 2;
					ortho.right = v.width / 2;
					ortho.top = v.height / 2;
					ortho.bottom = -v.height / 2;
					ortho.zoom = s.orthoZoom;
				}
				camera.position.set(p.x, p.y, p.z);
				camera.quaternion.set(s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w);
				(camera as InstanceType<typeof THREE.OrthographicCamera>).updateProjectionMatrix();
				for (const m of meshes) (m.material as InstanceType<typeof THREE.MeshLambertMaterial>).wireframe = st === 'wireframe';
				for (const l of edgeLines) l.visible = st === 'shaded-edges';
				draw();
			}

			let pending = false;
			function draw() {
				if (pending || disposed) return;
				pending = true;
				const go = () => {
					if (!pending || disposed) return;
					pending = false;
					const t0 = performance.now();
					renderer.render(scene, camera);
					const ms = performance.now() - t0;
					/* Wrapped: a probe that throws must not be able to reach the
					   render it is measuring. */
					if (onFrame) {
						try {
							onFrame(ms);
						} catch {
							/* measured, not enforced */
						}
					}
				};
				requestAnimationFrame(go);
				/* rAF alone never fires in a hidden or throttled tab, and a first
				   paint that never lands looks exactly like a broken renderer. */
				setTimeout(go, 100);
			}

			function resize() {
				const v = box();
				renderer.setPixelRatio(Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)));
				renderer.setSize(v.width, v.height, false);
				paint();
			}

			build(evaluation);
			rebuild = (e: Evaluation) => build(e);
			apply = (s, st) => paint(s, st);
			redraw = () => paint();
			resize();
			/* The fit is taken AFTER the first size is known: fitting against a
			   zero-width pane is how a model ends up microscopic or gone. */
			cam = fitted(cam, radius, box());

			controls = new SolidWorksControls(host, {
				/* A SNAPSHOT, NOT THE RUNE. `cam` is `$state`, so reading it hands
				   back a PROXY, and `PreviousViewStack.push` deep-copies what it
				   is given with `structuredClone` -- which refuses a proxy and
				   throws `could not be cloned`. That throw lands inside
				   `pointerdown`, BEFORE the drag is armed, so the whole control
				   map went quiet: no rotation, no Previous, no standard view,
				   and nothing on screen to say why. Measured as three separate
				   symptoms (a 300-frame drag that recorded 0 frames, a Top that
				   stayed Isometric, a Previous that did nothing) and one cause.
				   `controls-math.ts` is right and is not the thing to change:
				   `structuredClone` is correct for the plain object its own type
				   describes, and handing it one is this file's job. */
				get: () => $state.snapshot(cam) as CameraState,
				write: (next) => {
					cam = next;
				},
				size: box,
				radius: () => radius
			});
			refit = () => controls?.zoomToFit();

			const ro = new ResizeObserver(() => resize());
			ro.observe(host);

			/* Handed over rather than hung on the element: the probe answers
			   about the REAL camera, and a caller that wants one asks for it. */
			/**
			 * The model's extent ON SCREEN, in canvas pixels, walked from the
			 * real mesh vertices through the real camera.
			 *
			 * A caller cannot get this from `radius` and `orthoZoom`: the fit
			 * DERIVES the zoom from the radius, so `radius * 2 * zoom` is the
			 * same number whatever the radius is. Measured -- inflating the
			 * radius 2.2x moved nothing in that product, so a verdict written
			 * on it passed while the model rendered at less than half the size
			 * it should. This walks the geometry instead, so the two cannot
			 * agree with each other about a model that is not there.
			 */
			function projected() {
				const v = box();
				const s = $state.snapshot(cam) as CameraState;
				const basis = cameraBasis(s.quaternion);
				const p = new THREE.Vector3();
				let minX = Infinity;
				let maxX = -Infinity;
				let minY = Infinity;
				let maxY = -Infinity;
				model.traverse((o) => {
					const mesh = o as InstanceType<typeof THREE.Mesh>;
					if (!(mesh as { isMesh?: boolean }).isMesh) return;
					mesh.updateWorldMatrix(true, false);
					const pos = mesh.geometry.getAttribute('position');
					for (let i = 0; i < pos.count; i++) {
						p.fromBufferAttribute(pos as InstanceType<typeof THREE.BufferAttribute>, i)
							.applyMatrix4(mesh.matrixWorld)
							.sub(anchor);
						const u = p.x * basis.right.x + p.y * basis.right.y + p.z * basis.right.z;
						const w = p.x * basis.up.x + p.y * basis.up.y + p.z * basis.up.z;
						const sx = v.width / 2 + (u - s.rotationCenter.x) * s.orthoZoom;
						const sy = v.height / 2 - (w - s.rotationCenter.y) * s.orthoZoom;
						if (sx < minX) minX = sx;
						if (sx > maxX) maxX = sx;
						if (sy < minY) minY = sy;
						if (sy > maxY) maxY = sy;
					}
				});
				return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
			}

			onReady?.({
				box,
				canvas: () => ({ width: canvas!.width, height: canvas!.height }),
				state: () => $state.snapshot(cam) as CameraState,
				projected,
				radius: () => radius,
				anchor: () => ({ x: anchor.x, y: anchor.y, z: anchor.z }),
				under: (x, y) => worldUnderCursor(cam, anchor, { x, y }, box()),
				drawCalls: () => renderer.info.render.calls,
				triangles: () => renderer.info.render.triangles
			});

			cleanup = () => {
				ro.disconnect();
				controls?.destroy();
				controls = null;
				for (const o of owned) o.dispose();
				bodyMat.dispose();
				hexMat.dispose();
				bladeMat.dispose();
				edgeMat.dispose();
				failMat.dispose();
				arrowMat.dispose();
				renderer.dispose();
				rebuild = apply = redraw = refit = null;
			};
		})();

		return () => {
			disposed = true;
			cleanup?.();
		};
	});

	export function zoomToFit() {
		refit?.();
	}
	export function previousView() {
		controls?.restorePrevious();
	}
	export function standardView(n: keyof typeof STANDARD_VIEWS) {
		controls?.standardView(n);
	}
	export function cycleDisplayStyle() {
		style = style === 'shaded-edges' ? 'shaded' : style === 'shaded' ? 'wireframe' : 'shaded-edges';
	}
	export function toggleProjection() {
		cam = { ...cam, projection: cam.projection === 'orthographic' ? 'perspective' : 'orthographic' };
	}
	export function currentStyle() {
		return style;
	}
	export function currentProjection() {
		return cam.projection;
	}
</script>

<!-- `tabindex` because the key map is the controls', and a div cannot take a
     keystroke without being focusable. The pane is the focus target rather than
     the canvas so a click anywhere in the graphics area arms the shortcuts.

     `role="application"` is deliberate and is the reason for the suppression
     below: this pane owns its whole key map (F, Z, the arrows, Ctrl+1 to
     Ctrl+7), so a screen reader must hand keystrokes to it rather than spend
     them on its own browse mode. The a11y rule refuses a tabindex on an
     element it reads as non-interactive; a focusable widget that keyboard
     users cannot reach at all is the worse answer, so the role stays, the
     tabindex stays, and the reason is written here rather than left as a
     suppressed warning nobody can account for. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="vp"
	bind:this={host}
	tabindex="0"
	role="application"
	aria-label={label}
	aria-roledescription="3D model viewport"
	data-testid="ideacad-viewport"
	data-view={name}
>
	<canvas bind:this={canvas} data-testid="ideacad-canvas"></canvas>
	{#if webgl === false}
		<p class="nogl" role="status">
			This computer cannot draw 3D in the browser, so the model is not shown. Every number on the
			right is still correct: they are computed from the feature tree, not from the picture.
		</p>
	{/if}
	<svg class="triad" viewBox="-30 -30 60 60" aria-hidden="true">
		{#each axes as axis (axis.key)}
			<line x1="0" y1="0" x2={axis.x * 20} y2={axis.y * 20} class={`a${axis.key}`} />
			<text x={axis.x * 26} y={axis.y * 26} class={`a${axis.key}`}>{axis.key}</text>
		{/each}
	</svg>
	<p class="view">{name}</p>
</div>

<style>
	.vp {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	.vp:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: -3px;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		/* The model is the content: a drag must not select the page or bounce
		   the pane, and a middle-drag must not start the browser's autoscroll. */
		touch-action: none;
		user-select: none;
	}
	.nogl {
		position: absolute;
		inset: auto 1rem 3rem;
		margin: 0;
		padding: 0.75rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.triad {
		position: absolute;
		bottom: 2.1rem;
		left: 1rem;
		width: 64px;
		height: 64px;
		pointer-events: none;
	}
	.triad line {
		stroke: currentColor;
		stroke-width: 2;
	}
	.triad text {
		fill: currentColor;
		font: 10px 'Share Tech Mono', monospace;
		text-anchor: middle;
		dominant-baseline: middle;
	}
	/* Three hues AND three letters: the axis is never named by colour alone.
	   Declared as `color` with the marks painting `currentColor`, so a contrast
	   reading -- which asks an element for its `color` -- gets the colour that
	   is actually on screen rather than the pane's inherited one. */
	.aX {
		color: var(--crimson);
	}
	.aY {
		color: var(--green);
	}
	.aZ {
		color: var(--cyan);
	}
	.view {
		position: absolute;
		bottom: 0.3rem;
		left: 1rem;
		margin: 0;
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-1);
		pointer-events: none;
	}
</style>
