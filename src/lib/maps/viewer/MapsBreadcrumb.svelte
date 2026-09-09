<script lang="ts">
	/**
	 * THE CONTAINMENT CHAIN, VISIBLE AT EVERY LEVEL BELOW THE TOP (spec 6). It
	 * is the whole answer to the surface's hardest case: somebody who lands
	 * three levels deep from a search result and has no idea where the building
	 * they are looking at is.
	 *
	 * IT IS A `<nav>` WITH AN ORDERED LIST, and each crumb is a real link. The
	 * LAST crumb is the current level and is not a link -- a control whose only
	 * outcome is staying where you are is a control that should not be offered
	 * -- and it carries `aria-current="page"`, which is the only thing a screen
	 * reader has to tell it apart from the ones above it.
	 *
	 * IT RENDERS NOTHING AT THE TOP OF THE MAP, and that is prompt 0112's
	 * answer to "the black 'The map' banner looks out of place". At the
	 * directory there is no chain to show, so the trail was one word doing a
	 * title's job on a full-width bar above the real title. A breadcrumb with
	 * one crumb is a heading; the heading is already there. The trail starts
	 * the moment there is a way back, and from then on it sits where a
	 * breadcrumb belongs: directly above the level's heading, in the panel,
	 * not on a bar of its own.
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
	const shown = $derived(chain.length > 0 || !!leafLabel);
</script>

{#if shown}
	<nav class="mv-crumbs" aria-label="Where you are" data-testid="maps-viewer-crumbs">
		<ol>
			<li>
				<a href={rootHref} class="tap-reach-44">Map</a>
			</li>
			{#each chain as node, i (node.id)}
				<li>
					<span class="mv-sep" aria-hidden="true">&rsaquo;</span>
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
					<span class="mv-sep" aria-hidden="true">&rsaquo;</span>
					<span aria-current="page">{leafLabel}</span>
				</li>
			{/if}
		</ol>
	</nav>
{/if}

<style>
	.mv-crumbs {
		margin-bottom: var(--space-2);
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
	/* IN THE PANEL IT WRAPS, AT A ROW PITCH OF EXACTLY 44px. A 26rem panel
	   holds four crumbs of a five-deep chain on one line, and a trail whose
	   last crumb is off the edge is a trail that has stopped answering the
	   question. Wrapping is safe here because the row gap is chosen so the
	   rows sit 44px apart -- a 28px chip plus a 16px gap -- and a height-only
	   44px reach centred on each chip therefore ends exactly where the next
	   row's begins. That is the collision the one-line rule avoids on a phone,
	   avoided by arithmetic instead of by scrolling. */
	@media (min-width: 1024px) {
		ol {
			flex-wrap: wrap;
			overflow-x: visible;
			row-gap: 1rem;
		}
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 28px;
		/* THE CHIP IS AT LEAST 44px WIDE, because the reach grows in height
		   only and a three-letter crumb ("Map") is 36px of text: measured on
		   the harness at 37px, under the floor on width. A wider chip costs
		   nothing a short word can lose. */
		min-width: 44px;
		box-sizing: border-box;
		padding: 0 0.4rem;
		border: 1px solid transparent;
		border-radius: var(--radius-chip);
		/* The reach grows in HEIGHT only: two crumbs sit far closer than 44px
		   horizontally, and overlapping reaches hand the tap to the wrong one. */
		--tap-reach-w: 0px;
	}
	a:hover,
	a:focus-visible {
		border-color: var(--mv-accent);
		background: var(--mv-shape-fill);
	}
	[aria-current='page'] {
		color: var(--text-1, #e7eae8);
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		padding: 0 0.4rem;
	}
	.mv-crumb-kind {
		color: var(--text-2, #9aa49d);
		font-weight: 400;
	}
	.mv-sep {
		/* --boundary, not --hairline: this is a mark drawn as content. */
		color: var(--boundary, #6f7b73);
		padding: 0 0.1rem;
		font-size: 1rem;
	}
</style>
