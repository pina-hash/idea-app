import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Apply for a coin role from the Ledger's role modal.
 *
 * Session-gated, and the RPC takes NO student parameter:
 * `coin_role_self_apply` (0089) resolves the applicant from
 * `current_user_email()`, so — exactly like the contract claim beside it —
 * applying on somebody else's behalf is not a check that could fail but a
 * request that cannot be expressed. Every rule the admin-side
 * `coin_role_apply` enforces still applies (active role, roster section
 * required, one application per currently-held role, answers snapshotted with
 * MC correctness computed at submission).
 *
 * `answers` is passed straight through as the RPC's own shape:
 * `[{ question_id, written_answer? , selected_option_index? }]`. Validation
 * lives in the RPC, so a malformed body is answered by the database rather
 * than by a second copy of the rules here.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) return json({ ok: false, reason: 'not_signed_in' }, { status: 401 });

	let roleId = '';
	let answers: unknown = [];
	try {
		const body = (await request.json()) as { roleId?: unknown; answers?: unknown };
		roleId = typeof body?.roleId === 'string' ? body.roleId.trim() : '';
		answers = Array.isArray(body?.answers) ? body.answers : [];
	} catch {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}
	if (!roleId) return json({ ok: false, reason: 'bad_request' }, { status: 400 });

	const { data, error } = await supabase.rpc('coin_role_self_apply', {
		p_role_id: roleId,
		p_answers: answers
	});
	if (error) return json({ ok: false, reason: 'error', message: error.message }, { status: 400 });

	return json(data ?? { ok: false, reason: 'error' });
};
