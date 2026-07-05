<script lang="ts">
	import DomainLanding from '$lib/frc/DomainLanding.svelte';

	let { data } = $props();
	// frcCompleted comes from the /frc layout load (merged into page data).
</script>

<svelte:head>
	<title>{data.domain.title} // FRC Training</title>
</svelte:head>

<DomainLanding domain={data.domain} completed={data.frcCompleted ?? []} />
