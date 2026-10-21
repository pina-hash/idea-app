<script lang="ts">
	import { onMount } from 'svelte';
	import { page as appPage } from '$app/state';
	import StocksPage from '$lib/coin-stocks/StocksPage.svelte';
	import StockDetailPage from '$lib/coin-stocks/StockDetailPage.svelte';
	import { parseStockDetail, parseStocksBoard } from '$lib/coin-stocks/stocks';
	import type { StockTransports } from '$lib/coin-stocks/transports';

	/**
	 * Dev harness for /market/stocks and one stock's page (ledger 0402). The
	 * REAL components over an in-memory `coin_stocks_board()` / `coin_stock_detail()`
	 * payload run through the REAL parsers. `?detail=1` shows FNDRY's page,
	 * `?state=signed_out|updating|error`, `?closed=1` (not a class day),
	 * `?halt=1` (GAUNTLET paused after a big move, past the launch weeks).
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
	const detailView = q.get('detail') === '1';
	const pageState = (['ready', 'signed_out', 'updating', 'error'].includes(q.get('state') ?? '') ? q.get('state') : 'ready') as
		| 'ready'
		| 'signed_out'
		| 'updating'
		| 'error';


	/** The relaunch moment, and forty price changes after it, two hours apart. */
	const LAUNCH = '2026-10-14T14:30:00Z';
	function walk(seed: number, start: number, holdEvery = 0) {
		let p = start;
		let s = seed;
		const out: { at: string; close: number }[] = [];
		for (let i = 0; i < 40; i++) {
			s = (s * 9301 + 49297) % 233280;
			if (i > 0 && !(holdEvery > 0 && i % holdEvery === 0)) p = Math.min(100, Math.max(1, p * (1 + (s / 233280 - 0.48) * 0.04)));
			out.push({ at: new Date(Date.parse(LAUNCH) + i * 7_200_000).toISOString(), close: Math.round(p * 100) / 100 });
		}
		return out;
	}
	const RAMP = { phase: 'ramp', week: 2, cap_percent: 10, next_at: '2026-10-28T14:30:00Z', ramp_ends: '2026-11-11T14:30:00Z' };
	const halted = q.get('halt') === '1';
	function stock(id: string, kind: string, ticker: string, name: string, series: { at: string; close: number }[], halt: unknown = null) {
		const last = series[series.length - 1];
		const open = series[Math.max(0, series.length - 6)];
		const today = series.slice(-6).map((p) => p.close);
		return {
			id,
			kind,
			ticker,
			name,
			active: true,
			last: {
				day: last.at.slice(0, 10),
				close: last.close,
				prev: open.close,
				carried: false,
				at: last.at,
				open: open.close,
				high: Math.max(...today),
				low: Math.min(...today),
				change_percent: Math.round(((last.close - open.close) / open.close) * 10000) / 100
			},
			launch: { at: LAUNCH, price: series[0].close },
			phase: halt ? { ...RAMP, phase: 'open', week: 5, cap_percent: null } : RAMP,
			halt,
			series
		};
	}
	const S = {
		a: walk(7, 10.4),
		b: walk(19, 9.4, 9),
		f: walk(31, 10.6),
		g: walk(43, 11, 6)
	};
	const index = S.a.map((p, i) => ({
		at: p.at,
		close: Math.round((10 * (S.a[i].close / S.a[0].close + S.b[i].close / S.b[0].close + S.f[i].close / S.f[0].close + S.g[i].close / S.g[0].close)) / 4 * 100) / 100
	}));
	const gHalt = halted
		? { level: 1, move_percent: -11.4, started_at: '2026-10-21T17:02:00Z', until: '2026-10-21T17:17:00Z', rest_of_day: false }
		: null;
	const stocks = [
		stock('idea', 'index', 'IDEA', 'IDEA index', index),
		stock('class:s-a', 'class', 'IDEA100B1', 'IDEA100 Block 1', S.a),
		stock('class:s-b', 'class', 'IDEA209HB4', 'IDEA209H Block 4', S.b),
		stock('foundry', 'foundry', 'FNDRY', 'IDEA Foundry', S.f),
		stock('gauntlet', 'gauntlet', 'GNTLT', 'GAUNTLET', S.g, gHalt)
	];
	const fLast = stocks[3].last.close;
	const aLast = stocks[1].last.close;
	let raw = $state({
		signed_in: true,
		in_economy: true,
		balance: 23.5,
		open_today: q.get('closed') !== '1',
		launched_at: LAUNCH,
		last_tick_at: '2026-10-21T17:41:00Z',
		rules: {
			formula_version: 'v2',
			ramp: [
				{ week: 1, cap_percent: 5 },
				{ week: 2, cap_percent: 10 },
				{ week: 3, cap_percent: 15 },
				{ week: 4, cap_percent: 25 }
			],
			halts: [
				{ level: 1, move_percent: 10, minutes: 15 },
				{ level: 2, move_percent: 20, minutes: 15 },
				{ level: 3, move_percent: 30, minutes: null }
			],
			fee_percent: 2,
			position_cap: 50,
			floor: 1,
			ceiling: 100,
			base: 10,
			class_window_weeks: 4,
			min_class_students: 3
		},
		stocks,
		portfolio: {
			positions: [
				{ stock_id: 'foundry', ticker: 'FNDRY', name: 'IDEA Foundry', shares: 1.2, cost_basis: 11.8, price: fLast, value: Math.round(1.2 * fLast * 100) / 100 },
				{ stock_id: 'class:s-a', ticker: 'IDEA100B1', name: 'IDEA100 Block 1', shares: 0.5, cost_basis: 5, price: aLast, value: Math.round(0.5 * aLast * 100) / 100 }
			],
			value: Math.round((1.2 * fLast + 0.5 * aLast) * 100) / 100,
			cost_basis: 16.8
		},
		leaderboard: [
			{ name: 'Maya Torres', value: 41.2, me: false },
			{ name: 'Ana Reyes', value: Math.round((1.2 * fLast + 0.5 * aLast) * 100) / 100, me: true },
			{ name: 'Jon Park', value: 9.75, me: false },
			{ name: 'Lee Chen', value: 4.1, me: false }
		]
	});
	const board = $derived(parseStocksBoard(raw));

	const transports: StockTransports = {
		buy: async (id, c) => {
			if (!raw.open_today) return { ok: false, words: 'The market is closed today. Trades happen on class days.' };
			if (c > raw.balance) return { ok: false, words: 'Your balance does not cover that. Buying has to leave you at zero or more.' };
			raw.balance = Math.round((raw.balance - c) * 100) / 100;
			return { ok: true, data: { ok: true, stock_id: id } };
		},
		sell: async (id) => {
			raw.portfolio = { ...raw.portfolio, positions: raw.portfolio.positions.filter((p) => p.stock_id !== id) };
			return { ok: true, data: { ok: true } };
		}
	};

	const fs = S.f;
	const days = [...new Set(fs.map((p) => p.at.slice(0, 10)))].map((day) => {
		const c = fs.filter((p) => p.at.startsWith(day)).map((p) => p.close);
		return { day, open: c[0], high: Math.max(...c), low: Math.min(...c), close: c[c.length - 1], prev: null, changes: c.length };
	});
	const detail = parseStockDetail({
		ok: true,
		stock: stocks[3],
		launch: { at: LAUNCH, price: fs[0].close, anchor_price: fs[0].close, anchor_signal: 4.571429 },
		days: days.reverse(),
		ticks: fs
			.map((p, i) => ({
				at: p.at,
				price: p.close,
				raw: p.close,
				signal: Math.round(p.close * 0.43 * 1e6) / 1e6,
				ref: fs[0].close,
				phase: i === 0 ? 'launch' : 'ramp',
				cap_percent: i === 0 ? null : 10,
				carried: false,
				note: i === 0 ? 'Launch price: the price the stock had when the market relaunched.' : null,
				inputs: { person_days: 28 + (i % 9), people: 9 + (i % 4) },
				formula_version: 'v2'
			}))
			.reverse(),
		halts: [{ day: '2026-10-20', level: 1, move_percent: 10.6, started_at: '2026-10-20T18:05:00Z', until: '2026-10-20T18:20:00Z' }],
		position: { shares: 1.2, cost_basis: 11.8 },
		trades: [
			{ at: '2026-10-08T18:00:00Z', side: 'buy', shares: 0.8, price: 9.8, gross: 8, fee: 0.16, pnl: 0 },
			{ at: '2026-10-13T18:00:00Z', side: 'buy', shares: 0.4, price: 10.1, gross: 4, fee: 0.08, pnl: 0 }
		]
	});
</script>

<span hidden data-harness-hydrated={hydrated ? 'yes' : 'no'}></span>

{#if detailView}
	<StockDetailPage state={pageState === 'error' ? 'missing' : pageState} detail={pageState === 'ready' ? detail : null} />
{:else}
	<StocksPage state={pageState} board={pageState === 'ready' ? board : null} {transports} />
{/if}
