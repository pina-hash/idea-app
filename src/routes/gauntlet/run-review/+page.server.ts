import { error, fail } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { Actions, PageServerLoad } from './$types';
import type { ObservationCode, TelemetryState } from './observations';

/**
 * THE RANKED-RUN REVIEW'S READ. Admin only.
 *
 * A NON-ADMIN GETS 404, NOT A REDIRECT AND NOT 403, for the same reason
 * `/foundry/review`, `/admin` and `/coin-desk` do: this surface's EXISTENCE is
 * not public. A redirect would confirm there is a review lane to be turned away
 * from, and this one reads other students' runs. It is therefore deliberately
 * not in `authedPrefixes` either -- `/gauntlet` already bounces an anonymous
 * visitor, and this check is what turns away a signed-in non-admin.
 *
 * THE GUARD HERE IS CONVENIENCE, AS EVERY APP-SIDE GUARD IS. The real boundary
 * is `is_admin()` inside `gauntlet_run_review` (0152), which returns an EMPTY
 * SET rather than an error to anyone else, and which this page cannot talk its
 * way past. What the guard buys is that a non-admin never lands on a page whose
 * every row would be missing.
 *
 * THE RPC LADDER IS A SINGLE RUNG ON PURPOSE. 0152 is applied by hand and
 * separately, so a deployment sitting between the push and the apply is a real
 * state; `PGRST202` alone (never the message) means the function is not there
 * yet, and the page says so in words instead of rendering an empty report that
 * reads as "no runs to review". Any OTHER error is a real failure and is
 * reported as one -- degrading past it would turn a broken read into a clean
 * bill of health, which is the one outcome this surface must never produce.
 */

/** PostgREST's code for "no such function" -- i.e. 0152 is not applied yet. */
const UNDEFINED_FUNCTION = 'PGRST202';

export interface RunReviewRow {
	submission_id: string;
	challenge_id: string;
	challenge_title: string | null;
	user_id: string;
	player: string | null;
	started_at: string;
	submitted_at: string;
	elapsed_ms: number | null;
	par_time_s: number | null;
	board_rank: number | null;
	failed_attempts: number | null;
	submitted_volume_mm3: number | null;
	telemetry: TelemetryState;
	event_count: number;
	snapshot_count: number;
	feature_add_count: number;
	distinct_feature_counts: number;
	last_snapshot_volume_mm3: number | null;
	telemetry_span_ms: number | null;
	first_event_at: string | null;
	last_event_at: string | null;
	observations: ObservationCode[];
}

/**
 * Read a bounded integer out of the query string, falling back to a default.
 *
 * THE ABSENT CASE IS CHECKED FIRST AND EXPLICITLY, because `Number(null)` is
 * `0` -- finite, so a `Number.isFinite` guard alone accepts it and then CLAMPS
 * it into range. That is not a hypothetical: written that way this page opened
 * on a one hour window with a zero second floor, silently, on every visit with
 * no query string, and looked entirely deliberate doing it.
 */
function intParam(raw: string | null, fallback: number, lo: number, hi: number): number {
	if (raw === null || raw.trim() === '') return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(hi, Math.max(lo, Math.round(n)));
}

