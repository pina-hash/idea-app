<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import ChallengeForm from '$lib/gauntlet/ChallengeForm.svelte';
	import { formFromChallenge } from '$lib/gauntlet/authoring';

	let { data } = $props();
	let { supabase, userName, userRole, challenge } = $derived(data);
</script>

<svelte:head>
	<title>Edit challenge // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[{ label: 'Authoring', href: '/gauntlet/author' }, { label: 'Edit' }]}
/>

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Teacher Tools</span>
		<h1>Edit challenge</h1>
	</section>

	{#key challenge.id}
		<ChallengeForm {supabase} initial={formFromChallenge(challenge)} />
	{/key}
</main>
