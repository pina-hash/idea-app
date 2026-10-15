import { parseCoinMyPage, type CoinMyPage } from '$lib/coin-balance';
import type { PageServerLoad } from './$types';

/**
 * `/coin-balance`: a student's own IDEA Coin page (IDEA Coin V2, 0241).
 *
 * It used to 308 to the Ledger, which was the single student hub while the
 * balance was two numbers and nothing could be bought. Since V2 a student buys
 * on their own, and that needs a signed-in page of their own; the Ledger stays
 * the public board.
 *
 * NOT IN `authedPrefixes`, deliberately: a signed-out visitor gets a sign-in
 * panel that returns here, not a bounce to the home page.
 *
 * TWO CALLS, AND THE FIRST CANNOT FAIL THE PAGE. `coin_autopay_run('page')` is
 * the catch-up for weekly pay (idempotent and throttled in the database, 0242):
 * it runs first so a wage that is due shows up in the balance this page reads,
 * and every error it can raise is ignored. Then `coin_my_page()`, which takes no
 * identity parameter. A database without 0241 answers PGRST202 or 42883, which
 * is the "being updated" state rather than an error.
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('coin:page');
	const now = Date.now();
	const email = typeof locals.claims?.email === 'string' ? locals.claims.email.trim() : '';
	if (!locals.claims || !email) {
		return { state: 'signed_out' as const, page: null as CoinMyPage | null, now };
	}

	try {
		await locals.supabase.rpc('coin_autopay_run', { p_trigger: 'page' });
	} catch {
		// Best effort, always. Pay that did not run now runs nightly.
	}

	let answer: { data: unknown; error: { code?: string } | null };
	try {
		answer = await locals.supabase.rpc('coin_my_page');
	} catch {
		return { state: 'error' as const, page: null as CoinMyPage | null, now };
	}
	if (answer.error) {
		const code = answer.error.code ?? '';
		const state = code === 'PGRST202' || code === '42883' ? ('updating' as const) : ('error' as const);
		return { state, page: null as CoinMyPage | null, now };
	}
	const page = parseCoinMyPage(answer.data);
	return page
		? { state: 'ready' as const, page, now }
		: { state: 'signed_out' as const, page: null as CoinMyPage | null, now };
};
