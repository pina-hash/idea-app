<script lang="ts">
	import GradesPanel from '$lib/classroom/GradesPanel.svelte';
	import { classroomFeedbackSubmit } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);
</script>

<GradesPanel section={data.section} standings={data.standings} {submitFeedback} />
