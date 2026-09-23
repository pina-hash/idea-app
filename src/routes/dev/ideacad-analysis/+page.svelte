<!--
  THE ANALYSIS PANEL HARNESS: the REAL `AnalysisPanel` over a fake
  `WorkspaceApi` holding the representative robot in `analysis/sample.ts`
  (an aluminum chassis, a steel weapon disk on its motor, two wheels and a
  skid). No kernel, no worker, no auth; 404 in production (`+page.ts`).

  The panel sits where the workspace puts every panel: a 260px column on the
  right above 700px, the full width with an 8px gutter below it. The area to
  its left stands in for the viewport and draws a TOP VIEW of the bodies and of
  every guide the panel sends through `api.guide`, so a screenshot shows the
  CG, its footprint and the edge it tips over first.

  States, from the bar or the query string: `?state=printed` (the everyday
  robot, whose CG is Unknown), `?select=disk` or `?select=bore` (a selection on
  the weapon), `?spinner=1` (the spinner add-on on), `?state=spinner` (both of
  the last two at once), `?frc=1` or `?state=frc` (the FRC checks add-on on,
  the second with a wheel's round face selected), `?interference=off` (a
  workspace whose worker has no interference request), `?readonly=1`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/ideacad/ideacad.css';
	import AnalysisPanel from '$lib/ideacad/solid/AnalysisPanel.svelte';
	import { SAMPLE_INTERFERENCE, sampleModel, type SampleState } from '$lib/ideacad/solid/analysis/sample';
	import { SPINNER_ADDON_ID } from '$lib/ideacad/solid/addons/spinner';
	import { FRC_ADDON_ID } from '$lib/ideacad/solid/addons/frc';
	import { emptyManifest, type ModelProjection, type Selection, type SolidCommand, type Vec3 } from '$lib/ideacad/solid/types';
	import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';

	type Pick = 'none' | 'disk' | 'bore' | 'wheel';
	/* Read once, before the panel mounts: the panel asks for interference on its first effect, which runs before this page's onMount. */
	const query = page.url.searchParams;
	/* `?state=spinner` is the add-on on with the bore selected, one word for the route spec's own path. */
	const spinnerState = query.get('state') === 'spinner', frcState = query.get('state') === 'frc';
	const firstPick: Pick = query.get('select') === 'disk' ? 'disk' : query.get('select') === 'bore' || spinnerState ? 'bore' : query.get('select') === 'wheel' || frcState ? 'wheel' : 'none';
	const firstMaterials: SampleState = query.get('state') === 'printed' ? 'printed' : 'cited';
	let materials = $state<SampleState>(firstMaterials);
	let pick = $state<Pick>(firstPick);
	const firstSpinner = query.get('spinner') === '1' || spinnerState, firstFrc = query.get('frc') === '1' || frcState;
	let spinner = $state(firstSpinner);
	let frc = $state(firstFrc);
	const interference = query.get('interference') !== 'off';
	const readOnly = query.get('readonly') === '1';
	let ready = $state(false);
	const addonsFor = (s: boolean, f: boolean) => ({ ...(s ? { [SPINNER_ADDON_ID]: true } : {}), ...(f ? { [FRC_ADDON_ID]: true } : {}) });
	let model = $state.raw<ModelProjection>(sampleModel(firstMaterials, addonsFor(firstSpinner, firstFrc)));
	let guides = $state<{ points: Vec3[]; color?: string }[]>([]);
	const applied: { command: SolidCommand; label: string }[] = [];
	const requests: string[] = [];

	const PICKS: Record<Pick, Selection[]> = { none: [], disk: [{ bodyId: 'disk#0', kind: 'body', id: 'disk#0' }], bore: [{ bodyId: 'disk#0', kind: 'face', id: 'disk.bore' }], wheel: [{ bodyId: 'wheel-l#0', kind: 'face', id: 'wheel-l.outer' }] };
	let selections = $state<Selection[]>([...PICKS[firstPick]]);
	function rebuild() { model = sampleModel(materials, addonsFor(spinner, frc)); }
	function setState(next: SampleState) { materials = next; rebuild(); }
	function setPick(next: Pick) { pick = next; selections = [...PICKS[next]]; }
	function setSpinner(on: boolean) { spinner = on; rebuild(); }
	function setFrc(on: boolean) { frc = on; rebuild(); }

	const api: WorkspaceApi = {
		get model() { return model; }, get manifest() { return emptyManifest(); }, get selections() { return selections; }, get canWrite() { return !readOnly; }, get busy() { return false; }, get tool() { return 'select' as const; }, get editingSketch() { return null; },
		async apply(command, label) {
			applied.push({ command, label });
			if (command.type === 'metadata') model = { ...model, bodies: model.bodies.map((b) => (b.id === command.bodyId ? { ...b, ...(command.materialId !== undefined ? { materialId: command.materialId } : {}), ...(command.massG !== undefined ? { massG: command.massG } : {}) } : b)) };
		},
		select(selection, append) { selections = selection ? (append ? [...selections, selection] : [selection]) : []; },
		setTool() {}, editSketch() {}, setSketchPointer() {},
		async request<T>(method: string): Promise<T> {
			requests.push(method);
			if (method !== 'interference' || !interference) throw Error('Unknown geometry operation.');
			const start = performance.now();
			await new Promise((resolve) => setTimeout(resolve, 60));
			return { ...structuredClone(SAMPLE_INTERFERENCE), ms: performance.now() - start } as T;
		},
		project: () => ({ x: 0, y: 0 }), error() {},
		guide(points, color) { guides = [...guides, { points: points.map((p) => [...p] as Vec3), color }]; },
		clearGuides() { guides = []; },
		clip() {}, lookAt() {}, fit() {}, unproject: () => null
	};

	onMount(() => {
		(window as unknown as { ideaCadAnalysis: unknown }).ideaCadAnalysis = { get guides() { return guides; }, get applied() { return applied; }, get requests() { return requests; }, get selections() { return selections; }, setState, setPick, setSpinner, setFrc };
		ready = true;
	});

	/* The top view: X right, Y up, fitted to the bodies with a margin. */
	const VIEW = { w: 400, h: 300 };
	const frame = $derived.by(() => {
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (const b of model.bodies) { x0 = Math.min(x0, b.bounds[0]); y0 = Math.min(y0, b.bounds[1]); x1 = Math.max(x1, b.bounds[3]); y1 = Math.max(y1, b.bounds[4]); }
		const k = Math.min(VIEW.w / (x1 - x0 + 2), VIEW.h / (y1 - y0 + 2));
		return { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
	});
	const sx = (x: number) => VIEW.w / 2 + (x - frame.cx) * frame.k;
	const sy = (y: number) => VIEW.h / 2 - (y - frame.cy) * frame.k;
</script>

<svelte:head><title>IdeaCAD analysis · Development</title></svelte:head>
<main class="ic-root harness" data-ready={ready}>
	<div class="bar" role="group" aria-label="Harness state">
		<button type="button" aria-pressed={materials === 'cited'} onclick={() => setState('cited')}>Cited</button>
		<button type="button" aria-pressed={materials === 'printed'} onclick={() => setState('printed')}>Printed</button>
		<button type="button" aria-pressed={pick === 'none'} onclick={() => setPick('none')}>No pick</button>
		<button type="button" aria-pressed={pick === 'disk'} onclick={() => setPick('disk')}>Disk</button>
		<button type="button" aria-pressed={pick === 'bore'} onclick={() => setPick('bore')}>Bore</button>
		<button type="button" aria-pressed={pick === 'wheel'} onclick={() => setPick('wheel')}>Wheel</button>
		<button type="button" aria-pressed={spinner} onclick={() => setSpinner(!spinner)}>Spinner</button>
		<button type="button" aria-pressed={frc} onclick={() => setFrc(!frc)}>FRC</button>
	</div>
	<div class="view" aria-hidden="true">
		<svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet">
			{#each model.bodies as b (b.id)}
				{@const round = b.faces.find((f) => f.kind === 'cylinder' && f.id.endsWith('.outer'))}
				{#if round && (round.surface.axis as number[])[2] === 1}
					<circle cx={sx((b.bounds[0] + b.bounds[3]) / 2)} cy={sy((b.bounds[1] + b.bounds[4]) / 2)} r={((b.bounds[3] - b.bounds[0]) / 2) * frame.k} class="body" class:picked={selections.some((s) => s.bodyId === b.id)} />
				{:else}
					<rect x={sx(b.bounds[0])} y={sy(b.bounds[4])} width={(b.bounds[3] - b.bounds[0]) * frame.k} height={(b.bounds[4] - b.bounds[1]) * frame.k} class="body" class:picked={selections.some((s) => s.bodyId === b.id)} />
				{/if}
			{/each}
			{#each guides as g, i (i)}<polyline points={g.points.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} style:stroke={g.color ?? 'var(--text-1)'} class="guide" />{/each}
		</svg>
	</div>
	<div class="panels"><AnalysisPanel {api} /></div>
</main>

<style>
	:global(html), :global(body) { width: 100%; height: 100%; overflow: hidden; }
	main { position: fixed; inset: 0; max-width: none; margin: 0; padding: 0; z-index: 50; }
	.bar { position: absolute; top: 12px; left: 12px; right: 284px; display: flex; flex-wrap: wrap; gap: 6px; z-index: 8; }
	.bar button { min-height: 44px; padding: 4px 12px; }
	.view { position: absolute; left: 12px; top: 124px; right: 284px; bottom: 64px; display: grid; place-items: center; }
	svg { width: 100%; height: 100%; }
	.body { fill: var(--ic-control); stroke: var(--ic-edge); stroke-width: 1; }
	.body.picked { stroke: var(--ic-accent); stroke-width: 2; }
	.guide { fill: none; stroke-width: 2; }
	/* The workspace's own panel column: 260px on the right, 68px down (`SolidWorkspace.svelte`), and full width below 700px. */
	.panels { position: absolute; right: 12px; top: 68px; bottom: 64px; width: 260px; display: flex; flex-direction: column; gap: 8px; overflow: auto; z-index: 7; }
	/* The one rule the workspace gives every panel (`:global(.solid-workspace .panel)`); a panel styles its own heading. */
	.panels :global(.panel) { padding: 10px; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 7px; }
	@media (max-width: 700px) {
		.bar { right: 8px; left: 8px; top: 8px; }
		.view { left: 8px; right: 8px; top: 120px; height: 200px; bottom: auto; }
		.panels { right: 8px; left: 8px; top: 330px; bottom: 80px; width: auto; }
	}
</style>
