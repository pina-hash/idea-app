<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { MODES, familyLabel } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, counts } = $derived(data);
</script>

<svelte:head>
	<title>Authoring // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Authoring' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Teacher Tools</span>
		<h1>Challenge Authoring</h1>
		<p class="lead">
			Author and manage challenges across every mode. The full authoring UI is a later prompt,
			so this is a preview: challenges are seeded and edited in the database for now.
		</p>
	</section>

	<div class="card">
		<p>
			Each challenge stores a public prompt (question, drawing, options) and a private answer that
			students never receive. Grading runs server-side. See the dojo design doc for the data model.
		</p>
	</div>

	<h2>Challenges by mode</h2>
	<div class="card">
		{#each MODES as mode (mode.id)}
			<div class="field">
				<span class="key">{mode.name} <span class="mono dim">{familyLabel(mode.family)}</span></span>
				<span class="val meta">{(counts as Record<string, number>)[mode.id] ?? 0} authored</span>
			</div>
		{/each}
	</div>

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet">&lsaquo; Back to dojo</a>
	</div>
</main>
