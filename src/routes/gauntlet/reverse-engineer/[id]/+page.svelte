<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import ModelingRun from '$lib/gauntlet/ModelingRun.svelte';
	import { formatDeviation } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenge, board, myUserId, myBest } = $derived(data);
</script>

<svelte:head>
	<title>{challenge.title} // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[
		{ label: 'Reverse Engineer', href: '/gauntlet/reverse-engineer' },
		{ label: challenge.title }
	]}
/>

<ModelingRun
	{supabase}
	{challenge}
	{board}
	{myUserId}
	{myBest}
	gated={false}
	metricLabel="Deviation"
	formatMetric={formatDeviation}
	backHref="/gauntlet/reverse-engineer"
/>
