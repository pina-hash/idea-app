<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ArmoryIncidentConsole from '$lib/feedback/ArmoryIncidentConsole.svelte';
	import type { FeedbackStatus } from '$lib/feedback/feedback';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	async function setStatus(id: string, status: FeedbackStatus) {
		const { error } = await supabase.rpc('armory_app_incident_set_status', {
			p_id: id,
			p_status: status
		});
		if (error) return { ok: false, message: error.message };
		void invalidateAll();
		return { ok: true };
	}

	/** How many reports one read asks for: a report can be a megabyte. */
	const REPORT_CHUNK = 10;

	/**
	 * THE FULL REPORTS, READ AT THE PRESS, on the admin's own client through the
	 * table's admin-only select policy (the database's gate, not this page's).
	 * In chunks of ten, so one read never carries more than about ten megabytes.
	 * An id missing from the answer is a report that could not be read; the
	 * console says so rather than writing a file without it.
	 */
	async function fetchReports(ids: string[]): Promise<Map<string, unknown>> {
		const out = new Map<string, unknown>();
		for (let i = 0; i < ids.length; i += REPORT_CHUNK) {
			const chunk = ids.slice(i, i + REPORT_CHUNK);
			const { data: found, error } = await supabase
				.from('armory_app_incidents')
				.select('id, report')
				.in('id', chunk);
			if (error) continue;
			for (const row of (found ?? []) as { id: string; report: unknown }[]) out.set(row.id, row.report);
		}
		return out;
	}
</script>

<svelte:head>
	<title>Armory incidents // IDEA</title>
</svelte:head>

<ArmoryIncidentConsole
	rows={data.rows}
	unavailable={data.unavailable}
	setStatus={data.unavailable ? undefined : setStatus}
	fetchReports={data.unavailable ? undefined : fetchReports}
/>
