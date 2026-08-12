import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Claim an open contract from the Ledger's Contracts tab.
 *
 * A session is required and the RPC takes NO email: `coin_contract_self_claim`
 * (0077) resolves the caller from `current_user_email()` and takes the
 * contract row's own lock before counting, so a student can only ever claim
 * for themselves and two simultaneous claims on the last slot cannot both
 * succeed. This route adds nothing to that — it is the session boundary and a
 * shape the legacy page can read.
 *
 * Refusals come back as the same structured `{ ok: false, reason }` the RPC
 * returns (`full`, `wrong_section`, `already_claimed`, `not_open`), so the
 * page renders the real reason rather than a generic failure.
 */
/**
 * Which contracts the caller is already on, so the board can mark them.
 * Answers an empty list for an anonymous caller rather than 401 — the public
 * page asks this on every load and "none" is a normal answer. Contract ids
 * only; no identity of any kind travels in either direction.
 */
export const GET: RequestHandler = async ({ locals: { supabase, claims }, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	if (!claims) return json({ contractIds: [] });

	const { data, error } = await supabase.rpc('coin_my_contract_claims');
	if (error) return json({ contractIds: [] });

	const rows = (data ?? []) as { contract_id: string }[];
	return json({ contractIds: rows.map((r) => r.contract_id) });
};

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) return json({ ok: false, reason: 'not_signed_in' }, { status: 401 });

	let contractId = '';
	try {
		const body = (await request.json()) as { contractId?: unknown };
		contractId = typeof body?.contractId === 'string' ? body.contractId.trim() : '';
	} catch {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}
	if (!contractId) return json({ ok: false, reason: 'bad_request' }, { status: 400 });

	const { data, error } = await supabase.rpc('coin_contract_self_claim', {
		p_contract_id: contractId
	});
	if (error) return json({ ok: false, reason: 'error', message: error.message }, { status: 400 });

	return json(data ?? { ok: false, reason: 'error' });
};
