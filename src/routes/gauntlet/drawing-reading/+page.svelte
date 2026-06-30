<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { difficultyLabel, formatTime } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenges } = $derived(data);

	const cleared = $derived(challenges.filter((c) => c.cleared).length);
</script>

<svelte:head>
	<title>Drawing Reading // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Drawing Reading' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Knowledge Mode</span>
		<h1>Drawing Reading</h1>
		<p class="lead">
			Read orthographic views and dimensions, then match the 3D part to its drawing. Each
			challenge is scored on correctness, with your time breaking ties on the board.
		</p>
		<div class="mode-hero-meta">
			<span class="mono">{cleared} / {challenges.length} cleared</span>
		</div>
	</section>

	{#if challenges.length === 0}
		<div class="card">
			<p>No challenges are published yet. Check back soon.</p>
		</div>
	{:else}
		<ul class="challenge-list">
			{#each challenges as c (c.id)}
				<li>
					<a class="challenge-row" href="/gauntlet/drawing-reading/{c.id}">
						<span class="challenge-state" class:done={c.cleared} class:tried={c.attempted && !c.cleared}>
							{#if c.cleared}✓{:else if c.attempted}•{:else}{''}{/if}
						</span>
						<span class="challenge-main">
							<span class="challenge-title">{c.title}</span>
							<span class="challenge-sub">
								<span class="diff diff-{c.difficulty}">{difficultyLabel(c.difficulty)}</span>
								{#if c.cleared}
									<span class="challenge-meta">Best {formatTime(c.bestTime)} &middot; Rank #{c.rank}</span>
								{:else if c.attempted}
									<span class="challenge-meta warn">Attempted, not cleared</span>
								{:else}
									<span class="challenge-meta dim">Not attempted</span>
								{/if}
							</span>
						</span>
						<span class="challenge-go">Play &rsaquo;</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet">&lsaquo; All modes</a>
	</div>
</main>
