import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * GD&T and Tolerance challenge list. Web-only knowledge mode (no macro): loads
 * published challenges plus the user's best result per challenge (correctness +
 * time), identical in shape to the Drawing Reading list.
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
		.eq('mode', 'gdt_tolerance')
		.eq('published', true)
		.order('difficulty', { ascending: true })
		.order('created_at', { ascending: true });

	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('challenge_id, is_correct, score_metric, rank')
		.eq('user_id', claims.sub)
		.eq('mode', 'gdt_tolerance');

	const byChallenge = new Map((mine ?? []).map((r) => [r.challenge_id as string, r]));

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
