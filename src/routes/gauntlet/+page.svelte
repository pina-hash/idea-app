<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { MODES, familyLabel, modeStatusLabel } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, isTeacher, modeStats } = $derived(data);

	const liveCount = MODES.filter((m) => m.status === 'live').length;
	const totalCleared = $derived(
		Object.values(modeStats.cleared as Record<string, number>).reduce((a, b) => a + b, 0)
	);
</script>

<svelte:head>
	<title>IDEA // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} />

<main class="gauntlet">
	<section class="dojo-hero">
		<span class="eyebrow">CAD Skills Dojo</span>
		<h1 class="dojo-title">IDEA <span>// GAUNTLET</span></h1>
		<p class="dojo-tagline">Enter weak. Leave strong.</p>
		<p class="lead">
			Train your SolidWorks skills across challenge modes. Read drawings, model against the
			clock, reverse engineer parts, and climb the boards. Every run is scored and tracked.
		</p>
		<div class="dojo-stats">
			<div class="dojo-stat">
				<span class="stat-value">{liveCount}<span class="stat-of">/ {MODES.length}</span></span>
				<span class="stat-label">Modes live</span>
			</div>
			<div class="dojo-stat">
				<span class="stat-value">{totalCleared}</span>
				<span class="stat-label">Challenges cleared</span>
			</div>
			<div class="dojo-stat">
				<span class="stat-value cyan">{userRole}</span>
				<span class="stat-label">Your rank</span>
			</div>
		</div>
	</section>

	<a class="card author-callout" href="/gauntlet/rooms">
		<div>
			<div class="author-title">Live Rooms</div>
			<div class="author-sub">Race a synchronized Speedrun: one host, one shared clock, a live board.</div>
		</div>
		<span class="btn secondary">Enter rooms &rsaquo;</span>
	</a>

	{#if isTeacher}
		<a class="card author-callout" href="/gauntlet/author">
			<div>
				<div class="author-title">Authoring</div>
				<div class="author-sub">Create and manage challenges across every mode.</div>
			</div>
			<span class="btn secondary">Open authoring &rsaquo;</span>
		</a>
	{/if}

	<h2>Choose your mode</h2>
	<div class="mode-grid">
		{#each MODES as mode (mode.id)}
			{@const total = (modeStats.totals as Record<string, number>)[mode.id] ?? 0}
			{@const cleared = (modeStats.cleared as Record<string, number>)[mode.id] ?? 0}
			{#if mode.status === 'live' && mode.href}
				<a class="mode-card live" href={mode.href}>
					<div class="mode-top">
						<span class="mode-family {mode.family}">{familyLabel(mode.family)}</span>
						<span class="mode-status status-live">Live</span>
					</div>
					<h3 class="mode-name">{mode.name}</h3>
					<p class="mode-tagline">{mode.tagline}</p>
					<div class="mode-foot">
						<span class="mode-scoring">{mode.scoring}</span>
						<span class="mode-progress">{cleared} / {total} cleared</span>
					</div>
				</a>
			{:else}
				<div class="mode-card locked" aria-disabled="true">
					<div class="mode-top">
						<span class="mode-family {mode.family}">{familyLabel(mode.family)}</span>
						<span class="mode-status status-{mode.status}">{modeStatusLabel(mode.status)}</span>
					</div>
					<h3 class="mode-name">{mode.name}</h3>
					<p class="mode-tagline">{mode.tagline}</p>
					<div class="mode-foot">
						<span class="mode-scoring">{mode.scoring}</span>
						<span class="mode-progress">{mode.status === 'construction' ? 'In progress' : 'Locked'}</span>
					</div>
				</div>
			{/if}
		{/each}
	</div>

	<p class="dojo-note">
		Speedrun is live now, machine verified by the
		<a href="/gauntlet/tools">SolidWorks capture macro</a>. The other modes are under construction and
		will open as they are finished.
	</p>
</main>
