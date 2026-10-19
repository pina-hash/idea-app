import { parseStocksBoard, type StocksBoard } from '$lib/coin-stocks/stocks';
import type { PageServerLoad } from './$types';

/**
 * `/market/stocks` (ledger 0402, migration 0279). The catch-up autopay run
 * goes first (it writes the closes that are due) and never fails the page; a
 * database without 0279 answers PGRST202 or 42883: "being set up".
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('coin:stocks');
	const empty = { board: null as StocksBoard | null };
	if (!locals.claims?.sub) return { state: 'signed_out' as const, ...empty };
	const sb = locals.supabase;
	try {
		await sb.rpc('coin_autopay_run', { p_trigger: 'page' });
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
