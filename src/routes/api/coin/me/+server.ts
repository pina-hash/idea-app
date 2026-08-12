import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Who the visitor is, for the Ledger's own signed-in chrome (the claim
 * control and the role modal both need to know before they render).
 *
 * Answers `{ signedIn: false }` rather than 401 for an anonymous caller: this
 * is a question the public page asks on every load, and "nobody" is a normal
 * answer, not an error.
 *
 * The payload carries a display name and a section — never an email, even
 * though the caller already knows their own. Keeping the rule absolute across
 * `/api/coin/*` means there is no field anywhere on this surface to audit.
 */
export const GET: RequestHandler = async ({ locals: { supabase, claims }, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });

	if (!claims) return json({ signedIn: false });

	const { data, error } = await supabase.rpc('coin_me');
	if (error) return json({ signedIn: false, error: error.message }, { status: 502 });

	const me = (data ?? { signed_in: false }) as Record<string, unknown>;
	return json({
		signedIn: me.signed_in === true,
		isStudent: me.is_student === true,
		name: me.name ?? '',
		section: me.section ?? '',
		studentId: me.student_id ?? ''
	});
};
