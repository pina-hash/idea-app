import { error } from '@sveltejs/kit';
import { cooldownSecondsForFailStreak, domainById } from '$lib/frc/track';
import { MDM_UNITS, mdmUnitByNumber } from '$lib/frc/mdm-content';
import { cooldownState, getQuizBank } from '$lib/server/frc/quiz-engine';
import { loadSubmission, type GateSubmission } from '$lib/frc/gate-submissions';
import type { PageServerLoad } from './$types';

/**
 * A single unit page under a domain, e.g. /frc/cad-mechanical/1. Resolves the
 * unit (404 for unknown / non-content domains) and computes the Gate state per
 * gate type:
 *   - knowledge units with a bank (MDM-1, 2, 3, 9, 10): the server-authoritative
 *     quiz `gate` (readiness, unit-complete, cooldown), from that unit's bank;
 *   - modeling units (a `gauntlet:*` gate, MDM-4 through MDM-8): the model
 *     submission `modelGate` (the student's own submission + unit-complete).
 * Both fail soft to null (description-only Gate) if their migration (0040 /
 * 0042) is unapplied.
 */
export const load: PageServerLoad = async ({ params, parent, locals: { supabase, claims } }) => {
	const domain = domainById(params.domain);
	if (!domain || domain.contentSet !== 'mdm') error(404, 'Unknown training unit');

	const n = Number(params.unit);
	const unit = Number.isFinite(n) ? mdmUnitByNumber(n) : undefined;
	if (!unit) error(404, 'Unknown training unit');

	const idx = MDM_UNITS.findIndex((u) => u.n === unit.n);

	let gate: {
		enabled: true;
		testLength: number;
		passPercent: number;
		unitComplete: boolean;
		cooldownRemainingSec: number;
	} | null = null;

	let modelGate: {
		enabled: true;
		ready: boolean;
		submission: GateSubmission | null;
		unitComplete: boolean;
	} | null = null;

	const bank = getQuizBank(unit.id);
	// Modeling units carry a `gauntlet:*` gate and have no quiz bank.
	const isModelGate = !bank && unit.gate.startsWith('gauntlet:');

	if (bank && claims) {
		const { data, error: qErr } = await supabase
			.from('frc_quiz_attempts')
			.select('status, submitted_at')
			.eq('user_id', claims.sub)
			.eq('unit_id', unit.id)
			.in('status', ['passed', 'failed']);
		// Only enable the live gate when the quiz backend is present (0040 applied).
		if (!qErr) {
			const finalized = (data ?? [])
				.filter((r) => r.submitted_at)
				.map((r) => ({
					status: r.status as 'passed' | 'failed',
					at: new Date(r.submitted_at as string).getTime()
				}));
			const cd = cooldownState(finalized, Date.now(), cooldownSecondsForFailStreak);
			const parentData = await parent();
			gate = {
				enabled: true,
				testLength: bank.testLength,
				passPercent: bank.passPercent,
				unitComplete: (parentData.frcCompleted ?? []).includes(unit.id),
				cooldownRemainingSec: cd.remainingSec
			};
		}
	} else if (isModelGate && claims) {
		// Fails soft: loadSubmission reports ready=false if 0042 is unapplied, so
		// the panel shows an apply-migration note (the teacher override still works).
		const { ready, submission } = await loadSubmission(supabase, claims.sub, unit.id);
		const parentData = await parent();
		modelGate = {
			enabled: true,
			ready,
			submission,
			unitComplete: (parentData.frcCompleted ?? []).includes(unit.id)
		};
	}

	return {
		domain,
		unit,
		prev: idx > 0 ? MDM_UNITS[idx - 1] : null,
		next: idx < MDM_UNITS.length - 1 ? MDM_UNITS[idx + 1] : null,
		gate,
		modelGate
	};
};
