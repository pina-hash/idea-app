import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { DEFAULT_SPEEDRUN_RULESET, MODELS_BUCKET, type SpeedrunFraming, type SpeedrunRuleset } from '$lib/gauntlet';
import { nextUncleared } from '$lib/gauntlet/next-challenge';

/** One row of the named-field projection in the load below. */
interface SpeedrunDetailRow {
	id: string;
	mode: string;
	title: string;
	difficulty: number;
	material: string | null;
	unit_system: string | null;
	mass_unit: string | null;
	note: string | null;
	model_path: string | null;
	tutorial_video_id: string | null;
	par_time: number | null;
	par_feature_count: number | null;
}

/**
 * One Speedrun challenge, end to end. The load returns ONLY the public framing,
 * never the drawing: the dimensioned drawing lives in the hidden `answer` column
 * and is fetched on Start via the `gauntlet_speedrun_reveal` RPC (client side,
 * coupled to the timer). The `submit` action grades the typed mass through
 * `gauntlet_submit` (the only writer of submissions), so is_correct and the time
 * cannot be forged.
 *
 * THE FRAMING IS NAMED FIELD BY FIELD, AND THE TARGET IS NOT AMONG THEM (0153).
 * This used to select `prompt` whole and the page rendered `density`,
 * `target_mass` and `tolerance_pct` off it as a spec card -- the ranked answer
 * and the pass band, printed above the drawing, on every published level. What
 * is listed below is what a student needs in order to MODEL: which material to
 * assign, which units the level is authored in, what a good time looks like, the
 * shape-only preview, the author's note, the walkthrough. See the list loader's
 * header for why this projection is defence in depth rather than the boundary.
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
		.select(
			'id, mode, title, difficulty, ' +
				'prompt->>material, prompt->>unit_system, prompt->>mass_unit, prompt->>note, ' +
				'prompt->>model_path, prompt->>tutorial_video_id, ' +
				'prompt->par_time, prompt->par_feature_count'
		)
		.eq('id', params.id)
		.maybeSingle();

	// The generated Supabase types cannot describe a `->` projection, so the row
	// is cast once, here, and every read below goes through it. One cast at the
	// boundary rather than a cast per field: a second one is where the shape and
	// the select stop agreeing.
	const row = challenge as unknown as SpeedrunDetailRow | null;

	if (!row || row.mode !== 'speedrun') {
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

	// Rebuilt from the named projection rather than read off `prompt`, so the
	// object the page renders can only ever hold what the select above listed.
	// `par_time` / `par_feature_count` come back through `->` (a JSON number, not
	// a string); everything else through `->>`.
	const framing: SpeedrunFraming = {
		material: row.material ?? undefined,
		unit_system: (row.unit_system as SpeedrunFraming['unit_system']) ?? undefined,
		mass_unit: row.mass_unit ?? undefined,
		note: row.note ?? undefined,
		model_path: row.model_path ?? undefined,
		tutorial_video_id: row.tutorial_video_id ?? undefined,
		par_time: row.par_time ?? undefined,
		par_feature_count: row.par_feature_count ?? undefined
	};

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

	// The post-run analysis comparisons (0150). Both are best-effort: the panel
	// they feed degrades to "first recorded attempt" / "no class comparison yet"
	// and nothing else on the page depends on either.
	//
	// SELF HISTORY carries the EXPLICIT user filter on purpose. `read own
	// attempts` is `user_id = auth.uid() or public.is_teacher()`, so the same
	// policy legitimately returns other people's rows to an admin reading it --
	// and this list is a claim about ATTRIBUTION ("your past attempts"), not about
	// authorization. Without the filter an admin's own results screen would show
	// the whole class's runs as their learning curve.
	const { data: selfHistoryRows } = await supabase
		.from('gauntlet_speedrun_attempt_history')
		.select('created_at, elapsed_ms, result')
		.eq('challenge_id', params.id)
		.eq('user_id', claims.sub)
		.order('created_at', { ascending: false })
		.limit(5);

	// CLASS MEDIANS come from a definer RPC because they cannot come from
	// anywhere else: every table behind them is RLS-scoped to the caller's own
	// rows, so a browser cannot aggregate a class even in principle. The floor
	// that decides whether a median may be disclosed at all lives inside that
	// function, never here -- a client-side threshold is one a client can skip.
	//
	// 0150 is applied by hand, so a deployment sitting ahead of it is a real
	// state: PGRST202 (and PGRST202 ALONE, so a runtime error inside the function
	// fails closed rather than degrading to a weaker answer) leaves classStats
	// null and the panel says so.
	let classStats: {
		medianElapsedMs: number | null;
		medianFeatures: number | null;
		medianStuckMs: number | null;
		peersElapsed: number;
		peersFeatures: number;
		peersStuck: number;
	} | null = null;
	const { data: statsRow, error: statsError } = await supabase.rpc('gauntlet_class_run_stats', {
		p_challenge_id: params.id
	});
	if (!statsError && statsRow) {
		const r = statsRow as Record<string, number | null>;
		classStats = {
			medianElapsedMs: r.median_elapsed_ms ?? null,
			medianFeatures: r.median_features ?? null,
			medianStuckMs: r.median_stuck_ms ?? null,
			peersElapsed: Number(r.peers_elapsed ?? 0),
			peersFeatures: Number(r.peers_features ?? 0),
			peersStuck: Number(r.peers_stuck ?? 0)
		};
	}

	return {
		next,
		selfHistory: (selfHistoryRows ?? []) as Array<{
			created_at: string;
			elapsed_ms: number | null;
			result: string;
		}>,
		classStats,
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		challenge: {
			id: row.id,
			title: row.title,
			difficulty: row.difficulty,
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
