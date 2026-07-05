<script lang="ts">
	import DomainLanding from '$lib/frc/DomainLanding.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.domain.title} // FRC Training</title>
</svelte:head>

<DomainLanding domain={data.domain} />
