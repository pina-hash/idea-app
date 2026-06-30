<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import KnowledgePlay from '$lib/gauntlet/KnowledgePlay.svelte';

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
	crumbs={[{ label: 'GD&T and Tolerance', href: '/gauntlet/gdt-tolerance' }, { label: challenge.title }]}
/>

<KnowledgePlay {challenge} {board} {myUserId} {myBest} backHref="/gauntlet/gdt-tolerance" />
