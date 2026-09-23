<script lang="ts">
	import NotebookTimeline from '$lib/notebook/NotebookTimeline.svelte';
	import { buildTimeline, classDayStreak } from '$lib/notebook/timeline';
	import { sectionTitle } from '$lib/classroom/classroom';
	import { classNotebookHref } from '$lib/classroom/nav';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const days = $derived(
		buildTimeline({
			entries: data.timeline.entries,
			items: data.timelineItems,
			submissions: data.timeline.submissions,
			files: data.timeline.files
		})
	);
	const streak = $derived(classDayStreak(data.timeline.entries, data.classDays, data.today));
</script>

<svelte:head>
	<title>Timeline · {sectionTitle(data.section)} // IDEA Classroom</title>
</svelte:head>

<!-- The classroom frame's body, the way the Notebook tab's own page claims it,
     scrolling on its own above 1024px where the frame is one screen tall. -->
<div class="nb-root cr-app-body nbt-page">
	<NotebookTimeline
		{days}
		today={data.today}
		{streak}
		handInsReady={data.timeline.ready.handIns}
		notebookHref={classNotebookHref(data.section.id)}
		itemHref={(itemId) => `/classroom/${data.section.id}/item/${itemId}`}
	/>
</div>

<style>
	.nbt-page {
		overflow-y: auto;
	}
</style>
