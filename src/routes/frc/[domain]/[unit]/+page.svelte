<script lang="ts">
	import UnitPage from '$lib/frc/UnitPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.unit.title} // {data.domain.title} // FRC Training</title>
</svelte:head>

<UnitPage domain={data.domain} unit={data.unit} prev={data.prev} next={data.next} />
