<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import FspLiveFeed, { type FspQuestion } from '$lib/fsp/FspLiveFeed.svelte';

	/**
	 * Dev harness for /fsp/day1. No auth, no Supabase. Shows the hosted standalone
	 * deck in the iframe and a button that fakes the slide-13 postMessage so the
	 * live-feed overlay is verifiable without clicking through all 13 slides. It
	 * also listens for the REAL FSP_SLIDE messages the deck re-emits, so driving
	 * the deck to slide 13 also flips the overlay. The overlay renders the real
	 * FspLiveFeed with sample questions (supabase = null) so no network is needed.
	 */

	const SLIDES_SRC = '/fsp/day1-slides.html';

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

	let liveActive = $state(false);
	let populated = $state(true);
	let count = $state(0);

	function onMessage(e: MessageEvent) {
		const d = e.data;
		if (!d || d.type !== 'FSP_SLIDE') return;
		liveActive = d.slide === 13;
	}

	onMount(() => window.addEventListener('message', onMessage));
	onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('message', onMessage);
	});
</script>

<svelte:head>
	<title>dev · fsp-day1</title>
</svelte:head>

<div class="harness-bar">
	<strong>Day 1 deck harness</strong>
	<span>no auth / Supabase</span>
	<button onclick={() => (liveActive = !liveActive)}>
		{liveActive ? 'Hide slide-13 overlay' : 'Simulate slide 13'}
	</button>
	<label><input type="checkbox" bind:checked={populated} /> populate feed</label>
	<span class="hint">drive the real deck to slide 13 to trigger the overlay too</span>
</div>

<div class="deck-root">
	<iframe class="deck" src={SLIDES_SRC} title="FSP Day 1 presentation" allow="fullscreen"></iframe>

	{#if liveActive}
		<div class="live-overlay">
			<header class="live-head">
				<h2>Your Questions.</h2>
				<span class="live-badge">
					<span class="dot"></span>
					<span class="lbl">LIVE</span>
					{#if count > 0}<span class="cnt">{count}</span>{/if}
				</span>
			</header>
			<div class="live-body">
				<!-- Key on `populated` so toggling it remounts the feed (FspLiveFeed
				     reads sampleQuestions once on mount) and both states show live. -->
				{#key populated}
					<FspLiveFeed
						variant="slide"
						supabase={null}
						sampleQuestions={populated ? SAMPLE : []}
						bind:count
					/>
				{/key}
			</div>
		</div>
	{/if}
</div>

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
		background: rgba(8, 12, 8, 0.92);
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

	.deck-root {
		position: fixed;
		inset: 0;
		background: #0a0a0a;
		overflow: hidden;
		z-index: 1;
	}
	.deck {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
	.live-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		background: #0a0a0a;
		display: flex;
		flex-direction: column;
		padding: 40px 56px 44px;
		color: #e8ffe8;
		font-family: 'Rajdhani', system-ui, sans-serif;
	}
	.live-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 22px;
	}
	.live-head h2 {
		margin: 0;
		font-size: clamp(2.4rem, 5vw, 4.4rem);
		font-weight: 700;
		line-height: 1;
		color: var(--green, #00ff41);
		text-shadow: var(--glow-green, 0 0 18px rgba(0, 255, 65, 0.5));
	}
	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 14px;
		padding: 10px 22px;
		border: 1px solid rgba(255, 51, 85, 0.5);
		border-radius: 2px;
		font-family: 'Share Tech Mono', monospace;
	}
	.live-badge .dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--crimson, #ff3355);
	}
	.live-badge .lbl {
		font-size: clamp(1rem, 1.8vw, 1.6rem);
		letter-spacing: 0.2em;
		color: var(--crimson, #ff3355);
	}
	.live-badge .cnt {
		font-size: clamp(1rem, 1.8vw, 1.6rem);
		letter-spacing: 0.08em;
		color: var(--cyan, #00f0ff);
	}
	.live-body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>
