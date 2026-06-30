<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import ChallengeForm from '$lib/gauntlet/ChallengeForm.svelte';
	import { emptyForm } from '$lib/gauntlet/authoring';

	let { data } = $props();
	let { supabase, userName, userRole, mode } = $derived(data);
</script>

<svelte:head>
	<title>New challenge // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[{ label: 'Authoring', href: '/gauntlet/author' }, { label: 'New' }]}
/>

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Teacher Tools</span>
		<h1>New challenge</h1>
		<p class="lead">Pick a mode, fill the fields, and save as a draft or publish.</p>
	</section>

	{#key mode}
		<ChallengeForm {supabase} initial={emptyForm(mode)} />
	{/key}
</main>
