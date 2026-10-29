<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import './market.css';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import CoinBar from '$lib/coin-bar/CoinBar.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { coins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import Glyph from './Glyph.svelte';
	import ListingCard from './ListingCard.svelte';
	import ListingDialog from './ListingDialog.svelte';
	import PostListing from './PostListing.svelte';
	import TradeCard from './TradeCard.svelte';
	import TransferFeed from './TransferFeed.svelte';
	import TransferSheet from './TransferSheet.svelte';
	import { boardClasses, filterListings, MARKET_CATEGORIES, type Listing, type MarketBoard, type TransferRow } from './market';
	import type { OfficialTile } from './official';
	import type { MarketTransports, TransferTransports } from './transports';

	/**
	 * THE IDEA MARKET (ledger 0402): one roof over everything coins buy. The
	 * OFFICIAL zone is pinned on top (the shop, want-ads, backgrounds, staff
	 * cards, each opening the flow that already exists); the
	 * STUDENT zone is the board of offers and requests, searchable and
	 * filterable by class and category. Your trades, your listings, posting
	 * and transfers sit beside it. The route mounts this over the database;
	 * `/dev/coin-market` mounts it over an in-memory board.
	 */
	let {
		state: pageState,
		board = null,
		tiles = [],
		feed = [],
		transports = {},
		transfers = null,
		onsignin = null,
		onchanged = null,
		coinDesk = false
	}: {
		state: 'ready' | 'signed_out' | 'updating' | 'error';
		board?: MarketBoard | null;
		tiles?: OfficialTile[];
		feed?: TransferRow[];
		transports?: MarketTransports;
		transfers?: TransferTransports | null;
		onsignin?: (() => void) | null;
		onchanged?: (() => void) | null;
		/** Ledger 0422: whether the IDEA Coin bar offers the Coin Desk (coin staff only). */
		coinDesk?: boolean;
	} = $props();

	let query = $state('');
	let sectionId = $state('');
	let category = $state('');
	let kind = $state<'' | 'offer' | 'request'>('');
	let opened = $state<Listing | null>(null);
	let sending = $state(false);
	let posting = $state(false);
	let flash = $state<string | null>(null);

	const theirs = $derived(board ? board.listings.filter((l) => !l.mine) : []);
	const mine = $derived(board ? board.listings.filter((l) => l.mine) : []);
	const shown = $derived(filterListings(theirs, { query, sectionId, category, kind }));
	const classes = $derived(boardClasses(theirs));
	const openTrades = $derived(board ? board.orders.filter((o) => ['held', 'delivered', 'disputed'].includes(o.status)) : []);
	const pastTrades = $derived(board ? board.orders.filter((o) => !['held', 'delivered', 'disputed'].includes(o.status)).slice(0, 8) : []);
	const inDebt = $derived(!!board && board.me.balance < 0);

	function done(message: string) {
		flash = message;
		onchanged?.();
	}
	const glyphFor: Record<OfficialTile['kind'], 'shop' | 'donation' | 'background' | 'contract' | 'official'> = {
		shop: 'shop',
		donation: 'donation',
		background: 'background',
		official: 'official'
	};
</script>

<svelte:head>
	<title>IDEA Market · IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/coin-balance">My coins</a>
		<ProfileMenu />
	</div>
</div>
<CoinBar current="market" desk={coinDesk} />

