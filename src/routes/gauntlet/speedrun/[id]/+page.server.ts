import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULT_SPEEDRUN_RULESET, MODELS_BUCKET, type SpeedrunFraming, type SpeedrunRuleset } from '$lib/gauntlet';
import { nextUncleared } from '$lib/gauntlet/next-challenge';

/**
 * One Speedrun challenge, end to end. The load returns ONLY the public framing
 * (material, density, target mass, tolerance), never the drawing: the
 * dimensioned drawing lives in the hidden `answer` column and is fetched on
 * Start via the `gauntlet_speedrun_reveal` RPC (client side, coupled to the
 * timer). The `submit` action grades the typed mass through `gauntlet_submit`
 * (the only writer of submissions), so is_correct and the time cannot be forged.
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

	if (!challenge || challenge.mode !== 'speedrun') {
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

	const framing = (challenge.prompt ?? {}) as SpeedrunFraming;

	// The STL model is a shape-only preview (public framing), shown before Start.
	// The bucket is private, so hand the page a short-lived signed URL.
	let modelUrl: string | null = null;
	if (framing.model_path) {
		const { data: signed } = await supabase.storage
			.from(MODELS_BUCKET)
			.createSignedUrl(framing.model_path, 60 * 60);
		modelUrl = signed?.signedUrl ?? null;
	}

	// The one global ruleset, shown next to every Speedrun challenge.
	const { data: rules } = await supabase
		.from('gauntlet_speedrun_ruleset')
		.select('units_label, projection, rule_lines')
		.maybeSingle();

	// The suggested next drawing for the post-run results screen.
	const next = await nextUncleared(supabase, claims.sub, 'speedrun', '/gauntlet/speedrun', params.id);

	return {
		next,
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		challenge: {
			id: challenge.id as string,
			title: challenge.title as string,
			difficulty: challenge.difficulty as number,
			framing
		},
		modelUrl,
		ruleset: (rules ?? DEFAULT_SPEEDRUN_RULESET) as SpeedrunRuleset,
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

export const actions: Actions = {
	submit: async ({ request, params, locals: { supabase, claims } }) => {
		if (!claims) {
			return fail(401, { error: 'Sign in to submit.' });
		}

		const form = await request.formData();
		const massRaw = form.get('mass');
		const mass = Number(massRaw);
		if (typeof massRaw !== 'string' || massRaw.trim() === '' || !Number.isFinite(mass) || mass < 0) {
			return fail(400, { error: 'Enter the mass from Mass Properties.' });
		}

		const elapsedRaw = Number(form.get('elapsed_ms'));
		const elapsed = Number.isFinite(elapsedRaw) ? Math.max(0, Math.round(elapsedRaw)) : 0;

		const { data, error: rpcError } = await supabase.rpc('gauntlet_submit', {
			p_challenge_id: params.id,
			p_value: { mass },
			p_elapsed_ms: elapsed
		});

		if (rpcError) {
			return fail(500, { error: rpcError.message });
		}

		return { result: data };
	}
};
