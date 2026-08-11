<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
	import type { FeedbackStatus } from '$lib/classroom/classroom';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	async function setStatus(id: string, status: FeedbackStatus) {
		const { error } = await supabase.rpc('app_feedback_set_status', {
			p_id: id,
			p_status: status
		});
		if (error) return { ok: false, message: error.message };
		void invalidateAll();
		return { ok: true };
	}
</script>

<FeedbackConsole ready={data.ready} rows={data.rows} {setStatus} />
