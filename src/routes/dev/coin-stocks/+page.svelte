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
	 * `?state=signed_out|updating|error`, `?closed=1` (not a class day).
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

	/** Forty class days of a deterministic walk, starting 2026-08-24, skipping weekends. */
	function days(count: number): string[] {
		const out: string[] = [];
		const d = new Date('2026-08-24T12:00:00Z');
		while (out.length < count) {
			const w = d.getUTCDay();
			if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
			d.setUTCDate(d.getUTCDate() + 1);
		}
		return out;
	}
	const DAYS = days(40);
	function walk(seed: number, start: number, carryEvery = 0) {
		let p = start;
		let s = seed;
		return DAYS.map((day, i) => {
			s = (s * 9301 + 49297) % 233280;
			const carried = carryEvery > 0 && i > 0 && i % carryEvery === 0;
			if (!carried) p = Math.min(100, Math.max(1, p * (1 + ((s / 233280) - 0.48) * 0.12)));
			return { day, close: Math.round(p * 100) / 100, carried };
		});
	}
	function stock(id: string, kind: string, ticker: string, name: string, series: { day: string; close: number; carried: boolean }[]) {
		const last = series[series.length - 1];
		const prev = series[series.length - 2];
		return {
			id,
			kind,
			ticker,
			name,
			active: true,
			last: { day: last.day, close: last.close, prev: prev.close, carried: last.carried, change_percent: Math.round(((last.close - prev.close) / prev.close) * 10000) / 100 },
			series
		};
	}
	const S = {
		a: walk(7, 10),
		b: walk(19, 9.4, 9),
		f: walk(31, 10.6),
		g: walk(43, 11, 6)
	};
	const index = DAYS.map((day, i) => ({
		day,
		close: Math.round(((S.a[i].close + S.b[i].close + S.f[i].close + S.g[i].close) / 4) * 100) / 100,
		carried: false
	}));
	const stocks = [
		stock('idea', 'index', 'IDEA', 'IDEA index', index),
		stock('class:s-a', 'class', 'IDEA100B1', 'IDEA100 Block 1', S.a),
		stock('class:s-b', 'class', 'IDEA209HB4', 'IDEA209H Block 4', S.b),
		stock('foundry', 'foundry', 'FNDRY', 'IDEA Foundry', S.f),
		stock('gauntlet', 'gauntlet', 'GNTLT', 'GAUNTLET', S.g)
	];
	const fLast = stocks[3].last.close;
	const aLast = stocks[1].last.close;
	let raw = $state({
		signed_in: true,
		in_economy: true,
		balance: 23.5,
		open_today: q.get('closed') !== '1',
		rules: { fee_percent: 2, position_cap: 50, clamp_percent: 10, floor: 1, ceiling: 100, base: 10, median_weeks: 8 },
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
	const detail = parseStockDetail({
		ok: true,
		stock: stocks[3],
		closes: fs
			.map((p, i) => ({
				day: p.day,
				close: p.close,
				prev: i ? fs[i - 1].close : null,
				target: p.carried ? null : p.close,
				signal: p.carried ? null : Math.round(p.close * 0.4 * 100) / 100,
				median: 4,
				carried: p.carried,
				note: p.carried ? 'No data that day, so the price carried.' : null,
				inputs: p.carried
					? {}
					: { daily: [0, 1, 2, 3, 4, 5, 6].map((k) => ({ day: fs[Math.max(0, i - 6 + k)].day, people: 3 + ((i + k) % 4) })) },
				formula_version: 'v1'
			}))
			.reverse(),
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
