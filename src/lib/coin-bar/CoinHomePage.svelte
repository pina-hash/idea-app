<script lang="ts">
	import '$lib/coin-market/market.css';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import Glyph from '$lib/coin-market/Glyph.svelte';
	import { COIN_SYMBOL, coinNumber, coins, signedCoins } from '$lib/coin-format';
	import { changeWords, chartGeometry, price } from '$lib/coin-stocks/stocks';
	import CoinPagesNav from './CoinPagesNav.svelte';
	import PageHeader from '$lib/shell/PageHeader.svelte';
	import { COIN_PAGES, type CoinPageId } from './pages';
	import type { CoinHome } from './home';

	/**
	 * THE COIN HOME (ledger 0422, feedback d299d864). One condensed preview of
	 * every coin page; the whole card opens its page. The route mounts it over
	 * each page's own read; `/dev/coin-home` mounts it over in-memory answers.
	 *
	 * A card is one link (the title's, stretched over the card), so a tap
	 * anywhere on it opens the page and a screen reader hears one link per
	 * card, named for the page. The Coin Desk card's area keys sit above that
	 * link and open their own areas.
	 */
	let {
		home,
		coinDesk = false,
		onsignin = null
	}: { home: CoinHome; coinDesk?: boolean; onsignin?: (() => void) | null } = $props();

	const page = (id: CoinPageId) => COIN_PAGES.find((p) => p.id === id)!;

	/** "2026-10-23" to "Oct 23": the month and day, never a weekday. */
	function shortDate(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(`${iso}T12:00:00`);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Coin home · IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>
<CoinPagesNav current="home" desk={coinDesk} />

<main class="mk-page ch-page" data-testid="coin-home">
	<PageHeader eyebrow="IDEA Coins" title="Coin home" meta="Every coin page at a glance. Open any card for the whole page.">
		{#snippet actions()}
			{#if !home.signedIn && onsignin}
				<button class="btn mk-key" type="button" onclick={() => onsignin?.()} data-testid="ch-signin">Sign in to see your coins</button>
			{:else if home.mine}
				<span class="idea-display mk-balance" data-testid="ch-balance">
					<span class="idea-display-label">Balance</span>
					<span class="mk-balance-figure" class:neg={home.mine.balance < 0}>{coins(home.mine.balance)}</span>
				</span>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="ch-grid" class:with-desk={!!home.desk}>
		<!-- MY COINS -->
		<article class="card ch-card ch-mine" data-testid="ch-card-mine">
			<header class="ch-head">
				<span class="ch-key" aria-hidden="true"><Glyph name={page('mine').glyph} size={18} /></span>
				<h2><a class="ch-open" href={page('mine').href}>{page('mine').label}</a></h2>
				<span class="ch-go" aria-hidden="true">Open &rsaquo;</span>
			</header>
			{#if home.mine}
				<div class="ch-figure-row">
					<div class="ch-figure" class:neg={home.mine.balance < 0}>{coinNumber(home.mine.balance)}<span class="ch-sym">{COIN_SYMBOL}</span></div>
					<dl class="ch-facts">
						{#if home.mine.inEconomy}
							<div><dt>Wage</dt><dd>{coins(home.mine.weeklyWage)} a week</dd></div>
						{/if}
						{#if home.mine.payday}
							<div><dt>Payday</dt><dd>{shortDate(home.mine.payday)}</dd></div>
						{/if}
					</dl>
				</div>
				{#if home.mine.recent.length}
					<ul class="idea-list ch-rows" aria-label="Latest">
						{#each home.mine.recent as r, i (i)}
							<li><span class="ch-row-name">{r.label}</span><span class="ch-num" class:neg={r.amount < 0}>{signedCoins(r.amount)}</span></li>
						{/each}
					</ul>
				{:else}
					<p class="ch-quiet">Nothing earned or spent yet.</p>
				{/if}
			{:else}
				<p class="ch-quiet">{home.signedIn ? 'Your coin page could not be read just now.' : 'Sign in to see your balance, pay and history.'}</p>
			{/if}
		</article>

		<!-- LEDGER -->
		<article class="card ch-card ch-ledger" data-testid="ch-card-ledger">
			<header class="ch-head">
				<span class="ch-key" aria-hidden="true"><Glyph name={page('ledger').glyph} size={18} /></span>
				<h2><a class="ch-open" href={page('ledger').href}>{page('ledger').label}</a></h2>
				<span class="ch-go" aria-hidden="true">Open &rsaquo;</span>
			</header>
			{#if home.ledger}
				<ol class="idea-list ch-rows ch-board" aria-label="Top balances">
					{#each home.ledger.top as r, i (i)}
						<li>
							<span class="ch-rank">{i + 1}</span>
							<span class="ch-row-name">{r.name}{#if r.section}<span class="ch-dim ch-sep">{r.section}</span>{/if}</span>
							<span class="ch-num" class:neg={r.balance < 0}>{coins(r.balance)}</span>
						</li>
					{/each}
				</ol>
				<dl class="ch-stats">
					<div><dt>Students</dt><dd>{home.ledger.students}</dd></div>
					<div><dt>In circulation</dt><dd>{coins(home.ledger.circulation)}</dd></div>
					<div><dt>In debt</dt><dd>{home.ledger.inDebt}</dd></div>
				</dl>
			{:else}
				<p class="ch-quiet">The leaderboard could not be read just now.</p>
			{/if}
		</article>

		<!-- MARKET -->
		<article class="card ch-card ch-market" data-testid="ch-card-market">
			<header class="ch-head">
				<span class="ch-key" aria-hidden="true"><Glyph name={page('market').glyph} size={18} /></span>
				<h2><a class="ch-open" href={page('market').href}>{page('market').label}</a></h2>
				<span class="ch-go" aria-hidden="true">Open &rsaquo;</span>
			</header>
			{#if home.market}
				<dl class="ch-stats">
					<div><dt>Offers</dt><dd>{home.market.offers}</dd></div>
					<div><dt>Requests</dt><dd>{home.market.requests}</dd></div>
					<div><dt>Your open trades</dt><dd>{home.market.openTrades}</dd></div>
				</dl>
				{#if home.market.newest.length}
					<ul class="idea-list ch-rows" aria-label="Newest">
						{#each home.market.newest as l (l.id)}
							<li><span class="ch-row-name">{l.title}</span><span class="ch-num">{l.price === null ? 'Ask' : coins(l.price)}</span></li>
						{/each}
					</ul>
				{:else}
					<p class="ch-quiet">Nothing posted yet. Be the first.</p>
				{/if}
			{:else}
				<p class="ch-quiet">{home.signedIn ? 'The market could not be read just now.' : 'Sign in to buy, sell and trade.'}</p>
			{/if}
		</article>

		<!-- STOCKS -->
		<article class="card ch-card ch-stocks" data-testid="ch-card-stocks">
			<header class="ch-head">
				<span class="ch-key" aria-hidden="true"><Glyph name={page('stocks').glyph} size={18} /></span>
				<h2><a class="ch-open" href={page('stocks').href}>{page('stocks').label}</a></h2>
				<span class="ch-go" aria-hidden="true">Open &rsaquo;</span>
			</header>
			{#if home.stocks}
				{#if home.stocks.index}
					{@const move = changeWords(home.stocks.index.change)}
					<div class="ch-figure-row">
						<div>
							<div class="ch-label">{home.stocks.index.ticker}</div>
							<div class="ch-figure ch-figure-sm">{price(home.stocks.index.price)}</div>
						</div>
						<span class="ch-move {move.tone}">{move.text}</span>
					</div>
					{@const spark = chartGeometry(home.stocks.index.series, 320, 64, 4)}
					{#if spark && home.stocks.index.series.length > 1}
						<svg class="ch-spark {move.tone}" viewBox="0 0 320 64" preserveAspectRatio="none" aria-hidden="true" data-testid="ch-spark">
							<path class="ch-spark-area" d={spark.area} />
							<path class="ch-spark-line" d={spark.line} />
						</svg>
					{/if}
				{/if}
				<dl class="ch-stats">
					<div><dt>Top riser</dt><dd>{home.stocks.gainer ? `${home.stocks.gainer.ticker} ${changeWords(home.stocks.gainer.change).text}` : 'None today'}</dd></div>
					<div><dt>You hold</dt><dd>{home.stocks.holdings}</dd></div>
					<div><dt>Worth</dt><dd>{coins(home.stocks.value)}</dd></div>
				</dl>
			{:else}
				<p class="ch-quiet">{home.signedIn ? 'The stocks could not be read just now.' : 'Sign in to see prices and your holdings.'}</p>
			{/if}
		</article>

		{#if home.desk}
			<!-- COIN DESK: coin staff only -->
			<article class="card ch-card ch-desk" data-testid="ch-card-desk">
				<header class="ch-head">
					<span class="ch-key" aria-hidden="true"><Glyph name={page('desk').glyph} size={18} /></span>
					<h2><a class="ch-open" href={page('desk').href}>{page('desk').label}</a></h2>
					<span class="ch-go" aria-hidden="true">Open &rsaquo;</span>
				</header>
				<ul class="ch-areas">
					{#each home.desk.areas as a (a.href)}
						<li><a class="btn secondary ch-area" href={a.href}>{a.label}</a></li>
					{/each}
				</ul>
			</article>
		{/if}
	</div>

	<footer class="ch-footer">
		<VersionBadge app="coins" />
	</footer>
</main>

<style>
	.ch-grid {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 1rem;
	}
	.ch-mine {
		grid-column: span 5;
	}
	.ch-ledger {
		grid-column: span 7;
	}
	.ch-market,
	.ch-stocks {
		grid-column: span 6;
	}
	.with-desk .ch-market,
	.with-desk .ch-stocks,
	.with-desk .ch-desk {
		grid-column: span 4;
	}
	@media (max-width: 1100px) {
		.ch-grid .ch-card {
			grid-column: span 6;
		}
		.with-desk .ch-desk {
			grid-column: span 12;
		}
	}
	@media (max-width: 720px) {
		.ch-grid .ch-card,
		.with-desk .ch-desk {
			grid-column: span 12;
		}
	}

	.ch-card {
		position: relative;
		margin: 0;
		padding: 1.1rem 1.2rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		min-width: 0;
		transition:
			border-color 140ms ease,
			transform 140ms ease;
	}
	.ch-card:hover,
	.ch-card:focus-within {
		border-color: var(--line-strong);
	}
	@media (prefers-reduced-motion: no-preference) {
		.ch-card:hover {
			transform: translateY(-1px);
		}
	}

	.ch-head {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.ch-key {
		display: inline-grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		flex: 0 0 auto;
		border-radius: 8px;
		color: var(--green);
		background: var(--plate-well-face, var(--bg0));
		box-shadow:
			inset 0 1px 2px var(--plate-inset-shade, rgba(0, 0, 0, 0.55)),
			0 0 0 1px var(--line);
	}
	.ch-head h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 400;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		flex: 1 1 auto;
		min-width: 0;
	}
	.ch-open {
		color: var(--white);
		text-decoration: none;
	}
	/* The title's link covers the card: one tap target, one link per card. */
	.ch-open::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.ch-open:focus-visible {
		outline: none;
	}
	.ch-card:has(.ch-open:focus-visible) {
		outline: 2px solid var(--cyan);
		outline-offset: 2px;
	}
	.ch-go {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim);
		white-space: nowrap;
	}
	.ch-card:hover .ch-go {
		color: var(--green);
	}

	.ch-figure-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.ch-figure {
		font-family: var(--font-mono);
		font-size: 2.6rem;
		line-height: 1;
		color: var(--white);
		letter-spacing: 0.02em;
	}
	.ch-figure-sm {
		font-size: 1.9rem;
	}
	.ch-figure.neg,
	.ch-num.neg {
		color: var(--amber);
	}
	.ch-sym {
		font-family: var(--font-display);
		font-size: 0.55em;
		color: var(--gold);
		margin-left: 0.15rem;
	}
	.ch-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim);
		margin-bottom: 0.25rem;
	}
	.ch-move {
		font-family: var(--font-mono);
		font-size: 0.95rem;
		color: var(--dim);
	}
	.ch-move.up {
		color: var(--green);
	}
	.ch-move.down {
		color: var(--amber);
	}

	.ch-facts,
	.ch-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		margin: 0;
	}
	/* THE STATS ARE A LINE OF FACTS ON THE CARD, NOT A BOX IN IT (ledger 0468:
	   no box in a box). A rows list beside them is the list well. */
	.ch-facts div,
	.ch-stats div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	dt {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim);
	}
	dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--white);
	}

	/* The rows are the kit's list well (`idea-list`): one recessed well, the
	   rows divided by etched lines. Only the row's own layout is here. */
	.ch-rows li {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		min-width: 0;
	}
	.ch-row-name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--white);
		font-weight: 500;
	}
	.ch-dim {
		color: var(--dim);
		font-weight: 400;
	}
	.ch-sep::before {
		content: '·';
		margin: 0 0.4rem;
	}
	.ch-spark {
		display: block;
		width: 100%;
		height: 4rem;
	}
	.ch-spark-line {
		fill: none;
		stroke: var(--dim);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.ch-spark-area {
		fill: color-mix(in srgb, var(--dim) 12%, transparent);
	}
	.ch-spark.up .ch-spark-line {
		stroke: var(--green);
	}
	.ch-spark.up .ch-spark-area {
		fill: color-mix(in srgb, var(--green) 12%, transparent);
	}
	.ch-spark.down .ch-spark-line {
		stroke: var(--amber);
	}
	.ch-spark.down .ch-spark-area {
		fill: color-mix(in srgb, var(--amber) 12%, transparent);
	}
	.ch-num {
		font-family: var(--font-mono);
		color: var(--white);
		white-space: nowrap;
	}
	.ch-rank {
		display: inline-grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		flex: 0 0 auto;
		border-radius: 50%;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		/* The number in the well's own ink: gold as a word on a well face read
		   4.06:1 on Space White (ledger 0468); first place keeps its gold ring. */
		color: var(--plate-ink, var(--white));
		background: var(--plate-well-face, var(--bg0));
		box-shadow: 0 0 0 1px var(--line);
		align-self: center;
	}
	.ch-board li:first-child .ch-rank {
		box-shadow: 0 0 0 1px var(--gold);
	}

	.ch-quiet {
		margin: 0;
		color: var(--dim);
	}

	.ch-areas {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		/* Above the card's stretched link, so each area opens itself. */
		position: relative;
		z-index: 1;
	}
	/* The plate's own secondary key (raised, because it is pressed), sized down. */
	.ch-area {
		min-height: 44px;
		padding: 0 0.85rem;
		font-size: 0.74rem;
	}

	.ch-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
