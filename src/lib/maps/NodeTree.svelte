<script lang="ts">
	/**
	 * The node tree as a flattened, indented list of real buttons -- no canvas
	 * and no dragging in this bundle. Every row carries its name, its kind in
	 * words, and its publish-state chip, so a draft or a staged edit is
	 * visible from the list without opening anything.
	 */
	import {
		MAPS_KIND_LABELS,
		mapsPublishState,
		mapsTreeRows,
		pendingFor,
		type MapsNode,
		type MapsPending
	} from './maps';
	import MapsStatusChip from './MapsStatusChip.svelte';

	let {
		nodes,
		pending,
		selectedId,
		onselect
	}: {
		nodes: MapsNode[];
		pending: MapsPending[];
		selectedId: string | null;
		onselect: (id: string) => void;
	} = $props();

	const rows = $derived(mapsTreeRows(nodes));
</script>

<ul class="node-tree" data-testid="maps-node-tree">
	{#each rows as row (row.node.id)}
		<li>
			<button
				type="button"
				class="tree-row"
				class:selected={row.node.id === selectedId}
				style="--depth: {row.depth}"
				aria-current={row.node.id === selectedId ? 'true' : undefined}
				onclick={() => onselect(row.node.id)}
			>
				<span class="row-main">
					<span class="row-kind">{MAPS_KIND_LABELS[row.node.kind]}</span>
					<span class="row-name">{row.node.name}</span>
				</span>
				<MapsStatusChip
					state={mapsPublishState(row.node, pendingFor(pending, 'maps_nodes', row.node.id))}
				/>
			</button>
		</li>
	{/each}
</ul>
{#if rows.length === 0}
	<p class="empty">Nothing mapped yet. Add the first container below.</p>
{/if}

<style>
	.node-tree {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tree-row {
		width: 100%;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.35rem 0.6rem 0.35rem calc(0.6rem + var(--depth) * 1.1rem);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-control, 6px);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.95rem;
		text-align: left;
		cursor: pointer;
	}
	.tree-row:hover {
		background: var(--bg2);
	}
	.tree-row:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.tree-row.selected {
		background: var(--bg2);
		border-color: var(--maps-accent, var(--boundary));
	}
	.row-main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.row-kind {
		flex: 0 0 auto;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.row-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.empty {
		margin: 0.6rem 0 0;
		color: var(--dim);
		font-size: 0.88rem;
	}
</style>
