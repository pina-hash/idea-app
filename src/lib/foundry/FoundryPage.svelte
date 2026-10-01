<script lang="ts">
	/**
	 * ONE FOUNDRY PAGE: a heading, an optional lead and sub-navigation, and the
	 * page's own body. The gallery, the review queue, the publishers page and
	 * the request board all mount it (ledger 0360), so there is one answer to
	 * "how wide is a Foundry page" instead of the two copied `.fdy-page` and
	 * `.fdy-rev-page` blocks that each carried the defect below.
	 *
	 * THE DEFECT IT ENDS (reports 162057f0, 94e312c4, 647d1201). Above 1024px
	 * the gallery and the queue are full-height applications: the room is a
	 * flex COLUMN and this page is a flex item in it. Those blocks set
	 * `margin: 0 auto` and no `width`, and auto margins in a column flexbox
	 * cancel the stretch an item would otherwise get, so the box fell back to
	 * shrink-to-fit -- as wide as its widest child, which was the lead
	 * paragraph capped at 42rem. Every gallery at every desktop size was about
	 * 608px wide in the middle of the monitor, which is exactly what the
	 * screenshot measured. `$lib/shell/split.css` documents the same trap
	 * beside `.cr-split`'s own `width: 100%` (the note under "EXPLICIT,
	 * because `margin: 0 auto` below cancels the stretch"), and the fix is the
	 * one it gives: an explicit `width: 100%`. The dev harness never showed it
	 * because its wrapper carried `width: 100%` and no `.cr-app`.
	 *
	 * THE MEASURE IS THE ROOM'S. `forge.css` points `--measure-split` at the
	 * whole window for the Foundry, so the default here, the split inside it
	 * and the masthead all follow one declaration.
	 *
	 * `split` SAYS WHETHER THE BODY BRINGS ITS OWN GUTTER. A `ClassSplit` pads
	 * itself by the room's gutter, so a page around one pads only its heading;
	 * a document page pads everything. Two gutters stacked was the second
	 * thing narrowing the gallery.
	 */
	import type { Snippet } from 'svelte';

	let {
		heading,
		lead = '',
		testid = undefined,
		split = false,
		measure = undefined,
		nav = undefined,
		children
	}: {
		heading: string;
		lead?: string;
		testid?: string;
		/** The body is a `ClassSplit`, which carries its own side gutter. */
		split?: boolean;
		/** A cap for a reading page. Unset is the room's split measure, the window. */
		measure?: string;
		/** Sub-navigation under the heading, such as the review page's two keys. */
		nav?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div
	class="fdy-page"
	class:is-split={split}
	data-testid={testid}
	style={measure ? `--fdy-page-measure: ${measure}` : undefined}
>
	<header class="fdy-page-head">
		<h1>{heading}</h1>
		{#if lead}<p class="fdy-page-lead">{lead}</p>{/if}
		{#if nav}
			<div class="fdy-page-nav">{@render nav()}</div>
		{/if}
	</header>

	{@render children()}
</div>

<style>
	.fdy-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
		/* THE FIX. See the header: without it the column flexbox shrink-wraps
		   this box to its widest child. */
		width: 100%;
		max-width: var(--fdy-page-measure, var(--measure-split, 92rem));
		margin: 0 auto;
		padding: var(--space-5, 1.25rem) var(--cr-gutter, 1rem);
		min-width: 0;
		box-sizing: border-box;
	}

	/* The split pads itself; the page pads only its heading, so the heading
	   and the panes start on one line and the gutter is not paid twice. */
	.fdy-page.is-split {
		padding-inline: 0;
	}

	.fdy-page.is-split > .fdy-page-head {
		padding-inline: var(--cr-gutter, 1rem);
	}

	/* THE SPLIT IS WHAT GROWS, in app mode. `scroll="fill"` needs a bounded
	   parent with `min-height: 0` on this item, and without it `height: 100%`
	   resolves against an auto height, the panes grow to their content, and
	   the surface degrades to `page-flow` with nothing on screen saying so. */
	@media (min-width: 1024px) {
		:global(.cr-app) .fdy-page {
			min-height: 0;
			flex: 1 1 auto;
		}
		:global(.cr-app) .fdy-page > :global(.cr-split) {
			min-height: 0;
			flex: 1 1 auto;
		}
	}

	.fdy-page-head {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.fdy-page-head h1 {
		margin: 0;
		font-family: var(--font-title, var(--font-display));
	}

	.fdy-page-lead {
		margin: 0;
		max-width: var(--measure-prose, 42rem);
		color: var(--text-2, var(--dim));
	}

	.fdy-page-nav {
		margin-top: 0.4rem;
		min-width: 0;
	}
</style>
