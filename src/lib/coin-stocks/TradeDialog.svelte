<script lang="ts">
	import { coins } from '$lib/coin-format';
	import { parseCoinsTyped } from '$lib/coin-market/market';
	import { haltWords, price as priceText, sharesFor, type Stock, type StockRules } from './stocks';
	import type { StockTransports } from './transports';

	/**
	 * BUY OR SELL ONE STOCK WITH THE HOUSE, at the current price. The preview
	 * (the fee, the shares) is arithmetic for the eye; the database computes
	 * the trade at the price it holds when the trade arrives, refuses what it
	 * must (a trading pause among them), and its refusal is said here verbatim.
	 */
	let {
		stock,
		side,
		rules,
		balance,
		held,
		basis,
		transports,
		onclose,
		ondone
	}: {
		stock: Stock;
		side: 'buy' | 'sell';
		rules: StockRules;
		balance: number;
		held: number;
		basis: number;
		transports: StockTransports;
		onclose: () => void;
		ondone: (message: string) => void;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let amountText = $state('');
	let all = $state(false);
	let busy = $state(false);
	let said = $state<string | null>(null);

	$effect(() => {
		const el = dialogEl;
		if (el && !el.open) {
			try {
				el.showModal();
			} catch {
				el.setAttribute('open', '');
			}
		}
	});

	const last = $derived(stock.last?.close ?? 0);
	const amount = $derived(parseCoinsTyped(amountText, side === 'buy' ? 0.5 : 0.01));
	const fee = $derived(amount !== null ? Math.round(amount * rules.fee_percent) / 100 : 0);
	const heldValue = $derived(Math.round(held * last * 100) / 100);
	const room = $derived(Math.max(Math.floor(((rules.position_cap - basis) / (1 - rules.fee_percent / 100)) * 100) / 100, 0));
	const problem = $derived.by(() => {
		if (!last) return 'This stock has no price yet.';
		if (stock.halt) return haltWords(stock.halt);
		if (side === 'sell' && all) return null;
		if (amount === null) return side === 'buy' ? `Buy at least ${coins(0.5)}.` : 'Enter the coins to sell, or sell all.';
		if (side === 'buy') {
			if (balance < 0) return 'You are in debt, so you cannot buy. You can still sell.';
			if (balance - amount < 0) return `Your balance is ${coins(balance)}.`;
			if (amount > room) return `You can put ${coins(room)} more into this stock.`;
		} else if (amount > heldValue + 0.005) {
			return `You own ${coins(heldValue)} of it. You can only sell what you own (no shorting).`;
		}
		return null;
	});

	async function go() {
		if (problem || busy) return;
		busy = true;
		const r = side === 'buy' ? await transports.buy(stock.id, amount ?? 0) : await transports.sell(stock.id, all ? null : amount, all);
		busy = false;
		if (r.ok) {
			ondone(side === 'buy' ? `Bought ${stock.ticker}.` : `Sold ${stock.ticker}.`);
			close();
		} else said = r.words;
	}

	function close() {
		try {
			dialogEl?.close();
		} catch {
			/* nothing open */
		}
		onclose();
	}
</script>

<dialog
	class="mk-dialog"
	bind:this={dialogEl}
	aria-labelledby="sk-trade-title"
	onclose={() => onclose()}
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
	data-testid="sk-trade-dialog"
>
	<div class="mk-dialog-body">
		<div class="mk-dialog-head">
			<h2 id="sk-trade-title">{side === 'buy' ? 'Buy' : 'Sell'} {stock.ticker}</h2>
			<button type="button" class="btn secondary mk-key" onclick={close}>Close</button>
		</div>
		<dl class="mk-dl">
			<dt>Price now</dt>
			<dd class="mk-price">{priceText(last)}</dd>
			<dt>You own</dt>
			<dd>{held ? `${held.toFixed(4)} shares, ${coins(heldValue)}` : 'None'}</dd>
			<dt>Balance</dt>
			<dd>{coins(balance)}</dd>
		</dl>
		<label class="mk-field">
			{side === 'buy' ? 'Coins to put in' : 'Coins to take out'}
			<input type="text" inputmode="decimal" bind:value={amountText} disabled={side === 'sell' && all} placeholder="5" data-testid="sk-trade-amount" />
		</label>
		{#if side === 'sell'}
			<label class="mk-check"><input type="checkbox" bind:checked={all} data-testid="sk-trade-all" /> Sell everything I own</label>
		{/if}
		{#if amount !== null && last && !(side === 'sell' && all)}
			<p class="mk-note" data-testid="sk-trade-preview">
				{#if side === 'buy'}
					About {sharesFor(amount, last, rules.fee_percent).toFixed(4)} shares; the {rules.fee_percent}% fee is {coins(fee)}.
				{:else}
					About {(amount / last).toFixed(4)} shares; you get {coins(amount - fee)} after the {rules.fee_percent}% fee.
				{/if}
			</p>
		{/if}
		{#if problem && (amountText || all || stock.halt)}<p class="mk-why" data-testid="sk-trade-problem">{problem}</p>{/if}
		<div class="mk-row">
			<button type="button" class="btn mk-key" aria-disabled={problem !== null || busy} onclick={go} data-testid="sk-trade-go">
				{busy ? 'Working…' : side === 'buy' ? 'Buy' : 'Sell'}
			</button>
		</div>
		{#if said}<p class="mk-why" role="status" data-testid="sk-trade-said">{said}</p>{/if}
	</div>
</dialog>
