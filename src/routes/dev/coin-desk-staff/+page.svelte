<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import CoinDeskNav from '$lib/coin-desk/CoinDeskNav.svelte';
	import QueueView from '$lib/coin-desk/QueueView.svelte';
	import PaydayView from '$lib/coin-desk/PaydayView.svelte';
	import DigestView from '$lib/coin-desk/DigestView.svelte';
	import TournamentTransfer from '$lib/coin-desk/TournamentTransfer.svelte';
	import { areaAllowed, type CoinDeskAreaId } from '$lib/coin-desk/nav';
	import type { PushAvailability } from '$lib/tournaments/push-client';
	import '$lib/shell/split.css';
	// The room's geometry, the SAME file the real layout imports.
	import '$lib/coin-desk/coin-desk.css';
	import { createFakeStaff } from './fake';

	/**
	 * DEV HARNESS for the coin desk's four IDEA Coin V2 staff areas, mounting
	 * the REAL QueueView, PaydayView, DigestView and TournamentTransfer inside
	 * the coin desk's own room (`.cd-root` and `.coin-desk-page`, the real
	 * layout's two wrappers) over an in-memory backend (fake.ts).
	 *
	 *   ?view=queue|payday|digest|tournaments   which area (default queue)
	 *   ?scope=section   a section coin staff member: only Block 2's students,
	 *                    no Undo in the digest, and the tournament area answers
	 *                    the page's own 404, as the real route does
	 *   ?missing=1       every call answers as a database without the update
	 *   ?push=unconfigured|unsupported|denied   what this browser says about push
	 *   ?refuse=1        approving the split card answers pass_already_active
	 *
	 * THE LOG BENEATH RECORDS WHAT EACH COMPONENT SENT, which is the assertion a
	 * screen cannot make (Done sends only the ticked ids; Transfer sends the
	 * amounts on screen).
	 */
	const q = untrack(() => page.url.searchParams);
	const scope = q.get('scope') === 'section' ? 'section' : 'full';
	const pushParam = q.get('push');
	const push: PushAvailability =
		pushParam === 'unconfigured' || pushParam === 'unsupported' || pushParam === 'denied' ? pushParam : 'available';
	const VIEWS = ['queue', 'payday', 'digest', 'tournaments'] as const;
	type View = (typeof VIEWS)[number];
	const asked = q.get('view');
	let view = $state<View>((VIEWS as readonly string[]).includes(asked ?? '') ? (asked as View) : 'queue');
	let other = $state<CoinDeskAreaId | null>(null);

	let log = $state<string[]>([]);
	const note = (line: string) => {
		log = [...log.slice(-40), line];
	};
	const fake = createFakeStaff(
		{ scope, missing: q.get('missing') === '1', push, refuseSplit: q.get('refuse') === '1' },
		note
	);

	function select(id: CoinDeskAreaId) {
		if ((VIEWS as readonly string[]).includes(id)) {
			view = id as View;
			other = null;
		} else {
			other = id;
		}
	}

	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
</script>

<svelte:head><title>Coin desk staff areas harness</title></svelte:head>

<div class="cd-root" data-testid="coin-desk-staff-harness" data-staff-hydrated={hydrated ? 'true' : undefined} data-scope={scope}>
	<main class="coin-desk-page">
		<section class="hero">
			<div class="eyebrow">IDEA // Coin Desk (dev harness, {scope === 'full' ? 'full coin admin' : 'section coin staff'})</div>
			<h1>Coin desk</h1>
		</section>

		<CoinDeskNav active={other ?? view} {scope} onSelect={select} />

		{#if other}
			<section class="card">
				<h2>Not in this harness</h2>
				<p class="cdx-note">This area has its own harness. This one mounts the queue, payday, the digest and tournaments.</p>
			</section>
		{:else if !areaAllowed(view, scope)}
			<section class="card" data-testid="cd-harness-404">
				<h2>Not found</h2>
				<p class="cdx-note">
					The real route answers 404 here: this area is a full coin admin's, and section coin staff are not
					offered it.
				</p>
			</section>
		{:else}
			{#key view}
				{#if view === 'queue'}
					<QueueView transports={fake.queue} />
				{:else if view === 'payday'}
					<PaydayView transports={fake.payday} />
				{:else if view === 'digest'}
					<DigestView transports={fake.digest} queueHref="/dev/coin-desk-staff?view=queue" />
				{:else}
					<TournamentTransfer transports={fake.tournaments} />
				{/if}
			{/key}
		{/if}

		<details class="sh-log">
			<summary>What the screen sent ({log.length})</summary>
			<ol data-testid="cd-harness-log">
				{#each log as line, i (i)}
					<li>{line}</li>
				{/each}
			</ol>
		</details>
	</main>
</div>

<style>
	.sh-log {
		color: var(--text-2, var(--dim));
		font-family: var(--font-mono, monospace);
		font-size: 0.8rem;
		margin-top: 1rem;
	}
	.sh-log summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		cursor: pointer;
	}
	.sh-log ol {
		overflow-wrap: anywhere;
	}
</style>
