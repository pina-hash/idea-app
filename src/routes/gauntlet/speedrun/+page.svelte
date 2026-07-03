<script lang="ts">
	import { onMount } from 'svelte';
	import Header from '$lib/gauntlet/Header.svelte';
	import PartThumb from '$lib/gauntlet/PartThumb.svelte';
	import SeriesThumbRotator from '$lib/gauntlet/SeriesThumbRotator.svelte';
	import { difficultyLabel, formatTime, formatMass, MODELS_BUCKET } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenges, series } = $derived(data);

	const cleared = $derived(challenges.filter((c) => c.cleared).length);

	// Signed model URL for a tile's thumbnail render; called only on a
	// thumbnail cache miss (see part-thumbs.ts), so a warm cache never signs.
	const signModel = async (path: string) => {
		const { data: signed } = await supabase.storage.from(MODELS_BUCKET).createSignedUrl(path, 600);
		return signed?.signedUrl ?? null;
	};

	// Per-browser collapsed state per series (localStorage). A collapsed series
	// hides its list and shows one slot that slowly cross-fades through its
	// levels' isometric thumbnails (SeriesThumbRotator); expanded shows the list.
	// SSR renders expanded, then onMount restores the saved state (brief settle).
	const COLLAPSE_KEY = 'gauntlet_speedrun_series_collapsed';
	let collapsed = $state<Record<string, boolean>>({});
	onMount(() => {
		try {
			const raw = localStorage.getItem(COLLAPSE_KEY);
			if (raw) collapsed = JSON.parse(raw);
		} catch {
			/* no stored state */
		}
	});
	const toggleSeries = (id: string) => {
		collapsed = { ...collapsed, [id]: !collapsed[id] };
		try {
			localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
		} catch {
			/* storage unavailable */
		}
	};

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
			<PartThumb modelPath={c.modelPath} resolveUrl={signModel} />
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
			hit Start. Manual mass entry stays as unranked practice.
			<a href="/gauntlet/tools">Get the run tools</a>.
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
					<button
						class="series-head series-toggle"
						type="button"
						aria-expanded={!collapsed[g.series.id]}
						onclick={() => toggleSeries(g.series.id)}
					>
						<span class="series-caret" class:open={!collapsed[g.series.id]} aria-hidden="true">&rsaquo;</span>
						<span class="series-head-text">
							<h2>{g.series.name}</h2>
							{#if g.series.description}<span class="dim series-desc">{g.series.description}</span>{/if}
						</span>
						<span class="series-count">{g.items.length}</span>
					</button>
					{#if collapsed[g.series.id]}
						<div class="series-collapsed-body">
							<SeriesThumbRotator models={g.items.map((c) => c.modelPath)} resolveUrl={signModel} />
							<p class="dim series-collapsed-hint">
								{g.items.length} drawing{g.items.length === 1 ? '' : 's'}. Expand to run them.
							</p>
						</div>
					{:else}
						<ul class="challenge-list">
							{#each g.items as c (c.id)}{@render row(c)}{/each}
						</ul>
					{/if}
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
		<a class="btn secondary" href="/gauntlet/speedrun/history">My attempts</a>
		<a class="btn secondary" href="/gauntlet/tools">Tools</a>
	</div>
</main>

<style>
	/* Collapsible series header: the existing .series-head, made a button. */
	.series-toggle {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0.35rem 0;
		cursor: pointer;
		text-align: left;
		color: inherit;
	}
	.series-caret {
		flex: none;
		color: var(--green);
		font-size: 1.3rem;
		line-height: 1;
		transition: transform 0.2s ease;
	}
	.series-caret.open {
		transform: rotate(90deg);
	}
	.series-head-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.series-count {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--cyan);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.1rem 0.45rem;
	}
	.series-toggle:hover .series-count {
		border-color: var(--line-strong);
	}
	.series-collapsed-body {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0 0.7rem 1.7rem;
	}
	.series-collapsed-hint {
		font-size: 0.9rem;
		margin: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.series-caret {
			transition: none;
		}
	}
</style>
