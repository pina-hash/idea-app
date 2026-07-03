<script lang="ts">
	import RoomClocks from '$lib/gauntlet/RoomClocks.svelte';
	import '$lib/gauntlet/viewport/viewport.css';

	/**
	 * Dev-only harness for the two live-room timers (RoomClocks). The room page is
	 * auth-gated, so this exercises the component directly: ROOM counts from an
	 * "opened 6 minutes ago" anchor, RUN counts from a start anchor, the crimson
	 * LIVE badge shows while live, and RUN freezes on the scored time when stopped.
	 */
	let live = $state(true);
	let stopped = $state(false);

	// Fixed anchors relative to load (Date.now is fine at runtime in the browser).
	const openedMs = Date.now() - 6 * 60 * 1000; // room opened 6 min ago
	let runStartMs = $state(Date.now() - 42 * 1000); // run started 42s ago

	function restartRun() {
		runStartMs = Date.now();
		stopped = false;
		live = true;
	}
</script>

<svelte:head><title>RoomClocks harness</title></svelte:head>

<div class="gt-root">
	<div class="harness">
		<h1>Live-room timers harness</h1>
		<p class="note">
			ROOM should tick up from ~06:00 (opened 6 min ago); RUN should tick from ~00:42 with centiseconds
			while live. Toggle LIVE off or Stop to confirm RUN freezes; Stop shows the scored final time.
		</p>

		<div class="bar">
			<button type="button" onclick={() => (live = !live)}>live: {live}</button>
			<button type="button" onclick={() => (stopped = !stopped)}>stopped: {stopped}</button>
			<button type="button" onclick={restartRun}>restart run</button>
		</div>

		<RoomClocks
			roomOpenedMs={openedMs}
			{runStartMs}
			{live}
			runStopped={stopped}
			runResultMs={stopped ? 63120 : null}
		/>
	</div>
</div>

<style>
	.harness {
		max-width: 720px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
	}
	h1 {
		font-family: 'Orbitron', sans-serif;
		font-size: 1.1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.note {
		color: var(--dim, #5f8a78);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.bar {
		display: flex;
		gap: 0.6rem;
		margin: 1rem 0 1.5rem;
	}
	.bar button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--cyan, #00f0ff);
		background: var(--panel-2, #0e161b);
		border: 1px solid var(--line, #16242c);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
	}
</style>
