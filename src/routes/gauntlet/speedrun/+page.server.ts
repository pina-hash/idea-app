import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { SpeedrunFraming } from '$lib/gauntlet';

/**
 * Speedrun challenge list. Loads published Speedrun challenges (framing only,
 * the dimensioned drawing stays hidden in `answer` until Start) plus the user's
 * best PASSING run per challenge from the leaderboard view. The view only ranks
 * passing modeling-mode submissions, so a row here means the student cleared it.
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
		.eq('mode', 'speedrun')
		.eq('published', true)
		.order('difficulty', { ascending: true })
		.order('created_at', { ascending: true });

	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('challenge_id, score_metric, rank')
		.eq('user_id', claims.sub)
		.eq('mode', 'speedrun');

	const byChallenge = new Map((mine ?? []).map((r) => [r.challenge_id as string, r]));

	const list = (challenges ?? []).map((c) => {
		const framing = (c.prompt ?? {}) as SpeedrunFraming;
		const best = byChallenge.get(c.id);
		return {
			id: c.id as string,
			title: c.title as string,
			difficulty: c.difficulty as number,
			material: framing.material ?? null,
			targetMass: framing.target_mass ?? null,
			massUnit: framing.mass_unit ?? 'g',
			demo: framing.demo === true,
			cleared: best !== undefined,
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
