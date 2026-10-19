<script lang="ts">
	import { untrack } from 'svelte';
	import { coins } from '$lib/coin-format';
	import type { HallPassMinutesQuote } from '$lib/classroom/hall-pass';

	/**
	 * BUY HALL PASS TIME FOR TODAY (ledger 0402, 0278): whole blocks, up to the
	 * day's limit, never below zero. Mounted on the hall pass card for a
	 * student and on the coin page per class. The rule a student is told is the
	 * database's: the time adds to today's budget and moves today's warning and
	 * fine later for passes opened afterwards, never past the auto check-in, and
	 * never removes a fine already given.
	 */
	let {
		sectionId,
		label = null,
		quote: loadQuote,
		buy,
		onbought = null
	}: {
		sectionId: string;
		label?: string | null;
		quote: (sectionId: string) => Promise<HallPassMinutesQuote | null>;
		buy: (sectionId: string, blocks: number) => Promise<{ ok: true; minutes: number; cost: number } | { ok: false; message: string }>;
		onbought?: (() => void) | null;
	} = $props();

	let q = $state<HallPassMinutesQuote | null>(null);
	let armed = $state<number | null>(null);
	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);

	async function refresh() {
		q = await loadQuote(sectionId);
	}
	$effect(() => {
		const id = sectionId;
		untrack(() => {
			void id;
			refresh();
		});
	});

	const options = $derived(q && q.price_per_block !== null ? Array.from({ length: Math.min(q.room_blocks, 3) }, (_, i) => i + 1) : []);

	async function go(blocks: number) {
		if (busy) return;
		busy = true;
		const r = await buy(sectionId, blocks);
		busy = false;
		armed = null;
		if (r.ok) {
			said = { ok: true, text: `Added ${r.minutes} minutes for today for ${coins(r.cost)}.` };
			await refresh();
			onbought?.();
		} else said = { ok: false, text: r.message };
	}
</script>

{#if q && q.available && q.price_per_block !== null}
	<div class="hpm" data-testid="hall-pass-minutes">
		<p class="hpm-line">
			{label ? `${label}: ` : ''}Need more time today? {q.block_minutes} minutes for {coins(q.price_per_block)}, up to {q.cap_minutes} extra minutes a day.
			{#if q.bought_today_minutes}You bought {q.bought_today_minutes} today.{/if}
		</p>
		{#if options.length && armed === null}
			<div class="hpm-keys">
				{#each options as b (b)}
					<button type="button" class="btn secondary tap-44" disabled={busy} onclick={() => (armed = b)} data-testid="hall-pass-minutes-{b}">
						+{b * q.block_minutes} min · {coins(b * q.price_per_block)}
					</button>
				{/each}
			</div>
		{:else if armed !== null}
			<div class="hpm-keys">
				<button type="button" class="btn tap-44" disabled={busy} onclick={() => go(armed!)} data-testid="hall-pass-minutes-confirm">
					Buy {armed * q.block_minutes} minutes for {coins(armed * q.price_per_block)}
				</button>
				<button type="button" class="btn secondary tap-44" onclick={() => (armed = null)}>Not now</button>
			</div>
			<p class="hpm-note">It also moves today's warning and fine later by that much for passes you open after buying. It never removes a fine already given.</p>
		{:else}
			<p class="hpm-note">You have bought all the extra time allowed today.</p>
		{/if}
		{#if said}<p class={said.ok ? 'hpm-ok' : 'hpm-why'} role="status" data-testid="hall-pass-minutes-said">{said.text}</p>{/if}
	</div>
{/if}

<style>
	.hpm {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		border-top: 1px solid var(--hairline);
		padding-top: 0.6rem;
		margin-top: 0.2rem;
	}
	.hpm-line,
	.hpm-note,
	.hpm-ok,
	.hpm-why {
		margin: 0;
		font-size: 0.93rem;
		color: var(--text-2);
	}
	.hpm-line {
		color: var(--text-1);
	}
	.hpm-ok {
		color: var(--green);
	}
	.hpm-why {
		color: var(--amber);
	}
	.hpm-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
</style>
