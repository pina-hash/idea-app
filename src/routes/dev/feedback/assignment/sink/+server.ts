import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { FEEDBACK_MAX_LEN } from '$lib/feedback/feedback';
import type { RequestHandler } from './$types';

/**
 * The harness's signed-in sink for the injected assignment report control. It
 * answers the contract both real endpoints answer -- `{ok:true}` or
 * `{ok:false, reason}` -- and writes nothing anywhere. A GET returns the last
 * body it accepted, so a route spec can read what the panel actually posted
 * (the app, the context and the captured route and path) rather than trusting
 * the panel's own "Sent".
 */
let last: unknown = null;

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
	last = body;
	return json({ ok: true });
};

export const GET: RequestHandler = () => {
	if (!dev) error(404, 'Not found');
	return json({ last }, { headers: { 'cache-control': 'no-store' } });
};
