import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { KnowledgePrompt } from '$lib/gauntlet';

/**
 * One Spot the Error challenge. Same shape as Drawing Reading: the load returns
 * the public prompt (never the answer) plus the board and the user's best
 * result; the `submit` action grades through gauntlet_submit.
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
		.select('id, mode, title, difficulty, asset_ref, prompt')
		.eq('id', params.id)
		.maybeSingle();

	if (!challenge || challenge.mode !== 'spot_the_error') {
		error(404, 'Challenge not found.');
	}

	const { data: board } = await supabase
		.from('gauntlet_leaderboard')
		.select('user_id, player, is_correct, score_metric, rank')
		.eq('challenge_id', params.id)
		.order('rank', { ascending: true })
		.limit(50);

	const { data: myBest } = await supabase
		.from('gauntlet_leaderboard')
		.select('is_correct, score_metric, rank')
		.eq('challenge_id', params.id)
		.eq('user_id', claims.sub)
		.maybeSingle();

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		challenge: {
			id: challenge.id as string,
			title: challenge.title as string,
			difficulty: challenge.difficulty as number,
			prompt: challenge.prompt as KnowledgePrompt
		},
		board: (board ?? []) as Array<{
			user_id: string;
			player: string;
			is_correct: boolean | null;
			score_metric: number | null;
			rank: number;
		}>,
		myUserId: claims.sub,
		myBest: myBest ?? null
	};
};

export const actions: Actions = {
	submit: async ({ request, params, locals: { supabase, claims } }) => {
		if (!claims) {
			return fail(401, { error: 'Sign in to submit.' });
		}

		const form = await request.formData();
		const answer = form.get('answer');
		if (typeof answer !== 'string' || answer.length === 0) {
			return fail(400, { error: 'Pick the flawed callout first.' });
		}
		const elapsedRaw = Number(form.get('elapsed_ms'));
		const elapsed = Number.isFinite(elapsedRaw) ? Math.max(0, Math.round(elapsedRaw)) : 0;

		const { data, error: rpcError } = await supabase.rpc('gauntlet_submit', {
			p_challenge_id: params.id,
			p_value: { answer },
			p_elapsed_ms: elapsed
		});

		if (rpcError) {
			return fail(500, { error: rpcError.message });
		}

		return { result: data };
	}
};
