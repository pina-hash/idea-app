/**
 * THE IDEA STOCK MARKET ON THE CLIENT (ledger 0402, migration 0279): types,
 * parsers, the chart's arithmetic and the words. The prices are the
 * database's; nothing here computes one. `PRICE_FORMULA_WORDS` says the
 * formula in a student's terms, and every number in it is read from the
 * board's own rules, so the sentence cannot drift from the settings.
 */

import { personName } from '$lib/person-name';
import { coins, coinNumber } from '$lib/coin-format';

export type StockKind = 'class' | 'foundry' | 'gauntlet' | 'index';

export interface StockPoint {
	day: string;
	close: number;
	carried: boolean;
}

export interface Stock {
	id: string;
	kind: StockKind;
	ticker: string;
	name: string;
	active: boolean;
	last: { day: string; close: number; prev: number | null; carried: boolean; change_percent: number | null } | null;
	series: StockPoint[];
}

export interface Position {
	stock_id: string;
	ticker: string;
	name: string;
	shares: number;
	cost_basis: number;
	price: number | null;
	value: number;
}

export interface Portfolio {
	positions: Position[];
	value: number;
	cost_basis: number;
}

export interface StockRules {
	fee_percent: number;
	position_cap: number;
	clamp_percent: number;
	floor: number;
	ceiling: number;
	base: number;
	median_weeks: number;
}

export interface StocksBoard {
	in_economy: boolean;
	balance: number;
	open_today: boolean;
	rules: StockRules;
	stocks: Stock[];
	portfolio: Portfolio;
	leaderboard: { name: string; value: number; me: boolean }[];
}

export interface StockClose {
	day: string;
	close: number;
	prev: number | null;
	target: number | null;
	signal: number | null;
	median: number | null;
	carried: boolean;
	note: string | null;
	inputs: Record<string, unknown>;
	formula_version: string;
}

export interface StockDetail {
	stock: Stock;
	closes: StockClose[];
	position: { shares: number; cost_basis: number } | null;
	trades: { at: string; side: 'buy' | 'sell'; shares: number; price: number; gross: number; fee: number; pnl: number }[];
}

function n(v: unknown, d = 0): number {
	const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(x) ? x : d;
}
function nn(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const x = n(v, NaN);
	return Number.isFinite(x) ? x : null;
}
function obj(v: unknown): Record<string, unknown> | null {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function arr(v: unknown): unknown[] {
	return Array.isArray(v) ? v : [];
}
function s(v: unknown, d = ''): string {
	return typeof v === 'string' ? v : d;
}

export function parseStock(v: unknown): Stock | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string') return null;
	const last = obj(o.last);
	const kind = (['class', 'foundry', 'gauntlet', 'index'].includes(String(o.kind)) ? o.kind : 'class') as StockKind;
	return {
		id: o.id,
		kind,
		ticker: s(o.ticker, o.id.toUpperCase()),
		name: s(o.name, o.id),
		active: o.active !== false,
		last: last
			? {
					day: s(last.day),
					close: n(last.close),
					prev: nn(last.prev),
					carried: last.carried === true,
					change_percent: nn(last.change_percent)
				}
			: null,
		series: arr(o.series)
			.map(obj)
			.filter((p): p is Record<string, unknown> => !!p)
			.map((p) => ({ day: s(p.day), close: n(p.close), carried: p.carried === true }))
	};
}

export function parsePortfolio(v: unknown): Portfolio {
	const o = obj(v) ?? {};
	return {
		positions: arr(o.positions)
			.map(obj)
			.filter((p): p is Record<string, unknown> => !!p)
			.map((p) => ({
				stock_id: s(p.stock_id),
				ticker: s(p.ticker),
				name: s(p.name),
				shares: n(p.shares),
				cost_basis: n(p.cost_basis),
				price: nn(p.price),
				value: n(p.value)
			})),
		value: n(o.value),
		cost_basis: n(o.cost_basis)
	};
}

export function parseStocksBoard(v: unknown): StocksBoard | null {
	const o = obj(v);
	if (!o || o.signed_in !== true) return null;
	const r = obj(o.rules) ?? {};
	return {
		in_economy: o.in_economy === true,
		balance: n(o.balance),
		open_today: o.open_today === true,
		rules: {
			fee_percent: n(r.fee_percent, 2),
			position_cap: n(r.position_cap, 50),
			clamp_percent: n(r.clamp_percent, 10),
			floor: n(r.floor, 1),
			ceiling: n(r.ceiling, 100),
			base: n(r.base, 10),
			median_weeks: n(r.median_weeks, 8)
		},
		stocks: arr(o.stocks).map(parseStock).filter((x): x is Stock => !!x),
		portfolio: parsePortfolio(o.portfolio),
		leaderboard: arr(o.leaderboard)
			.map(obj)
			.filter((x): x is Record<string, unknown> => !!x)
			.map((x) => ({ name: personName(s(x.name, 'A student')), value: n(x.value), me: x.me === true }))
	};
}

