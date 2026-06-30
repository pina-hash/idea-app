<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { difficultyLabel, formatTime, formatMass } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenges } = $derived(data);

	const cleared = $derived(challenges.filter((c) => c.cleared).length);
</script>

<svelte:head>
	<title>Speedrun // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Speedrun' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Modeling Mode</span>
		<h1>Speedrun</h1>
		<p class="lead">
			Model a dimensioned part in SolidWorks as fast as you can, then enter its mass. The drawing
			is hidden until you hit Start, and the clock starts the instant it appears. Pass within the
			tolerance band and your time ranks on the board.
		</p>
		<div class="mode-hero-meta">
			<span class="mono">{cleared} / {challenges.length} cleared</span>
		</div>
	</section>

	<div class="card supervised-note">
		<p>
			Manual mass entry runs on supervised trust: you type the mass from Mass Properties and the
			timer is client-side. Machine-authoritative capture and timing arrive with the SolidWorks
			macro. The seeded challenges below are labeled demos with placeholder drawings.
		</p>
	</div>

	{#if challenges.length === 0}
		<div class="card">
			<p>No challenges are published yet. Check back soon.</p>
		</div>
	{:else}
		<ul class="challenge-list">
			{#each challenges as c (c.id)}
				<li>
					<a class="challenge-row" href="/gauntlet/speedrun/{c.id}">
						<span class="challenge-state" class:done={c.cleared}>
							{#if c.cleared}✓{/if}
						</span>
						<span class="challenge-main">
							<span class="challenge-title">
								{c.title}
								{#if c.demo}<span class="demo-badge">Demo</span>{/if}
							</span>
							<span class="challenge-sub">
								<span class="diff diff-{c.difficulty}">{difficultyLabel(c.difficulty)}</span>
								<span class="challenge-meta dim">
									{c.material ?? 'Material TBD'} &middot; target {formatMass(c.targetMass, c.massUnit)}
								</span>
								{#if c.cleared}
									<span class="challenge-meta">Best {formatTime(c.bestTime)} &middot; Rank #{c.rank}</span>
								{:else}
									<span class="challenge-meta dim">Not cleared yet</span>
								{/if}
							</span>
						</span>
						<span class="challenge-go">Run &rsaquo;</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet">&lsaquo; All modes</a>
	</div>
</main>
