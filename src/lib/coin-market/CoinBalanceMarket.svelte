<script lang="ts">
	import './market.css';
	import { coins } from '$lib/coin-format';
	import Glyph from './Glyph.svelte';
	import HallPassMinutes from './HallPassMinutes.svelte';
	import TransferSheet from './TransferSheet.svelte';
	import type { HallPassMinutesQuote } from '$lib/classroom/hall-pass';
	import type { TransferTransports } from './transports';

	/**
	 * THE COIN PAGE'S DOOR TO THE LATER FEATURES (ledger 0402): the market, the
	 * stocks (a portfolio is never part of the balance, and says so), sending
	 * coins, and buying hall pass time per class. The Buy section below it is
	 * unchanged; this only adds. A section whose read is missing is not drawn.
	 */
	let {
		portfolio = null,
		minuteClasses = null,
		transfers = null,
		minutesQuote = null,
		buyMinutes = null,
		inEconomy = false,
		ondone = null
	}: {
		portfolio?: { value: number; cost_basis: number; count: number } | null;
		minuteClasses?: { section_id: string; label: string }[] | null;
		transfers?: TransferTransports | null;
		minutesQuote?: ((sectionId: string) => Promise<HallPassMinutesQuote | null>) | null;
		buyMinutes?: ((sectionId: string, blocks: number) => Promise<{ ok: true; minutes: number; cost: number } | { ok: false; message: string }>) | null;
		inEconomy?: boolean;
		ondone?: (() => void) | null;
	} = $props();

	let sending = $state(false);
	let flash = $state<string | null>(null);
</script>

<section class="card mk-panel" aria-labelledby="cbm-h" data-testid="coin-market-strip">
	<header>
		<h2 id="cbm-h">Market, stocks and transfers</h2>
		<div class="mk-row">
			<a class="btn mk-key" href="/market" data-testid="coin-market-link"><Glyph name="shop" size={16} /> IDEA Market</a>
			<a class="btn secondary mk-key" href="/market/stocks"><Glyph name="stocks" size={16} /> Stocks</a>
			{#if transfers && inEconomy}
				<button type="button" class="btn secondary mk-key" onclick={() => (sending = true)} data-testid="coin-send-open"><Glyph name="transfer" size={16} /> Send coins</button>
			{/if}
		</div>
	</header>
	<p class="mk-sub">Buy from classmates and the shop on the market, with escrow on every trade. The Buy section below still works the same.</p>
	{#if portfolio && portfolio.count > 0}
		<p class="mk-body" data-testid="coin-portfolio">
			Your stocks are worth {coins(portfolio.value)} at the last closes (you paid {coins(portfolio.cost_basis)}). That is not part of your balance until you sell.
		</p>
	{/if}
	{#if minutesQuote && buyMinutes && minuteClasses && minuteClasses.length}
		<h3>Extra hall pass time</h3>
		{#each minuteClasses as c (c.section_id)}
			<HallPassMinutes sectionId={c.section_id} label={minuteClasses.length > 1 ? c.label : null} quote={minutesQuote} buy={buyMinutes} onbought={() => ondone?.()} />
		{/each}
	{/if}
	{#if flash}<p class="mk-ok" role="status">{flash}</p>{/if}
</section>

{#if sending && transfers}
	<TransferSheet
		transports={transfers}
		onclose={() => (sending = false)}
		ondone={(m) => {
			flash = m;
			ondone?.();
		}}
	/>
{/if}
