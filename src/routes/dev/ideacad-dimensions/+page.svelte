<script lang="ts">
	/**
	 * THE DIMENSION OVERLAY, ON ITS OWN, with no kernel. Ledger 0296.
	 *
	 * Mounts the REAL `DimensionOverlay` (and the real `DimensionPanel` beside
	 * it, so the two can be read against each other) over a small fake model:
	 * a 4 x 3 rectangle sketched on Top, extruded 1 in, one top edge rounded,
	 * a 0.5 in hole drilled into the top, and a circle sketched on Front. The model is REBUILT from its numbers on
	 * every `set-feature`, which is what the engine's replay does for the real
	 * modeler, so a typed width moves the box and its labels. The "kernel" here
	 * refuses exactly one thing, a zero-depth extrude, in the engine's own
	 * words, so a refusal can be seen.
	 *
	 * The scene is an SVG wireframe drawn through the same orthographic
	 * projector the overlay is handed as `api.project`, so a label beside an
	 * edge on screen is beside that edge in the projection too. `?state=` picks
	 * what is selected: `box` (default), `sketch` (the sketch open for editing),
	 * `circle`, `fillet`, `hole`, `edge` (a measured length), `rim` (a hole's
	 * rim, measured as its diameter), `editing`, `mm`, `readonly`.
	 */
	import { onMount } from 'svelte';
	import '$lib/ideacad/ideacad.css';
	import DimensionOverlay from '$lib/ideacad/solid/DimensionOverlay.svelte';
	import DimensionPanel from '$lib/ideacad/solid/DimensionPanel.svelte';
	import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
	import { defaultPreferences } from '$lib/ideacad/solid/preferences';
	import { datumPlane, lift } from '$lib/ideacad/solid/sketch/model';
	import { emptyManifest, type BodyProjection, type Feature, type ModelProjection, type Selection, type SketchConstraint, type SketchEntity, type SketchProjection, type SolidCommand, type SolidManifest, type Vec3 } from '$lib/ideacad/solid/types';

	/* ------------------------------------------------------------------ the model, from its numbers */
	interface Params { w: number; h: number; depth: number; fillet: number; radius: number; hole: number; holeDepth: number }
	let params = $state<Params>({ w: 4, h: 3, depth: 1, fillet: 0.25, radius: 0.75, hole: 0.5, holeDepth: 0.5 });
	/** Where the hole is drilled into the top face, in world X and Y. */
	const HOLE_AT: [number, number] = [1, 1];
	const MESH = { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() };
	const SOLVED = { converged: true, classification: 'solved' as const, dof: 2, maxResidual: 0, trouble: [] };
	function rectEntities(p: Params): SketchEntity[] {
		return [{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: p.w, y: 0 }, { id: 'p2', type: 'point', x: p.w, y: p.h }, { id: 'p3', type: 'point', x: 0, y: p.h },
			{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }];
	}
	const rectConstraints = (p: Params): SketchConstraint[] => [{ id: 'k0', type: 'horizontal', line: 'l0' }, { id: 'k1', type: 'vertical', line: 'l1' }, { id: 'k2', type: 'horizontal', line: 'l2' }, { id: 'k3', type: 'vertical', line: 'l3' }, { id: 'kw', type: 'distance', a: 'p0', b: 'p1', value: p.w }, { id: 'kh', type: 'distance', a: 'p1', b: 'p2', value: p.h }];
	const circleEntities: SketchEntity[] = [{ id: 'c0', type: 'point', x: 6.5, y: 1.5 }, { id: 'c1', type: 'circle', center: 'c0', radius: 0.75 }];
	function manifestOf(p: Params): SolidManifest {
		return { ...emptyManifest(), title: 'Dimension harness', features: [
			{ id: 's1', name: 'Sketch 1', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: rectEntities(p), constraints: rectConstraints(p) },
			{ id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: p.depth, operation: 'new' },
			{ id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [{ body: 'x1#0', faces: ['x1.end', 'x1.side.0'], hint: { curve: 'line', mid: [p.w / 2, 0, p.depth], length: p.w } }], radius: p.fillet },
			{ id: 's2', name: 'Sketch 2', type: 'sketch', plane: { kind: 'datum', datum: 'XZ' }, entities: circleEntities.map((e) => (e.type === 'circle' ? { ...e, radius: p.radius } : e)), constraints: [{ id: 'kr', type: 'circleRadius', circle: 'c1', value: p.radius }] },
			{ id: 'h1', name: 'Hole 1', type: 'hole', face: { body: 'x1#0', name: 'x1.end', hint: { kind: 'plane', center: [p.w / 2, p.h / 2, p.depth], normal: [0, 0, 1], area: p.w * p.h } }, center: HOLE_AT, standard: 'custom', fit: 'custom', diameter: p.hole, depth: p.holeDepth }
		] };
	}
	function modelOf(p: Params, manifest: SolidManifest): ModelProjection {
		const top = datumPlane('XY'), front = datumPlane('XZ'), d = p.depth, z0 = Math.min(0, d), z1 = Math.max(0, d), k = p.fillet * (1 - Math.SQRT1_2);
		const face = (id: string, center: Vec3, normal: Vec3, kind = 'plane') => ({ id, kind, center, normal, area: 1, surface: {}, edges: [], ...MESH });
		const body: BodyProjection = { id: 'x1#0', name: 'Plate', materialId: null, role: 'part', createdBy: 'x1', volume: p.w * p.h * Math.abs(d), bounds: [0, 0, z0, p.w, p.h, z1], centerOfMass: [p.w / 2, p.h / 2, d / 2], inertia: [], mesh: MESH,
			faces: [face('x1.end', [p.w / 2, p.h / 2, d], [0, 0, Math.sign(d) || 1]), face('x1.side.0', [p.w / 2, 0, d / 2], [0, -1, 0]), face('f1.blend.x1.end|x1.side.0', [p.w / 2, k, d - k], [0, -Math.SQRT1_2, Math.SQRT1_2], 'cylinder'),
				face('h1.wall', [HOLE_AT[0] + p.hole / 2, HOLE_AT[1], d - p.holeDepth / 2], [1, 0, 0], 'cylinder'), face('h1.bottom', [HOLE_AT[0], HOLE_AT[1], d - p.holeDepth], [0, 0, 1])],
			edges: [{ id: 'edge:x1.end|x1.side.1', curve: 'line', points: new Float32Array([p.w, 0, d, p.w, p.h, d]), faces: ['x1.end', 'x1.side.1'], length: p.h, mid: [p.w, p.h / 2, d] },
				{ id: 'edge:h1.wall|x1.end', curve: 'CIRCLE', points: new Float32Array(Array.from({ length: 33 }, (_, i) => [HOLE_AT[0] + p.hole / 2 * Math.cos(i / 32 * Math.PI * 2), HOLE_AT[1] + p.hole / 2 * Math.sin(i / 32 * Math.PI * 2), d]).flat()), faces: ['h1.wall', 'x1.end'], length: Math.PI * p.hole, mid: [HOLE_AT[0] - p.hole / 2, HOLE_AT[1], d] }], vertices: [] };
		const s1 = manifest.features[0] as Extract<Feature, { type: 'sketch' }>, s2 = manifest.features[3] as Extract<Feature, { type: 'sketch' }>;
		const sketches: SketchProjection[] = [
			{ feature: 's1', name: 'Sketch 1', plane: top, planeRef: { kind: 'datum', datum: 'XY' }, entities: s1.entities, constraints: s1.constraints, solve: SOLVED, regions: [{ id: 'r0', outline: [[0, 0, 0], [p.w, 0, 0], [p.w, p.h, 0], [0, p.h, 0]], holes: [], area: p.w * p.h }], consumed: true },
			{ feature: 's2', name: 'Sketch 2', plane: front, planeRef: { kind: 'datum', datum: 'XZ' }, entities: s2.entities, constraints: s2.constraints, solve: SOLVED, regions: [{ id: 'r0', outline: Array.from({ length: 33 }, (_, i) => lift(front, [6.5 + p.radius * Math.cos(i / 32 * Math.PI * 2), 1.5 + p.radius * Math.sin(i / 32 * Math.PI * 2)])), holes: [], area: Math.PI * p.radius ** 2 }], consumed: false }
		];
		const row = (id: string, index: number, type: Feature['type'], name: string, bodies: string[] = [], dependsOn: string[] = []) => ({ id, index, type, name, status: 'ok' as const, summary: '', bodies, dependsOn, suppressed: false });
		return { bodies: [body], sketches, references: [], mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false,
			features: [row('s1', 0, 'sketch', 'Sketch 1'), row('x1', 1, 'extrude', 'Extrude 1', ['x1#0'], ['s1']), row('f1', 2, 'fillet', 'Fillet 1', ['x1#0'], ['x1']), row('s2', 3, 'sketch', 'Sketch 2'), row('h1', 4, 'hole', 'Hole 1', ['x1#0'], ['x1'])] };
	}
	const first = manifestOf(params);
	let manifest = $state.raw<SolidManifest>(first);
	let model = $state.raw<ModelProjection>(modelOf(params, first));
	function rebuild() { manifest = manifestOf(params); model = modelOf(params, manifest); }

	/* ------------------------------------------------------------------ the harness state */
	const query = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
	const scenario = query.get('state') ?? 'box';
	let selections = $state<Selection[]>([]), editingSketch = $state<string | null>(null), canWrite = $state(scenario !== 'readonly'), busy = $state(false);
	let error = $state(''), log = $state<string[]>([]);
	let prefs = $state.raw({ ...defaultPreferences(), units: { display: (scenario === 'mm' ? 'mm' : 'in') as 'in' | 'mm' } });
	function pick(what: string) {
		editingSketch = null; error = '';
		if (what === 'box' || what === 'mm' || what === 'readonly' || what === 'editing') selections = [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }];
		else if (what === 'sketch') { selections = [{ bodyId: '', kind: 'sketch', id: 's1' }]; editingSketch = 's1'; }
		else if (what === 'circle') selections = [{ bodyId: '', kind: 'sketch', id: 's2' }];
		else if (what === 'fillet') selections = [{ bodyId: 'x1#0', kind: 'feature', id: 'f1' }];
		else if (what === 'edge') selections = [{ bodyId: 'x1#0', kind: 'edge', id: 'edge:x1.end|x1.side.1' }];
		else if (what === 'hole') selections = [{ bodyId: 'x1#0', kind: 'feature', id: 'h1' }];
		else if (what === 'rim') selections = [{ bodyId: 'x1#0', kind: 'edge', id: 'edge:h1.wall|x1.end' }];
		else selections = [];
	}
	pick(scenario);

	/* ------------------------------------------------------------------ the camera: orthographic, like the viewport's */
	let area: HTMLDivElement | undefined = $state();
	let yaw = $state(-37.9), pitch = $state(35.3), zoom = $state(1), size = $state({ w: 800, h: 600 });
	const target: Vec3 = [3, 1.5, 0.5];
	const view = $derived.by(() => {
		const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
		/* The eye direction from the target, Z up; right and up are the screen axes. */
		const eye: Vec3 = [Math.cos(p) * Math.sin(-y), -Math.cos(p) * Math.cos(y), Math.sin(p)];
		const right: Vec3 = [Math.cos(y), -Math.sin(y), 0];
		const up: Vec3 = [eye[1] * right[2] - eye[2] * right[1], eye[2] * right[0] - eye[0] * right[2], eye[0] * right[1] - eye[1] * right[0]];
		const scale = Math.min(size.w, size.h) / 9 * zoom;
		return { right, up, scale };
	});
	/** World to area-local pixels. */
	function local(p: Vec3) { const d: Vec3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]], v = view; return { x: size.w / 2 + (d[0] * v.right[0] + d[1] * v.right[1] + d[2] * v.right[2]) * v.scale, y: size.h / 2 - (d[0] * v.up[0] + d[1] * v.up[1] + d[2] * v.up[2]) * v.scale }; }
	function setView(name: 'iso' | 'top' | 'front') { if (name === 'iso') { yaw = -37.9; pitch = 35.3; } else if (name === 'top') { yaw = 0; pitch = 89.999; } else { yaw = 0; pitch = 0; } }
	onMount(() => {
		const measure = () => { if (area) size = { w: area.clientWidth, h: area.clientHeight }; };
		measure(); const ro = new ResizeObserver(measure); if (area) ro.observe(area);
		(window as unknown as { ideaCadDims: unknown }).ideaCadDims = { get model() { return model; }, get manifest() { return manifest; }, get log() { return log; }, get error() { return error; }, get selections() { return selections; }, project: (p: Vec3) => api.project(p), pick, setView, zoomBy: (k: number) => { zoom *= k; }, orbit: (d: number) => { yaw += d; }, units: (u: 'in' | 'mm') => { prefs = { ...prefs, units: { display: u } }; }, set busy(v: boolean) { busy = v; } };
		return () => ro.disconnect();
	});
	/* A left drag on the scene turns the camera, which is the gesture the overlay steps aside for. */
	let turning: { x: number; y: number } | null = null;
	const down = (e: PointerEvent) => { if (e.button === 0) { turning = { x: e.clientX, y: e.clientY }; (e.currentTarget as Element).setPointerCapture(e.pointerId); } };
	const move = (e: PointerEvent) => { if (!turning) return; yaw += (e.clientX - turning.x) * 0.4; pitch = Math.max(-89.9, Math.min(89.9, pitch + (e.clientY - turning.y) * 0.4)); turning = { x: e.clientX, y: e.clientY }; };
	const up = () => { turning = null; };

	/* ------------------------------------------------------------------ the fake workspace */
	async function apply(command: SolidCommand, label: string) {
		if (!canWrite || busy) return;
		error = '';
		if (command.type !== 'set-feature') return;
		const f = manifest.features.find((x) => x.id === command.id); if (!f) return;
		const next = { ...f, ...command.patch } as Feature;
		/* The one refusal this stand-in engine makes, in the engine's own words (`features/core.ts`). */
		if (next.type === 'extrude' && Math.abs(next.distance) < 1e-9) { error = 'Pull the sketch to give it depth.'; return; }
		busy = true;
		await new Promise((r) => setTimeout(r, 30));
		if (next.type === 'extrude') params.depth = next.distance;
		else if (next.type === 'fillet') params.fillet = next.radius;
		else if (next.type === 'hole') { if (next.diameter !== undefined) params.hole = next.diameter; if (typeof next.depth === 'number') params.holeDepth = next.depth; }
		else if (next.type === 'sketch') for (const c of next.constraints) { if (c.id === 'kw' && c.type === 'distance') params.w = c.value; if (c.id === 'kh' && c.type === 'distance') params.h = c.value; if (c.id === 'kr' && c.type === 'circleRadius') params.radius = c.value; }
		rebuild(); log = [...log, label]; busy = false;
	}
	const api: WorkspaceApi = {
		get model() { return model; }, get manifest() { return manifest; }, get selections() { return selections; }, get canWrite() { return canWrite; }, get busy() { return busy; }, get tool() { return 'select' as const; }, get editingSketch() { return editingSketch; },
		get prefs() { return prefs; },
		apply, select: (s, append) => { selections = s ? (append ? [...selections, s] : [s]) : []; }, setTool: () => {}, editSketch: (id) => { editingSketch = id; }, setSketchPointer: () => {},
		request: async () => { throw Error('No kernel in this harness.'); },
		project: (p) => { const l = local(p), r = area?.getBoundingClientRect(); return { x: l.x + (r?.left ?? 0), y: l.y + (r?.top ?? 0) }; },
		error: (m) => { error = m; }, guide: () => {}, clearGuides: () => {}, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	};

	/* ------------------------------------------------------------------ the wireframe */
	const scene = $derived.by(() => {
		void view; void size;
		const p = params, d = p.depth, lines: { points: string; kind: string }[] = [];
		const path = (pts: Vec3[], kind: string) => lines.push({ points: pts.map((q) => { const s = local(q); return `${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(' '), kind });
		const c = (x: number, y: number, z: number): Vec3 => [x, y, z];
		for (const z of [0, d]) path([c(0, 0, z), c(p.w, 0, z), c(p.w, p.h, z), c(0, p.h, z), c(0, 0, z)], 'body');
		for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) path([c(x, y, 0), c(x, y, d)], 'body');
		/* The rounded edge, as an arc across the corner at each end and a line along it. */
		const r = p.fillet, arc = (x: number) => Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI / 2; return c(x, r - r * Math.sin(a), d - r + r * Math.cos(a)); });
		path(arc(0), 'blend'); path(arc(p.w), 'blend'); path([c(0, r - r * Math.SQRT1_2, d - r + r * Math.SQRT1_2), c(p.w, r - r * Math.SQRT1_2, d - r + r * Math.SQRT1_2)], 'blend');
		const ring = (z: number) => Array.from({ length: 33 }, (_, i) => c(HOLE_AT[0] + p.hole / 2 * Math.cos(i / 32 * Math.PI * 2), HOLE_AT[1] + p.hole / 2 * Math.sin(i / 32 * Math.PI * 2), z));
		path(ring(d), 'body'); path(ring(d - p.holeDepth), 'blend');
		const front = datumPlane('XZ');
		path(Array.from({ length: 49 }, (_, i) => lift(front, [6.5 + p.radius * Math.cos(i / 48 * Math.PI * 2), 1.5 + p.radius * Math.sin(i / 48 * Math.PI * 2)])), 'sketch');
		return lines;
	});
	const choices = ['box', 'sketch', 'circle', 'fillet', 'hole', 'edge', 'rim', 'none'];
</script>

<svelte:head><title>IdeaCAD dimensions · Development</title></svelte:head>
<main class="ic-root harness" data-state={scenario}>
	<nav class="controls" aria-label="Harness">
		{#each choices as c (c)}<button class:active={(c === 'sketch' && editingSketch) || (c !== 'sketch' && selections[0] && ((c === 'box' && selections[0].kind === 'body') || (c === 'circle' && selections[0].id === 's2') || (c === 'fillet' && selections[0].id === 'f1') || (c === 'hole' && selections[0].id === 'h1') || (c === 'edge' && selections[0].id === 'edge:x1.end|x1.side.1') || (c === 'rim' && selections[0].id === 'edge:h1.wall|x1.end'))) || (c === 'none' && !selections.length)} onclick={() => pick(c)}>{c}</button>{/each}
		<button onclick={() => setView('iso')}>Iso</button><button onclick={() => setView('top')}>Top</button><button onclick={() => setView('front')}>Front</button>
		<button onclick={() => (zoom *= 1.25)} aria-label="Zoom in">+</button><button onclick={() => (zoom /= 1.25)} aria-label="Zoom out">−</button>
		<button onclick={() => { prefs = { ...prefs, units: { display: prefs.units.display === 'mm' ? 'in' : 'mm' } }; }}>{prefs.units.display}</button>
	</nav>
	<div class="workarea" bind:this={area}>
		<svg class="scene" role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
			{#each scene as l, i (i)}<polyline class={l.kind} points={l.points} />{/each}
		</svg>
		<DimensionOverlay {api} />
		<div class="panels"><DimensionPanel {api} /></div>
		{#if error}<div class="error" role="alert">{error}</div>{/if}
		<output class="log" data-testid="harness-log">{log.join(' · ')}</output>
	</div>
</main>

<style>
	:global(html),:global(body){width:100%;height:100%;overflow:hidden}
	main{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;margin:0;padding:0;display:grid;grid-template-rows:auto minmax(0,1fr);background:var(--surface-0,#15191d);color:var(--text-1);z-index:50}
	.controls{display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;background:var(--surface-1);border-bottom:1px solid var(--hairline)}
	.controls button{padding:0 12px}.controls button.active{border-color:var(--green);color:var(--green)}
	.workarea{position:relative;min-height:0;overflow:hidden}
	.scene{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
	.scene polyline{fill:none;stroke-width:1.5}.scene .body{stroke:var(--text-2)}.scene .blend{stroke:var(--text-3)}.scene .sketch{stroke:var(--cyan);stroke-dasharray:5 3}
	.panels{position:absolute;right:12px;top:12px;bottom:12px;width:260px;overflow:auto;z-index:7;display:flex;flex-direction:column;gap:8px;pointer-events:none}.panels>:global(*){pointer-events:auto}
	.panels :global(.panel){padding:10px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px}
	.error{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:9;padding:10px 14px;background:var(--surface-2);border:1px solid var(--amber);border-radius:6px;font-size:15px}
	.log{position:absolute;left:12px;bottom:12px;z-index:8;font:12px var(--font-mono,monospace);color:var(--text-2)}
	@media(max-width:700px){.panels{top:auto;left:8px;right:8px;width:auto;height:38%}}
</style>
