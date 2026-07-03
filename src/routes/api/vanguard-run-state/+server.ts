import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Per-user, PER-MODE VANGUARD in-progress RUN checkpoint API (0032, reworked for
 * per-mode slots in 0037). Distinct from /api/vanguard-save (between-run
 * progression): this holds a minimal sector-boundary snapshot of the current run
 * so a signed-in player can quit on one device and resume it on another.
 *
 * Each user holds ONE run per game mode (composite PK (user_id, mode)), so a
 * HARDCORE checkpoint never clobbers a saved NORMAL run and vice versa. A run is
 * played on one device at a time, so within a mode this is last-write-wins:
 *   GET    -> array of the user's saved run states ({ mode, data, updated_at }).
 *   POST   -> upsert the checkpoint for the mode read from snapshot.gameMode.
 *   DELETE -> clear only the row for the caller's given mode (query param/body).
 *
 * Only RANKABLE modes are persisted (normal / hardcore); dev/tune/calib and any
 * unknown mode are rejected so throwaway runs never occupy a resume slot.
 *
 * Auth is the cookie-based server client (`locals.supabase`); no session -> 401.
 * A ~64 KB body cap keeps a malformed/oversized snapshot from being persisted.
 */

const MAX_BYTES = 64 * 1024;

/** Modes that own a resume slot. Mirrors the game's rankable modes. */
const RANKABLE_MODES = new Set(['normal', 'hardcore']);

export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) return json({ error: 'unauthorized' }, { status: 401 });

	const { data, error } = await supabase
		.from('vanguard_run_state')
		.select('mode, data, updated_at')
		.eq('user_id', claims.sub);

	if (error) return json({ error: error.message }, { status: 500 });
	return json({ runStates: data ?? [] });
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

	const mode = (snapshot as { gameMode?: unknown }).gameMode;
	if (typeof mode !== 'string' || !RANKABLE_MODES.has(mode)) {
		return json({ error: 'unsupported mode' }, { status: 400 });
	}

	const { error } = await supabase.from('vanguard_run_state').upsert(
		{ user_id: claims.sub, mode, data: snapshot, updated_at: new Date().toISOString() },
		{ onConflict: 'user_id,mode' }
	);
	if (error) return json({ error: error.message }, { status: 500 });
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, url, locals: { supabase, claims } }) => {
	if (!claims) return json({ error: 'unauthorized' }, { status: 401 });

	// Mode is required so a run-end in one mode clears only that mode's slot.
	let mode = url.searchParams.get('mode') ?? undefined;
	if (!mode) {
		try {
			const body = await request.json();
			if (body && typeof body === 'object' && typeof body.mode === 'string') mode = body.mode;
		} catch {
			// no body / not JSON: fall through to the missing-mode error below.
		}
	}
	if (typeof mode !== 'string' || !RANKABLE_MODES.has(mode)) {
		return json({ error: 'unsupported mode' }, { status: 400 });
	}

	const { error } = await supabase
		.from('vanguard_run_state')
		.delete()
		.eq('user_id', claims.sub)
		.eq('mode', mode);
	if (error) return json({ error: error.message }, { status: 500 });
	return json({ ok: true });
};
