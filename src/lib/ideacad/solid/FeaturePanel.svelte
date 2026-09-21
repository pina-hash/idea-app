<script lang="ts">
	/**
	 * THE FEATURE OPTIONS PANEL: what a blend or a feature tool needs beyond a
	 * drag -- multi-edge selection, tangent propagation, the second chamfer
	 * distance, an angle, the hole standard and fit, draft, shell faces.
	 *
	 * THIS COMPONENT IS THE BLENDS-AND-FEATURES SURFACE'S TO REPLACE. The spine
	 * version shows how many edges are selected for a fillet or chamfer, which
	 * is what the drag already uses, so multi-edge blends are reachable.
	 */
	import type { WorkspaceApi } from './workspace-api';
	let { api }: { api: WorkspaceApi } = $props();
	const edges = $derived(api.selections.filter((s) => s.kind === 'edge').length);
	const faces = $derived(api.selections.filter((s) => s.kind === 'face').length);
</script>
{#if ['fillet', 'chamfer', 'shell'].includes(api.tool)}
	<section class="feature panel" aria-label="Feature options" data-testid="ideacad-feature-panel">
		<h2>{api.tool === 'fillet' ? 'Fillet' : api.tool === 'chamfer' ? 'Chamfer' : 'Shell'}</h2>
		<p>{api.tool === 'shell' ? `${faces} open face${faces === 1 ? '' : 's'} selected` : `${edges} edge${edges === 1 ? '' : 's'} selected`}. Shift-click adds more; drag any selected edge to size them together.</p>
	</section>
{/if}
<style>
	.feature{display:grid;gap:6px}h2{margin:0;font-size:18px}p{margin:0;color:var(--text-2);font-size:14px;line-height:1.4}
</style>
