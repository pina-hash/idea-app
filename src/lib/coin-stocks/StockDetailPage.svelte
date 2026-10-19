<script lang="ts">
	import '$lib/coin-market/market.css';
	import './stocks.css';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import { coins, coinNumber } from '$lib/coin-format';
	import StockChart from './StockChart.svelte';
	import { changeWords, KIND_WORDS, price, type StockClose, type StockDetail } from './stocks';

	/**
	 * ONE STOCK, AND HOW ITS PRICE IS MADE: every close with the recorded
	 * inputs that produced it and the formula version, newest first. A carried
	 * day says why it carried. Nothing on this page is computed in the browser.
	 */
	let { detail = null, state: pageState }: { detail?: StockDetail | null; state: 'ready' | 'missing' | 'updating' | 'signed_out' } = $props();

	function day(iso: string): string {
		const d = new Date(`${iso}T12:00:00`);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	/** The recorded inputs of one close, in words. */
	function inputsWords(c: StockClose, kind: string): string {
		const i = c.inputs as Record<string, unknown>;
		if (kind === 'index') {
			const m = Array.isArray(i.members) ? (i.members as { id: string; close: number }[]) : [];
			return m.length ? `Average of ${m.length} closes: ${m.map((x) => `${x.id.startsWith('class:') ? 'class' : x.id} ${Number(x.close).toFixed(2)}`).join(', ')}.` : 'No member closed.';
		}
		if (kind === 'class') {
			if (i.out_of === undefined) return '';
			return `${coinNumber(Number(i.earned))} earned of ${coinNumber(Number(i.out_of))} possible, ${i.students} students, ${i.items} assignments, ${day(String(i.window_start))} to ${day(String(i.window_end))}.`;
		}
		const daily = Array.isArray(i.daily) ? (i.daily as { day: string; people: number }[]) : [];
		return daily.length ? `People each day: ${daily.map((d) => d.people).join(', ')} (${day(daily[0].day)} to ${day(daily[daily.length - 1].day)}).` : '';
	}
</script>

<svelte:head>
	<title>{detail ? `${detail.stock.ticker} · IDEA Stocks` : 'IDEA Stocks'}</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/market/stocks">All stocks</a>
		<ProfileMenu />
	</div>
</div>

<main class="mk-page" data-testid="sk-detail" data-state={pageState}>
	{#if pageState !== 'ready' || !detail}
		<section class="card mk-panel">
			<h2>{pageState === 'updating' ? 'The stock market is being set up' : pageState === 'signed_out' ? 'Sign in to see this stock' : 'That stock is not trading'}</h2>
			<a class="btn secondary mk-key" href="/market/stocks">Back to the stocks</a>
		</section>
	{:else}
		{@const s = detail.stock}
		{@const mv = changeWords(s.last?.change_percent ?? null)}
		<section class="mk-hero">
			<div>
				<div class="mk-eyebrow">{s.ticker}</div>
				<h1>{s.name}</h1>
				<p class="lead">{KIND_WORDS[s.kind]}</p>
			</div>
			<div class="sk-hero-figure">
				<span class="sk-big">{s.last ? price(s.last.close) : 'No price yet'}</span>
				<span class="sk-move {mv.tone}">{mv.text}</span>
			</div>
		</section>
		<div class="mk-layout">
			<div class="mk-col">
				<section class="card mk-panel">
					<StockChart series={s.series} label={s.ticker} height={180} />
				</section>
				<section class="card mk-panel" aria-labelledby="sk-h-made" data-testid="sk-made">
					<header><h2 id="sk-h-made">How this price is made</h2></header>
					<p class="mk-body">
						{#if s.kind === 'index'}
							The IDEA index is the plain average of every other stock's close that day.
						{:else}
							The signal is the number under "Signal". The price is the base times the signal divided by the signal's median over the window, moved at most the daily limit, and kept between the floor and the ceiling. A day with no data keeps the previous price.
						{/if}
					</p>
					<div class="sk-scroll">
						<table class="sk-table">
							<thead>
								<tr><th>Day</th><th>Close</th>{#if s.kind !== 'index'}<th>Signal</th><th>Median</th><th>Formula says</th>{/if}<th>From</th></tr>
							</thead>
							<tbody>
								{#each detail.closes as c (c.day)}
									<tr data-testid="sk-close-row">
										<td class="num">{day(c.day)}</td>
										<td class="num">{price(c.close)}</td>
										{#if s.kind !== 'index'}
											<td class="num">{c.signal !== null ? c.signal.toFixed(4) : 'None'}</td>
											<td class="num">{c.median !== null ? Number(c.median).toFixed(4) : 'None'}</td>
											<td class="num">{c.target !== null ? price(c.target) : 'None'}</td>
										{/if}
										<td class="sk-inputs">
											{#if c.carried}<strong>Carried.</strong> {c.note ?? ''}{:else}{inputsWords(c, s.kind)}{/if}
											<span class="mk-note"> Formula {c.formula_version}.</span>
										</td>
									</tr>
								{:else}
									<tr><td colspan="6">No closes yet.</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			</div>
			<aside class="mk-col">
				<section class="card mk-panel" aria-labelledby="sk-h-yours">
					<header><h2 id="sk-h-yours">Yours</h2></header>
					{#if detail.position}
						<p class="mk-body">{detail.position.shares.toFixed(4)} shares, paid {coins(detail.position.cost_basis)}, worth {coins(Math.round(detail.position.shares * (s.last?.close ?? 0) * 100) / 100)}.</p>
					{:else}
						<p class="mk-note">You own none.</p>
					{/if}
					{#if detail.trades.length}
						<ul class="mk-feed">
							{#each detail.trades as t, i (i)}
								<li>
									<span class="mk-feed-who">{t.side === 'buy' ? 'Bought' : 'Sold'} {t.shares.toFixed(4)} at {price(t.price)}</span>
									<span class="mk-feed-amt">{coins(t.gross)}</span>
									<span class="mk-feed-msg">Fee {coins(t.fee)}{t.side === 'sell' ? `, ${t.pnl >= 0 ? 'gain' : 'loss'} ${coins(Math.abs(t.pnl))}` : ''}</span>
								</li>
							{/each}
						</ul>
					{/if}
					<a class="btn mk-key" href="/market/stocks">Trade on the stocks page</a>
				</section>
			</aside>
		</div>
	{/if}
</main>
