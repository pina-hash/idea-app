<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import UnitPage from '$lib/frc/UnitPage.svelte';
	import { submitGate } from '$lib/frc/gate-submissions';

	let { data } = $props();

	// Model-gate submit: an RLS-guarded upsert of the student's OWN submission
	// (status forced to 'submitted' server-side by the policy), then a reload so
	// the freshly-loaded submission drives the panel. Never writes completion.
	async function onModelSubmit(link: string, notes: string) {
		const uid = data.claims?.sub;
		if (!uid) return { error: 'You must be signed in to submit.' };
		const { error } = await submitGate(
			data.supabase,
			uid,
			data.unit.id,
			link,
			notes,
			new Date().toISOString()
		);
		if (!error) await invalidateAll();
		return { error };
	}
</script>

<svelte:head>
	<title>{data.unit.title} // {data.domain.title} // FRC Training</title>
</svelte:head>

<UnitPage
	domain={data.domain}
	unit={data.unit}
	prev={data.prev}
	next={data.next}
	gate={data.gate}
	modelGate={data.modelGate}
	{onModelSubmit}
/>
