<script lang="ts">
	import BracketView from '$lib/tournaments/BracketView.svelte';
	import PoolsView from '$lib/tournaments/PoolsView.svelte';
	import { entryMap } from '$lib/tournaments/tournaments';
	import { buildSim, buildQualSample, playNext, startNext, type Sim } from './sim';

	let fieldSize = $state(6);
	let sim = $state<Sim>(buildSim(6));
	const qual = buildQualSample();

	const entries = $derived(entryMap(sim.entries));
	const qualEntries = entryMap(qual.entries);

	function rebuild(n: number) {
		fieldSize = n;
		sim = buildSim(n);
	}
	function playAll() {
		let guard = 0;
		while (guard++ < 300 && playNext(sim)) {
			/* run to champion */
		}
	}
	function forceReset() {
		// Play everything up to the grand final, then hand game one to the LB side.
		let guard = 0;
		while (guard++ < 300) {
			const gf = sim.matches.find((m) => m.bracket === 'grand_final');
			if (gf && gf.status !== 'complete' && gf.entry_a_id && gf.entry_b_id) break;
			if (!playNext(sim)) break;
		}
		playNext(sim, 'b');
	}
</script>

<svelte:head>
	<title>DEV · Tournaments harness</title>
</svelte:head>

<main class="harness">
	<h1>Tournaments harness (dev)</h1>
	<p class="note">
		In-memory simulator mirroring the 0062 double-elimination rules, driving the real
		components. No auth, no Supabase.
	</p>

	<div class="controls">
		<span>Field:</span>
		{#each [2, 5, 6, 8, 11, 16] as n (n)}
			<button class="ctl" class:on={fieldSize === n} onclick={() => rebuild(n)}>{n}</button>
		{/each}
		<span class="sep"></span>
		<button class="ctl" onclick={() => startNext(sim)}>start next (LIVE)</button>
		<button class="ctl" onclick={() => playNext(sim)}>play next</button>
		<button class="ctl" onclick={playAll}>play all</button>
		<button class="ctl" onclick={forceReset}>force GF reset</button>
		<button class="ctl" onclick={() => rebuild(fieldSize)}>rebuild</button>
		<span class="state">
			{sim.status === 'complete' ? 'COMPLETE' : 'LIVE'} ·
			{sim.matches.filter((m) => m.status === 'complete').length}/{sim.matches.length} matches
		</span>
	</div>

	<section>
		<h2>BracketView · {fieldSize} entries</h2>
		<BracketView matches={sim.matches} {entries} games={sim.games} championId={sim.championId} />
	</section>

	<section>
		<h2>PoolsView · sample quals (score mode)</h2>
		<PoolsView pools={qual.pools} matches={qual.matches} entries={qualEntries} scoreEntry />
	</section>
</main>

<style>
	.harness {
		max-width: 76rem;
		margin: 0 auto;
		padding: 1.5rem 1.2rem 4rem;
	}
	.note {
		color: var(--dim, #7a8a7a);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		margin: 1rem 0 1.4rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim, #7a8a7a);
	}
	.ctl {
		background: var(--bg1, #0d120d);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.ctl.on {
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
	}
	.sep {
		width: 0.8rem;
	}
	.state {
		margin-left: auto;
	}
	section {
		margin-top: 2rem;
	}
	h2 {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green, #00ff41);
	}
</style>
