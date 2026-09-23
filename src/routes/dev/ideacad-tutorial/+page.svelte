<!--
  THE LEARNING HARNESS: the REAL `Tutorial` panel and the REAL `ToolButton`s
  (their cards, their moving pictures and their first-use hints) around a
  stand-in for the viewport. The "Pretend" buttons change a fake model the way
  a student's gesture would, so a step can be seen to move on and a hint to
  retire; the tool buttons arm a tool exactly as the palette does. Preferences
  are a real `MemoryPreferenceStore`, so what the tutorial stores is what the
  workspace would store. `window.ideaCadTutorial` reads state for the browser
  spec. No auth, no Supabase, no kernel; 404 in production (`+page.ts`).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/ideacad/ideacad.css';
	import ToolButton from '$lib/ideacad/solid/ToolButton.svelte';
	import Tutorial from '$lib/ideacad/solid/learn/Tutorial.svelte';
	import { firstUseHint, retireAfterUse } from '$lib/ideacad/solid/learn/hints';
	import { tutorialFacts } from '$lib/ideacad/solid/learn/tutorial';
	import { commandById, keyLabel } from '$lib/ideacad/solid/command-registry';
	import { MemoryPreferenceStore } from '$lib/ideacad/solid/preferences';
	import type { Feature, FeatureRow, ModelProjection, SketchProjection } from '$lib/ideacad/solid/types';
	import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
	import type { Tool } from '$lib/ideacad/solid/viewport';
	const store = new MemoryPreferenceStore();
	let prefs = $state.raw(store.current);
	store.subscribe((p) => (prefs = p));
	const PALETTE: Tool[] = ['select', 'rectangle', 'circle', 'line', 'extrude', 'fillet', 'move'];
	/* Folded under More, as in the workspace: the tutorial rings More for a tool it names that is not on the palette. */
	const MORE: Tool[] = ['mate', 'measure'];
	let more = $state(false);
	let tool = $state<Tool>('select');
	let features = $state.raw<Feature[]>([]);
	let model = $state.raw<ModelProjection>({ bodies: [], sketches: [], references: [], features: [], mates: [], addons: {} as ModelProjection['addons'], operationMs: 0, canUndo: false, canRedo: false });
	let open = $state(true);
	const plane = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] } as SketchProjection['plane'];
	const solved = { converged: true, classification: 'solved', dof: 0, maxResidual: 0, trouble: [] } as SketchProjection['solve'];
	const rowOf = (f: Feature): FeatureRow => ({ id: f.id, index: features.length, type: f.type, name: f.name, status: 'ok', summary: '', bodies: [], dependsOn: [], suppressed: false });
	/** One pretend gesture: the feature it adds, and whatever it adds to the projection. The armed tool's hint retires, as the workspace retires it. */
	function add(f: Feature, extra: Partial<ModelProjection> = {}) {
		const before = features;
		features = [...features, f];
		model = { ...model, ...extra, features: [...model.features, rowOf(f)] };
		const retired = retireAfterUse(prefs.hints.retired, tool, before, features);
		if (retired !== prefs.hints.retired) store.set('hints', { ...prefs.hints, retired: [...retired] });
	}
	let n = 0;
	const next = (p: string) => `${p}${++n}`;
	function sketch(entities: SketchProjection['entities'], planeRef: SketchProjection['planeRef']) {
		const id = next('s');
		add({ id, name: `Sketch ${n}`, type: 'sketch', plane: planeRef as never, entities, constraints: [] }, { sketches: [...model.sketches, { feature: id, name: `Sketch ${n}`, plane, planeRef, entities, constraints: [], solve: solved, regions: [], consumed: false }] });
	}
	const PRETEND: { word: string; run: () => void }[] = [
		{ word: 'Draw a rectangle', run: () => sketch([{ id: 'a', type: 'point', x: 0, y: 0 }, { id: 'b', type: 'point', x: 2, y: 0 }, { id: 'c', type: 'point', x: 2, y: 1 }, { id: 'd', type: 'point', x: 0, y: 1 }, { id: 'l1', type: 'line', a: 'a', b: 'b' }, { id: 'l2', type: 'line', a: 'b', b: 'c' }, { id: 'l3', type: 'line', a: 'c', b: 'd' }, { id: 'l4', type: 'line', a: 'd', b: 'a' }], { kind: 'datum', datum: 'XY' }) },
		{ word: 'Pull it up', run: () => { const id = next('e'); add({ id, name: `Extrude ${n}`, type: 'extrude', sketch: 's1', distance: 1, operation: 'new' }, { bodies: [...model.bodies, { id: `${id}#0` } as ModelProjection['bodies'][number]] }); } },
		{ word: 'Round an edge', run: () => add({ id: next('f'), name: `Fillet ${n}`, type: 'fillet', edges: [], radius: 0.125 }) },
		{ word: 'Circle on a face', run: () => sketch([{ id: 'c', type: 'point', x: 0, y: 0 }, { id: 'k', type: 'circle', center: 'c', radius: 0.25 }], { kind: 'face', face: { feature: 'e2', role: 'end' } } as unknown as SketchProjection['planeRef']) },
		{ word: 'Cut it', run: () => add({ id: next('e'), name: `Cut ${n}`, type: 'extrude', sketch: 's4', distance: -0.5, operation: 'cut' }) },
		{ word: 'Second body', run: () => { const id = next('e'); add({ id, name: `Extrude ${n}`, type: 'extrude', sketch: 's1', distance: 1, operation: 'new' }, { bodies: [...model.bodies, { id: `${id}#0` } as ModelProjection['bodies'][number]] }); } },
		{ word: 'Mate', run: () => { const id = next('m'); add({ id, name: `Mate ${n}`, type: 'mate', kind: 'coincident', a: {} as never, b: {} as never }, { mates: [...model.mates, { feature: id, kind: 'coincident', a: {} as never, b: {} as never, status: 'ok' }] }); } }
	];
	const api = {
		get model() { return model; }, get manifest() { return { features } as unknown as WorkspaceApi['manifest']; }, get selections() { return []; }, get canWrite() { return true; }, get busy() { return false; }, get tool() { return tool; }, get editingSketch() { return null; },
		get prefs() { return prefs; }, setPreference: (group, value) => store.set(group, value), runCommand: (id) => { const c = commandById(id); if (c?.tool) tool = c.tool; },
		apply: async () => {}, select: () => {}, setTool: (t) => { tool = t; }, editSketch: () => {}, setSketchPointer: () => {}, request: async () => ({}) as never, project: () => ({ x: 0, y: 0 }), error: () => {}, guide: () => {}, clearGuides: () => {}, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	} satisfies WorkspaceApi as WorkspaceApi;
	const keyFor = (id: string) => { const k = commandById(id)?.keys?.[0]; return k ? keyLabel(k) : ''; };
	onMount(() => { (window as unknown as { ideaCadTutorial: unknown }).ideaCadTutorial = { get prefs() { return prefs; }, get tool() { return tool; }, get facts() { return tutorialFacts(model, features, tool); }, setDelay: (ms: number) => store.set('hints', { ...prefs.hints, tooltipDelayMs: ms }) }; });
