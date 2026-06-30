<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { difficultyLabel, formatFeatures } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenges } = $derived(data);

	const cleared = $derived(challenges.filter((c) => c.cleared).length);
</script>

<svelte:head>
	<title>Feature Golf // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Feature Golf' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Modeling Mode</span>
		<h1>Feature Golf</h1>
		<p class="lead">
			Hit the target geometry in the fewest features. The volume must be within tolerance to count;
			among passing runs, the lowest feature count wins, like golf. Time only breaks ties.
		</p>
		<div class="mode-hero-meta">
			<span class="mono">{cleared} / {challenges.length} cleared</span>
		</div>
	</section>

	<div class="card supervised-note">
		<p>
			Runs are machine verified by the GAUNTLET SolidWorks macro, which reads your feature tree.
			<a href="/gauntlet/tools">Get the macro and setup</a>. The seeded challenges below are labeled
			demos with placeholder drawings.
		</p>
	</div>

	{#if challenges.length === 0}
		<div class="card"><p>No challenges are published yet. Check back soon.</p></div>
	{:else}
		<ul class="challenge-list">
			{#each challenges as c (c.id)}
				<li>
					<a class="challenge-row" href="/gauntlet/feature-golf/{c.id}">
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
									{c.material ?? 'Material TBD'}{#if c.par != null} &middot; par {c.par}{/if}
								</span>
								{#if c.cleared}
									<span class="challenge-meta">Best {formatFeatures(c.bestMetric)} feat &middot; Rank #{c.rank}</span>
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
