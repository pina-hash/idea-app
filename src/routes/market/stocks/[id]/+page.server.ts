import { parseStockDetail, type StockDetail } from '$lib/coin-stocks/stocks';
import type { PageServerLoad } from './$types';

/** One stock and every close's inputs (0279). "Not trading" and "not there" answer alike. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const empty = { detail: null as StockDetail | null };
	if (!locals.claims?.sub) return { state: 'signed_out' as const, ...empty };
	try {
		const { data, error } = await locals.supabase.rpc('coin_stock_detail', { p_stock_id: params.id });
		if (error) {
			const code = error.code ?? '';
			return { state: code === 'PGRST202' || code === '42883' ? ('updating' as const) : ('missing' as const), ...empty };
		}
		const detail = parseStockDetail(data);
		return detail ? { state: 'ready' as const, detail } : { state: 'missing' as const, ...empty };
	} catch {
		return { state: 'missing' as const, ...empty };
	}
};
