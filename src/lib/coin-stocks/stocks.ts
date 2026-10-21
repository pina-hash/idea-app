/**
 * THE IDEA STOCK MARKET ON THE CLIENT (ledger 0402, migration 0279; formula v2
 * since the relaunch, 0283): types, parsers, the chart's arithmetic and the
 * words. The prices are the database's; nothing here computes one. The launch
 * ramp and the circuit breakers are stated once, in the database
 * (`_coin_stock_rules`), and arrive on the board as `rules`; every sentence
 * below reads its numbers from there, and a stock's own `phase` and `halt`
 * arrive already worked out. Nothing here decides a cap or a halt.
 */

import { personName } from '$lib/person-name';
import { coins, coinNumber } from '$lib/coin-format';

export type StockKind = 'class' | 'foundry' | 'gauntlet' | 'index' | 'area';

/** One price change: the series is every change since the launch. */
export interface StockPoint {
	at: string;
	close: number;
}

export interface StockPhase {
	phase: 'launch' | 'ramp' | 'open';
	week: number | null;
	cap_percent: number | null;
	next_at: string | null;
	ramp_ends: string | null;
}

export interface StockHalt {
	level: number;
	move_percent: number;
	started_at: string;
	until: string;
	rest_of_day: boolean;
}

export interface Stock {
	id: string;
	kind: StockKind;
	ticker: string;
	name: string;
	active: boolean;
	last: {
		day: string;
		close: number;
		prev: number | null;
		carried: boolean;
		change_percent: number | null;
		at: string | null;
		high: number | null;
		low: number | null;
	} | null;
	launch: { at: string | null; price: number | null } | null;
	phase: StockPhase | null;
	halt: StockHalt | null;
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
	floor: number;
	ceiling: number;
	base: number;
	class_window_weeks: number;
	min_class_students: number;
	formula_version: string;
	ramp: { week: number; cap_percent: number }[];
	halts: { level: number; move_percent: number; minutes: number | null }[];
}

export interface StocksBoard {
	in_economy: boolean;
	balance: number;
	open_today: boolean;
	launched_at: string | null;
	last_tick_at: string | null;
	rules: StockRules;
	stocks: Stock[];
	portfolio: Portfolio;
	leaderboard: { name: string; value: number; me: boolean }[];
}

export interface StockTick {
	at: string;
	price: number;
	raw: number | null;
	signal: number | null;
	ref: number | null;
	phase: string;
	cap_percent: number | null;
	carried: boolean;
	note: string | null;
	inputs: Record<string, unknown>;
	formula_version: string;
}

export interface StockDay {
	day: string;
	open: number;
	high: number;
	low: number;
	close: number;
	prev: number | null;
	changes: number;
	/** Coins traded in this stock on the day, and how many trades (0287). */
	volume: number;
	trades: number;
}

export interface StockDetail {
	stock: Stock;
	launch: { at: string | null; price: number | null; anchor_price: number | null; anchor_signal: number | null };
	days: StockDay[];
	ticks: StockTick[];
	halts: { day: string; level: number; move_percent: number; started_at: string; until: string }[];
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
function sn(v: unknown): string | null {
	return typeof v === 'string' && v ? v : null;
}
function objs(v: unknown): Record<string, unknown>[] {
	return arr(v)
		.map(obj)
		.filter((x): x is Record<string, unknown> => !!x);
}

function parsePhase(v: unknown): StockPhase | null {
	const o = obj(v);
	if (!o) return null;
	const phase = o.phase === 'ramp' || o.phase === 'open' ? o.phase : 'launch';
	return { phase, week: nn(o.week), cap_percent: nn(o.cap_percent), next_at: sn(o.next_at), ramp_ends: sn(o.ramp_ends) };
}

function parseHalt(v: unknown): StockHalt | null {
	const o = obj(v);
	if (!o || typeof o.until !== 'string') return null;
	return { level: n(o.level, 1), move_percent: n(o.move_percent), started_at: s(o.started_at), until: o.until, rest_of_day: o.rest_of_day === true };
}

export function parseStock(v: unknown): Stock | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string') return null;
	const last = obj(o.last);
	const launch = obj(o.launch);
	const kind = (['class', 'foundry', 'gauntlet', 'index', 'area'].includes(String(o.kind)) ? o.kind : 'class') as StockKind;
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
					change_percent: nn(last.change_percent),
					at: sn(last.at),
					high: nn(last.high),
					low: nn(last.low)
				}
			: null,
		launch: launch ? { at: sn(launch.at), price: nn(launch.price) } : null,
		phase: parsePhase(o.phase),
		halt: parseHalt(o.halt),
		series: objs(o.series).map((p) => ({ at: s(p.at), close: n(p.close) }))
	};
}

