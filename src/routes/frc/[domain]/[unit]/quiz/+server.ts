import { json } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getQuizBank, type AttemptRecord, type SealedItem } from '$lib/server/frc/quiz-engine';
import { startQuiz, submitQuiz, type QuizStore } from '$lib/server/frc/quiz-service';
import { cooldownSecondsForFailStreak, domainById } from '$lib/frc/track';
import type { RequestHandler } from './$types';

/**
 * Server-authoritative knowledge-gate quiz for a unit. POST { action:'start' }
 * -> serves stems + shuffled options (NO answer key), enforcing the escalating
 * cooldown. POST { action:'submit', attemptId, answers } -> grades against the
 * server-held key and records the attempt. The answer key never leaves the
 * server.
 *
 * WHICH UNITS THIS ANSWERS FOR IS DERIVED, NEVER NAMED. The route resolves
 * `params.domain` through the track registry (`domainById`) and `params.unit`
 * through THAT domain's own unit list, then serves the pair if and only if
 * `getQuizBank` has a bank for the resolved unit id. There is no domain
 * literal anywhere in this file, which is the whole point: it used to open
 * with `params.domain !== 'cad-mechanical'`, and that single literal made the
 * ENTIRE Foundation domain unreachable -- F1 through F5 all have banks, are
 * all authored `gate: quiz`, and the unit page builds a live gate for every
 * one of them, so five units rendered a "Start quiz" button against an
 * endpoint that 404'd it. A domain added to the registry later is served here
 * the moment its units have banks, with no edit to this file, because the
 * condition is "does this unit have a bank" rather than "is this the domain
 * somebody wrote down".
 *
 * Completion recording: the `frc_quiz_grade` RPC (0041) records a pass into
 * `frc_user_progress` ITSELF, inline, scoped to the caller's own `auth.uid()`.
 * This endpoint does not call `markUnitComplete` (that seam is teacher-only as
 * of 0041 and would simply be refused for a student); the `onPass` hook below
 * is a deliberate no-op.
 *
 * Fails soft: if migration 0040/0041 is unapplied, the store errors surface as
 * `unavailable` and the unit page falls back to its description-only Gate.
 */

/** DB store: cooldown log via safe columns, start/grade via the definer RPCs. */
function dbStore(supabase: SupabaseClient): QuizStore {
	return {
		async listFinalized(userId, unitId): Promise<AttemptRecord[]> {
			const { data, error } = await supabase
				.from('frc_quiz_attempts')
				.select('status, submitted_at')
				.eq('user_id', userId)
				.eq('unit_id', unitId)
				.in('status', ['passed', 'failed']);
			if (error) return [];
			return (data ?? [])
				.filter((r) => r.submitted_at)
				.map((r) => ({
					status: r.status as 'passed' | 'failed',
					at: new Date(r.submitted_at as string).getTime()
				}));
		},
		async createAttempt(_userId, unitId, sealed: SealedItem[], passPercent) {
			const { data, error } = await supabase.rpc('frc_quiz_start', {
				p_unit_id: unitId,
				p_sealed: sealed,
				p_pass_percent: passPercent
			});
			if (error || !data || (data as { error?: string }).error) {
				return { error: error?.message ?? (data as { error?: string })?.error ?? 'start_failed' };
			}
			return { attemptId: (data as { attempt_id: string }).attempt_id };
		},
		async gradeAttempt(_userId, attemptId, answers) {
			const { data, error } = await supabase.rpc('frc_quiz_grade', {
				p_attempt_id: attemptId,
				p_answers: answers
			});
			if (error || !data) return { error: error?.message ?? 'grade_failed' };
			const d = data as { error?: string; passed?: boolean; score?: number; missed?: string[] };
			if (d.error) return { error: d.error };

			// THE UNIT THE ATTEMPT WAS ACTUALLY FOR, read back off the row rather
			// than taken from the URL. `frc_quiz_grade` (0041) grades and records
			// against the unit id on the attempt row and does not return it, so
			// without this read the caller's only source for "which unit was that"
			// is `params.unit` -- and a student who submits an MDM-9 attempt
			// through the MDM-1 URL is then told the cooldown and the missed
			// topics of MDM-1. The grade above already refused anything that is
			// not this caller's own in-flight attempt, so the id alone identifies
			// the row and no second ownership filter is restated here.
			const { data: row } = await supabase
				.from('frc_quiz_attempts')
				.select('unit_id')
				.eq('id', attemptId)
				.maybeSingle();
			const unitId = (row as { unit_id?: string } | null)?.unit_id;

			return {
				passed: !!d.passed,
				score: d.score ?? 0,
				missed: d.missed ?? [],
				...(unitId ? { unitId } : {})
			};
		}
	};
}

export const POST: RequestHandler = async ({ request, params, locals: { supabase, claims } }) => {
	if (!claims) return json({ ok: false, reason: 'unauthorized' }, { status: 401 });

	// Resolve the unit within its own domain, then confirm it has a quiz gate.
	// Both halves come from registries: the domain and its units from track.ts,
	// the bank from the engine. Nothing about which domain this is is written
	// down here.
	const domain = domainById(params.domain);
	const n = Number(params.unit);
	const unit =
		domain && Number.isFinite(n) ? domain.units.find((u) => u.n === n) : undefined;
	if (!unit || !getQuizBank(unit.id)) {
		return json({ ok: false, reason: 'unavailable' }, { status: 404 });
	}
	const unitId = unit.id;

	let body: { action?: string; attemptId?: string; answers?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}

	const store = dbStore(supabase);
	const now = Date.now();

	if (body.action === 'start') {
		const result = await startQuiz(store, claims.sub, unitId, cooldownSecondsForFailStreak, now);
		const status = result.ok ? 200 : result.reason === 'cooldown' ? 429 : 503;
		return json(result, { status });
	}

	if (body.action === 'submit') {
		if (!body.attemptId) return json({ ok: false, reason: 'bad_request' }, { status: 400 });
		const result = await submitQuiz(
			store,
			claims.sub,
			unitId,
			body.attemptId,
			// RAW, deliberately. The coercion used to be `Number(a)` right here,
			// which graded a JSON `null` as option 0 -- so "left blank" and "chose
			// the first option" reached the grader as the same value. It is
			// `normalizeAnswers` inside submitQuiz now, one implementation, so no
			// caller of the service can reintroduce a softer one.
			body.answers,
			cooldownSecondsForFailStreak,
			now,
			// No-op: frc_quiz_grade (called from gradeAttempt above) already
			// recorded the completion inline as part of grading, scoped to the
			// caller's own auth.uid(). Nothing left for the endpoint to do.
			async () => {}
		);
		const status = result.ok ? 200 : result.reason === 'no_attempt' ? 409 : 503;
		return json(result, { status });
	}

	return json({ ok: false, reason: 'bad_request' }, { status: 400 });
};
