<script lang="ts">
	import Pending from '$lib/Pending.svelte';
	import './market.css';
	import { untrack } from 'svelte';
	import { coins } from '$lib/coin-format';
	import Stars from './Stars.svelte';
	import { parseListing, parseTransfer, type Listing, type TransferRow } from './market';
	import { parseBanner, type BannerKind, type BannerPin } from './banner';
	import { parseStock, type Stock } from '$lib/coin-stocks/stocks';
	import { CARD_KIND_WORDS, parseMarketCards, type MarketCard, type MarketDeskTransports, type DeskResult as Res } from './desk';

	/**
	 * THE MARKET ON THE COIN DESK (ledger 0402): disputes, featuring and hiding
	 * listings, reviews, official cards, the classroom banner, transfers and
	 * (for a full coin admin) the stocks. Section coin staff see their own
	 * students only; the database decides that, and every write re-checks it.
	 * The route hands in the transports; the harness answers them in memory.
	 */

	let { transports }: { transports: MarketDeskTransports } = $props();

	interface Dispute {
		id: string;
		title: string;
		amount: number;
		payer: string;
		payee: string;
		disputed_by: string;
		reason: string;
		from: string;
	}
	interface ReviewRow {
		id: string;
		stars: number;
		body: string;
		author: string;
		subject: string;
		removed: boolean;
	}

	let scope = $state('section');
	let escrow = $state(0);
	let disputes = $state<Dispute[]>([]);
	let listings = $state<(Listing & { owner_email?: string })[]>([]);
	let official = $state<Listing[]>([]);
	let reviews = $state<ReviewRow[]>([]);
	let pins = $state<BannerPin[]>([]);
	let transfers = $state<(TransferRow & { raw_message?: string | null })[]>([]);
	let stocks = $state<Stock[]>([]);
	let sections = $state<{ id: string; label: string }[]>([]);
	let cards = $state<MarketCard[]>([]);
	let loaded = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);
	let busy = $state(false);

	const n = (v: unknown) => {
		const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
		return Number.isFinite(x) ? x : 0;
	};
	const arr = (v: unknown) => (Array.isArray(v) ? v : []);

	async function reload() {
		const r = await transports.load();
		const m = (r.moderation ?? {}) as Record<string, unknown>;
		scope = String(m.scope ?? 'section');
		escrow = n(m.escrow);
		disputes = arr(m.disputes).map((d) => {
			const o = d as Record<string, unknown>;
			return {
				id: String(o.id),
				title: String(o.title ?? ''),
				amount: n(o.amount),
				payer: String(o.payer ?? ''),
				payee: String(o.payee ?? ''),
				disputed_by: String(o.disputed_by ?? ''),
				reason: String(o.reason ?? ''),
				from: String(o.from ?? '')
			};
		});
		listings = arr(m.listings).map(parseListing).filter((l): l is Listing => !!l);
		official = arr(m.official).map(parseListing).filter((l): l is Listing => !!l);
		reviews = arr(m.reviews).map((x) => {
			const o = x as Record<string, unknown>;
			return { id: String(o.id), stars: n(o.stars), body: String(o.body ?? ''), author: String(o.author ?? ''), subject: String(o.subject ?? ''), removed: o.removed === true };
		});
		pins = parseBanner(r.banner)?.pins ?? [];
		transfers = arr(r.transfers).flatMap((t) => {
			const row = parseTransfer(t);
			if (!row) return [];
			const raw = (t as Record<string, unknown>).raw_message;
			return [{ ...row, raw_message: typeof raw === 'string' ? raw : null }];
		});
		stocks = arr(r.stocks).map(parseStock).filter((s): s is Stock => !!s);
		sections = arr(r.sections).map((s) => ({ id: String((s as Record<string, unknown>).id), label: String((s as Record<string, unknown>).label ?? '') }));
		cards = parseMarketCards(r.cards);
		loaded = true;
	}
	$effect(() => {
		untrack(() => reload());
	});

	async function run(p: Promise<Res>, ok: string) {
		if (busy) return;
		busy = true;
		const r = await p;
		busy = false;
		said = r.ok ? { ok: true, text: ok } : { ok: false, text: r.words };
		if (r.ok) await reload();
	}

	// ---- per-row drafts ----
	let splitText = $state<Record<string, string>>({});
	let noteText = $state<Record<string, string>>({});
	let hideText = $state<Record<string, string>>({});
	let removeText = $state<Record<string, string>>({});

	// ---- the official card form ----
	let oTitle = $state('');
	let oDesc = $state('');
	let oLink = $state('/coin-balance');
	let oPrice = $state('');
	let oSection = $state('');
	let oDays = $state('30');
	function saveOfficial(e: SubmitEvent) {
		e.preventDefault();
		const price = oPrice.trim() ? Number(oPrice) : null;
		run(
			transports.official({ id: null, title: oTitle.trim(), description: oDesc.trim(), link: oLink.trim(), price: price !== null && Number.isFinite(price) ? price : null, sectionId: oSection || null, days: Number(oDays) || 30 }),
			'Official card posted.'
		).then(() => {
			oTitle = '';
			oDesc = '';
		});
	}

	// ---- the banner form ----
	let bKind = $state<BannerKind>('official');
	let bTitle = $state('');
	let bSub = $state('');
	let bHref = $state('/market');
	let bStart = $state('');
	let bEnd = $state('');
	let bSection = $state('');
	let bListing = $state('');
	function pinListing(l: Listing) {
		bKind = l.zone === 'official' ? 'official' : 'listing';
		bListing = l.id;
		bTitle = l.title;
		bSub = l.price !== null ? `${coins(l.price)}${l.zone === 'student' ? `, from ${l.owner.name}` : ''}` : '';
		bHref = l.zone === 'official' && l.link ? l.link : '/market';
		document.getElementById('md-banner-form')?.scrollIntoView({ behavior: 'instant', block: 'start' });
	}
	function saveBanner(e: SubmitEvent) {
		e.preventDefault();
		run(
			transports.bannerSave({ id: null, kind: bKind, listingId: bListing || null, title: bTitle.trim(), subtitle: bSub.trim(), href: bHref.trim(), startsOn: bStart || null, endsOn: bEnd || null, sectionId: bSection || null, sort: pins.length }),
			'Pinned to the classroom banner.'
		).then(() => {
			bTitle = '';
			bSub = '';
			bListing = '';
		});
	}
