import { parseStocksBoard, type StocksBoard } from '$lib/coin-stocks/stocks';
import { coinBarDesk } from '$lib/server/coin-bar';
import type { PageServerLoad } from './$types';

/**
 * `/market/stocks` (ledger 0402, migration 0279; relaunched in 0283). A price
 * tick goes first (`coin_stocks_tick`, which throttles itself, so a page
 * refreshing each minute costs nothing extra) and never fails the page; a
 * database without 0279 answers PGRST202 or 42883: "being set up". A database
 * with 0279 but not yet 0283 has no tick to call, which is the same best
 * effort, and the board it answers is the old one.
 */
const loadPage = async ({ locals, depends }: Parameters<PageServerLoad>[0]) => {
	depends('coin:stocks');
	const empty = { board: null as StocksBoard | null };
	if (!locals.claims?.sub) return { state: 'signed_out' as const, ...empty };
	const sb = locals.supabase;
	try {
		await sb.rpc('coin_stocks_tick');
	} catch {
		// Best effort, always.
	}
	try {
		const { data, error } = await sb.rpc('coin_stocks_board');
		if (error) {
			const code = error.code ?? '';
			return { state: code === 'PGRST202' || code === '42883' ? ('updating' as const) : ('error' as const), ...empty };
		}
		const board = parseStocksBoard(data);
		return board ? { state: 'ready' as const, board } : { state: 'signed_out' as const, ...empty };
	} catch {
		return { state: 'error' as const, ...empty };
	}
};

/** Ledger 0422: every coin page carries the IDEA Coin bar; the Coin Desk tab is coin staff's alone. */
export const load: PageServerLoad = async (event) => {
	const [page, coinDesk] = await Promise.all([loadPage(event), coinBarDesk(event.locals)]);
	return { ...page, coinDesk };
};
