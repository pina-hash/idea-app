import { json } from '@sveltejs/kit';
import { pushConfigured, sendPushToUsers, serviceClient } from '$lib/server/push';
import type { RequestHandler } from './$types';

/**
 * REQUEST A SIGN-OFF, AND TELL WHOEVER DECIDES IT (ledger 0436, 0304, 0306).
 *
 * The request is `classroom_signoff_request`, called through the student's
 * own session, so every rule (a member of the team, the checks the site makes
 * passing, one open request per checkpoint) is the database's. Only AFTER it
 * landed does the service key read who the request is for
 * (`_classroom_signoff_notify`: the class's teacher, or Mr. Pina alone for an
 * owner-only item) and send one push, the tournament-push idiom. A push that
 * fails or is not configured never makes a committed request look failed, and
 * the notification text is built from the database's team name, never from
 * anything the student sent.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) return json({ ok: false, reason: 'signed_out' }, { status: 401 });
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, reason: 'invalid' }, { status: 400 });
	}
	const teamId = typeof body.team_id === 'string' ? body.team_id : '';
	const key = typeof body.checkpoint_key === 'string' ? body.checkpoint_key : '';
	const { data, error } = await supabase.rpc('classroom_signoff_request', { p_team_id: teamId, p_checkpoint_key: key });
	if (error) return json({ ok: false, reason: 'error', message: error.message }, { status: 400 });
	const out = data as { ok?: boolean; id?: string } | null;
	if (!out?.ok || !out.id || !pushConfigured()) return json(out);

	const admin = serviceClient();
	if (!admin) return json(out);
	try {
		const [{ data: ids }, { data: team }] = await Promise.all([
			admin.rpc('_classroom_signoff_notify', { p_request_id: out.id }),
			admin.from('classroom_teams').select('name, team_number').eq('id', teamId).maybeSingle()
		]);
		const name = (team as { name?: string | null; team_number?: number } | null)?.name?.trim() || `Team ${(team as { team_number?: number } | null)?.team_number ?? ''}`.trim();
		await sendPushToUsers(admin, Array.isArray(ids) ? ids.map(String) : [], {
			title: 'Sign-off requested',
			body: `${name} is waiting for a sign-off.`,
			url: '/classroom/signoffs',
			tag: `signoff-${out.id}`
		});
	} catch {
		// The request stands; the queue shows it whether or not a phone buzzed.
	}
	return json(out);
};