export function parseStockDetail(v: unknown): StockDetail | null {
	const o = obj(v);
	if (!o || o.ok !== true) return null;
	const stock = parseStock(o.stock);
	if (!stock) return null;
	const pos = obj(o.position);
	return {
		stock,
		closes: arr(o.closes)
			.map(obj)
			.filter((c): c is Record<string, unknown> => !!c)
			.map((c) => ({
				day: s(c.day),
				close: n(c.close),
				prev: nn(c.prev),
				target: nn(c.target),
				signal: nn(c.signal),
				median: nn(c.median),
				carried: c.carried === true,
				note: typeof c.note === 'string' ? c.note : null,
				inputs: obj(c.inputs) ?? {},
				formula_version: s(c.formula_version, 'v1')
			})),
		position: pos ? { shares: n(pos.shares), cost_basis: n(pos.cost_basis) } : null,
		trades: arr(o.trades)
			.map(obj)
			.filter((t): t is Record<string, unknown> => !!t)
			.map((t) => ({
				at: s(t.at),
				side: t.side === 'sell' ? 'sell' : 'buy',
				shares: n(t.shares),
				price: n(t.price),
				gross: n(t.gross),
				fee: n(t.fee),
				pnl: n(t.pnl)
			}))
	};
}

// ---------------------------------------------------------------------------
// The chart's arithmetic: a series into an SVG path in a w by h box.
// ---------------------------------------------------------------------------

export interface ChartGeometry {
	line: string;
	area: string;
	points: { x: number; y: number; carried: boolean; day: string; close: number }[];
	min: number;
	max: number;
}

export function chartGeometry(series: StockPoint[], w: number, h: number, pad = 6): ChartGeometry | null {
	if (series.length === 0) return null;
	const values = series.map((p) => p.close);
	let min = Math.min(...values);
	let max = Math.max(...values);
	if (max - min < 1e-9) {
		min -= 1;
		max += 1;
	}
	const span = max - min;
	const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
	const points = series.map((p, i) => ({
		x: Math.round((pad + i * step) * 100) / 100,
		y: Math.round((pad + (h - pad * 2) * (1 - (p.close - min) / span)) * 100) / 100,
		carried: p.carried,
		day: p.day,
		close: p.close
	}));
	const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
	const area = `${line} L${points[points.length - 1].x} ${h - pad} L${points[0].x} ${h - pad} Z`;
	return { line, area, points, min, max };
}

/** A price: four decimals stored, two shown. */
export function price(v: number | null | undefined): string {
	return v === null || v === undefined ? '' : v.toFixed(2);
}

export function changeWords(pct: number | null): { text: string; tone: 'up' | 'down' | 'flat' } {
	if (pct === null || Math.abs(pct) < 0.005) return { text: 'Unchanged', tone: 'flat' };
	return pct > 0 ? { text: `Up ${pct.toFixed(2)}%`, tone: 'up' } : { text: `Down ${Math.abs(pct).toFixed(2)}%`, tone: 'down' };
}

export const KIND_WORDS: Record<StockKind, string> = {
	index: 'The whole platform: the average of every stock below.',
	class: "This class's grade ratio on work returned in the last 4 weeks.",
	foundry: 'People active in the IDEA Foundry each day, averaged over a week.',
	gauntlet: 'People who submitted a GAUNTLET answer each day, averaged over a week.'
};

/** The formula in words, with the board's own numbers. */
export function priceFormulaWords(r: StockRules): string {
	return (
		`Each class day, once it is over, the price is ${coinNumber(r.base)} times today's signal divided by the signal's median over the last ${coinNumber(r.median_weeks)} weeks. ` +
		`It moves at most ${coinNumber(r.clamp_percent)}% a day and stays between ${coinNumber(r.floor)} and ${coinNumber(r.ceiling)}. ` +
		`A day with no data keeps the previous price and says so.`
	);
}

export function tradeRulesWords(r: StockRules): string {
	return (
		`You trade with the house at the last closing price, on class days only. ` +
		`Each buy and sale costs a ${coinNumber(r.fee_percent)}% fee. At most ${coins(r.position_cap)} in one stock. ` +
		`No shorting: you can only sell shares you own. Shares are never part of your balance.`
	);
}

export function stockRefusalWords(r: Record<string, unknown> | null | undefined): string {
	switch (String(r?.reason ?? '')) {
		case 'market_closed':
			return 'The market is closed today. Trades happen on class days.';
		case 'no_price':
			return 'This stock has no price yet. Its first close comes after the next class day.';
		case 'in_debt':
			return 'You are in debt, so you cannot buy until your balance is back to zero. You can still sell.';
		case 'insufficient':
			return 'Your balance does not cover that. Buying has to leave you at zero or more.';
		case 'cap': {
			const room = nn(r?.room);
			return room !== null ? `That is over the limit for one stock. You can put in ${coins(room)} more.` : 'That is over the limit for one stock.';
		}
		case 'no_short':
			return 'That is more than you own. You can only sell shares you have (no shorting).';
		case 'no_position':
			return 'You do not own any of this stock.';
		case 'coins':
			return `Trade at least ${coins(0.5)}, with at most two decimals.`;
		case 'not_found':
			return 'That stock is not trading.';
		case 'not_in_economy':
			return 'None of your classes is using IDEA Coins right now.';
		case 'rate_limited':
			return 'That is a lot in one minute. Wait a minute, then try again.';
		case 'signed_out':
			return 'You are signed out. Sign in again, then try once more.';
		default:
			return 'That trade did not go through. Try again in a minute.';
	}
}

/** Shares a coin amount buys after the fee, at a price: a preview, the database decides. */
export function sharesFor(coinsIn: number, price: number, feePercent: number): number {
	if (!(coinsIn > 0) || !(price > 0)) return 0;
	const fee = Math.round(coinsIn * feePercent) / 100;
	return Math.round(((coinsIn - fee) / price) * 1e6) / 1e6;
}
