<script lang="ts">
	/**
	 * THE SKETCH EDITOR PANEL: the entities and dimensions of the sketch open
	 * for editing, its solve status in words, and the sketch tools.
	 *
	 * THIS COMPONENT IS THE SKETCHING SURFACE'S TO REPLACE. The spine version
	 * shows the open sketch's status and offers Done, so a sketch reopened from
	 * the tree can be closed again.
	 */
	import type { WorkspaceApi } from './workspace-api';
	let { api }: { api: WorkspaceApi } = $props();
	const sketch = $derived(api.model.sketches.find((s) => s.feature === api.editingSketch));
	const words: Record<string, string> = { solved: 'Fully defined', underConstrained: 'Under defined', redundant: 'Over defined', unsatisfied: 'Cannot be solved', unsolved: 'Not solved' };
</script>
{#if sketch}
	<section class="sketch-editor panel" aria-label="Sketch editor" data-testid="ideacad-sketch-editor">
		<h2>{sketch.name}</h2>
		<p class="status" role="status">{words[sketch.solve.classification] ?? sketch.solve.classification}{sketch.solve.dof ? ` · ${sketch.solve.dof} free` : ''}</p>
		<p class="count">{sketch.entities.filter((e) => e.type !== 'point').length} entities · {sketch.constraints.length} constraints · {sketch.regions.length} closed {sketch.regions.length === 1 ? 'region' : 'regions'}</p>
		<button onclick={() => api.editSketch(null)}>Done</button>
	</section>
{/if}
<style>
	.sketch-editor{display:grid;gap:8px}h2{margin:0;font-size:18px}.status,.count{margin:0;color:var(--text-2);font-size:14px}button{min-height:44px;border:1px solid var(--green);border-radius:5px;background:var(--surface-0);color:var(--green);font:600 16px Rajdhani,sans-serif;cursor:pointer}
</style>
