<!--
  THE DESIGN TREE HARNESS: the REAL `FeatureTree` over an in-memory workspace
  (`tree/memory.svelte.ts`) holding a motor bracket, answered by the real
  reducer, with every optional member the tree lights a control for: hover both
  ways and the rollback bar. The rail is the workspace's own width (260px above
  1024px, the 300px slide-over below it) inside `.ic-root`, so the tree is
  measured in the room it ships in. The buttons at the right stand in for the
  viewport: each tells the tree the pointer is over a piece of geometry.
  No auth, no Supabase, no kernel; 404 in production (`+page.ts`).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/ideacad/ideacad.css';
	import FeatureTree from '$lib/ideacad/solid/FeatureTree.svelte';
	import { createMemoryTreeApi } from '$lib/ideacad/solid/tree/memory.svelte';
	import type { Selection } from '$lib/ideacad/solid/types';
	const memory = createMemoryTreeApi();
	const api = memory.api;
	const hovers: { label: string; selection: Selection | null }[] = [
		{ label: 'Fillet 1 face', selection: { bodyId: 'base#0', kind: 'face', id: 'fil.blend.base.end|up.side.0' } },
		{ label: 'Plate top edge', selection: { bodyId: 'base#0', kind: 'edge', id: 'edge:base.end|base.side.0' } },
		{ label: 'Sketch 3', selection: { bodyId: '', kind: 'sketch', id: 'sk3' } },
		{ label: 'Top Plane', selection: { bodyId: '', kind: 'reference', id: 'datum:XY' } },
		{ label: 'Nothing', selection: null }
	];
	onMount(() => { (window as unknown as { ideaCadTree: unknown }).ideaCadTree = memory; });
	const words = (s: Selection[] | null) => (s ? s.map((x) => `${x.kind}:${x.id}`).join(', ') : 'none');
</script>
<svelte:head><title>IdeaCAD design tree · Development</title></svelte:head>
<main class="ic-root">
	<aside class="rail" aria-label="Design tree rail"><FeatureTree {api} /></aside>
	<section class="side" aria-label="Harness state">
		<h1>Design tree harness</h1>
		<dl>
			<dt>Selected</dt><dd data-testid="harness-selected">{words(api.selections)}</dd>
			<dt>Hovered</dt><dd data-testid="harness-hovered">{words(memory.hovered)}</dd>
			<dt>Rollback</dt><dd data-testid="harness-rollback">{api.rollbackIndex ?? 'end'}</dd>
			<dt>Editing</dt><dd>{api.editingSketch ?? 'none'}</dd>
			<dt>Order</dt><dd data-testid="harness-order">{api.manifest.features.map((f) => f.id).join(' ')}</dd>
		</dl>
		{#if memory.error}<p class="error" role="alert" data-testid="harness-error">{memory.error}</p>{/if}
		<div class="point" role="group" aria-label="Pointer over">
			{#each hovers as h (h.label)}<button type="button" onclick={() => memory.pointAt(h.selection)}>{h.label}</button>{/each}
		</div>
		<ol class="log" data-testid="harness-log">{#each memory.log as line, i (i)}<li>{line}</li>{/each}</ol>
	</section>
</main>
<style>
	:global(html), :global(body) { margin: 0; height: 100%; }
	main { position: fixed; inset: 0; z-index: 50; display: grid; grid-template-columns: 260px minmax(0, 1fr); max-width: none; margin: 0; padding: 0; min-height: 0; }
	.rail { min-height: 0; display: flex; flex-direction: column; background: var(--surface-1); border-right: 1px solid var(--hairline); overflow: hidden; }
	.side { min-width: 0; overflow: auto; padding: 16px; font: 14px/1.4 Rajdhani, sans-serif; color: var(--text-1); }
	h1 { font-size: 18px; margin: 0 0 8px; }
	dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0 0 12px; }
	dt { font: 11px 'Share Tech Mono', monospace; text-transform: uppercase; color: var(--text-2); }
	dd { margin: 0; font: 13px 'Share Tech Mono', monospace; overflow-wrap: anywhere; }
	.error { color: var(--ic-fail-ink); margin: 0 0 12px; }
	.point { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
	.point button { padding: 0 10px; }
	.log { margin: 0; padding-left: 18px; font: 12px 'Share Tech Mono', monospace; color: var(--text-2); }
	@media (max-width: 1023px) { main { grid-template-columns: min(300px, 80vw) minmax(0, 1fr); } }
</style>