<main class="mk-page" data-testid="mk-page" data-state={pageState}>
	<section class="mk-hero">
		<div>
			<div class="mk-eyebrow">IDEA Coins</div>
			<h1>IDEA Market</h1>
			<p class="lead">Buy, sell and trade with coins. Every trade goes through escrow, so nobody gets scammed.</p>
		</div>
		{#if board}
			<div class="mk-hero-keys">
				<a class="btn secondary mk-key" href="/market/stocks" data-testid="mk-stocks-link"><Glyph name="stocks" size={16} /> Stocks</a>
				{#if transfers && board.in_economy}
					<button type="button" class="btn secondary mk-key" onclick={() => (sending = true)} data-testid="mk-send-open"><Glyph name="transfer" size={16} /> Send coins</button>
				{/if}
				<span class="mk-balance" data-testid="mk-balance">
					<span class="mk-balance-label">Balance</span>
					<span class="mk-balance-figure" class:neg={inDebt}>{coins(board.me.balance)}</span>
				</span>
			</div>
		{/if}
	</section>

	{#if pageState === 'signed_out'}
		<section class="card mk-panel" data-testid="mk-signin">
			<p class="mk-body">Sign in to see the market and trade with your coins.</p>
			{#if onsignin}<button class="btn mk-key" type="button" onclick={() => onsignin?.()}>Sign in with your school Google account</button>{/if}
		</section>
	{:else if pageState === 'updating'}
		<section class="card mk-panel" data-testid="mk-updating">
			<h2>The market is being set up</h2>
			<p class="mk-body">Mr. Pina is switching it on. Check back soon.</p>
		</section>
	{:else if pageState === 'error' || !board}
		<section class="card mk-panel" data-testid="mk-error">
			<h2>The market could not be read</h2>
			<p class="mk-body">Try again in a minute. If it keeps happening, send feedback from the button on this page.</p>
		</section>
	{:else}
		{#if flash}<p class="mk-ok" role="status" data-testid="mk-flash">{flash}</p>{/if}
		{#if inDebt}
			<p class="mk-why" data-testid="mk-debt">
				You are in debt ({coins(board.me.balance)}). You can sell and be paid, but not buy, post a paid request or send coins until you are back to zero. Restitution jobs below help.
			</p>
		{/if}
		<div class="mk-layout">
			<div class="mk-col">
				<section class="card mk-panel" aria-labelledby="mk-h-official" data-testid="mk-official">
					<header>
						<h2 id="mk-h-official">Official</h2>
						<span class="mk-sub">From the IDEA Coin economy itself.</span>
					</header>
					<ul class="mk-grid mk-official-grid">
						{#each tiles as t (t.key)}
							<li>
								<a class="mk-tile" class:featured={t.featured} href={t.href} data-testid="mk-official-tile" data-kind={t.kind}>
									<span class="mk-tile-top">
										<span class="mk-glyph"><Glyph name={glyphFor[t.kind]} /></span>
										{#if t.featured}<StatusChip tone="special" label="Featured" />{/if}
									</span>
									<span class="mk-tile-title">{t.title}</span>
									<span class="mk-tile-line">{t.line}</span>
									<span class="mk-tile-foot">
										{#if t.price}<span class="mk-price">{t.price}</span>{/if}
										<span class="mk-note mk-open-word">Open &rsaquo;</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>

				<section class="card mk-panel" aria-labelledby="mk-h-students" data-testid="mk-students">
					<header>
						<h2 id="mk-h-students">From students</h2>
						<span class="mk-sub">{theirs.length} open listing{theirs.length === 1 ? '' : 's'}</span>
					</header>
					<div class="mk-toolbar">
						<label class="mk-field grow">
							Search
							<input type="search" bind:value={query} placeholder="Name tags, tutoring, a classmate's name" data-testid="mk-search" />
						</label>
						<label class="mk-field">
							Class
							<select bind:value={sectionId} data-testid="mk-filter-class">
								<option value="">Every class</option>
								{#each classes as c (c.section_id)}<option value={c.section_id}>{c.label}</option>{/each}
							</select>
						</label>
						<label class="mk-field">
							Category
							<select bind:value={category} data-testid="mk-filter-category">
								<option value="">Every category</option>
								{#each MARKET_CATEGORIES as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
							</select>
						</label>
						<div class="mk-seg" role="radiogroup" aria-label="Offers or requests">
							<button type="button" class="btn secondary mk-key" role="radio" aria-checked={kind === ''} onclick={() => (kind = '')}>All</button>
							<button type="button" class="btn secondary mk-key" role="radio" aria-checked={kind === 'offer'} onclick={() => (kind = 'offer')} data-testid="mk-kind-offer">Offers</button>
							<button type="button" class="btn secondary mk-key" role="radio" aria-checked={kind === 'request'} onclick={() => (kind = 'request')} data-testid="mk-kind-request">Requests</button>
						</div>
					</div>
					{#if shown.length}
						<ul class="mk-grid" data-testid="mk-board">
							{#each shown as l (l.id)}
								<ListingCard listing={l} onopen={(x) => (opened = x)} />
							{/each}
						</ul>
					{:else}
						<p class="mk-empty" data-testid="mk-board-empty">
							{theirs.length ? 'Nothing matches. Clear the search or a filter.' : 'Nothing is listed yet. Be the first.'}
						</p>
					{/if}
				</section>

				<section class="card mk-panel" aria-labelledby="mk-h-mine" data-testid="mk-mine">
					<header>
						<h2 id="mk-h-mine">Your listings</h2>
						<span class="mk-sub">{board.me.open_listings} of {board.rules.max_open} open</span>
					</header>
					{#if mine.length}
						<ul class="mk-grid">
							{#each mine as l (l.id)}<ListingCard listing={l} onopen={(x) => (opened = x)} />{/each}
						</ul>
					{/if}
					{#if transports.post && board.in_economy}
						{#if !posting}
							<button type="button" class="btn mk-key" onclick={() => (posting = true)} data-testid="mk-post-open">Post a listing</button>
						{:else}
							<PostListing
								rules={board.rules}
								balance={board.me.balance}
								openCount={board.me.open_listings}
								post={transports.post}
								uploadPhoto={transports.uploadPhoto ?? null}
								ondone={(m) => {
									posting = false;
									done(m);
								}}
							/>
						{/if}
					{/if}
					<Disclosure label="How escrow works" scope="market-escrow-how" collapseWhen={true} testId="mk-escrow-how">
						<p class="mk-note">
							A claim holds the payer's coins at once. The seller delivers and marks it done; the payer confirms and the coins move
							{board.rules.fee_percent > 0 ? `, minus a ${board.rules.fee_percent}% sale fee` : ''}. Left unconfirmed and undisputed for
							{board.rules.auto_release_days} class days, they move on their own. The seller can cancel before delivery for a full refund. Either side can dispute; staff decide.
						</p>
					</Disclosure>
				</section>

			</div>

			<aside class="mk-col" aria-label="Your market">
				<section class="card mk-panel" aria-labelledby="mk-h-trades" data-testid="mk-trades">
					<header>
						<h2 id="mk-h-trades">Your trades</h2>
						<span class="mk-sub">{openTrades.length} open</span>
					</header>
					{#if openTrades.length}
						<ul class="mk-list">
							{#each openTrades as o (o.id)}<TradeCard order={o} rules={board.rules} {transports} ondone={done} />{/each}
						</ul>
					{:else}
						<p class="mk-note">No open trades. Claim a listing, or post one.</p>
					{/if}
					{#if pastTrades.length}
						<h3>Finished</h3>
						<ul class="mk-list">
							{#each pastTrades as o (o.id)}<TradeCard order={o} rules={board.rules} {transports} ondone={done} />{/each}
						</ul>
					{/if}
				</section>

				<section class="card mk-panel" aria-labelledby="mk-h-feed" data-testid="mk-transfers">
					<header>
						<h2 id="mk-h-feed">Transfers</h2>
						{#if transfers && board.in_economy}
							<button type="button" class="btn secondary mk-key" onclick={() => (sending = true)}>Send coins</button>
						{/if}
					</header>
					<TransferFeed rows={feed} />
				</section>
			</aside>
		</div>
	{/if}

	<footer class="mk-foot">
		<VersionBadge app="coins" />
	</footer>
</main>

{#if opened && board}
	<ListingDialog
		listing={opened}
		balance={board.me.balance}
		inEconomy={board.in_economy}
		{transports}
		onclose={() => (opened = null)}
		ondone={done}
	/>
{/if}
{#if sending && transfers}
	<TransferSheet transports={transfers} onclose={() => (sending = false)} ondone={done} />
{/if}
