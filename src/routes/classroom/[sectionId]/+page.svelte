<script lang="ts">
	import { sectionTitle } from '$lib/classroom/classroom';
	import type { PageData } from './$types';

	/**
	 * THE DETAIL PANE BEFORE ANYTHING IS SELECTED, which is now a TITLE AND
	 * NOTHING ELSE -- and the nothing is the point.
	 *
	 * The class content itself lives in +layout.svelte, where it is the
	 * navigation pane and survives opening an item. This page is the other half
	 * of the split, and at every width `.cr-split:not(.has-detail) .cr-detail`
	 * is `display: none`: the list takes the whole measure until something is
	 * opened in it.
	 *
	 * SO THE PROMPT THAT USED TO SIT HERE IS GONE, not hidden. It was a line of
	 * quiet text asking somebody to pick something, which was a reasonable thing
	 * to render into a 921px column that had nothing else in it; with the column
	 * itself gone there is no surface for it and a hidden one would be a path
	 * nothing can reach. The class list IS the answer to "what now".
	 *
	 * The route still needs its own page -- this is what makes
	 * /classroom/<id> a page rather than a 404 -- and it still owns the tab
	 * title, which is the one thing a detail pane cannot supply while there is
	 * no detail. `section` comes from the layout load (page data and layout data
	 * merge), so there is no second query behind it.
	 */
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{sectionTitle(data.section)} // IDEA Classroom</title>
</svelte:head>
