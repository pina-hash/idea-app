<script lang="ts">
	/**
	 * MATES: create one between two selected entities, list the document's
	 * mates with their status, and set a distance or angle exactly.
	 *
	 * THIS COMPONENT IS THE MATE SURFACE'S TO REPLACE, together with
	 * `features/mate.ts` (the solver) and the magnetic snap in the viewport.
	 * The spine version lists what the document has and says the solver is
	 * not built yet, in words, on every row.
	 */
	import type { WorkspaceApi } from './workspace-api';
	let { api }: { api: WorkspaceApi } = $props();
</script>
<section class="mates panel" aria-label="Mates" data-testid="ideacad-mate-panel">
	<h2>Mates <span>{api.model.mates.length}</span></h2>
	{#if !api.model.mates.length}<p class="note">Select a face on each of two bodies to mate them.</p>{/if}
	<ul>{#each api.model.mates as mate (mate.feature)}<li class={mate.status}><strong>{mate.kind}</strong>{#if mate.message}<p role="status">{mate.message}</p>{/if}</li>{/each}</ul>
</section>
<style>
	.mates{display:grid;gap:8px}h2{margin:0;font-size:18px}h2 span{color:var(--text-2);font:12px 'Share Tech Mono',monospace;margin-left:6px}.note,p{margin:0;color:var(--text-2);font-size:14px}ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}li{padding:6px 8px;border:1px solid var(--boundary);border-radius:4px}li.error{border-color:var(--warning)}
</style>
