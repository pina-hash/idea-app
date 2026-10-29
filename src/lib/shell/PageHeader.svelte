<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * THE ONE PAGE HEADER (ledger 0468, feedback 38516c68).
	 *
	 * Every app page names itself the same way: a cyan eyebrow saying which app
	 * it is part of, the Plate's title bar (the page title between two hazard
	 * blocks, over a groove) and one meta line under it. Before this there
	 * were five title treatments on the site (the classroom's title bar, a
	 * left bar, a short bar, a plain heading and none at all).
	 *
	 * The parts are the kit's classes (`idea-eyebrow`, `idea-titlebar`), drawn
	 * by tools/hx-kit/kit/plate.css, the one file HTML assignments build with
	 * too; this component only lays them out. Actions sit on their own row
	 * under the meta line, centred with the title, so the bar always spans its
	 * row and a phone never squeezes the title beside a key.
	 *
	 * A `div`, NOT A `header`: several rooms style every `header` inside them
	 * as their masthead (`.legacy-index header` is sticky, flexed and painted),
	 * and a page title is not a masthead.
	 *
	 * `meta` is the plain sentence; `metaContent` is for a meta line that
	 * carries a link or a value. `children` is anything the page puts under
	 * the header that belongs to it (a stats strip, a notice).
	 */
	let {
		eyebrow,
		title,
		meta,
		metaContent,
		actions,
		children,
		id,
		titleTestid,
		testid = 'page-header'
	}: {
		/** Which app this page is part of, in its own words. */
		eyebrow?: string;
		title: string;
		/** One sentence under the title. */
		meta?: string | null;
		metaContent?: Snippet;
		actions?: Snippet;
		children?: Snippet;
		/** The heading's id, for an `aria-labelledby` on the page. */
		id?: string;
		/** A test id on the heading itself, where a page's tests read the title. */
		titleTestid?: string;
		testid?: string;
	} = $props();
</script>

<div class="page-header" data-testid={testid}>
	{#if eyebrow}<p class="idea-eyebrow idea-eyebrow--info ph-eyebrow" data-testid="page-header-eyebrow">{eyebrow}</p>{/if}
	<h1 class="idea-titlebar ph-title" {id} data-testid={titleTestid}>{title}</h1>
	{#if metaContent}
		<div class="ph-meta">{@render metaContent()}</div>
	{:else if meta}
		<p class="ph-meta">{meta}</p>
	{/if}
	{#if actions}<div class="ph-actions">{@render actions()}</div>{/if}
	{#if children}{@render children()}{/if}
</div>

<style>
	.page-header {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
		margin: 1rem 0 1.4rem;
		text-align: center;
		/* The meta line is prose in the reading face, whatever the room's own
		   body face is (the home page's is mono). */
		font-family: var(--font-display);
	}
	/* The bar spans its row: its rails line up with the panels under it. */
	.ph-title {
		width: 100%;
	}
	/* The meta line is prose, so it keeps a reading measure even when the
	   header spans a wide page. */
	.ph-meta {
		max-width: var(--measure-prose, 72ch);
		margin: 0 auto;
		color: var(--text-2);
		font-size: var(--fs-base);
		line-height: 1.5;
	}
	.ph-meta :global(p) {
		margin: 0;
	}
	.ph-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
</style>
