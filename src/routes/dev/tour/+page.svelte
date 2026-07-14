<script lang="ts">
	import { TOUR_SEEN_KEY } from '$lib/tour/orientation';
	import HomePage from '../../+page.svelte';
	import { store } from './store.svelte';

	/**
	 * Manual verification harness for the first-time spotlight tour (dev-only,
	 * no auth / Supabase). The page below is the REAL home page component fed
	 * this route's mock session, so the tour runs its exact production path:
	 * auto-launch decisions, spotlight positioning against real layout, the
	 * stamped tour_completed_at write (logged in the panel), and the header's
	 * "Take the tour" replay. Mode links reload the page for a clean mount.
	 */
	let { data } = $props();

	const MODES = [
		{ id: 'anon', label: 'Anonymous', hint: 'phase A auto-launch (sign-in step)' },
		{ id: 'student', label: 'First-time student', hint: 'phase B auto-launch (home walk)' },
		{ id: 'done', label: 'Tour done', hint: 'no auto-launch, header replay only' },
		{ id: 'picker', label: 'Pathway picker first', hint: 'tour waits for the picker' }
	];

	const reset = () => {
		try {
			localStorage.removeItem(TOUR_SEEN_KEY);
			sessionStorage.removeItem('pathway-picker-dismissed');
		} catch {
			/* nothing to clear */
		}
		store.tourCompletedAt = null;
		store.pathway = null;
		store.log = [];
		location.reload();
	};
</script>

<svelte:head><title>Tour harness</title></svelte:head>

<HomePage {data} />

<div class="tour-harness">
	<div class="th-row">
		<strong>TOUR HARNESS</strong>
		<button type="button" onclick={reset}>Reset flags + reload</button>
	</div>
	<div class="th-row th-modes">
		{#each MODES as m (m.id)}
			<a href="?mode={m.id}" data-sveltekit-reload class:active={data.mode === m.id} title={m.hint}>
				{m.label}
			</a>
		{/each}
	</div>
	<div class="th-state">
		mode={data.mode} &middot; tour_completed_at={String(store.tourCompletedAt)}
	</div>
	{#if store.log.length}
		<div class="th-log">
			{#each store.log as line, i (i)}<div>{line}</div>{/each}
		</div>
	{/if}
</div>

<style>
	/* Above the tour layer (z 1100-1102) so reset/mode stay reachable mid-tour. */
	.tour-harness {
		position: fixed;
		right: 12px;
		bottom: 12px;
		z-index: 1200;
		width: 300px;
		background: var(--bg1, #050f07);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 8px;
		padding: 0.7rem 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--dim, #4a7a52);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
	}
	.th-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.45rem;
	}
	strong {
		color: var(--cyan, #00f0ff);
		letter-spacing: 0.14em;
	}
	button {
		font: inherit;
		color: var(--green, #00ff41);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 3px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
	}
	.th-modes a {
		color: var(--dim, #4a7a52);
		text-decoration: none;
		border: 1px solid rgba(74, 122, 82, 0.35);
		border-radius: 3px;
		padding: 0.22rem 0.45rem;
	}
	.th-modes a.active {
		color: var(--gold, #c8a848);
		border-color: color-mix(in srgb, var(--gold, #c8a848) 55%, transparent);
	}
	.th-state {
		color: var(--white, #e8ffe8);
		margin-bottom: 0.35rem;
		overflow-wrap: anywhere;
	}
	.th-log {
		border-top: 1px solid rgba(74, 122, 82, 0.3);
		padding-top: 0.35rem;
		max-height: 8rem;
		overflow-y: auto;
	}
	.th-log div {
		overflow-wrap: anywhere;
	}
</style>
