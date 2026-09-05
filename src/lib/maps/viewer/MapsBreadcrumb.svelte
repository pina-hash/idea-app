<script lang="ts">
	/**
	 * THE CONTAINMENT CHAIN, VISIBLE AT EVERY LEVEL (spec 6). It is the whole
	 * answer to the surface's hardest case: somebody who lands three levels deep
	 * from a search result and has no idea where the building they are looking
	 * at is.
	 *
	 * IT IS A `<nav>` WITH AN ORDERED LIST, and each crumb is a real link. The
	 * LAST crumb is the current level and is not a link -- a control whose only
	 * outcome is staying where you are is a control that should not be offered
	 * -- and it carries `aria-current="page"`, which is the only thing a screen
	 * reader has to tell it apart from the ones above it.
	 *
	 * IT IS NOT ALLOWED TO SCROLL AWAY. On a phone the crumb trail sticks to the
	 * top of the content column, because "where am I" is the question a person
	 * asks halfway down a list of forty items, and scrolling back up to answer
	 * it is exactly the moment they give up.
	 *
	 * THE SEPARATOR IS A BOUNDARY, NOT A HAIRLINE. It is a mark drawn AS
	 * content rather than a line drawn beside it, so it takes `--boundary`'s
	 * 3:1 floor -- the notebook's meta middots are the same call, and the
	 * failure there was a separator nobody could see separating things.
	 */
	import type { MapsNode } from '../maps';
	import { mapsKindWord } from './viewer';

	let {
		chain,
		leafLabel = null,
		rootHref,
		hrefFor
	}: {
		chain: MapsNode[];
		/** An item card open over the last container: the deepest crumb of all. */
		leafLabel?: string | null;
		rootHref: string;
		hrefFor: (node: MapsNode) => string;
	} = $props();

	/** The crumb that is NOT a link: the level actually on screen. */
	const currentIndex = $derived(leafLabel ? -1 : chain.length - 1);
</script>

<nav class="mv-crumbs" aria-label="Where you are" data-testid="maps-viewer-crumbs">
	<ol>
		<li>
			{#if chain.length === 0 && !leafLabel}
				<span aria-current="page">The map</span>
			{:else}
				<a href={rootHref} class="tap-reach-44">The map</a>
			{/if}
		</li>
		{#each chain as node, i (node.id)}
			<li>
				<span class="mv-sep" aria-hidden="true">/</span>
				{#if i === currentIndex}
					<span aria-current="page">
						{node.name}<span class="mv-crumb-kind"> ({mapsKindWord(node)})</span>
					</span>
				{:else}
					<a href={hrefFor(node)} class="tap-reach-44">{node.name}</a>
				{/if}
			</li>
		{/each}
		{#if leafLabel}
			<li>
				<span class="mv-sep" aria-hidden="true">/</span>
				<span aria-current="page">{leafLabel}</span>
			</li>
		{/if}
	</ol>
</nav>

<style>
	.mv-crumbs {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface-0, #0a0c0b);
		padding: var(--space-2) 0;
		margin-bottom: var(--space-3);
	}
	ol {
		display: flex;
		/* ONE LINE, SCROLLED, RATHER THAN WRAPPED -- and it is a tap-target
		   decision, not a styling one. Wrapped, the crumb lines sit ~21px
		   apart and a 44px reach on each link overlaps the line above and
		   below: measured on the harness at 375px, 7 of 25 sample taps landed
		   on the wrong crumb. That is the same collision CLAUDE.md describes
		   for inline links in prose, and the repo's answer there is to leave
		   the reach alone. Here there is a better one, because a breadcrumb is
		   navigation rather than a sentence: on one line each crumb owns its
		   own horizontal band inside a single 44px row, so a height-only reach
		   cannot overlap anything and the trail costs one line of a phone
		   screen instead of three. The region scrolls and KEEPS ITS SCROLLBAR
		   -- a gradient says there is more, it is not a control. */
		flex-wrap: nowrap;
		overflow-x: auto;
		min-height: 44px;
		align-items: center;
		gap: 0;
		list-style: none;
		margin: 0;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	li {
		display: flex;
		align-items: center;
		/* The crumbs must not squeeze each other into ellipses on a narrow
		   screen: the row scrolls instead. */
		flex: none;
		white-space: nowrap;
	}
	a {
		color: var(--mv-accent-ink);
		text-decoration: none;
		padding: 0 0.15rem;
		/* The reach grows in HEIGHT only: two crumbs sit far closer than 44px
		   horizontally, and overlapping reaches hand the tap to the wrong one. */
		--tap-reach-w: 0px;
	}
	a:hover,
	a:focus-visible {
		text-decoration: underline;
	}
	[aria-current='page'] {
		color: var(--text-1, #e7eae8);
		font-weight: 600;
		padding: 0 0.15rem;
	}
	.mv-crumb-kind {
		color: var(--text-2, #9aa49d);
		font-weight: 400;
	}
	.mv-sep {
		/* --boundary, not --hairline: this is a mark drawn as content. */
		color: var(--boundary, #6f7b73);
		padding: 0 0.2rem;
	}
</style>
