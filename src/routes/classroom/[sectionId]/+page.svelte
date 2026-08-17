<script lang="ts">
	import { sectionTitle } from '$lib/classroom/classroom';
	import type { PageData } from './$types';

	/**
	 * THE DETAIL PANE BEFORE ANYTHING IS SELECTED.
	 *
	 * The class content itself moved up to +layout.svelte, where it is the
	 * navigation pane and survives opening an item. What is left here is the
	 * other half of the split: what a person sees on the right before they have
	 * picked something.
	 *
	 * BELOW 1024px THIS IS NOT RENDERED AT ALL -- `.cr-split:not(.has-detail)
	 * .cr-detail` is display:none there, so a phone gets the class list full
	 * width exactly as it always has, with no empty panel under it. That is why
	 * this carries nothing a reader would miss: it is a desktop-only prompt, not
	 * a page.
	 *
	 * `section` comes from the layout load (page data and layout data merge), so
	 * there is no second query behind this.
	 */
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{sectionTitle(data.section)} // IDEA Classroom</title>
</svelte:head>

<!--
	AN ABSENCE, NOT A COMPONENT. This was a dashed box roughly as tall as the
	whole class list beside it, which drew more attention than most of the items
	it was asking somebody to pick. Nothing is open; the honest rendering of that
	is a line of quiet text where the item would start.
-->
<div class="empty-detail" data-testid="detail-empty">
	<p class="hint">Pick something from the class to read it here.</p>
</div>

<style>
	.empty-detail {
		padding-top: var(--space-2);
	}
	.hint {
		margin: 0;
		max-width: 26rem;
		font-size: 0.9rem;
		color: var(--text-3);
	}
</style>
