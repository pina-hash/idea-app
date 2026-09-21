<script lang="ts">
	/**
	 * THE DESIGN TREE. Every feature in order, its status, its one number, and
	 * the controls to rename, reorder, suppress, delete and edit it.
	 *
	 * THIS COMPONENT IS THE DESIGN-TREE SURFACE'S TO REPLACE. The spine version
	 * lists the rows with their status and sentence so a broken feature is
	 * already reachable and readable; parameter editing arrives with the panel.
	 */
	import type { WorkspaceApi } from './workspace-api';
	let { api }: { api: WorkspaceApi } = $props();
	const glyph = (status: string) => status === 'error' ? '⚠' : status === 'warning' ? '△' : status === 'suppressed' ? '○' : '●';
	function pick(id: string, kind: 'feature' | 'sketch' | 'reference') { api.select({ bodyId: '', kind, id }); }
	const kindOf = (type: string) => type === 'sketch' ? 'sketch' : ['plane', 'axis', 'point'].includes(type) ? 'reference' : 'feature';
</script>
<section class="tree" aria-label="Design tree" data-testid="ideacad-feature-tree">
	<h2>Features <span>{api.model.features.length}</span></h2>
	{#if !api.model.features.length}<p class="empty">Draw a shape to start the tree.</p>{/if}
	<ol>
		{#each api.model.features as row (row.id)}
			<li class={row.status} class:selected={api.selections.some((s) => s.id === row.id)}>
				<button class="row" onclick={() => pick(row.id, kindOf(row.type))} aria-label={`${row.name}, ${row.status}`} title={row.message}>
					<span class="glyph" aria-hidden="true">{glyph(row.status)}</span>
					<span class="name">{row.name}</span>
					<span class="summary">{row.summary}</span>
				</button>
				{#if row.message}<p class="message" role={row.status === 'error' ? 'alert' : 'status'}>{row.message}</p>{/if}
			</li>
		{/each}
	</ol>
</section>
<style>
	.tree{display:flex;flex-direction:column;min-height:0;font-family:Rajdhani,sans-serif;color:var(--text-1)}h2{margin:0;padding:8px 10px;font-size:17px;border-bottom:1px solid var(--boundary)}h2 span{color:var(--text-2);font:12px 'Share Tech Mono',monospace;margin-left:6px}ol{list-style:none;margin:0;padding:4px;overflow:auto;min-height:0}li{border-radius:4px}li.selected{background:color-mix(in srgb,var(--green) 12%,var(--surface-1))}.row{width:100%;display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:6px;align-items:center;min-height:44px;padding:0 8px;background:transparent;border:1px solid transparent;color:inherit;font:600 15px Rajdhani,sans-serif;text-align:left;cursor:pointer}.row:hover{background:var(--surface-2)}.row:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}.glyph{color:var(--green)}li.error .glyph{color:var(--warning)}li.warning .glyph{color:var(--amber)}li.suppressed .glyph,li.suppressed .name{color:var(--text-2)}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.summary{color:var(--text-2);font:12px 'Share Tech Mono',monospace}.message{margin:0 8px 8px 34px;font-size:13px;line-height:1.4;color:var(--text-2)}li.error .message{color:var(--warning)}.empty{margin:0;padding:12px 10px;color:var(--text-2);font-size:14px}
</style>
