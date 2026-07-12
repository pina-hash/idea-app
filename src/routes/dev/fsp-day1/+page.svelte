<script lang="ts">
	import FspDeck from '$lib/fsp/FspDeck.svelte';
	import type { FspQuestion } from '$lib/fsp/FspLiveFeed.svelte';

	/**
	 * Dev harness for the FSP Day 1 deck. No auth, no Supabase. The floating strip
	 * jumps to the first / live slide and toggles slide 13 between its empty
	 * ("waiting for submissions") and populated states using sample data.
	 */
	const SAMPLE: FspQuestion[] = [
		{
			id: 's1',
			session_id: 'Day1-A',
			answered: false,
			created_at: new Date(Date.now() - 8000).toISOString(),
			question: 'How long does the pawn take to 3D print overnight?'
		},
		{
			id: 's2',
			session_id: 'Day1-A',
			answered: false,
			created_at: new Date(Date.now() - 64000).toISOString(),
			question: 'Can I do both the chess pawn and the dog tag?'
		},
		{
			id: 's3',
			session_id: 'Day1-A',
			answered: false,
			created_at: new Date(Date.now() - 200000).toISOString(),
			question: 'Do we get to actually drive the FRC robot on day 2?'
		}
	];

	let populated = $state(false);
	let startAt = $state(0);
	// Remount the deck when either control changes (startAt + sample are read on mount).
	let deckKey = $derived(`${startAt}-${populated}`);
</script>

<svelte:head>
	<title>dev · fsp-day1</title>
</svelte:head>

<div class="harness-bar">
	<strong>Deck harness</strong>
	<span>no auth / Supabase</span>
	<button onclick={() => (startAt = 0)}>First slide</button>
	<button onclick={() => (startAt = 12)}>Live slide (13)</button>
	<label><input type="checkbox" bind:checked={populated} /> populate feed</label>
	<span class="hint">← → space · Home/End · 1–9 · F full screen</span>
</div>

{#key deckKey}
	<FspDeck supabase={null} liveSample={populated ? SAMPLE : []} {startAt} />
{/key}

<style>
	.harness-bar {
		position: fixed;
		top: 10px;
		left: 10px;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 8px 12px;
		border-radius: 10px;
		background: rgba(8, 12, 8, 0.9);
		border: 1px solid rgba(0, 255, 65, 0.35);
		color: #e8ffe8;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
	}
	.harness-bar strong {
		color: #00ff41;
	}
	.harness-bar span {
		color: #4a7a52;
	}
	.harness-bar .hint {
		color: #00f0ff;
	}
	.harness-bar button {
		font: inherit;
		padding: 4px 8px;
		border-radius: 6px;
		border: 1px solid rgba(0, 255, 65, 0.35);
		background: transparent;
		color: #00ff41;
		cursor: pointer;
	}
	.harness-bar button:hover {
		background: rgba(0, 255, 65, 0.14);
	}
	.harness-bar label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: #e8ffe8;
	}
</style>
