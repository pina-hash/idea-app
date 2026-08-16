<script lang="ts">
	import AdminConsole from '$lib/classroom/AdminConsole.svelte';
	import { classroomFeedbackSubmit, createClassroomTransports } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);
</script>

<AdminConsole
	ready={data.ready}
	email={data.email}
	isAdmin={data.isAdmin}
	initialSections={data.sections}
	initialCourses={data.courses}
	{transports}
	{submitFeedback}
/>
