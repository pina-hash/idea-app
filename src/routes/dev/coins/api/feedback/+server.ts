import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { FEEDBACK_MAX_LEN } from '$lib/feedback/feedback';
import type { RequestHandler } from './$types';

/**
 * The harness's feedback sink for the injected Ledger report control.
 *
 * IT ANSWERS THE SAME CONTRACT BOTH REAL ENDPOINTS DO -- `{ok:true}` or
 * `{ok:false, reason}`, where a `reason` means the request was CONSIDERED --
 * so the panel's whole outcome ladder (sent, refused in the refusal's own
 * words, retryable) is exercised against something that answers exactly as
 * `/api/coin-feedback` and `/api/feedback` do. It writes nothing anywhere: a
 * harness has no session, no Supabase and no reason to keep a report.
 *
 * A REFUSAL IS REACHABLE ON PURPOSE, from the message itself, so the branch a
 * person only ever meets when something has gone wrong can be driven without
 * breaking anything: a message of exactly `refuse:<reason>` comes back as that
 * refusal. Nothing in the real routes reads the message that way.
 */
export const POST: RequestHandler = async ({ request, setHeaders }) => {
	if (!dev) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });

	let body: Record<string, unknown> = {};
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ ok: false, reason: 'invalid_body' }, { status: 400 });
	}

	const message = typeof body.message === 'string' ? body.message.trim() : '';
	if (!message) return json({ ok: false, reason: 'message_empty' });
	if (message.length > FEEDBACK_MAX_LEN) return json({ ok: false, reason: 'message_too_long' });

	const forced = /^refuse:([a-z_]+)$/.exec(message);
	if (forced) return json({ ok: false, reason: forced[1] });

	return json({ ok: true });
};
