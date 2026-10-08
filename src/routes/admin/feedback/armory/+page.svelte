<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ArmoryFeedbackConsole from '$lib/feedback/ArmoryFeedbackConsole.svelte';
	import type { FeedbackStatus } from '$lib/feedback/feedback';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	/**
	 * One note's status, through the admin-only definer on the admin's own
	 * client (`armory_app_feedback_set_status`, which re-checks `is_admin()`),
	 * then a reload. The site queue's `setStatus` shape.
	 */
	async function setStatus(id: string, status: FeedbackStatus) {
		const { error } = await supabase.rpc('armory_app_feedback_set_status', {
			p_id: id,
			p_status: status
		});
		if (error) return { ok: false, message: error.message };
		void invalidateAll();
		return { ok: true };
	}

	/** A five-minute link to a screenshot, through the bucket's admin read policy (0235). */
	async function screenshotUrl(path: string): Promise<string | null> {
		const { data: signed, error } = await supabase.storage.from('armory-feedback-shots').createSignedUrl(path, 300);
		return error ? null : (signed?.signedUrl ?? null);
	}
</script>

<svelte:head>
	<title>Armory app feedback // IDEA</title>
</svelte:head>

<ArmoryFeedbackConsole
	rows={data.rows}
	unavailable={data.unavailable}
	setStatus={data.unavailable ? undefined : setStatus}
	screenshotUrl={data.unavailable ? undefined : screenshotUrl}
/>
