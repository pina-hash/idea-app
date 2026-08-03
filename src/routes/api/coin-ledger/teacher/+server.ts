import { json } from '@sveltejs/kit';
import { callLedger, forwardableParams, ledgerConfigured } from '$lib/server/coin-ledger';
import type { RequestHandler } from './$types';

/**
 * Teacher-only coin ledger proxy: the single path the entry tool
 * (`src/lib/legacy/coin-entry.html`) now uses for every ledger call it makes,
 * reads and writes alike — logging, editing and deleting transactions, payouts,
 * weekly wages, fines, contracts, students, sections, reasons and roles.
 *
 * Reads are not exempt because Code.gs requires the key for all of them, but
 * they would belong here anyway: the roster, the transaction log and the
 * application answers are student records, not public data.
 *
 * THE SECURITY BOUNDARY IS THE SESSION CHECK BELOW, and nothing else. The tool's
 * 4-digit PIN pad is a UI-only convenience on shared classroom devices — it is
 * verified in the browser against a hash committed in the page, so it never
 * protected the API and could not (audit F2). The teacher role is read from
 * `profiles` server-side, the same lookup `/coin-entry` and `/dashboard` use,
 * because the role is not in the JWT.
 *
 * Requests are GET because that is the legacy contract the ledger and the page
 * already speak; the authorization does not depend on the method.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, claims }, setHeaders }) => {
	if (!claims) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', claims.sub)
		.single();

	if (profile?.role !== 'teacher') {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const action = url.searchParams.get('action')?.trim() ?? '';
	if (!action) {
		return json({ error: 'an action is required' }, { status: 400 });
	}

	if (!ledgerConfigured()) {
		return json(
			{
				error:
					'The coin ledger is not configured on this server. Set COIN_API_KEY in the deployment environment.'
			},
			{ status: 503 }
		);
	}

	const res = await callLedger(action, forwardableParams(url.searchParams));
	if (!res.ok) {
		return json({ error: res.error }, { status: res.status });
	}

	setHeaders({ 'cache-control': 'no-store' });
	return new Response(res.body, {
		headers: { 'content-type': 'application/json; charset=utf-8' }
	});
};
