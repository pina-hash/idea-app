import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoinBuyResult } from '$lib/coin-balance';

/**
 * The four student purchases on `/coin-balance` (0241), as injected
 * transports. The page component never touches Supabase: the route builds
 * these over the caller's own browser client and the dev harness answers in
 * memory, so the harness mounts the identical component.
 *
 * NONE OF THEM SENDS AN EMAIL OR AN AMOUNT, because none of the functions
 * takes one. Who is buying comes from the session; every price comes from the
 * database. What is sent is a choice (which work, how many points) or a
 * measurement (grams off the slicer).
 *
 * An omitted transport removes the control it drives, so a surface that
 * cannot buy (a preview, a database without 0241) passes none.
 */
export interface CoinPageTransports {
	buyEatingPass?: () => Promise<CoinBuyResult>;
	buyPayRaise?: () => Promise<CoinBuyResult>;
	buyPrint?: (grams: number) => Promise<CoinBuyResult>;
	buyExtraCredit?: (sectionId: string, submissionId: string, points: number) => Promise<CoinBuyResult>;
}

type RpcAnswer = { data: unknown; error: { code?: string; message?: string } | null };

/** A purchase's answer, read the same way for all four. */
export function readBuyAnswer({ data, error }: RpcAnswer): CoinBuyResult {
	if (error) {
		// A missing function (the migration is not applied yet) is "not for
		// sale", never a crash. Anything else is a failure the person can retry.
		if (error.code === 'PGRST202' || error.code === '42883') return { ok: false, reason: 'not_available' };
		return { ok: false, reason: 'error', message: error.message };
	}
	if (!data || typeof data !== 'object') return { ok: false, reason: 'error' };
	const d = data as Record<string, unknown>;
	if (d.ok === true) {
		return {
			ok: true,
			cost: d.cost === undefined ? undefined : Number(d.cost),
			balance: d.balance === undefined ? undefined : Number(d.balance),
			points: d.points === undefined ? undefined : Number(d.points),
			new_tier: d.new_tier === undefined ? undefined : Number(d.new_tier)
		};
	}
	return {
		ok: false,
		reason: typeof d.reason === 'string' ? d.reason : 'error',
		balance: d.balance === undefined ? undefined : Number(d.balance),
		cost: d.cost === undefined ? undefined : Number(d.cost),
		room: d.room && typeof d.room === 'object' ? (d.room as Record<string, number>) : undefined
	};
}

async function call(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<CoinBuyResult> {
	try {
		const answer = args ? await supabase.rpc(fn, args) : await supabase.rpc(fn);
		return readBuyAnswer(answer as RpcAnswer);
	} catch (e) {
		return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
	}
}

export function createCoinPageTransports(supabase: SupabaseClient): CoinPageTransports {
	return {
		buyEatingPass: () => call(supabase, 'coin_buy_eating_pass'),
		buyPayRaise: () => call(supabase, 'coin_buy_pay_raise'),
		buyPrint: (grams) => call(supabase, 'coin_buy_print', { p_grams: grams }),
		buyExtraCredit: (sectionId, submissionId, points) =>
			call(supabase, 'coin_buy_extra_credit', {
				p_section_id: sectionId,
				p_submission_id: submissionId,
				p_points: points
			})
	};
}
