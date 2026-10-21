<script lang="ts">
	import '$lib/coin-market/market.css';
	import './stocks.css';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import { coins, coinNumber } from '$lib/coin-format';
	import StockChart from './StockChart.svelte';
	import { changeWords, clock, haltWords, KIND_WORDS, percent, phaseWords, price, shortDay, type StockDetail, type StockTick } from './stocks';

	/**
	 * ONE STOCK, AND HOW ITS PRICE IS MADE (formula v2, 0283): the launch and
	 * the reading it is measured against, every recent price change with the
	 * recorded inputs that produced it, the days since the launch (open, high,
	 * low, close) and any trading pause. A held price says why it held.
	 * Nothing on this page is computed in the browser.
	 */
	let { detail = null, state: pageState }: { detail?: StockDetail | null; state: 'ready' | 'missing' | 'updating' | 'signed_out' } = $props();

	function when(iso: string): string {
		return `${shortDay(iso)}, ${clock(iso)}`;
	}

	/** The recorded inputs of one price change, in words. */
	function inputsWords(t: StockTick, kind: string): string {
		const i = t.inputs as Record<string, unknown>;
		if (kind === 'index') {
			const m = Array.isArray(i.members) ? (i.members as { id: string; ticker?: string; ratio: number }[]) : [];
			return m.length
				? `Average move of ${m.length} stocks: ${m.map((x) => `${x.ticker ?? x.id} ${((Number(x.ratio) - 1) * 100).toFixed(1)}%`).join(', ')}.`
				: 'No member had a price.';
		}
		if (kind === 'class') {
			if (i.out_of === undefined) return '';
			return `${coinNumber(Number(i.earned))} earned of ${coinNumber(Number(i.out_of))} possible, ${i.students} students, ${i.items} assignments, since ${shortDay(String(i.window_start))}.`;
		}
		if (i.person_days === undefined) return '';
		return `${i.person_days} person-days from ${i.people} people in the last 7 days.`;
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
				{#if s.halt}<span class="sk-halt" data-testid="sk-halt">{haltWords(s.halt)}</span>{:else if s.phase}<span class="mk-note">{phaseWords(s.phase)}</span>{/if}
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
							The IDEA index is its launch price times the average move of every other stock since its own launch.
						{:else}
							The price is the launch price times the signal now over the signal it is measured against. "Data says" is that number; the price is the same unless the launch weeks' daily limit or the floor and ceiling held it back. When there is no new data, the price holds.
						{/if}
					</p>
					{#if detail.launch.at}
						<p class="mk-note" data-testid="sk-launch">
							Launched {when(detail.launch.at)} at {price(detail.launch.price)}.
							{#if s.kind !== 'index'}
								{#if detail.launch.anchor_signal !== null}Measured against a signal of {Number(detail.launch.anchor_signal).toFixed(4)} at a price of {price(detail.launch.anchor_price)}.{:else}No real reading yet to measure against: the price holds until the first one.{/if}
							{/if}
						</p>
					{/if}
					<h3 class="mk-sub">Latest price changes</h3>
					<div class="sk-scroll">
						<table class="sk-table">
							<thead>
								<tr><th>When</th><th>Price</th>{#if s.kind !== 'index'}<th>Signal</th>{/if}<th>Data says</th><th>From</th></tr>
							</thead>
							<tbody>
								{#each detail.ticks as t, i (i)}
									<tr data-testid="sk-tick-row">
										<td class="num">{when(t.at)}</td>
										<td class="num">{price(t.price)}</td>
										{#if s.kind !== 'index'}<td class="num">{t.signal !== null ? t.signal.toFixed(4) : 'None'}</td>{/if}
										<td class="num">{t.raw !== null ? price(t.raw) : 'None'}</td>
										<td class="sk-inputs">
											{#if t.carried}<strong>Held.</strong>{/if}
											{inputsWords(t, s.kind)}
											{#if t.note}<span class="mk-note"> {t.note}</span>{/if}
											<span class="mk-note"> Formula {t.formula_version}.</span>
										</td>
									</tr>
								{:else}
									<tr><td colspan="5">No prices yet.</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
					<h3 class="mk-sub">Each day since the launch</h3>
					<div class="sk-scroll">
						<table class="sk-table" data-testid="sk-days">
							<thead><tr><th>Day</th><th>Open</th><th>High</th><th>Low</th><th>Close</th></tr></thead>
							<tbody>
								{#each detail.days as d (d.day)}
									<tr><td class="num">{shortDay(d.day)}</td><td class="num">{price(d.open)}</td><td class="num">{price(d.high)}</td><td class="num">{price(d.low)}</td><td class="num">{price(d.close)}</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if detail.halts.length}
						<h3 class="mk-sub">Trading pauses</h3>
						<ul class="mk-feed" data-testid="sk-halts">
							{#each detail.halts as h, i (i)}
								<li><span class="mk-feed-who">{when(h.started_at)} to {clock(h.until)}</span><span class="mk-feed-msg">Moved {percent(h.move_percent)}% from the day's start (level {h.level}).</span></li>
							{/each}
						</ul>
					{/if}
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
