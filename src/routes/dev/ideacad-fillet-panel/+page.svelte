<script lang="ts">
	/**
	 * THE FILLET PANEL'S REFUSALS, WITH THE HELP THE ENGINE WILL CARRY. A
	 * development harness (404 in production) that mounts the REAL
	 * `FeaturePanel` over `fixture.json`: projections, feature rows and the
	 * `help` the real fillet executor threw, recorded from the real engine and
	 * kernel (`features/blends.ts`), meshes left out because the panel reads
	 * none of them.
	 *
	 * WHY IT EXISTS: until the engine copies a refusal's `help` onto its feature
	 * row (a request to the modeler's single writer), `/dev/ideacad-solid`
	 * shows the sentence and only the size fix the sentence itself names. This
	 * page shows the rest of what a refused round offers: adding the edges to
	 * the round they meet, and leaving out the ones that run into it.
	 *
	 * `?state=edge` (a box with one edge picked), `merge` (the four top edges
	 * after one was rounded) or `corner` (three top edges beside a 0.999 in
	 * round). The column copies the modeler's panel column: 260 px on the
	 * right above 700 px, the width less 8 px each side below it. A pressed
	 * control is listed under the column with the commands it sent.
	 */
	import { onMount } from 'svelte';
	import FeaturePanel from '$lib/ideacad/solid/FeaturePanel.svelte';
	import '$lib/ideacad/ideacad.css';
	import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
	import type { BodyProjection, FeatureRow, ModelProjection, Selection, SolidCommand, SolidManifest } from '$lib/ideacad/solid/types';
	import type { Tool } from '$lib/ideacad/solid/viewport';
	import fixture from './fixture.json';
	type Lean = { rows: FeatureRow[]; manifest: SolidManifest; body: Omit<BodyProjection, 'faces' | 'edges'> & { faces: Record<string, unknown>[]; edges: (Record<string, unknown> & { points: number[] })[] }; selections: Selection[] };
	const STATES = fixture as unknown as Record<'edge' | 'merge' | 'corner', Lean>;
	const empty = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
	function body(l: Lean): BodyProjection {
		return { ...l.body, materialId: null, role: 'part', volume: 0, centerOfMass: [0, 0, 0], inertia: [], mesh: empty(), vertices: [], faces: l.body.faces.map((f) => ({ ...f, ...empty(), surface: {} })) as BodyProjection['faces'], edges: l.body.edges.map((e) => ({ ...e, points: new Float32Array(e.points) })) as BodyProjection['edges'] } as BodyProjection;
	}
	let name = $state<'edge' | 'merge' | 'corner'>('edge'), ready = $state(false);
	let selections = $state<Selection[]>([]), tool = $state<Tool>('fillet'), error = $state(''), applied = $state<{ label: string; command: SolidCommand }[]>([]), hovered = $state(0);
	const current = $derived(STATES[name]);
	const model = $derived<ModelProjection>({ bodies: [body(current)], sketches: [], references: [], features: current.rows, mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 } as ModelProjection);
	const api: WorkspaceApi = {
		get model() { return model; }, get manifest() { return current.manifest; }, get selections() { return selections; }, get canWrite() { return true; }, get busy() { return false; }, get tool() { return tool; }, get editingSketch() { return null; },
		apply: async (command, label) => { applied = [...applied, { label, command }]; },
		select: (s, append) => { if (!s) selections = []; else if (!append) selections = [s]; else selections = selections.some((x) => x.id === s.id && x.kind === s.kind) ? selections.filter((x) => !(x.id === s.id && x.kind === s.kind)) : [...selections, s]; },
		setTool: (t) => { tool = t; }, editSketch: () => {}, setSketchPointer: () => {},
		request: async () => { throw Error('No worker in this harness.'); }, project: () => ({ x: 0, y: 0 }), error: (m) => { error = m; }, guide: () => {}, clearGuides: () => {}, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null,
		hover: (list) => { hovered = list?.length ?? 0; }
	};
	onMount(() => { const q = new URLSearchParams(location.search).get('state'); if (q === 'merge' || q === 'corner' || q === 'edge') name = q; selections = [...STATES[name].selections]; ready = true; });
</script>
<svelte:head><title>IdeaCAD fillet panel · Development</title></svelte:head>
<main class="ic-root" data-testid="ideacad-fillet-harness" data-state={name} data-ready={ready}>
	<div class="column">{#if ready}<FeaturePanel {api} />{/if}</div>
	<aside class="log" aria-label="Harness log"><p data-testid="harness-hovered">lit {hovered}</p>{#if error}<p data-testid="harness-error">{error}</p>{/if}<ol data-testid="harness-applied">{#each applied as a, i (i)}<li>{a.label}: {a.command.type}{'id' in a.command ? ` ${a.command.id}` : ''}</li>{/each}</ol></aside>
</main>
<style>
	:global(html),:global(body){width:100%;height:100%;overflow:hidden}
	main{position:fixed;inset:0;background:var(--surface-0);color:var(--text-1);font-family:Rajdhani,sans-serif;z-index:50}
	/* The modeler's panel column, copied: `SolidWorkspace.svelte`'s `.panels` and its `.panel` card. */
	.column{position:absolute;right:12px;top:68px;bottom:12px;width:260px;display:flex;flex-direction:column;gap:8px;overflow:auto}
	.column :global(.panel){padding:10px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px}
	.log{position:absolute;left:12px;top:68px;max-width:40%;font:13px 'Share Tech Mono',monospace;color:var(--text-2)}.log ol{margin:0;padding-left:18px}
	@media(max-width:700px){.column{right:8px;left:8px;top:112px;bottom:80px;width:auto}.log{top:8px;max-width:none;right:8px}}
</style>
