<script lang="ts">
	import FeedbackInbox from '$lib/classroom/feedback/FeedbackInbox.svelte';
	import { FeedbackSession } from '$lib/classroom/feedback/session.svelte';
	import { createFeedbackTransports } from '$lib/classroom/feedback/transports';
	import { studentToken, STUDENT_PARAM } from '$lib/classroom/grading-student-url';
	import type { FeedbackThread } from '$lib/classroom/feedback/notes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const session = new FeedbackSession({
		transports: createFeedbackTransports(data.supabase, 'teacher'),
		side: 'teacher',
		itemId: null,
		seed: data.feedbackInbox.threads
	});

	/**
	 * THE WORK BEHIND A NOTE: the grading console of the first class this
	 * instructor manages that the student is in, opened on that student through
	 * the opaque token the console reads (never the address).
	 */
	async function workHref(t: FeedbackThread): Promise<string | null> {
		const sectionId = t.sections[0];
		if (!sectionId) return null;
		const token = await studentToken(t.itemId, t.studentEmail);
		return `/classroom/${sectionId}/item/${t.itemId}/grade?${STUDENT_PARAM}=${token}`;
	}
</script>

<svelte:head>
	<title>Student feedback · Classroom · IDEA</title>
</svelte:head>

<FeedbackInbox
	{session}
	sections={data.feedbackInbox.sections}
	manifests={data.feedbackInbox.manifests}
	{workHref}
/>
