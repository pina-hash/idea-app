import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Per-user VANGUARD cloud-save API. Auth is via the cookie-based server
 * Supabase client (`locals.supabase`); requests without a session are rejected.
 *
 * The save is a single JSON object: a snapshot of the game's `vanguard_*`
 * localStorage keys. The `/vanguard` endpoint seeds these into localStorage on
 * load and an injected sync script POSTs changes back here.
 */

/** GET: return the current user's save blob (`{}` if none yet). */
export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('vanguard_saves')
		.select('data')
		.eq('user_id', claims.sub)
		.maybeSingle();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ data: data?.data ?? {} });
};

/** POST: upsert the current user's save blob. Body is the `vanguard_*` snapshot. */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}

	// Expect a plain object map of localStorage key -> string value.
	if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'expected an object' }, { status: 400 });
	}

	const { error } = await supabase.from('vanguard_saves').upsert(
		{
			user_id: claims.sub,
			data: payload,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id' }
	);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ ok: true });
};
