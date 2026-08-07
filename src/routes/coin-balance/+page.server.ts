import { redirect } from '@sveltejs/kit';
import {
	eatingPassStatus,
	sumBalance,
	withCategoryNames,
	type CoinBalanceTransaction
} from '$lib/coin-balance';
import type { PageServerLoad } from './$types';

/**
 * The student-facing counterpart to /coin-desk: a signed-in student's own
 * IDEA Coin balance, transaction history, wage tier, and Eating Pass status.
 * Gated to signed-in @boscotech.net students specifically -- not admin-only
 * (/coin-desk, /admin) and not public (/coin-entry's teacher gate). An
 * anonymous visitor or a signed-in non-student is redirected to `/`: the
 * hooks.server.ts standard signed-out handling for anonymous, extended here
 * to also cover "signed in but the wrong role" the same way /dashboard
 * redirects a non-admin teacher away.
 *
 * Every query below runs as the CALLER'S OWN session (locals.supabase, the
 * per-request cookie-scoped client hooks.server.ts sets up for every
 * request) with no `.eq('student_email', ...)` filter and no RPC call at
 * all: coin_transactions and coin_wage_tiers (0070) already grant a signed-in
 * user SELECT on their own rows via `student_email = current_user_email() or
 * is_admin()`, so the filtering IS the RLS policy, not application code.
 * This is deliberately the opposite of /coin-desk and /admin, which both go
 * through coin_admin_lookup (an is_admin()-gated RPC) -- this route
 * exercises the student read path those policies were built for, and never
 * touches coin_admin_lookup or any other admin RPC.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: profile } = await supabase
		.from('profiles')
		.select('role, email, display_name, full_name')
		.eq('id', claims.sub)
		.maybeSingle();

	if (profile?.role !== 'student') redirect(303, '/');

	const [
		{ data: categories, error: catError },
		{ data: transactions, error: txError },
		{ data: wageRow, error: wageError }
	] = await Promise.all([
		supabase.from('coin_categories').select('id, name'),
		supabase
			.from('coin_transactions')
			.select('id, category_id, amount, quantity, note, meta, created_at')
			.order('created_at', { ascending: false }),
		supabase.from('coin_wage_tiers').select('tier').maybeSingle()
	]);

	// Fails soft: 0070 not applied yet reads as a clearly-flagged "ledger not
	// available" page rather than a crashed one (the /coin-desk convention).
	const configured = !catError && !txError;

	const rows = (transactions ?? []) as CoinBalanceTransaction[];

	return {
		configured,
		email: profile?.email ?? claims.email ?? null,
		displayName: profile?.display_name || profile?.full_name || null,
		balance: sumBalance(rows),
		transactions: withCategoryNames(rows, categories ?? []),
		// No row yet (never bought a Pay Raise) means the base tier, 1 -- the
		// same default coin_wage_tiers.tier's column default expresses, and
		// what coin_admin_lookup itself falls back to.
		wageTier: wageError ? null : (wageRow?.tier ?? 1),
		eatingPass: eatingPassStatus(rows)
	};
};
