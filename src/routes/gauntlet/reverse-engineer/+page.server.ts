import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ModelingFraming } from '$lib/gauntlet';

/**
 * Reverse Engineer challenge list. Mirrors the Speedrun list: published
 * challenges plus the user's best PASSING (macro-verified) run per challenge.
 * The score metric here is deviation (lower is better), not time.
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
		.eq('mode', 'reverse_engineer')
		.eq('published', true)
		.order('difficulty', { ascending: true })
		.order('created_at', { ascending: true });

	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('challenge_id, score_metric, rank')
		.eq('user_id', claims.sub)
		.eq('mode', 'reverse_engineer');

	const byChallenge = new Map((mine ?? []).map((r) => [r.challenge_id as string, r]));

	const list = (challenges ?? []).map((c) => {
		const framing = (c.prompt ?? {}) as ModelingFraming;
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
