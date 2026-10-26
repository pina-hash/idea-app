<script lang="ts">
	import PresentationQueue from '$lib/classroom/PresentationQueue.svelte';
	import { createFeedbackTransports } from '$lib/classroom/feedback/transports';
	import { createPresentationScoring, createPresentationTransports } from '$lib/classroom/presentations';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const transports = $derived(createPresentationTransports(data.supabase));
	const feedback = $derived(createFeedbackTransports(data.supabase, 'teacher'));
	const scoring = $derived(createPresentationScoring(data.supabase));
</script>

<PresentationQueue section={data.section} assignments={data.assignments} {transports} {feedback} {scoring} />
