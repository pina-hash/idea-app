<script lang="ts">
	import '$lib/coin-market/market.css';
	import './stocks.css';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import CoinPagesNav from '$lib/coin-bar/CoinPagesNav.svelte';
	import PageHeader from '$lib/shell/PageHeader.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { coins } from '$lib/coin-format';
	import StockChart from './StockChart.svelte';
	import TradeDialog from './TradeDialog.svelte';
	import {
		changeWords,
		clock,
		haltRulesWords,
		haltWords,
		KIND_WORDS,
		phaseWords,
		price,
		priceFormulaWords,
		rampWords,
		shortDay,
		tradeRulesWords,
		topMovers,
		type Stock,
		type StocksBoard
	} from './stocks';
	import type { StockTransports } from './transports';

	/**
	 * THE IDEA STOCK MARKET (ledger 0402; relaunched, 0283). The IDEA index on
	 * top, every stock with its price, its move since the day's start, where it
	 * stands in the launch weeks, any trading pause, and its history since the
	 * launch; your holdings; a separate leaderboard by portfolio value. Every
	 * price traces to recorded site data: each stock's page says how each price
	 * was made. The route mounts this over the database and refreshes it each
	 * minute; `/dev/coin-stocks` over an in-memory board.
	 */
	let {
		state: pageState,
		board = null,
		transports = null,
		onchanged = null,
		coinDesk = false
	}: {
		state: 'ready' | 'signed_out' | 'updating' | 'error';
		board?: StocksBoard | null;
		transports?: StockTransports | null;
		onchanged?: (() => void) | null;
		/** Ledger 0422: whether the IDEA Coin bar offers the Coin Desk (coin staff only). */
		coinDesk?: boolean;
	} = $props();

	let trading = $state<{ stock: Stock; side: 'buy' | 'sell' } | null>(null);
	let flash = $state<string | null>(null);

	const index = $derived(board?.stocks.find((s) => s.kind === 'index') ?? null);
	const others = $derived(board?.stocks.filter((s) => s.kind !== 'index') ?? []);
	const movers = $derived(topMovers(board?.stocks ?? []));
	const canTrade = $derived(!!transports && !!board?.in_economy);
	const gain = $derived(board ? Math.round((board.portfolio.value - board.portfolio.cost_basis) * 100) / 100 : 0);

	function held(id: string): { shares: number; basis: number } {
		const p = board?.portfolio.positions.find((x) => x.stock_id === id);
		return { shares: p?.shares ?? 0, basis: p?.cost_basis ?? 0 };
	}
</script>

<svelte:head>
	<title>IDEA Stocks · IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/market">Market</a>
		<ProfileMenu />
	</div>
</div>
<CoinPagesNav current="stocks" desk={coinDesk} />

