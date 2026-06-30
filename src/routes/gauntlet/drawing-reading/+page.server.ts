import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Drawing Reading challenge list. Loads the published challenges for the mode
 * plus the signed-in user's best result per challenge (from the leaderboard
 * view) so each row can show cleared / attempted / new and the user's time.
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
		.eq('mode', 'drawing_reading')
		.eq('published', true)
		.order('difficulty', { ascending: true })
		.order('created_at', { ascending: true });

	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('challenge_id, is_correct, score_metric, rank')
		.eq('user_id', claims.sub)
		.eq('mode', 'drawing_reading');

	const byChallenge = new Map(
		(mine ?? []).map((r) => [r.challenge_id as string, r])
	);

	const list = (challenges ?? []).map((c) => {
		const best = byChallenge.get(c.id);
		return {
			id: c.id as string,
			title: c.title as string,
			difficulty: c.difficulty as number,
			cleared: best?.is_correct === true,
			attempted: best !== undefined,
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
