import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ModelingFraming } from '$lib/gauntlet';

/**
 * Feature Golf challenge list. Published challenges plus the user's best
 * PASSING (macro-verified) run per challenge. The score metric is feature count
 * (lower is better), with time as a tiebreak handled in the leaderboard view.
 *
 * `cleared` IS READ OFF THE STUDENT'S OWN `submissions` ROWS, NEVER THE BOARD.
 * `gauntlet_leaderboard` is a RANKING, not a history, and for this mode it is
 * an EMPTY one: since 0146 the view's modeling branch is an allowlist
 * (`s.mode in ('speedrun')`) that feature_golf is deliberately kept off, because
 * its ranked metric is a raw client integer the server cannot check. Board
 * presence therefore reads as `cleared: false` for EVERY level, however many a
 * student has genuinely cleared. 0154 then added the 30s plausibility floor to
 * that same branch, so the speedrun list stopped trusting board presence for
 * `cleared` too; this file carries the same fix for the same reason. bestMetric
 * and rank still come from the board and are null for this mode today, which is
 * correct and was already true.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	const { data: challenges } = await supabase
		.from('challenges')
		.select('id, title, difficulty, prompt')
		.eq('mode', 'feature_golf')
		.eq('published', true)
		.order('difficulty', { ascending: true })
		.order('created_at', { ascending: true });

	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('challenge_id, score_metric, rank')
		.eq('user_id', claims.sub)
		.eq('mode', 'feature_golf');

	// A student's own history, never the board: the board (above) is a RANKING
	// that this mode is not admitted to at all (0146's allowlist), and since
	// 0154 the one modeling mode that IS admitted loses a passing run under the
	// 30s plausibility floor from it too. A pass `gauntlet_macro_submit`
	// returned `is_correct` for was still genuinely cleared, so "cleared" is
	// read from the student's own `submissions` rows (RLS: own-row select,
	// granted since 0004), not from board presence. `mine` above still supplies
	// bestMetric/rank, which are legitimately absent for an unranked run.
	const { data: mySubmissions } = await supabase
		.from('submissions')
		.select('challenge_id, is_correct')
		.eq('user_id', claims.sub)
		.eq('mode', 'feature_golf');

	const byChallenge = new Map((mine ?? []).map((r) => [r.challenge_id as string, r]));
	const clearedIds = new Set(
		(mySubmissions ?? [])
			.filter((s) => s.is_correct === true)
			.map((s) => s.challenge_id as string)
	);

	const list = (challenges ?? []).map((c) => {
		const framing = (c.prompt ?? {}) as ModelingFraming;
		const best = byChallenge.get(c.id);
		return {
			id: c.id as string,
			title: c.title as string,
			difficulty: c.difficulty as number,
			material: framing.material ?? null,
			par: framing.par_features ?? null,
			demo: framing.demo === true,
			cleared: clearedIds.has(c.id as string),
			bestMetric: (best?.score_metric ?? null) as number | null,
			rank: (best?.rank ?? null) as number | null
		};
	});

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		challenges: list
	};
};
