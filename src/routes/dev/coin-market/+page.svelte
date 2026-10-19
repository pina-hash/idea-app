<script lang="ts">
	import { onMount } from 'svelte';
	import { page as appPage } from '$app/state';
	import MarketPage from '$lib/coin-market/MarketPage.svelte';
	import MarketDesk from '$lib/coin-market/MarketDesk.svelte';
	import CoinBalanceMarket from '$lib/coin-market/CoinBalanceMarket.svelte';
	import { parseBoard, parseTransfer, type MarketBoard, type TransferRow } from '$lib/coin-market/market';
	import { officialTiles } from '$lib/coin-market/official';
	import type { MarketTransports, TransferTransports } from '$lib/coin-market/transports';
	import type { MarketDeskTransports } from '$lib/coin-market/desk';
	import type { HallPassMinutesQuote } from '$lib/classroom/hall-pass';
	import { fixtureBoard, FIXTURE_DIRECTORY, FIXTURE_FEED } from './fixture';

	/**
	 * Dev harness for /market, the coin page's market strip and the Coin Desk's
	 * market page (ledger 0402). Mounts the REAL components over in-memory
	 * payloads run through the REAL parsers. Transports answer in memory with
	 * the refusals the database gives in the common cases, so a claim, the
	 * escrow steps, a review, a PIN and a transfer can each be driven.
	 *
	 * `?view=market|coin-page|desk`, `?state=ready|signed_out|updating|error`,
	 * `?debt=1` (the balance below zero), `?pin=1` (a PIN already set, 1234).
	 * 404s in production.
	 */
	let hydrated = $state(false);
	onMount(() => (hydrated = true));
	const themeParam = appPage.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});
	const q = appPage.url.searchParams;
	const view = q.get('view') ?? 'market';
	const pageState = (['ready', 'signed_out', 'updating', 'error'].includes(q.get('state') ?? '') ? q.get('state') : 'ready') as
		| 'ready'
		| 'signed_out'
		| 'updating'
		| 'error';

	let raw = $state(fixtureBoard(q.get('debt') === '1' ? -3.25 : 23.5));
	const board = $derived<MarketBoard | null>(parseBoard(raw));
	const feed: TransferRow[] = FIXTURE_FEED.map(parseTransfer).filter((t): t is TransferRow => !!t);
	const tiles = $derived(
		board
			? officialTiles({
					shop: { eatingPass: 150, extraCreditPerPoint: 2, payRaiseCost: 100, gramsPerCoin: 10, printActive: true },
					donations: [
						{ id: 'd1', name: 'Small square tissue box', rate: 1 },
						{ id: 'd2', name: 'Large tissue box', rate: 2 }
					],
					contracts: [
						{ id: 'c1', title: 'Organize the filament shelf', pay_type: 'flat', payout_amount: 3, hourly_rate: null, debt_only: false, section: null },
						{ id: 'c2', title: 'Sweep the shop', pay_type: 'hourly', payout_amount: null, hourly_rate: 2, debt_only: true, section: null }
					],
					staffCards: board.official,
					inDebt: board.me.balance < 0
				})
			: []
	);

	const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data: data as unknown as Record<string, unknown> });
	const no = (words: string) => Promise.resolve({ ok: false as const, words });

	const transports: MarketTransports = {
		post: async (i) => {
			raw.listings = [
				{ ...raw.listings[0], id: `n${Date.now()}`, kind: i.kind, title: i.title, description: i.description, price: i.price, category: i.category, quantity: i.quantity, remaining: i.quantity ?? 1, featured: false, mine: true, owner: { name: 'Ana Reyes' } } as never,
				...raw.listings
			];
			raw.me = { ...raw.me, open_listings: raw.me.open_listings + 1 };
			return ok({ ok: true });
		},
		claim: async (id) => {
			const l = raw.listings.find((x) => x.id === id);
			if (!l) return no('That is not there any more. Reload the page.');
			if (l.kind === 'offer' && raw.me.balance - Number(l.price) < 0) return no('Your balance is too low.');
			raw.orders = [
				{ ...raw.orders[0], id: `o${Date.now()}`, title: String(l.title), amount: Number(l.price), status: 'held', side: l.kind === 'offer' ? 'payer' : 'payee', other: { id: 'x', name: String((l.owner as { name: string }).name) }, can_deliver: l.kind !== 'offer', can_cancel: l.kind !== 'offer', can_dispute: true, can_confirm: false, can_review: false },
				...raw.orders
			];
			if (l.kind === 'offer') raw.me = { ...raw.me, balance: raw.me.balance - Number(l.price) };
			return ok({ ok: true });
		},
		orderAct: async (id, action) => {
			raw.orders = raw.orders.map((o) =>
				o.id !== id
					? o
					: action === 'deliver'
						? { ...o, status: 'delivered', can_deliver: false, can_cancel: false, class_days_since_delivery: 0 }
						: action === 'confirm'
							? { ...o, status: 'released', can_confirm: false, can_dispute: false, can_review: true }
							: action === 'cancel'
								? { ...o, status: 'refunded', can_deliver: false, can_cancel: false, can_dispute: false }
								: { ...o, status: 'disputed', can_confirm: false, can_dispute: false, dispute_reason: 'In the harness.' }
			);
			return ok({ ok: true });
		},
		review: async (id, stars, body) => {
			raw.orders = raw.orders.map((o) => (o.id === id ? { ...o, my_review: { id: 'r', stars, body, created_at: new Date().toISOString(), removed: false } } : o));
			return ok({ ok: true });
		},
		listingSet: async () => ok({ ok: true }),
		profile: async (id) =>
			ok({
				ok: true,
				id,
				name: 'Maya Torres',
				classes: [{ section_id: 's-a', label: 'IDEA100 Block 1' }],
				rating: { average: 4.6, count: 5 },
				reviews: [
					{ id: 'r1', stars: 5, body: 'Name tags came out perfect and on time.', at: '2026-10-12T18:00:00Z', author: 'Jon Park' },
					{ id: 'r2', stars: 4, body: 'Good work, took one extra day to deliver.', at: '2026-10-09T18:00:00Z', author: 'Kai Brooks' }
				],
				listings: []
			})
	};

	let pin = $state<string | null>(q.get('pin') === '1' ? '1234' : null);
	let wrong = $state(0);
	let sentToday = $state(4);
	const transfers: TransferTransports = {
		status: async () =>
			ok({
				signed_in: true,
				in_economy: true,
				has_pin: pin !== null,
				locked_until: wrong >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null,
				balance: raw.me.balance,
				sent_today: sentToday,
				rules: { daily_cap: 20, private_fee_percent: 10, private_fee_min: 0.1, pin_tries: 5, lock_minutes: 15 },
				mine: []
			}),
		directory: async () => ok(FIXTURE_DIRECTORY),
		setPin: async (p) => {
			pin = p;
			return ok({ ok: true });
		},
		send: async (i) => {
			if (i.pin !== pin) {
				wrong++;
				return no(`Wrong PIN. ${Math.max(5 - wrong, 0)} tries left before sending locks.`);
			}
			sentToday += i.amount;
			raw.me = { ...raw.me, balance: raw.me.balance - i.amount };
			return ok({ ok: true });
		}
	};

	let quoteState = $state<HallPassMinutesQuote>({
		available: true,
		block_minutes: 5,
		price_per_block: 1,
		cap_minutes: 15,
		bought_today_minutes: 0,
		bought_here_minutes: 0,
		room_minutes: 15,
		room_blocks: 3,
		balance: 23.5
	});
	const minutesQuote = async () => ({ ...quoteState });
	const buyMinutes = async (_s: string, blocks: number) => {
		const m = blocks * 5;
		quoteState = { ...quoteState, bought_today_minutes: quoteState.bought_today_minutes + m, room_minutes: quoteState.room_minutes - m, room_blocks: quoteState.room_blocks - blocks };
		return { ok: true as const, minutes: m, cost: blocks };
	};

	const deskBoard = fixtureBoard();
	const desk: MarketDeskTransports = {
		load: async () => ({
			moderation: {
				scope: 'full',
				escrow: 9.5,
				disputes: [{ id: 'd1', title: 'SolidWorks tutoring', amount: 5, payer: 'Ana Reyes', payee: 'Lee Chen', disputed_by: 'payer', reason: 'The session was cut short.', from: 'delivered' }],
				listings: deskBoard.listings.filter((l) => !l.mine).slice(0, 4),
				official: deskBoard.official,
				reviews: [{ id: 'r1', stars: 2, body: 'Took forever and the tags were crooked.', author: 'Kai Brooks', subject: 'Maya Torres', removed: false }]
			},
			banner: { style: 'spotlight', pins: [{ id: 'b1', kind: 'official', title: 'Tissue boxes wanted', subtitle: 'Bring one in', href: '/market', sort_order: 0, price: null }] },
			transfers: [{ ...FIXTURE_FEED[0], raw_message: FIXTURE_FEED[0].message }, { ...FIXTURE_FEED[1], private: true, fee: 0.1, raw_message: 'For lunch' }],
			stocks: [
				{ id: 'idea', kind: 'index', ticker: 'IDEA', name: 'IDEA index', active: true },
				{ id: 'foundry', kind: 'foundry', ticker: 'FNDRY', name: 'IDEA Foundry', active: true }
			],
			sections: [
				{ id: 's-a', label: 'IDEA100 Block 1' },
				{ id: 's-b', label: 'IDEA209H Block 4' }
			]
		}),
		resolve: async () => ({ ok: true }),
		listing: async () => ({ ok: true }),
		reviewRemove: async () => ({ ok: true }),
		official: async () => ({ ok: true }),
		bannerSave: async () => ({ ok: true }),
		bannerRemove: async () => ({ ok: true }),
		transferRemove: async () => ({ ok: true }),
		stockSet: async () => ({ ok: true })
	};
</script>

<span hidden data-harness-hydrated={hydrated ? 'yes' : 'no'}></span>

{#if view === 'coin-page'}
	<main class="mk-page" data-testid="harness-coin-page">
		<CoinBalanceMarket portfolio={{ value: 12.4, cost_basis: 11.8, count: 2 }} minuteClasses={[{ section_id: 's-a', label: 'IDEA100 Block 1' }]} {transfers} {minutesQuote} {buyMinutes} inEconomy />
	</main>
{:else if view === 'desk'}
	<main class="mk-page" data-testid="harness-desk"><MarketDesk transports={desk} /></main>
{:else}
	<MarketPage state={pageState} board={pageState === 'ready' ? board : null} {tiles} {feed} {transports} {transfers} />
{/if}
