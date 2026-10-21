/**
 * THE COIN HOME'S PREVIEWS (ledger 0422, feedback d299d864: "one coin home with
 * condensed previews of each, each preview opening its full page").
 *
 * Pure: the loader hands in what each page's own read answered (or null when
 * that read is missing, failed, or the viewer is signed out) and this shapes
 * the few numbers and rows each preview shows. Nothing here is a second rule
 * for any figure: a balance is the coin page's balance, a price is the stock
 * board's price, a top three is the Ledger's own board sorted the Ledger's way.
 */
import type { CoinMyPage } from '$lib/coin-balance';
import type { MarketBoard } from '$lib/coin-market/market';
import type { StocksBoard } from '$lib/coin-stocks/stocks';
import { topMovers } from '$lib/coin-stocks/stocks';
import { areasForScope, type CoinStaffScope } from '$lib/coin-desk/nav';

export interface LedgerRow {
	name: string;
	section: string | null;
	balance: number;
}

export interface CoinHome {
	signedIn: boolean;
	mine: null | {
		balance: number;
		weeklyWage: number;
		payday: string | null;
		inEconomy: boolean;
		recent: { amount: number; label: string }[];
	};
	ledger: null | { top: LedgerRow[]; students: number; circulation: number; inDebt: number };
	market: null | {
		offers: number;
		requests: number;
		openTrades: number;
		newest: { id: string; title: string; price: number | null; kind: 'offer' | 'request' | 'official' }[];
	};
	stocks: null | {
		index: { ticker: string; name: string; price: number | null; change: number | null; series: { at: string; close: number }[] } | null;
		gainer: { ticker: string; change: number | null } | null;
		holdings: number;
		value: number;
	};
	desk: null | { areas: { label: string; href: string }[] };
}

function num(v: unknown): number {
	const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(n) ? n : 0;
}

/** The public board's rows, as `coin_public_leaderboard()` answers them. */
export function parseLeaderboard(raw: unknown): LedgerRow[] | null {
	if (!Array.isArray(raw)) return null;
	return raw
		.map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : null))
		.filter((r): r is Record<string, unknown> => !!r && typeof r.name === 'string')
		.map((r) => ({ name: String(r.name), section: typeof r.section === 'string' ? r.section : null, balance: num(r.balance) }));
}

/** How many rows of each preview are drawn: condensed, so a glance and not a page. */
export const PREVIEW_ROWS = 3;

/** How many of the index's recorded prices the stocks preview draws. */
export const SPARK_POINTS = 40;

export function coinHomeFrom(input: {
	signedIn: boolean;
	mine: CoinMyPage | null;
	leaderboard: LedgerRow[] | null;
	market: MarketBoard | null;
	stocks: StocksBoard | null;
	staff: CoinStaffScope | null;
}): CoinHome {
	const { mine, leaderboard, market, stocks, staff } = input;
	const live = market ? market.listings.filter((l) => !l.closed && !l.expired && !l.hidden) : [];
	const index = stocks?.stocks.find((s) => s.kind === 'index' && s.active) ?? null;
	const gainer = stocks ? (topMovers(stocks.stocks, 1).gainers[0] ?? null) : null;
	return {
		signedIn: input.signedIn,
		mine: mine
			? {
					balance: mine.balance,
					weeklyWage: mine.weekly_wage,
					payday: mine.payday,
					inEconomy: mine.in_economy,
					// Newest first, as the coin page lists them; an undone pair is left out.
					recent: mine.history
						.filter((h) => !h.reversed && !h.reverses)
						.slice(0, PREVIEW_ROWS)
						.map((h) => ({ amount: h.amount, label: h.name }))
				}
			: null,
		ledger: leaderboard
			? {
					// The Ledger's own order: highest balance first.
					top: [...leaderboard].sort((a, b) => b.balance - a.balance).slice(0, PREVIEW_ROWS),
					students: leaderboard.length,
					circulation: Math.round(leaderboard.reduce((t, r) => t + r.balance, 0) * 100) / 100,
					inDebt: leaderboard.filter((r) => r.balance < 0).length
				}
			: null,
		market: market
			? {
					offers: live.filter((l) => l.kind === 'offer').length,
					requests: live.filter((l) => l.kind === 'request').length,
					openTrades: market.orders.filter((o) => ['held', 'delivered', 'disputed'].includes(o.status)).length,
					newest: [...live]
						.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
						.slice(0, PREVIEW_ROWS)
						.map((l) => ({ id: l.id, title: l.title, price: l.price, kind: l.kind }))
				}
			: null,
		stocks: stocks
			? {
					index: index
						? {
								ticker: index.ticker,
								name: index.name,
								price: index.last?.close ?? null,
								change: index.last?.change_percent ?? null,
								// The board's own series, the last stretch of it: a glance, not the chart.
								series: index.series.slice(-SPARK_POINTS)
							}
						: null,
					gainer: gainer ? { ticker: gainer.ticker, change: gainer.last?.change_percent ?? null } : null,
					holdings: stocks.portfolio.positions.filter((p) => p.shares > 0).length,
					value: stocks.portfolio.value
				}
			: null,
		desk: staff ? { areas: areasForScope(staff).map((a) => ({ label: a.label, href: a.href })) } : null
	};
}