</script>

<div class="mk-desk" data-testid="market-desk">
	{#if said}<p class={said.ok ? 'mk-ok' : 'mk-why'} role="status" data-testid="md-said">{said.text}</p>{/if}
	{#if !loaded}
		<Pending label="Loading the market desk" />
	{:else}
		<section class="card mk-panel" aria-labelledby="md-h-disputes" data-testid="md-disputes">
			<header>
				<h2 id="md-h-disputes">Disputes</h2>
				<span class="mk-sub">{disputes.length} waiting. {coins(escrow)} held in escrow{scope === 'section' ? ' for your students' : ''}.</span>
			</header>
			{#if disputes.length}
				<ul class="mk-list">
					{#each disputes as d (d.id)}
						<li class="mk-trade" data-testid="md-dispute">
							<div class="mk-trade-head"><span class="mk-trade-title">{d.title}</span><span class="mk-price">{coins(d.amount)}</span></div>
							<p class="mk-body">{d.payer} paid, {d.payee} is paid. Disputed by the {d.disputed_by === 'payer' ? 'buyer' : 'seller'}, {d.from === 'delivered' ? 'after' : 'before'} it was marked done.</p>
							<p class="mk-note">“{d.reason}”</p>
							<label class="mk-field">Note to both (optional)<input type="text" maxlength="500" bind:value={noteText[d.id]} /></label>
							<div class="mk-row">
								<button type="button" class="btn mk-key" disabled={busy} onclick={() => run(transports.resolve(d.id, 'release', null, noteText[d.id] ?? null), 'Paid to the seller.')} data-testid="md-release">Pay the seller</button>
								<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.resolve(d.id, 'refund', null, noteText[d.id] ?? null), 'Refunded to the buyer.')} data-testid="md-refund">Refund the buyer</button>
								<input class="mk-input mk-qty" type="text" inputmode="decimal" placeholder="to seller" aria-label="Coins to the seller in a split" bind:value={splitText[d.id]} />
								<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.resolve(d.id, 'split', Number(splitText[d.id]), noteText[d.id] ?? null), 'Split.')} data-testid="md-split">Split</button>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mk-note">No disputes.</p>
			{/if}
		</section>

		{#if transports.cardFeature && cards.length}
			<section class="card mk-panel" aria-labelledby="md-h-cards" data-testid="md-cards">
				<header>
					<h2 id="md-h-cards">Every market card</h2>
					<span class="mk-sub">{cards.filter((c) => c.featured).length} of {cards.length} featured. A featured card leads the Official zone with a Featured chip.</span>
				</header>
				<ul class="mk-list">
					{#each cards as c (c.card)}
						<li class="mk-trade" data-testid="md-card" data-card={c.card} data-featured={c.featured}>
							<div class="mk-trade-head">
								<span class="mk-trade-title">{c.title}</span>
								<span class="mk-row">
									{#if c.featured}<span class="mk-chip gold">Featured</span>{/if}
									{#if c.hidden}<span class="mk-chip bad">Hidden</span>{/if}
								</span>
							</div>
							<span class="mk-note">{CARD_KIND_WORDS[c.kind]}{c.detail ? `. ${c.detail}` : ''}</span>
							{#if c.canSet}
								<button
									type="button"
									class="btn secondary mk-key"
									disabled={busy}
									aria-pressed={c.featured}
									onclick={() => run(transports.cardFeature!(c.card, !c.featured), c.featured ? `${c.title}: unfeatured.` : `${c.title}: featured.`)}
									data-testid="md-card-feature">{c.featured ? 'Unfeature' : 'Feature'}</button
								>
							{:else}
								<span class="mk-note">A full coin admin features this one.</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="card mk-panel" aria-labelledby="md-h-listings" data-testid="md-listings">
			<header><h2 id="md-h-listings">Student listings</h2><span class="mk-sub">Feature one to pin it near the top. Hide one with a reason the student sees.</span></header>
			{#if listings.length}
				<ul class="mk-list">
					{#each listings as l (l.id)}
						<li class="mk-trade" data-testid="md-listing">
							<div class="mk-trade-head">
								<span class="mk-trade-title">{l.title}</span>
								<span class="mk-row">
									<span class="mk-price">{l.price !== null ? coins(l.price) : ''}</span>
									{#if l.featured}<span class="mk-chip gold">Featured</span>{/if}
									{#if l.hidden}<span class="mk-chip bad">Hidden</span>{/if}
									{#if l.closed}<span class="mk-chip plain">Closed</span>{:else if l.expired}<span class="mk-chip plain">Expired</span>{/if}
								</span>
							</div>
							<span class="mk-note">{l.kind === 'request' ? 'Request' : 'Offer'} by {l.owner.name}{l.hidden && l.hidden_reason ? `. Hidden: ${l.hidden_reason}` : ''}</span>
							<div class="mk-row">
								<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.listing(l.id, l.featured ? 'unfeature' : 'feature', null), l.featured ? 'Unfeatured.' : 'Featured.')}>{l.featured ? 'Unfeature' : 'Feature'}</button>
								{#if l.hidden}
									<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.listing(l.id, 'unhide', null), 'Shown again.')}>Unhide</button>
								{:else}
									<input class="mk-input" type="text" maxlength="300" placeholder="Why it is hidden" aria-label="Reason to hide" bind:value={hideText[l.id]} />
									<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.listing(l.id, 'hide', hideText[l.id] ?? ''), 'Hidden.')} data-testid="md-hide">Hide</button>
								{/if}
								{#if !l.closed && !l.hidden}
									<button type="button" class="btn secondary mk-key" onclick={() => pinListing(l)}>Pin to banner</button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mk-note">No listings{scope === 'section' ? ' from your students' : ''}.</p>
			{/if}
		</section>

		<section class="card mk-panel" aria-labelledby="md-h-official" data-testid="md-official">
			<header><h2 id="md-h-official">Official cards</h2><span class="mk-sub">A card in the Official zone: a want-ad, an announcement, a door to a page.</span></header>
			{#if official.length}
				<ul class="mk-list">
					{#each official as o (o.id)}
						<li class="mk-trade">
							<div class="mk-trade-head"><span class="mk-trade-title">{o.title}</span><span class="mk-note">{o.section ?? 'Every class'}</span></div>
							<div class="mk-row">
								<button type="button" class="btn secondary mk-key" onclick={() => pinListing(o)}>Pin to banner</button>
								<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.listing(o.id, 'remove', null), 'Removed.')}>Remove</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			<form class="mk-form" onsubmit={saveOfficial} data-testid="md-official-form">
				<label class="mk-field wide">Title<input type="text" maxlength="80" bind:value={oTitle} placeholder="Tissue boxes wanted" /></label>
				<label class="mk-field wide">Description<input type="text" maxlength="1000" bind:value={oDesc} /></label>
				<label class="mk-field">Opens (a page on this site)<input type="text" bind:value={oLink} /></label>
				<label class="mk-field">Price shown (optional)<input type="text" inputmode="decimal" bind:value={oPrice} /></label>
				<label class="mk-field">For<select bind:value={oSection}>{#if scope === 'full'}<option value="">Every class</option>{/if}{#each sections as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select></label>
				<label class="mk-field">Days up<input type="text" inputmode="numeric" bind:value={oDays} /></label>
				<div class="wide"><button type="submit" class="btn mk-key" disabled={busy}>Post official card</button></div>
			</form>
		</section>

		<section class="card mk-panel" aria-labelledby="md-h-banner" data-testid="md-banner">
			<header><h2 id="md-h-banner">Classroom banner</h2><span class="mk-sub">Pins rotate under the IDEA Classroom header. The look is chosen in Settings.</span></header>
			{#if pins.length}
				<ul class="mk-list">
					{#each pins as p (p.id)}
						<li class="mk-trade" data-testid="md-pin">
							<div class="mk-trade-head"><span class="mk-trade-title">{p.title}</span><span class="mk-note">{p.section ?? 'Every class'}{p.ends_on ? `, until ${p.ends_on}` : ''}</span></div>
							<div class="mk-row"><span class="mk-note">Opens {p.href}</span><button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.bannerRemove(p.id), 'Unpinned.')}>Unpin</button></div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mk-note">Nothing pinned. The banner does not show until something is.</p>
			{/if}
			<form class="mk-form" id="md-banner-form" onsubmit={saveBanner} data-testid="md-banner-form">
				<label class="mk-field">Kind<select bind:value={bKind}><option value="official">Official</option><option value="listing">Student listing</option><option value="shop">Shop item</option><option value="link">Any page</option></select></label>
				<label class="mk-field wide">Title<input type="text" maxlength="80" bind:value={bTitle} placeholder="Extra Credit is on sale" /></label>
				<label class="mk-field wide">Line under it (optional)<input type="text" maxlength="140" bind:value={bSub} /></label>
				<label class="mk-field">Opens<input type="text" bind:value={bHref} /></label>
				<label class="mk-field">From (optional)<input type="date" bind:value={bStart} /></label>
				<label class="mk-field">Until (optional)<input type="date" bind:value={bEnd} /></label>
				<label class="mk-field">For<select bind:value={bSection}>{#if scope === 'full'}<option value="">Every class</option>{/if}{#each sections as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select></label>
				<div class="wide mk-row"><button type="submit" class="btn mk-key" disabled={busy}>Pin it</button>{#if bListing}<span class="mk-note">Pinning a listing: it shows only while the listing is open.</span>{/if}</div>
			</form>
		</section>

		<section class="card mk-panel" aria-labelledby="md-h-reviews" data-testid="md-reviews">
			<header><h2 id="md-h-reviews">Reviews</h2></header>
			{#if reviews.length}
				<ul class="mk-list">
					{#each reviews as r (r.id)}
						<li class="mk-review">
							<Stars average={r.stars} count={1} single />
							<p>{r.body}</p>
							<span class="mk-note">{r.author} about {r.subject}{r.removed ? ', removed' : ''}</span>
							{#if !r.removed}
								<div class="mk-row">
									<input class="mk-input" type="text" maxlength="300" placeholder="Why it is removed" aria-label="Reason to remove" bind:value={removeText[r.id]} />
									<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.reviewRemove(r.id, removeText[r.id] ?? ''), 'Review removed.')}>Remove</button>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mk-note">No reviews yet.</p>
			{/if}
		</section>

		<section class="card mk-panel" aria-labelledby="md-h-transfers" data-testid="md-transfers">
			<header><h2 id="md-h-transfers">Transfers</h2><span class="mk-sub">Every transfer touching your students, private ones too.</span></header>
			{#if transfers.length}
				<ul class="mk-feed">
					{#each transfers as t (t.id)}
						<li>
							<span class="mk-feed-who">{t.from.name} to {t.to.name} {#if t.private}<span class="mk-chip plain">Private</span>{/if}</span>
							<span class="mk-feed-amt">{coins(t.amount)}</span>
							{#if t.raw_message}
								<span class="mk-feed-msg">“{t.raw_message}”{t.message_removed ? ' (removed from the feed)' : ''}</span>
								{#if !t.message_removed}
									<span class="mk-feed-when">
										<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.transferRemove(t.id, 'Removed by staff.'), 'Message removed from the feed.')}>Remove message</button>
									</span>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mk-note">No transfers yet.</p>
			{/if}
		</section>

		{#if transports.stockSet && stocks.length}
			<section class="card mk-panel" aria-labelledby="md-h-stocks" data-testid="md-stocks">
				<header><h2 id="md-h-stocks">Stocks</h2><span class="mk-sub">Switch a stock off to stop new trades; holders can still sell. The formula's numbers are in Settings.</span></header>
				<ul class="mk-list">
					{#each stocks as s (s.id)}
						<li class="mk-trade">
							<div class="mk-trade-head"><span class="mk-trade-title">{s.ticker}: {s.name}</span><span class="mk-chip {s.active ? 'good' : 'plain'}">{s.active ? 'On' : 'Off'}</span></div>
							<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => run(transports.stockSet!(s.id, !s.active), s.active ? 'Switched off.' : 'Switched on.')}>{s.active ? 'Switch off' : 'Switch on'}</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
