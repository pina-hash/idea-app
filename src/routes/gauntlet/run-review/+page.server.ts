import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
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
	const fastFinishSeconds = intParam(url.searchParams.get('floor'), 30, 0, 3600);
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
		readError: !notApplied && rpcError ? rpcError.message : null
	};
};