<main class="mk-page" data-testid="sk-page" data-state={pageState}>
	<PageHeader eyebrow="IDEA Coins" title="IDEA Stocks" meta="Prices made from what really happens on the site: grades, the Foundry, GAUNTLET, the Market, Tournaments and every other part of it. They update about every minute on class days.">
		{#snippet actions()}
			{#if board}
				<span class="idea-display mk-balance">
					<span class="idea-display-label">Balance</span>
					<span class="mk-balance-figure" class:neg={board.balance < 0}>{coins(board.balance)}</span>
				</span>
				<span class="idea-display mk-balance" data-testid="sk-portfolio-value">
					<span class="idea-display-label">In stocks</span>
					<span class="mk-balance-figure">{coins(board.portfolio.value)}</span>
				</span>
			{/if}
		{/snippet}
	</PageHeader>

	{#if pageState === 'signed_out'}
		<section class="card mk-panel"><p class="mk-body">Sign in to see the stock market.</p></section>
	{:else if pageState === 'updating'}
		<section class="card mk-panel" data-testid="sk-updating"><h2>The stock market is being set up</h2><p class="mk-body">Check back soon.</p></section>
	{:else if pageState === 'error' || !board}
		<section class="card mk-panel"><h2>The stock market could not be read</h2><p class="mk-body">Try again in a minute.</p></section>
	{:else}
		{#if flash}<p class="mk-ok" role="status" data-testid="sk-flash">{flash}</p>{/if}
		{#if !board.open_today}<p class="mk-note" data-testid="sk-closed">The market is closed today. Trades happen on class days; selling and buying open again then.</p>{/if}
		{#if board.last_tick_at || board.launched_at}
			<p class="mk-note" data-testid="sk-fresh">
				{#if board.launched_at}Relaunched {shortDay(board.launched_at)}; every chart starts there.{/if}
				{#if board.last_tick_at}Prices checked at {clock(board.last_tick_at)}.{/if}
			</p>
		{/if}
		<ul class="sk-strip" aria-label="Live prices" data-testid="sk-strip">
			{#each board.stocks as t (t.id)}
				{@const m = changeWords(t.last?.change_percent ?? null)}
				<li>
					<a href="/market/stocks/{encodeURIComponent(t.id)}">
						<strong>{t.ticker}</strong>
						<span>{t.last ? price(t.last.close) : 'No price'}</span>
						<span class="sk-move {m.tone}">{m.text}</span>
					</a>
				</li>
			{/each}
		</ul>
		<div class="mk-layout">
			<div class="mk-col">
				{#if index}
					{@const mv = changeWords(index.last?.change_percent ?? null)}
					<section class="card mk-panel" aria-labelledby="sk-h-index" data-testid="sk-index">
						<header>
							<h2 id="sk-h-index">IDEA index</h2>
							<a class="btn secondary mk-key" href="/market/stocks/{index.id}">How it is made</a>
						</header>
						<div class="sk-hero">
							<div class="sk-hero-figure">
								<span class="sk-big" data-testid="sk-index-price">{index.last ? price(index.last.close) : 'No price yet'}</span>
								<span class="sk-move {mv.tone}">{mv.text}</span>
								<span class="mk-note">{KIND_WORDS.index}</span>
								{#if index.halt}<span class="sk-halt" data-testid="sk-halt">{haltWords(index.halt)}</span>{:else if index.phase}<span class="mk-note">{phaseWords(index.phase)}</span>{/if}
							</div>
							<StockChart series={index.series} label="IDEA index" height={160} />
						</div>
						{#if canTrade}
							<div class="mk-row">
								<button type="button" class="btn mk-key" disabled={!board.open_today || !!index.halt} onclick={() => (trading = { stock: index, side: 'buy' })}>Buy IDEA</button>
								{#if held(index.id).shares > 0}
									<button type="button" class="btn secondary mk-key" disabled={!board.open_today || !!index.halt} onclick={() => (trading = { stock: index, side: 'sell' })}>Sell IDEA</button>
								{/if}
							</div>
						{/if}
					</section>
				{/if}

				<section class="card mk-panel" aria-labelledby="sk-h-movers" data-testid="sk-movers">
					<header><h2 id="sk-h-movers">Top movers today</h2></header>
					<div class="sk-movers">
						<div>
							<h3 class="mk-sub">Gainers</h3>
							<ol>
								{#each movers.gainers as g (g.id)}
									<li data-testid="sk-gainer"><a href="/market/stocks/{encodeURIComponent(g.id)}">{g.ticker}</a><span class="sk-move up">{changeWords(g.last?.change_percent ?? null).text}</span></li>
								{:else}
									<li class="mk-note">No stock is up today.</li>
								{/each}
							</ol>
						</div>
						<div>
							<h3 class="mk-sub">Losers</h3>
							<ol>
								{#each movers.losers as l (l.id)}
									<li data-testid="sk-loser"><a href="/market/stocks/{encodeURIComponent(l.id)}">{l.ticker}</a><span class="sk-move down">{changeWords(l.last?.change_percent ?? null).text}</span></li>
								{:else}
									<li class="mk-note">No stock is down today.</li>
								{/each}
							</ol>
						</div>
					</div>
				</section>

				<section class="card mk-panel" aria-labelledby="sk-h-stocks" data-testid="sk-stocks">
					<header>
						<h2 id="sk-h-stocks">Stocks</h2>
						<span class="mk-sub">{others.length} trading</span>
					</header>
					<ul class="sk-rows">
						{#each others as s (s.id)}
							{@const mv = changeWords(s.last?.change_percent ?? null)}
							{@const h = held(s.id)}
							<li class="mk-tile sk-row" data-testid="sk-stock" data-stock-id={s.id}>
								<div class="sk-row-head">
									<span class="sk-ticker">{s.ticker}</span>
									<span class="mk-price">{s.last ? price(s.last.close) : 'No price yet'}</span>
								</div>
								<div class="sk-row-head">
									<span class="sk-name">{s.name}</span>
									<span class="sk-move {mv.tone}">{mv.text}</span>
								</div>
								<StockChart series={s.series} label={s.ticker} height={56} axis={false} />
								{#if s.last && s.last.high !== null && s.last.low !== null}
									<span class="sk-range" data-testid="sk-range">Day high {price(s.last.high)} · low {price(s.last.low)}</span>
								{/if}
								<span class="mk-note">{KIND_WORDS[s.kind]}{s.last?.carried ? ' No new data: the price holds.' : ''}</span>
								{#if s.halt}<span class="sk-halt" data-testid="sk-halt">{haltWords(s.halt)}</span>{:else if s.phase}<span class="mk-note">{phaseWords(s.phase)}</span>{/if}
								{#if h.shares > 0}<span class="mk-note">You own {h.shares.toFixed(4)} shares.</span>{/if}
								<div class="mk-row">
									<a class="btn secondary mk-key" href="/market/stocks/{encodeURIComponent(s.id)}" data-testid="sk-details">How it is made</a>
									{#if canTrade && s.last}
										<button type="button" class="btn mk-key" disabled={!board.open_today || !!s.halt} onclick={() => (trading = { stock: s, side: 'buy' })} data-testid="sk-buy">Buy</button>
										{#if h.shares > 0}
											<button type="button" class="btn secondary mk-key" disabled={!board.open_today || !!s.halt} onclick={() => (trading = { stock: s, side: 'sell' })} data-testid="sk-sell">Sell</button>
										{/if}
									{/if}
								</div>
							</li>
						{:else}
							<li><p class="mk-empty">No stocks are trading yet.</p></li>
						{/each}
					</ul>
				</section>
			</div>

			<aside class="mk-col" aria-label="Your stocks">
				<section class="card mk-panel" aria-labelledby="sk-h-mine" data-testid="sk-portfolio">
					<header>
						<h2 id="sk-h-mine">Your portfolio</h2>
						<span class="sk-move {gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat'}">{gain > 0 ? '+' : ''}{coins(gain)}</span>
					</header>
					{#if board.portfolio.positions.length}
						<table class="sk-table">
							<thead><tr><th>Stock</th><th>Shares</th><th>Paid</th><th>Worth</th></tr></thead>
							<tbody>
								{#each board.portfolio.positions as p (p.stock_id)}
									<tr><td>{p.ticker}</td><td class="num">{p.shares.toFixed(4)}</td><td class="num">{coins(p.cost_basis)}</td><td class="num">{coins(p.value)}</td></tr>
								{/each}
							</tbody>
						</table>
						<p class="mk-note">Worth {coins(board.portfolio.value)} at today's prices. Not part of your balance until you sell.</p>
					{:else}
						<p class="mk-note">You own no shares.</p>
					{/if}
				</section>

				<section class="card mk-panel" aria-labelledby="sk-h-board" data-testid="sk-leaderboard">
					<header><h2 id="sk-h-board">Top portfolios</h2></header>
					{#if board.leaderboard.length}
						<ol class="mk-feed">
							{#each board.leaderboard as row, i (i)}
								<li><span class="mk-feed-who">{i + 1}. {row.me ? `${row.name} (you)` : row.name}</span><span class="mk-feed-amt">{coins(row.value)}</span></li>
							{/each}
						</ol>
					{:else}
						<p class="mk-note">Nobody owns shares yet.</p>
					{/if}
				</section>

				<section class="card mk-panel" aria-labelledby="sk-h-rules" data-testid="sk-rules">
					<header><h2 id="sk-h-rules">The rules</h2></header>
					<p class="mk-body">{priceFormulaWords(board.rules)}</p>
					<p class="mk-body" data-testid="sk-ramp">{rampWords(board.rules)}</p>
					<p class="mk-body" data-testid="sk-breakers">{haltRulesWords(board.rules)}</p>
					<p class="mk-body">{tradeRulesWords(board.rules)}</p>
					<p class="mk-note">Why no shorting: a short can lose more coins than anyone holds, and the economy has no one to collect that debt from.</p>
				</section>
			</aside>
		</div>
	{/if}
	<footer class="mk-foot"><VersionBadge app="coins" /></footer>
</main>

{#if trading && board && transports}
	{@const h = held(trading.stock.id)}
	<TradeDialog
		stock={trading.stock}
		side={trading.side}
		rules={board.rules}
		balance={board.balance}
		held={h.shares}
		basis={h.basis}
		{transports}
		onclose={() => (trading = null)}
		ondone={(m) => {
			flash = m;
			onchanged?.();
		}}
	/>
{/if}
