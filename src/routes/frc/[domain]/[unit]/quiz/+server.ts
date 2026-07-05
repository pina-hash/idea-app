import { json } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getQuizBank, type AttemptRecord, type SealedItem } from '$lib/server/frc/quiz-engine';
import { startQuiz, submitQuiz, type QuizStore } from '$lib/server/frc/quiz-service';
import { cooldownSecondsForFailStreak } from '$lib/frc/track';
import { markUnitComplete } from '$lib/frc/progression';
import { mdmUnitByNumber } from '$lib/frc/mdm-content';
import type { RequestHandler } from './$types';

/**
 * Server-authoritative knowledge-gate quiz for a unit (currently MDM-1).
 * POST { action:'start' } -> serves stems + shuffled options (NO answer key),
 * enforcing the escalating cooldown. POST { action:'submit', attemptId, answers }
 * -> grades against the server-held key, records the attempt, and on a pass
 * calls markUnitComplete. The answer key never leaves the server.
 *
 * Fails soft: if migration 0040 is unapplied, the store errors surface as
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
			return { passed: !!d.passed, score: d.score ?? 0, missed: d.missed ?? [] };
		}
	};
}

export const POST: RequestHandler = async ({ request, params, locals: { supabase, claims } }) => {
	if (!claims) return json({ ok: false, reason: 'unauthorized' }, { status: 401 });

	// Resolve the unit and confirm it has a quiz gate.
	const n = Number(params.unit);
	const unit = Number.isFinite(n) ? mdmUnitByNumber(n) : undefined;
	if (params.domain !== 'cad-mechanical' || !unit || !getQuizBank(unit.id)) {
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
		const answers = Array.isArray(body.answers) ? body.answers.map((a) => Number(a)) : [];
		if (!body.attemptId) return json({ ok: false, reason: 'bad_request' }, { status: 400 });
		const result = await submitQuiz(
			store,
			claims.sub,
			unitId,
			body.attemptId,
			answers,
			cooldownSecondsForFailStreak,
			now,
			async () => {
				// The single completion seam. Fails soft (progression migration).
				await markUnitComplete(supabase, claims.sub, unitId);
			}
		);
		const status = result.ok ? 200 : result.reason === 'no_attempt' ? 409 : 503;
		return json(result, { status });
	}

	return json({ ok: false, reason: 'bad_request' }, { status: 400 });
};
