<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import ModelingRun from '$lib/gauntlet/ModelingRun.svelte';
	import { formatFeatures } from '$lib/gauntlet';

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
	crumbs={[{ label: 'Feature Golf', href: '/gauntlet/feature-golf' }, { label: challenge.title }]}
/>

<ModelingRun
	{supabase}
	{challenge}
	{board}
	{myUserId}
	{myBest}
	next={data.next}
	gated={true}
	metricLabel="Features"
	formatMetric={formatFeatures}
	backHref="/gauntlet/feature-golf"
/>
