<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import TiltCard from '$lib/gauntlet/viewport/TiltCard.svelte';
	import ModeArt from '$lib/gauntlet/viewport/ModeArt.svelte';
	import { countUp } from '$lib/gauntlet/viewport/motion';
	import { MODES, familyLabel, modeStatusLabel } from '$lib/gauntlet';

	/** Family sublabels for the card header (mockup: how each family verifies). */
	const FAMILY_SUB: Record<string, string> = {
		modeling: 'verified by mass',
		knowledge: 'read the print'
	};

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
				<span class="stat-value"><span use:countUp={liveCount}>{liveCount}</span><span class="stat-of">/ {MODES.length}</span></span>
				<span class="stat-label">Modes live</span>
			</div>
			<div class="dojo-stat">
				<span class="stat-value" use:countUp={totalCleared}>{totalCleared}</span>
				<span class="stat-label">Challenges cleared</span>
			</div>
			<div class="dojo-stat">
				<span class="stat-value cyan">{userRole}</span>
				<span class="stat-label">Your rank</span>
			</div>
		</div>
	</section>

	<a class="roomstrip" href="/gauntlet/rooms">
		<div>
			<div class="rs-label">Live rooms</div>
			<div class="rs-title">Race a synchronized Speedrun</div>
			<div class="rs-meta">One host &middot; one shared server clock &middot; a live board</div>
		</div>
		<span class="btn">Enter rooms</span>
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

	<div class="grid-lede">
		<span class="gt-kicker">Select challenge</span>
		<h2>Six ways to sharpen the same skill</h2>
		<p>
			Modeling modes verify your part by mass. Knowledge modes test the print. Pick one, or drop
			into a live room and race the class.
		</p>
	</div>
	<div class="mode-grid">
		{#each MODES as mode (mode.id)}
			{@const total = (modeStats.totals as Record<string, number>)[mode.id] ?? 0}
			{@const cleared = (modeStats.cleared as Record<string, number>)[mode.id] ?? 0}
			{#if mode.status === 'live' && mode.href}
				<TiltCard family={mode.family}>
					<a class="mode-card live {mode.family}" href={mode.href}>
						<div class="mode-top">
							<span class="mode-family {mode.family}">
								{familyLabel(mode.family)} &middot; {FAMILY_SUB[mode.family]}
							</span>
							<span class="mode-status status-live">Live</span>
						</div>
						<div class="mode-art"><ModeArt id={mode.id} /></div>
						<h3 class="mode-name">{mode.name}</h3>
						<p class="mode-tagline">{mode.tagline}</p>
						<div class="mode-foot">
							<span class="gt-chip">
								<span class="chip-l">Cleared</span>
								<span class="chip-v">{cleared} / {total}</span>
							</span>
							<span class="mode-play">ENTER &#9656;</span>
						</div>
					</a>
				</TiltCard>
			{:else}
				<div class="mode-card locked {mode.family}" aria-disabled="true">
					<div class="mode-top">
						<span class="mode-family {mode.family}">
							{familyLabel(mode.family)} &middot; {FAMILY_SUB[mode.family]}
						</span>
						<span class="mode-status status-{mode.status}">{modeStatusLabel(mode.status)}</span>
					</div>
					<div class="mode-art"><ModeArt id={mode.id} /></div>
					<h3 class="mode-name">{mode.name}</h3>
					<p class="mode-tagline">{mode.tagline}</p>
					<div class="mode-foot">
						<span class="gt-chip">
							<span class="chip-l">Status</span>
							<span class="chip-v">{mode.status === 'construction' ? 'In progress' : 'Locked'}</span>
						</span>
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
