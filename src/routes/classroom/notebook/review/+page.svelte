<script lang="ts">
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import {
		createReviewConsoleTransports,
		reviewConsoleTransports
	} from '$lib/notebook/review-transports';
	import type { PageData } from './$types';

	/**
	 * The all-sections review console. The screen is `ReviewConsole`, the same
	 * component a class's own Notebook tab mounts locked to that class; this
	 * file only builds the transports, and `reviewConsoleTransports` decides
	 * which bundles this viewer is handed.
	 */
	let { data }: { data: PageData } = $props();

	// The client is one stable instance for the session; built once.
	// svelte-ignore state_referenced_locally
	const built = createReviewConsoleTransports(data.supabase);
	const bundle = $derived(
		reviewConsoleTransports(built, { isChair: data.isChair, docCheckReady: data.docCheckReady })
	);
</script>

<svelte:head>
	<title>Notebook review // IDEA Classroom</title>
</svelte:head>

<ReviewConsole
	sections={data.reviewSections}
	isChair={data.isChair}
	configured={data.configured}
	initialSectionId={data.initialSectionId}
	transports={bundle.transports}
	docCheck={bundle.docCheck}
	excusals={bundle.excusals}
	entryMove={bundle.entryMove}
	adminLog={bundle.adminLog}
	staffNote={bundle.staffNote}
	itemLink={bundle.itemLink}
	viewerId={data.viewerId}
/>
