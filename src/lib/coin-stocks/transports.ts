/**
 * The stock market's calls (ledger 0402, 0279), over the caller's own client.
 * An omitted transport removes the control it drives.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callV2, V2_UNAVAILABLE } from '$lib/coin-desk/v2';
import type { Outcome } from '$lib/coin-market/transports';
import { stockRefusalWords } from './stocks';

export interface StockTransports {
	buy: (stockId: string, coinsIn: number) => Promise<Outcome>;
	sell: (stockId: string, coinsOut: number | null, all: boolean) => Promise<Outcome>;
}

async function trade(supabase: SupabaseClient, fn: string, params: Record<string, unknown>): Promise<Outcome> {
	const r = await callV2<Record<string, unknown>>(supabase, fn, params);
	if (r.kind === 'missing') return { ok: false, words: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, words: r.message || 'That trade did not go through.' };
	if (!r.data || r.data.ok !== true) return { ok: false, words: stockRefusalWords(r.data), raw: r.data ?? {} };
	return { ok: true, data: r.data };
}

export function createStockTransports(supabase: SupabaseClient): StockTransports {
	return {
		buy: (id, c) => trade(supabase, 'coin_stock_buy', { p_stock_id: id, p_coins: c }),
		sell: (id, c, all) => trade(supabase, 'coin_stock_sell', { p_stock_id: id, p_coins: c, p_all: all })
	};
}
