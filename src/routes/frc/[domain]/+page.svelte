<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import DomainLanding from '$lib/frc/DomainLanding.svelte';
	import { markUnitComplete, clearUnitComplete } from '$lib/frc/progression';

	let { data } = $props();
	// frcCompleted comes from the /frc layout load (merged into page data).

	// Teacher-only completion override for the CALLER'S OWN account, so a
	// teacher can preview progress states in-track without going through the
	// dashboard roster. DomainLanding shows/hides it itself from FrcShell's
	// FrcViewContext (hidden entirely in "view as student"); this component
	// only needs to supply the real write path.
	let overrideBusyId = $state('');
	let overrideError = $state('');

	async function handleToggleComplete(unitId: string, next: boolean) {
		const claims = data.claims;
		if (!claims) return;
		overrideBusyId = unitId;
		overrideError = '';
		const fn = next ? markUnitComplete : clearUnitComplete;
		const { error } = await fn(data.supabase, claims.sub, unitId);
		if (error) overrideError = error;
		else await invalidateAll();
		overrideBusyId = '';
	}
</script>

<svelte:head>
	<title>{data.domain.title} // FRC Training</title>
</svelte:head>

<DomainLanding
	domain={data.domain}
	completed={data.frcCompleted ?? []}
	{overrideBusyId}
	onToggleComplete={handleToggleComplete}
/>
{#if overrideError}
	<p class="override-error">{overrideError}</p>
{/if}

<style>
	.override-error {
		margin: 0.6rem 0 0;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--frc-red, #ed1c24);
	}
</style>
