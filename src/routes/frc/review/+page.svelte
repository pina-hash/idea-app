<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FrcReviewConsole from '$lib/frc/FrcReviewConsole.svelte';
	import { approveSubmission, requestRevision } from '$lib/frc/gate-submissions';

	let { data } = $props();

	// One "<userId>:<unitId>" in flight at a time, exactly as the dashboard
	// wires the same queue. Approving records completion FIRST through
	// frc_mark_complete (inside approveSubmission, reviewer-gated in the
	// database since 0167), then flips the row; the refreshed load drops the
	// row from the queue.
	let busyKey = $state('');
	let reviewError = $state('');

	const approve = async (userId: string, unitId: string) => {
		busyKey = `${userId}:${unitId}`;
		reviewError = '';
		try {
			const { error } = await approveSubmission(
				data.supabase,
				userId,
				unitId,
				new Date().toISOString()
			);
			if (error) reviewError = error;
			else await invalidateAll();
		} finally {
			busyKey = '';
		}
	};

	const requestRework = async (userId: string, unitId: string, feedback: string) => {
		busyKey = `${userId}:${unitId}`;
		reviewError = '';
		try {
			const { error } = await requestRevision(
				data.supabase,
				userId,
				unitId,
				feedback,
				new Date().toISOString()
			);
			if (error) reviewError = error;
			else await invalidateAll();
		} finally {
			busyKey = '';
		}
	};
</script>

<svelte:head>
	<title>Gate review // FRC Training</title>
</svelte:head>

<FrcReviewConsole
	queueReady={data.reviewQueueReady}
	rows={data.reviewQueue}
	{busyKey}
	error={reviewError}
	onApprove={approve}
	onRequestRevision={requestRework}
/>
