import { json } from '@sveltejs/kit';
import { summarizeRuns, type VanguardRun } from '$lib/vanguard-history';
import type { RequestHandler } from './$types';

/**
 * Per-user VANGUARD run-history API. Auth is via the cookie-based server
 * Supabase client (`locals.supabase`); requests without a session are rejected.
 *
 * POST appends exactly one run-summary row to `vanguard_runs` for the signed-in
 * user. This is fire-and-forget from the client (see the injected bootstrap in
 * `src/routes/vanguard/+server.ts`), so it stays lightweight: whitelist and
 * coerce the incoming fields, insert one row, return `{ ok: true }`. No
 * read-back, no merge.
 *
 * GET returns the signed-in user's own runs (RLS restricts to their rows): the
 * 25 most recent (newest first) plus a `summary` (see `summarizeRuns`) computed
 * over ALL of their runs. The in-game overlay uses this via the injected helper.
 */

const MODES = new Set(['normal', 'hardcore', 'arcade']);
const TEXT_MAX = 40;

/** Columns of `vanguard_runs`, in the order the history helper expects. */
const RUN_COLUMNS =
	'id, user_id, created_at, mode, version, score, sector, accuracy, time_s, kills, bosses, coins_earned, primary_weapon, heavy_weapon, death_cause';

const RECENT_LIMIT = 25;

export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('vanguard_runs')
		.select(RUN_COLUMNS)
		.eq('user_id', claims.sub)
		.order('created_at', { ascending: false });

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	const all = (data ?? []) as unknown as VanguardRun[];
	return json({ runs: all.slice(0, RECENT_LIMIT), summary: summarizeRuns(all) });
};

/** Coerce to a bounded integer, or null when absent/non-finite. */
function intOr(v: unknown, min: number, max: number): number | null {
	const n = Math.round(Number(v));
	if (!Number.isFinite(n)) return null;
	return Math.min(max, Math.max(min, n));
}

/** Coerce to a trimmed, length-capped string, or null when absent. */
function textOr(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const s = v.slice(0, TEXT_MAX);
	return s.length ? s : null;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	let body: Record<string, unknown>;
	try {
		const parsed = await request.json();
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return json({ error: 'expected a run-summary object' }, { status: 400 });
		}
		body = parsed as Record<string, unknown>;
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}

	// Whitelist + coerce. Unknown fields are ignored; out-of-range values clamped.
	const mode = typeof body.mode === 'string' && MODES.has(body.mode) ? body.mode : null;
	const row = {
		user_id: claims.sub,
		mode,
		version: textOr(body.version),
		score: intOr(body.score, 0, 2_000_000_000),
		sector: intOr(body.sector, 0, 100000),
		accuracy: intOr(body.accuracy, 0, 100),
		time_s: intOr(body.time_s, 0, 2_000_000_000),
		kills: intOr(body.kills, 0, 2_000_000_000),
		bosses: intOr(body.bosses, 0, 100000),
		coins_earned: intOr(body.coins_earned, 0, 2_000_000_000),
		primary_weapon: textOr(body.primary_weapon),
		heavy_weapon: textOr(body.heavy_weapon),
		death_cause: textOr(body.death_cause)
	};

	const { error } = await supabase.from('vanguard_runs').insert(row);
	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ ok: true });
};
