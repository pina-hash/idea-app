<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { difficultyLabel, formatTime, formatMass } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenges, series } = $derived(data);

	const cleared = $derived(challenges.filter((c) => c.cleared).length);

	// Browse by series (0022). 'all' shows every group; a series id or 'none'
	// (the unfiled drawings) narrows to one.
	let activeSeries = $state<string>('all');

	const seriesById = $derived(new Map(series.map((s) => [s.id, s])));

	// Series in their sort order, each carrying its member drawings (in series_order).
	const groups = $derived(
		series
			.map((s) => ({
				series: s,
				items: challenges
					.filter((c) => c.seriesId === s.id)
					.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0))
			}))
			.filter((g) => g.items.length > 0)
	);
	const ungrouped = $derived(challenges.filter((c) => !c.seriesId || !seriesById.has(c.seriesId)));

	const showGroup = (id: string) => activeSeries === 'all' || activeSeries === id;
	const showUngrouped = $derived(activeSeries === 'all' || activeSeries === 'none');
</script>

<svelte:head>
	<title>Speedrun // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Speedrun' }]} />

{#snippet row(c: (typeof challenges)[number])}
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
{/snippet}

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Modeling Mode</span>
		<h1>Speedrun</h1>
		<p class="lead">
			Model a blank part up to a target, given as a material, density, and target mass. Grading is on
			geometry, shown to you as mass. It is two steps: Start on an empty part begins the clock, then
			Submit checks your result and ranks you. The clock starts at Start, not when the drawing is
			revealed, so you can study the drawing first. Model in IPS or MMGS, whichever you prefer; every
			property follows your chosen system.
		</p>
		<div class="mode-hero-meta">
			<span class="mono">{cleared} / {challenges.length} cleared</span>
		</div>
	</section>

	<div class="card supervised-note">
		<p>
			Ranked runs are machine verified: the GAUNTLET SolidWorks add-in (or the macros) reads your
			part and posts it with a one-time submit code, and the server times the run from the moment you
			hit Start. Manual mass entry stays as unranked practice. New to the add-in?
			<a href="/gauntlet/speedrun/quickstart">Add-in quick-start</a>.
			<a href="/gauntlet/tools">Get the tools</a>.
		</p>
	</div>

	{#if challenges.length === 0}
		<div class="card">
			<p>No challenges are published yet. Check back soon.</p>
		</div>
	{:else}
		{#if series.length}
			<div class="series-filter" role="group" aria-label="Filter by series">
				<button class="series-chip" class:active={activeSeries === 'all'} type="button" onclick={() => (activeSeries = 'all')}>
					All
				</button>
				{#each groups as g (g.series.id)}
					<button class="series-chip" class:active={activeSeries === g.series.id} type="button" onclick={() => (activeSeries = g.series.id)}>
						{g.series.name} <span class="chip-n">{g.items.length}</span>
					</button>
				{/each}
				{#if ungrouped.length}
					<button class="series-chip" class:active={activeSeries === 'none'} type="button" onclick={() => (activeSeries = 'none')}>
						Other <span class="chip-n">{ungrouped.length}</span>
					</button>
				{/if}
			</div>
		{/if}

		{#each groups as g (g.series.id)}
			{#if showGroup(g.series.id)}
				<section class="series-section">
					<div class="series-head">
						<h2>{g.series.name}</h2>
						{#if g.series.description}<p class="dim series-desc">{g.series.description}</p>{/if}
					</div>
					<ul class="challenge-list">
						{#each g.items as c (c.id)}{@render row(c)}{/each}
					</ul>
				</section>
			{/if}
		{/each}

		{#if ungrouped.length && showUngrouped}
			<section class="series-section">
				{#if series.length}<div class="series-head"><h2>Other drawings</h2></div>{/if}
				<ul class="challenge-list">
					{#each ungrouped as c (c.id)}{@render row(c)}{/each}
				</ul>
			</section>
		{/if}
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet">&lsaquo; All modes</a>
		<a class="btn secondary" href="/gauntlet/speedrun/quickstart">Add-in quick-start</a>
		<a class="btn secondary" href="/gauntlet/tools">Macro &amp; tools</a>
	</div>
</main>
