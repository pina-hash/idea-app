<script lang="ts">
	import UpdatesPage from '$lib/classroom/UpdatesPage.svelte';
	import { classroomFeedbackSubmit } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);
</script>

<UpdatesPage {submitFeedback} />
