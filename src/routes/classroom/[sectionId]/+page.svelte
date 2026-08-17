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

<div class="empty-detail" data-testid="detail-empty">
	<p class="lead">Nothing open yet</p>
	<p class="hint">
		Pick an announcement, assignment or material from the class to read it here.
	</p>
</div>

<style>
	.empty-detail {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 18rem;
		padding: var(--space-6) var(--space-4);
		text-align: center;
		border: 1px dashed var(--hairline);
		border-radius: var(--radius-card);
	}
	.lead {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.hint {
		margin: 0;
		max-width: 26rem;
		font-size: 0.9rem;
		color: var(--text-3);
	}
</style>
