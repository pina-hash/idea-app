<script lang="ts">
	/**
	 * WHAT THE STAGE SHOWS WHEN NOTHING IS SELECTED: the whole map, drawn. One
	 * sheet per root container -- a building's plan with its rooms inside, a
	 * site with its buildings -- read-only, every shape a way in. It exists so
	 * the editor OPENS on a drawing rather than on an empty column beside a
	 * list: the first thing a person sees is the thing they are making.
	 *
	 * It mounts the SAME `PlanCanvas` the editing stage mounts, in its
	 * read-only mode, so a root drawn here and the same root drawn while it is
	 * being edited are one rendering and cannot disagree about a shape. A root
	 * with no outline yet is named rather than skipped: a building nobody has
	 * measured is a real building somebody created, and the one thing this
	 * surface must not do is hide it.
	 */
	import PlanCanvas from './PlanCanvas.svelte';
	import MapsStatusChip from './MapsStatusChip.svelte';
	import {
		MAPS_KIND_LABELS,
		mapsEffectiveNodeContent,
		mapsPublishState,
		pendingFor,
		type MapsEditorData,
		type MapsNode
	} from './maps';

	let {
		nodes,
		data,
		onselect
	}: {
		/** The nodes the viewer may see (already narrowed to their scope). */
		nodes: MapsNode[];
		data: MapsEditorData;
		onselect: (id: string) => void;
	} = $props();

	/* The sheets draw only what the tree shows: the same set, so a grantee's
	   overview and their tree cannot disagree about what exists. */
	const visibleIds = $derived(new Set(nodes.map((n) => n.id)));
	const roots = $derived(
		nodes.filter((n) => n.parent_id === null).slice().sort((a, b) => a.name.localeCompare(b.name))
	);
	const drawn = $derived(
		roots.map((root) => ({
			root,
			content: mapsEffectiveNodeContent(root, pendingFor(data.pending, 'maps_nodes', root.id)),
			pending: pendingFor(data.pending, 'maps_nodes', root.id),
			childCount: nodes.filter((n) => n.parent_id === root.id).length
		}))
	);
</script>

<section class="overview" data-testid="maps-overview" aria-label="Everything mapped">
	<header class="overview-head">
		<h2>Everything mapped</h2>
		<p class="hint">
			{#if roots.length === 0}
				Nothing is mapped yet. Add the first container under the tree; its outline becomes the frame
				everything else is placed against.
			{:else}
				Pick a container in the tree or click a shape below to open it. Its plan, with the numbers on
				it, and its fields open side by side.
			{/if}
		</p>
	</header>
	<div class="roots">
		{#each drawn as d (d.root.id)}
			<article class="root-card" data-testid="maps-overview-root">
				<div class="root-head">
					<button type="button" class="root-open" onclick={() => onselect(d.root.id)}>
						<span class="root-kind">{MAPS_KIND_LABELS[d.root.kind]}</span>
						<span class="root-name">{d.root.name}</span>
					</button>
					<MapsStatusChip state={mapsPublishState(d.root, d.pending)} />
					<span class="root-count">{d.childCount} inside</span>
				</div>
				{#if d.content.outline}
					<PlanCanvas
						readOnly
						parent={null}
						selfId={d.root.id}
						selfName={d.root.name}
						selfKind={d.root.kind}
						outline={d.content.outline}
						rotationDeg={null}
						x={null}
						y={null}
						{data}
						onplace={() => {}}
						{onselect}
						{visibleIds}
					/>
				{:else}
					<p class="hint no-outline" data-testid="maps-overview-no-outline">
						No outline yet, so there is nothing to draw. Open it and type its width and depth.
					</p>
				{/if}
			</article>
		{/each}
	</div>
</section>

<style>
	.overview {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}
	.overview-head {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.hint {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-2, var(--dim));
	}
	.roots {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(30rem, 100%), 1fr));
		gap: 1rem;
		align-items: start;
	}
	.root-card {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
		padding: 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		background: var(--bg1);
		box-shadow: var(--bevel-raised);
	}
	.root-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.root-open {
		display: inline-flex;
		align-items: baseline;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0.3rem 0.6rem;
		margin-left: -0.6rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-control, 3px);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		text-align: left;
		cursor: pointer;
		min-width: 0;
	}
	.root-open:hover {
		background: var(--bg2);
	}
	.root-open:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.root-kind {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
		font-weight: 400;
	}
	.root-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.root-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2, var(--dim));
		margin-left: auto;
	}
	.no-outline {
		padding: 0.6rem 0;
	}
</style>
