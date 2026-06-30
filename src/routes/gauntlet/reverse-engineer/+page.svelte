<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { difficultyLabel, formatDeviation, formatMass } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenges } = $derived(data);

	const cleared = $derived(challenges.filter((c) => c.cleared).length);
</script>

<svelte:head>
	<title>Reverse Engineer // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Reverse Engineer' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Modeling Mode</span>
		<h1>Reverse Engineer</h1>
		<p class="lead">
			Reproduce a part from its reference as closely as you can. There is no clock: runs are scored
			on how close your volume and surface area land to the canonical part, and the lowest deviation
			wins.
		</p>
		<div class="mode-hero-meta">
			<span class="mono">{cleared} / {challenges.length} cleared</span>
		</div>
	</section>

	<div class="card supervised-note">
		<p>
			Runs are machine verified by the GAUNTLET SolidWorks macro, which captures volume and surface
			area. <a href="/gauntlet/tools">Get the macro and setup</a>. The seeded challenges below are
			labeled demos with placeholder references.
		</p>
	</div>

	{#if challenges.length === 0}
		<div class="card"><p>No challenges are published yet. Check back soon.</p></div>
	{:else}
		<ul class="challenge-list">
			{#each challenges as c (c.id)}
				<li>
					<a class="challenge-row" href="/gauntlet/reverse-engineer/{c.id}">
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
									<span class="challenge-meta">Best {formatDeviation(c.bestMetric)} dev &middot; Rank #{c.rank}</span>
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
		<a class="btn secondary" href="/gauntlet/tools">Macro &amp; tools</a>
	</div>
</main>
