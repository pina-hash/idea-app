<script lang="ts">
	import ManageConsole from '$lib/classroom/ManageConsole.svelte';
	import { classroomFeedbackSubmit, createClassroomTransports } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The REAL transports live in $lib/classroom/transports so the console, the
	 * class stream and the item page all reach the SAME calls -- a per-page copy
	 * is how one surface quietly ends up on a stale RPC signature.
	 */
	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);
</script>

<ManageConsole
	ready={data.ready}
	email={data.email}
	isAdmin={data.isAdmin}
	attachmentsEnabled={data.attachmentsEnabled}
	initialSections={data.sections}
	initialCourses={data.courses}
	{transports}
	{submitFeedback}
/>