</script>
<svelte:head><title>IdeaCAD learning · Development</title></svelte:head>
<main class="ic-root harness" style:--ic-tip-delay={`${prefs.hints.tooltipDelayMs}ms`}>
	<nav class="tools" aria-label="Tools">
		{#each PALETTE as id (id)}{@const c = commandById(id)!}<ToolButton name={keyFor(id) ? `${c.name} (${keyFor(id)})` : c.name} description={c.description} icon={c.icon} active={tool === id} hint={firstUseHint(id, prefs.hints.retired)} onclick={() => (tool = id)} />{/each}
		{#if more}{#each MORE as id (id)}{@const c = commandById(id)!}<ToolButton name={c.name} description={c.description} icon={c.icon} active={tool === id} hint={firstUseHint(id, prefs.hints.retired)} onclick={() => (tool = id)} />{/each}{/if}
		<button type="button" class="more" data-more-tools aria-label={more ? 'Fewer tools' : 'More tools'} aria-expanded={more} onclick={() => (more = !more)}>{more ? '−' : '⋯'}</button>
	</nav>
	<section class="stage" aria-label="Stand-in viewport" data-testid="tutorial-stage">
		<p class="facts">Tool <b>{tool}</b> · {model.sketches.length} sketches · {model.bodies.length} bodies · {model.mates.length} mates · {prefs.hints.retired.length} hints retired</p>
		<div class="pretend">{#each PRETEND as p (p.word)}<button type="button" onclick={p.run}>{p.word}</button>{/each}{#if !open}<button type="button" onclick={() => (open = true)} data-testid="tutorial-open">Help</button>{/if}</div>
	</section>
	<aside class="panels">{#if open}<Tutorial {api} onclose={() => (open = false)} />{/if}</aside>
</main>
<style>
	:global(html), :global(body) { margin: 0; height: 100%; }
	main { position: fixed; inset: 0; z-index: 50; display: grid; grid-template-columns: auto minmax(0, 1fr) 260px; max-width: none; margin: 0; padding: 0; background: var(--bg0); }
	.tools { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-right: 1px solid var(--hairline); }
	.stage { min-width: 0; padding: 16px; font: 15px/1.3 Rajdhani, sans-serif; color: var(--text-1); }
	.facts { margin: 0 0 12px; }
	.more { width: 44px; height: 44px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-2); font-size: 22px; }
	.pretend { display: flex; flex-wrap: wrap; gap: 6px; }
	.pretend button { min-height: 44px; padding: 4px 12px; border: 1px dashed var(--boundary); border-radius: 4px; background: transparent; color: var(--text-2); font: 15px Rajdhani, sans-serif; }
	.panels { padding: 12px; border-left: 1px solid var(--hairline); overflow: auto; }
	@media (max-width: 700px) {
		main { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr) auto; }
		.panels { order: -1; border: 0; border-bottom: 1px solid var(--hairline); }
		.tools { order: 2; flex-direction: row; overflow-x: auto; border: 0; border-top: 1px solid var(--hairline); padding-bottom: 60px; }
	}
</style>