export function parsePortfolio(v: unknown): Portfolio {
	const o = obj(v) ?? {};
	return {
		positions: objs(o.positions).map((p) => ({
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

export function parseRules(v: unknown): StockRules {
	const r = obj(v) ?? {};
	return {
		fee_percent: n(r.fee_percent, 2),
		position_cap: n(r.position_cap, 50),
		floor: n(r.floor, 1),
		ceiling: n(r.ceiling, 100),
		base: n(r.base, 10),
		class_window_weeks: n(r.class_window_weeks, 4),
		min_class_students: n(r.min_class_students, 3),
		formula_version: s(r.formula_version, 'v2'),
		ramp: objs(r.ramp).map((x) => ({ week: n(x.week), cap_percent: n(x.cap_percent) })),
		halts: objs(r.halts).map((x) => ({ level: n(x.level), move_percent: n(x.move_percent), minutes: nn(x.minutes) }))
	};
}

export function parseStocksBoard(v: unknown): StocksBoard | null {
	const o = obj(v);
	if (!o || o.signed_in !== true) return null;
	return {
		in_economy: o.in_economy === true,
		balance: n(o.balance),
		open_today: o.open_today === true,
		launched_at: sn(o.launched_at),
		last_tick_at: sn(o.last_tick_at),
		rules: parseRules(o.rules),
		stocks: arr(o.stocks).map(parseStock).filter((x): x is Stock => !!x),
		portfolio: parsePortfolio(o.portfolio),
		leaderboard: objs(o.leaderboard).map((x) => ({ name: personName(s(x.name, 'A student')), value: n(x.value), me: x.me === true }))
	};
}

export function parseStockDetail(v: unknown): StockDetail | null {
	const o = obj(v);
	if (!o || o.ok !== true) return null;
	const stock = parseStock(o.stock);
	if (!stock) return null;
	const pos = obj(o.position);
	const launch = obj(o.launch) ?? {};
	return {
		stock,
		launch: { at: sn(launch.at), price: nn(launch.price), anchor_price: nn(launch.anchor_price), anchor_signal: nn(launch.anchor_signal) },
		days: objs(o.days).map((d) => ({
			day: s(d.day),
			open: n(d.open),
			high: n(d.high),
			low: n(d.low),
			close: n(d.close),
			prev: nn(d.prev),
			changes: n(d.changes),
			volume: n(d.volume),
			trades: n(d.trades)
		})),
		ticks: objs(o.ticks).map((t) => ({
			at: s(t.at),
			price: n(t.price),
			raw: nn(t.raw),
			signal: nn(t.signal),
			ref: nn(t.ref),
			phase: s(t.phase),
			cap_percent: nn(t.cap_percent),
			carried: t.carried === true,
			note: typeof t.note === 'string' ? t.note : null,
			inputs: obj(t.inputs) ?? {},
			formula_version: s(t.formula_version, 'v2')
		})),
		halts: objs(o.halts).map((h) => ({
			day: s(h.day),
			level: n(h.level),
			move_percent: n(h.move_percent),
			started_at: s(h.started_at),
			until: s(h.until)
		})),
		position: pos ? { shares: n(pos.shares), cost_basis: n(pos.cost_basis) } : null,
		trades: objs(o.trades).map((t) => ({
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
	points: { x: number; y: number; at: string; close: number }[];
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
		at: p.at,
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

/** A moment as the school reads a clock: "10:45 AM", in Los Angeles. */
export function clock(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
}

/** A day as the school reads a calendar: "Oct 21". */
export function shortDay(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
}

export function changeWords(pct: number | null): { text: string; tone: 'up' | 'down' | 'flat' } {
	if (pct === null || Math.abs(pct) < 0.005) return { text: 'Unchanged', tone: 'flat' };
	return pct > 0 ? { text: `Up ${pct.toFixed(2)}%`, tone: 'up' } : { text: `Down ${Math.abs(pct).toFixed(2)}%`, tone: 'down' };
}

export const KIND_WORDS: Record<StockKind, string> = {
	index: 'The whole platform: it moves with the average move of every stock below.',
	class: "This class's grade ratio on work returned in the last 4 weeks.",
	foundry: 'People active in the IDEA Foundry each day, over the last 7 days.',
	gauntlet: 'People who submitted a GAUNTLET answer each day, over the last 7 days.',
	area: "This part of the site's activity this week against its own recent weeks: a few real counts, such as work handed in or reports sent."
};

/** One metric of an area stock's index, as the database recorded it on a price change. */
export interface AreaMetric {
	key: string;
	label: string;
	this_week: number;
	average_week: number;
	ratio: number;
}

/** The recorded metrics of an area price change, or none. */
export function areaMetrics(inputs: Record<string, unknown>): AreaMetric[] {
	return objs(inputs.metrics).map((m) => ({
		key: s(m.key),
		label: s(m.label, s(m.key)),
		this_week: n(m.this_week),
		average_week: n(m.average_week),
		ratio: n(m.ratio, 1)
	}));
}

/** The biggest risers and fallers by today's move, for the movers panel. Stocks with no move are left out of both lists. */
export function topMovers(stocks: Stock[], count = 3): { gainers: Stock[]; losers: Stock[] } {
	const moved = stocks.filter((x) => x.kind !== 'index' && x.last && x.last.change_percent !== null && Math.abs(x.last.change_percent) >= 0.005);
	const pct = (x: Stock) => x.last?.change_percent ?? 0;
	return {
		gainers: moved.filter((x) => pct(x) > 0).sort((a, b) => pct(b) - pct(a)).slice(0, count),
		losers: moved.filter((x) => pct(x) < 0).sort((a, b) => pct(a) - pct(b)).slice(0, count)
	};
}

/** A candle for one day: where the body and the wick sit, as numbers the chart scales. */
export interface Candle {
	day: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	up: boolean;
}

/** The days oldest first, as candles. A day with no recorded open falls back to its close. */
export function candlesOf(days: StockDay[]): Candle[] {
	return [...days]
		.sort((a, b) => a.day.localeCompare(b.day))
		.map((d) => ({
			day: d.day,
			open: d.open || d.close,
			high: Math.max(d.high || d.close, d.open || d.close, d.close),
			low: Math.min(d.low || d.close, d.open || d.close, d.close),
			close: d.close,
			volume: d.volume,
			up: d.close >= (d.open || d.close)
		}));
}

function list(xs: string[]): string {
	if (xs.length <= 1) return xs.join('');
	return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** How a price is made, in a student's words. */
export function priceFormulaWords(r: StockRules): string {
	return (
		`Each price comes straight from what happens on the site and is checked about every minute on class days. ` +
		`A stock's price is its launch price times its signal now over its signal at the launch, so a signal 10% higher is a price 10% higher. ` +
		`The IDEA index moves with the average move of the other stocks. When there is no new data, the price holds and the stock's page says why. ` +
		`Prices stay between ${coinNumber(r.floor)} and ${coinNumber(r.ceiling)}.`
	);
}

/** The launch ramp, from the board's own schedule. */
export function rampWords(r: StockRules): string {
	if (!r.ramp.length) return '';
	const steps = r.ramp.map((x) => `${coinNumber(x.cap_percent)}% in week ${x.week}`);
	return (
		`For the first ${r.ramp.length} weeks after the launch, a price can move at most ${list(steps)}, ` +
		`counted from the day's starting price. After that there is no daily limit.`
	);
}

/** The circuit breakers, from the board's own schedule. */
export function haltRulesWords(r: StockRules): string {
	if (!r.halts.length) return '';
	const steps = r.halts.map((h, i) => {
		const len = h.minutes === null ? 'for the rest of the day' : `for ${i ? 'another ' : ''}${coinNumber(h.minutes)} minutes`;
		return `${coinNumber(h.move_percent)}%${i ? '' : ' pauses it'} ${len}`;
	});
	return (
		`After the launch weeks, a big move pauses trading in that stock, the way a real stock exchange does. ` +
		`Counted from the day's starting price, a move up or down of ${list(steps)}. ` +
		`While trading is paused you cannot buy or sell that stock, and its price keeps following the data.`
	);
}

/** Where one stock stands: in the launch weeks, or open with breakers. */
export function phaseWords(p: StockPhase | null): string {
	if (!p) return '';
	if (p.phase === 'ramp' && p.week !== null && p.cap_percent !== null) {
		return `Launch week ${p.week}: moves at most ${coinNumber(p.cap_percent)}% a day.`;
	}
	if (p.phase === 'open') return 'No daily limit. A big move pauses trading.';
	return '';
}

/** A percentage as a person says it: 11.4, 12, never 11.40. */
export function percent(v: number): string {
	return String(Math.round(Math.abs(v) * 100) / 100);
}

/** A pause in force, in words. */
export function haltWords(h: StockHalt | null): string {
	if (!h) return '';
	const moved = `its price moved ${percent(h.move_percent)}% today`;
	return h.rest_of_day
		? `Trading is paused for the rest of the day: ${moved}.`
		: `Trading is paused until ${clock(h.until)}: ${moved}.`;
}

export function tradeRulesWords(r: StockRules): string {
	return (
		`You trade with the house at the current price, on class days only. ` +
		`Each buy and sale costs a ${coinNumber(r.fee_percent)}% fee. At most ${coins(r.position_cap)} in one stock. ` +
		`No shorting: you can only sell shares you own. Shares are never part of your balance.`
	);
}

export function stockRefusalWords(r: Record<string, unknown> | null | undefined): string {
	switch (String(r?.reason ?? '')) {
		case 'market_closed':
			return 'The market is closed today. Trades happen on class days.';
		case 'halted': {
			const until = typeof r?.until === 'string' ? r.until : null;
			const moved = nn(r?.move_percent);
			const why = moved !== null ? ` because its price moved ${percent(moved)}% today` : '';
			return r?.rest_of_day === true || !until
				? `Trading in this stock is paused for the rest of the day${why}. Buying and selling open again on the next class day.`
				: `Trading in this stock is paused until ${clock(until)}${why}. Buying and selling open again then.`;
		}
		case 'no_price':
			return 'This stock has no price yet. Try again in a minute.';
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