export const load: PageServerLoad = async ({ locals: { supabase, claims }, url }) => {
	if (!claims) {
		error(404, 'Not found');
	}
	if (!(await isAdmin(supabase, claims.sub))) {
		error(404, 'Not found');
	}

	// Every control is a query parameter, so a teacher can send a colleague the
	// exact view they are looking at. Bounds are applied here AND inside the
	// function; this pair is convenience, the function's is the real clamp.
	const challengeId = url.searchParams.get('challenge') || null;
	const sinceHours = intParam(url.searchParams.get('hours'), 720, 1, 8760);
	// 0194: THE BOARD'S OWN FLOOR, read ONCE and used for both jobs below -- the
	// number shown in the settings card, and the DEFAULT of the lens box.
	//
	// IT IS READ, NEVER ASSUMED. The box defaulted to a hard 30, which was
	// `0154`'s literal restated in a third place, so the day the floor moved
	// this page would have shown a lens that no longer matched the board with
	// nothing saying so. A teacher may still narrow the box for themselves; the
	// held-run observation is independent of it either way, which is what makes
	// narrowing safe.
	//
	// PGRST202 ALONE means 0194 is not applied yet -- never the message, so a
	// runtime failure inside the function fails closed rather than degrading to
	// a guess about the floor.
	const { data: settings, error: settingsError } = await supabase.rpc('gauntlet_rank_settings_get');
	const settingsMissing = settingsError?.code === UNDEFINED_FUNCTION;
	const boardFloorMs =
		!settingsError && settings && typeof settings === 'object'
			? ((settings as { speedrun_floor_ms?: number }).speedrun_floor_ms ?? null)
			: null;

	// 30 is `0152`'s own default and `0154`'s literal: a page that could not
	// read the setting shows the number it has always shown rather than
	// inventing one.
	const fastFinishSeconds = intParam(
		url.searchParams.get('floor'),
		boardFloorMs == null ? 30 : Math.round(boardFloorMs / 1000),
		0,
		3600
	);
	const includeAbsent = url.searchParams.get('absent') === '1';
	const observedOnly = url.searchParams.get('all') !== '1';

	// The Speedrun challenge list for the filter. Framing only: this page has no
	// business reading `answer`, and the column grant would refuse it anyway.
	const { data: challenges } = await supabase
		.from('challenges')
		.select('id, title')
		.eq('mode', 'speedrun')
		.order('title', { ascending: true });

	const { data, error: rpcError } = await supabase.rpc('gauntlet_run_review', {
		p_challenge_id: challengeId,
		p_since_hours: sinceHours,
		p_fast_finish_seconds: fastFinishSeconds,
		p_include_absent: includeAbsent,
		p_observed_only: observedOnly,
		p_limit: 200
	});

	const notApplied = rpcError?.code === UNDEFINED_FUNCTION;

	return {
		rows: notApplied ? [] : ((data ?? []) as RunReviewRow[]),
		challenges: (challenges ?? []) as Array<{ id: string; title: string }>,
		filters: { challengeId, sinceHours, fastFinishSeconds, includeAbsent, observedOnly },
		notApplied,
		readError: !notApplied && rpcError ? rpcError.message : null,
		// 0194. `boardFloorMs` null with `settingsMissing` true is "the migration
		// is not applied here"; null WITHOUT it is a real read failure, and the
		// page says which. Neither renders as a number.
		boardFloorMs,
		settingsMissing
	};
};

/**
 * THE FLOOR IS A SETTING MR. PINA OWNS (0194), and this is where he owns it.
 *
 * IT LIVES ON THIS PAGE AND NOT IN `/admin` DELIBERATELY. The number's whole
 * effect is the list underneath it: raising it holds more runs and puts them
 * here, lowering it releases them. A settings screen somewhere else would mean
 * changing a number and then going to look for what it did.
 *
 * THE ROUTE IS NOT THE BOUNDARY. `gauntlet_rank_settings_set` re-checks
 * `is_admin()` in its own body and RAISES for anybody else; the `isAdmin` call
 * in the load is convenience, exactly as it is for the report itself.
 */
export const actions: Actions = {
	setFloor: async ({ request, locals: { supabase, claims } }) => {
		if (!claims) error(404, 'Not found');
		if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

		const form = await request.formData();
		const raw = String(form.get('floorSeconds') ?? '').trim();
		const seconds = Number(raw);
		// Checked here as well as in the database, because a refusal a person
		// can read where they are typing beats one that arrives as an RPC error.
		// The database's is still the boundary and still runs.
		if (raw === '' || !Number.isFinite(seconds) || seconds < 0 || seconds > 600) {
			return fail(400, {
				floorMessage: 'Enter a whole number of seconds between 0 and 600.',
				floorOk: false
			});
		}

		const { data, error: rpcError } = await supabase.rpc('gauntlet_rank_settings_set', {
			p_speedrun_floor_ms: Math.round(seconds) * 1000
		});
		if (rpcError) {
			return fail(rpcError.code === UNDEFINED_FUNCTION ? 400 : 500, {
				floorMessage:
					rpcError.code === UNDEFINED_FUNCTION
						? 'Migration 0194 is not on the database yet, so there is no setting to change.'
						: rpcError.message,
				floorOk: false
			});
		}

		// A CONSIDERED REFUSAL IS NOT A FAILURE TO RETRY. The RPC answers
		// `{ok:false, message}` for a number out of range, and that sentence is
		// shown verbatim rather than re-toned here.
		const result = (data ?? {}) as { ok?: boolean; message?: string; speedrun_floor_ms?: number };
		if (result.ok !== true) {
			return fail(400, {
				floorMessage: result.message ?? 'The floor was not changed.',
				floorOk: false
			});
		}

		return {
			floorOk: true,
			floorMessage: `The board now holds a run under ${Math.round((result.speedrun_floor_ms ?? 0) / 1000)} seconds for verification.`
		};
	}
};
