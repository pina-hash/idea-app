import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Per-user VANGUARD in-progress RUN checkpoint API (0032). Distinct from
 * /api/vanguard-save (between-run progression): this holds a single minimal
 * snapshot of the current run so a signed-in player can resume it on any device.
 *
 * A run is played on one device at a time, so this is last-write-wins (no merge):
 *   GET    -> the current checkpoint, or null.
 *   POST   -> upsert the checkpoint (body: an arbitrary JSON snapshot object).
 *   DELETE -> clear it (called when the run ends).
 *
 * Auth is the cookie-based server client (`locals.supabase`); no session -> 401.
 * A ~64 KB body cap keeps a malformed/oversized snapshot from being persisted.
 */

const MAX_BYTES = 64 * 1024;

export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) return json({ error: 'unauthorized' }, { status: 401 });

	const { data, error } = await supabase
		.from('vanguard_run_state')
		.select('data, updated_at')
		.eq('user_id', claims.sub)
		.maybeSingle();

	if (error) return json({ error: error.message }, { status: 500 });
	return json({ data: data?.data ?? null, updated_at: data?.updated_at ?? null });
};

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) return json({ error: 'unauthorized' }, { status: 401 });

	const raw = await request.text();
	if (raw.length > MAX_BYTES) {
		return json({ error: 'snapshot too large' }, { status: 413 });
	}
	let snapshot: unknown;
	try {
		snapshot = JSON.parse(raw);
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}
	if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
		return json({ error: 'expected a snapshot object' }, { status: 400 });
	}

	const { error } = await supabase.from('vanguard_run_state').upsert(
		{ user_id: claims.sub, data: snapshot, updated_at: new Date().toISOString() },
		{ onConflict: 'user_id' }
	);
	if (error) return json({ error: error.message }, { status: 500 });
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) return json({ error: 'unauthorized' }, { status: 401 });

	const { error } = await supabase.from('vanguard_run_state').delete().eq('user_id', claims.sub);
	if (error) return json({ error: error.message }, { status: 500 });
	return json({ ok: true });
};
