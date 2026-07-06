import { error } from '@sveltejs/kit';
import { cooldownSecondsForFailStreak, domainById } from '$lib/frc/track';
import { MDM_UNITS, mdmUnitByNumber, type MdmUnit } from '$lib/frc/mdm-content';
import { FOUNDATION_UNITS, foundationUnitByNumber } from '$lib/frc/foundation-content';
import { cooldownState, getQuizBank } from '$lib/server/frc/quiz-engine';
import { loadSubmission, type GateSubmission } from '$lib/frc/gate-submissions';
import type { PageServerLoad } from './$types';

/**
 * Each domain's content set supplies its own ordered unit list (for prev/next,
 * scoped within that domain only) and a by-number lookup. Adding a domain's
 * content here is the only change needed for this route to serve it; no
 * cross-domain unlock logic is introduced by having two content sets.
 */
const CONTENT_SETS: Record<string, { units: MdmUnit[]; byNumber: (n: number) => MdmUnit | undefined }> = {
	mdm: { units: MDM_UNITS, byNumber: mdmUnitByNumber },
	foundation: { units: FOUNDATION_UNITS, byNumber: foundationUnitByNumber }
};

/**
 * A single unit page under a domain, e.g. /frc/cad-mechanical/1 or
 * /frc/foundation/1. Resolves the unit against its domain's content set
 * (404 for unknown domains, non-content domains, or unknown unit numbers) and
 * computes the Gate state per gate type:
 *   - knowledge units with a bank (MDM-1, 2, 3, 9, 10, and F1 in Foundation):
 *     the server-authoritative quiz `gate` (readiness, unit-complete,
 *     cooldown), from that unit's bank;
 *   - modeling units (a `gauntlet:*` gate, MDM-4 through MDM-8): the model
 *     submission `modelGate` (the student's own submission + unit-complete).
 * Both fail soft to null (description-only Gate) if their migration (0040 /
 * 0042) is unapplied.
 */
export const load: PageServerLoad = async ({ params, parent, locals: { supabase, claims } }) => {
	const domain = domainById(params.domain);
	const contentSet = domain?.contentSet ? CONTENT_SETS[domain.contentSet] : undefined;
	if (!domain || !contentSet) error(404, 'Unknown training unit');

	const n = Number(params.unit);
	const unit = Number.isFinite(n) ? contentSet.byNumber(n) : undefined;
	if (!unit) error(404, 'Unknown training unit');

	const idx = contentSet.units.findIndex((u) => u.n === unit.n);

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
		prev: idx > 0 ? contentSet.units[idx - 1] : null,
		next: idx < contentSet.units.length - 1 ? contentSet.units[idx + 1] : null,
		gate,
		modelGate
	};
};
