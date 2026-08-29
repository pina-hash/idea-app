import { error, fail } from '@sveltejs/kit';
import { rpcErrorStatus } from '$lib/pg-errors';
import type { Actions, PageServerLoad } from './$types';
import type { KnowledgePrompt } from '$lib/gauntlet';
import { nextUncleared } from '$lib/gauntlet/next-challenge';

/**
 * One GD&T and Tolerance challenge. Same shape as Drawing Reading: the load
 * returns the public prompt (never the answer) plus the board and the user's
 * best result; the `submit` action grades through gauntlet_submit (the only
 * writer), which compares the submitted answer to the canonical answer by type
 * (choice / numeric / text).
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

	if (!challenge || challenge.mode !== 'gdt_tolerance') {
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
		next: await nextUncleared(supabase, claims.sub, 'gdt_tolerance', '/gauntlet/gdt-tolerance', params.id),
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
			return fail(400, { error: 'Enter an answer first.' });
		}
		/*
		 * 0148: THE CLOCK IS THE SERVER'S, AND THE ABSENT FIELD IS THE SIGNAL.
		 *
		 * The play surface deletes `elapsed_ms` from the form once
		 * `gauntlet_knowledge_start` has answered, so a missing field means the
		 * database is timing this run and `p_elapsed_ms` must not be named at
		 * all. A field that IS present is the pre-0148 rung, where the deployed
		 * function still scores what it is sent -- and where sending nothing
		 * would score every knowledge submit on the site at zero. Passing the
		 * parameter conditionally is what keeps the two deploys independent.
		 *
		 * Post-0148 the value is ignored for scoring either way and is recorded
		 * on the submission as `client_elapsed_ms`, so a forged number is kept
		 * as evidence rather than trusted or discarded.
		 */
		const elapsedField = form.get('elapsed_ms');
		const args: Record<string, unknown> = { p_challenge_id: params.id, p_value: { answer } };
		if (typeof elapsedField === 'string' && elapsedField !== '') {
			const elapsedRaw = Number(elapsedField);
			args.p_elapsed_ms = Number.isFinite(elapsedRaw) ? Math.max(0, Math.round(elapsedRaw)) : 0;
		}

		const { data, error: rpcError } = await supabase.rpc('gauntlet_submit', args);

		if (rpcError) {
			// A refusal this function CONSIDERED (a missing start row, an
			// unavailable challenge) is a 400, not a 500: `rpcErrorStatus` is the
			// repo's one partition of SQLSTATEs, so a deadlock is still reported
			// as retryable and everything else as a decision about the payload.
			// The message is rendered verbatim where the student is working.
			return fail(rpcErrorStatus(rpcError.code), { error: rpcError.message });
		}

		return { result: data };
	}
};
