import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Spot the Error challenge list. Web-only knowledge mode (no macro): published
 * challenges, the user's best RANKED result per challenge (from the
 * leaderboard view, for bestTime/rank), and `cleared`/`attempted` from the
 * student's own `submissions` rows directly rather than from board presence.
 *
 * `gauntlet_leaderboard` is a RANKING, not a history. Since 0154 it admits a
 * knowledge row only when `is_correct = true`, so a student whose every answer
 * was wrong has NO board row at all -- reading `attempted` off board presence
 * would then say they never tried, which is false and which they would
 * notice. `submissions` (RLS: own-row select, granted since 0004) carries
 * every attempt regardless of correctness, so it is the one source for both
 * fields; the board stays the source for bestTime/rank, which are legitimately
 * absent for a wrong-only history.
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
		.select('id, title, difficulty')
		.eq('mode', 'spot_the_error')
		.eq('published', true)
		.order('difficulty', { ascending: true })
		.order('created_at', { ascending: true });

	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('challenge_id, is_correct, score_metric, rank')
		.eq('user_id', claims.sub)
		.eq('mode', 'spot_the_error');

	const { data: mySubmissions } = await supabase
		.from('submissions')
		.select('challenge_id, is_correct')
		.eq('user_id', claims.sub)
		.eq('mode', 'spot_the_error');

	const byChallenge = new Map((mine ?? []).map((r) => [r.challenge_id as string, r]));
	const attemptedIds = new Set((mySubmissions ?? []).map((s) => s.challenge_id as string));
	const clearedIds = new Set(
		(mySubmissions ?? [])
			.filter((s) => s.is_correct === true)
			.map((s) => s.challenge_id as string)
	);

	const list = (challenges ?? []).map((c) => {
		const best = byChallenge.get(c.id);
		return {
			id: c.id as string,
			title: c.title as string,
			difficulty: c.difficulty as number,
			cleared: clearedIds.has(c.id as string),
			attempted: attemptedIds.has(c.id as string),
			bestTime: (best?.score_metric ?? null) as number | null,
			rank: (best?.rank ?? null) as number | null
		};
	});

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		challenges: list
	};
};
