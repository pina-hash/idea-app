import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ModelingFraming } from '$lib/gauntlet';
import { nextUncleared } from '$lib/gauntlet/next-challenge';

/**
 * One Feature Golf challenge. Macro-only: the dimensioned drawing is hidden in
 * `answer` and revealed on Start (like Speedrun), so the load returns only the
 * public framing plus the board and the user's best feature count. Scoring is in
 * gauntlet_macro_submit (verify on volume, rank by feature count).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, params }) => {
	if (!claims) {
		error(401, 'Sign in to play.');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	const { data: challenge } = await supabase
		.from('challenges')
		.select('id, mode, title, difficulty, prompt')
		.eq('id', params.id)
		.maybeSingle();

	if (!challenge || challenge.mode !== 'feature_golf') {
		error(404, 'Challenge not found.');
	}

	const { data: board } = await supabase
		.from('gauntlet_leaderboard')
		.select('user_id, player, score_metric, rank')
		.eq('challenge_id', params.id)
		.order('rank', { ascending: true })
		.limit(50);

	const { data: myBest } = await supabase
		.from('gauntlet_leaderboard')
		.select('score_metric, rank')
		.eq('challenge_id', params.id)
		.eq('user_id', claims.sub)
		.maybeSingle();

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		next: await nextUncleared(supabase, claims.sub, 'feature_golf', '/gauntlet/feature-golf', params.id),
		userRole: profile?.role ?? 'student',
		challenge: {
			id: challenge.id as string,
			title: challenge.title as string,
			difficulty: challenge.difficulty as number,
			framing: (challenge.prompt ?? {}) as ModelingFraming
		},
		board: (board ?? []) as Array<{
			user_id: string;
			player: string;
			score_metric: number | null;
			rank: number;
		}>,
		myUserId: claims.sub,
		myBest: myBest ?? null
	};
};
