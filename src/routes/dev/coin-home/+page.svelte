<script lang="ts">
	/**
	 * /dev/coin-home (ledger 0422): the REAL coin home over in-memory answers,
	 * shaped by the REAL `coinHomeFrom`. `?who=student` (default), `staff`
	 * (the Coin Desk card and tab), `out` (signed out: only the Ledger has data),
	 * `empty` (signed in, nothing recorded yet), `debt` (a negative balance).
	 */
	import { page } from '$app/state';
	import CoinHomePage from '$lib/coin-bar/CoinHomePage.svelte';
	import { coinHomeFrom, type LedgerRow } from '$lib/coin-bar/home';
	import type { CoinMyPage } from '$lib/coin-balance';
	import type { MarketBoard } from '$lib/coin-market/market';
	import type { StocksBoard } from '$lib/coin-stocks/stocks';

	const who = page.url.searchParams.get('who') ?? 'student';
	const out = who === 'out';
	const empty = who === 'empty';
	const day = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

	const mine = {
		in_economy: true,
		balance: who === 'debt' ? -14 : 86,
		weekly_wage: 5,
		payday: '2026-10-23',
		history: empty
			? []
			: [
					{ id: 'h1', at: day(2), amount: 5, name: 'Weekly wage', reversed: false, reverses: null },
					{ id: 'h2', at: day(20), amount: -12, name: 'Eating pass', reversed: false, reverses: null },
					{ id: 'h3', at: day(30), amount: 10, name: 'Contract: Sweep the IDEA Shop', reversed: false, reverses: null }
				]
	} as unknown as CoinMyPage;

	const leaderboard: LedgerRow[] = [
		{ name: 'Mateo Reyes', section: 'IDEA209H Block 2', balance: 142 },
		{ name: 'Ana Lopez', section: 'IDEA100 Block 1', balance: 131.5 },
		{ name: 'Daniel Rios', section: 'IDEA209H Block 2', balance: 118 },
		{ name: 'Ben Ortiz', section: 'IDEA100 Block 3', balance: 64 },
		{ name: 'Leo Park', section: 'IDEA100 Block 1', balance: -8 }
	];

	const listing = (id: string, title: string, price: number | null, kind: 'offer' | 'request', hours: number) => ({
		id,
		title,
		price,
		kind,
		created_at: day(hours),
		closed: false,
		expired: false,
		hidden: false
	});
	const market = {
		listings: empty
			? []
			: [
					listing('l1', 'Custom 3D printed keychain', 6, 'offer', 3),
					listing('l2', 'Help soldering my FRC wiring harness', 15, 'request', 9),
					listing('l3', 'Laser cut name plate', 8, 'offer', 26),
					listing('l4', 'Old calculator', null, 'offer', 50)
				],
		orders: empty ? [] : [{ status: 'held' }]
	} as unknown as MarketBoard;

	const stock = (ticker: string, kind: string, close: number, change: number) => ({
		id: ticker,
		ticker,
		name: ticker,
		kind,
		active: true,
		last: { close, change_percent: change },
		// A gentle climb with some chop, ending at the close.
		series: Array.from({ length: 40 }, (_, i) => ({
			at: day(40 - i),
			close: Math.round((close - (39 - i) * (change / 20) + Math.sin(i * 1.7) * 0.9) * 100) / 100
		}))
	});
	const stocks = {
		stocks: [stock('IDEAX', 'index', 104.32, 1.84), stock('B2CL', 'class', 52.1, 4.2), stock('FNDY', 'foundry', 18.4, -2.1)],
		portfolio: { positions: empty ? [] : [{ shares: 3 }, { shares: 1 }], value: empty ? 0 : 214.6, cost_basis: 200 }
	} as unknown as StocksBoard;

	const home = coinHomeFrom({
		signedIn: !out,
		mine: out ? null : mine,
		leaderboard,
		market: out ? null : market,
		stocks: out ? null : stocks,
		staff: who === 'staff' ? 'full' : null
	});
</script>

<CoinHomePage {home} coinDesk={who === 'staff'} onsignin={out ? () => {} : null} />
