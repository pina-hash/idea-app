/**
 * DOCUMENTATION CHECK: the notebook unit's grade, as an ordinary IDEA
 * Classroom assignment.
 *
 * Plain data + pure functions (the notebook-review.ts / classroom.ts
 * convention): no Supabase client, no `$lib/server` import, nothing that
 * cannot run in a dev harness with no backend.
 *
 * WHAT LIVES HERE AND WHAT DELIBERATELY DOES NOT.
 *   * HERE: the four criteria, and how the grid's own counts become the
 *     presence score and its evidence.
 *   * NOT HERE: any scoring arithmetic. The per-student counts come from
 *     `summarize()` in notebook-review.ts, the criterion total comes from
 *     `rubricTotal()` in assignment-spec.ts, and the SAVED total is whatever
 *     classroom_grade_submission computed -- this file never adds up a grade.
 *   * NOT HERE: any permission rule. Grading a Documentation Check requires
 *     exactly what grading any Classroom item requires, and that check lives
 *     inside classroom_grade_submission (classroom_can_review_submission).
 *
 * THE RUBRIC IS ORDINARY CONTENT, not a schema. `DOC_CHECK_CRITERIA` is a
 * STARTING POINT installed through the existing `classroom_set_rubric`, and a
 * teacher may then edit it like any other rubric. Only two things about it are
 * load-bearing: the presence criterion's id (so the grid's counts know which
 * criterion to pre-fill) and its maximum (PRESENCE_POINTS, which is the same
 * 7 the grid's own arithmetic uses -- imported, never restated).
 */

import type { RubricCriterion } from '$lib/classroom/assignment-spec';
import { PRESENCE_POINTS, type StudentSummary } from '$lib/notebook-review';

/**
 * The one id this feature genuinely depends on: it is how the grading view
 * knows which criterion the grid can answer for the instructor. Every other
 * criterion is judged by a person, so nothing reads their ids.
 *
 * Must match `^[A-Za-z0-9_-]{1,64}$` (_classroom_normalize_rubric).
 */
export const DOC_CHECK_PRESENCE_ID = 'doc-check-presence';

/**
 * IDEA209H Unit 1's documentation rubric, 25 points across four criteria.
 *
 * Levels satisfy 0095's constraints (three or four, top = the maximum, bottom
 * = 0, strictly descending, every level labelled AND described) so the server
 * stores them as COMPLETE rather than flagging them unfinished.
 */
export const DOC_CHECK_CRITERIA: RubricCriterion[] = [
	{
		id: DOC_CHECK_PRESENCE_ID,
		criterion: 'Present for every lab and testing session',
		points: PRESENCE_POINTS,
		levels: [
			{
				points: PRESENCE_POINTS,
				label: 'Every session',
				descriptor: 'An entry for every scheduled check-in in this unit.'
			},
			{
				points: 5,
				label: 'Nearly all',
				descriptor: 'One or two check-ins have nothing filed against them.'
			},
			{
				points: 3,
				label: 'Some',
				descriptor: 'Roughly half the unit is documented.'
			},
			{
				points: 0,
				label: 'Absent',
				descriptor: 'Little or nothing was filed for this unit.'
			}
		]
	},
	{
		id: 'doc-check-raw-data',
		criterion: 'Raw data recorded in the moment, not reconstructed after',
		points: 6,
		levels: [
			{
				points: 6,
				label: 'In the moment',
				descriptor:
					'Measurements, readings and observations were written down as the work happened, with the rough edges that implies.'
			},
			{
				points: 3,
				label: 'Partly reconstructed',
				descriptor:
					'Some of it reads as written up afterwards -- tidy summaries where raw numbers should be.'
			},
			{
				points: 0,
				label: 'Reconstructed',
				descriptor: 'Written after the fact, or no raw data at all.'
			}
		]
	},
	{
		id: 'doc-check-legibility',
		criterion: 'Dated and legible',
		points: 6,
		levels: [
			{
				points: 6,
				label: 'Dated and clear',
				descriptor: 'Every entry carries its date and can be read without effort.'
			},
			{
				points: 3,
				label: 'Inconsistent',
				descriptor: 'Dates missing in places, or parts are hard to read.'
			},
			{
				points: 0,
				label: 'Neither',
				descriptor: 'Undated, or not legible.'
			}
		]
	},
	{
		id: 'doc-check-specificity',
		criterion: 'Enough specificity that another student could reconstruct the work',
		points: 6,
		levels: [
			{
				points: 6,
				label: 'Reproducible',
				descriptor:
					'Setup, values and decisions are specific enough that someone else could repeat it from the notebook alone.'
			},
			{
				points: 3,
				label: 'Partly',
				descriptor: 'The gist is there, but key details would have to be guessed at.'
			},
			{
				points: 0,
				label: 'Not reproducible',
				descriptor: 'Too vague to repeat the work from.'
			}
		]
	}
];

/** 25. Derived from the criteria, so editing one number cannot desync it. */
export const DOC_CHECK_TOTAL = DOC_CHECK_CRITERIA.reduce((sum, c) => sum + c.points, 0);

/**
 * The presence criterion of a rubric AS IT IS ON THE ITEM -- which may have
 * been edited, or may be an unrelated rubric a teacher pointed the unit at.
 * Null means "this rubric has no criterion the grid can answer", which is a
 * legitimate state: the other three are graded by hand as usual and nothing is
 * pre-filled.
 */
export function presenceCriterion(
	rubric: RubricCriterion[] | null | undefined
): RubricCriterion | null {
	return (rubric ?? []).find((c) => c.id === DOC_CHECK_PRESENCE_ID) ?? null;
}

/**
 * The presence score from the grid's own counts: sessions covered / total,
 * times the criterion's maximum, rounded.
 *
 * `summary.presenceScore` already IS that number at the rubric's default 7
 * (notebook-review.ts owns the counting); this rescales it only when a teacher
 * has changed the criterion's maximum, so the two can never disagree at the
 * default and the pre-fill still lands in range if they edit it.
 */
export function presenceScoreFor(summary: StudentSummary, max: number): number {
	if (max === PRESENCE_POINTS) return summary.presenceScore;
	if (summary.total === 0) return 0;
	return Math.round((summary.covered / summary.total) * max);
}

/**
 * The evidence line stored ALONGSIDE the presence score, as its criterion
 * comment. It does two jobs at once, which is why it is always attached:
 *
 *   1. It makes a low number explainable -- an excused session is NOT counted
 *      as covered (the grid's rule, unchanged), so "3 of 5 · 1 excused" is the
 *      difference between a student who missed two sessions and one who missed
 *      one and was excused for the other.
 *   2. It satisfies 0095's override rule for free. A computed score can land
 *      between the criterion's levels (4 of 7 is not one of 7/5/3/0), and an
 *      off-level score REQUIRES a comment explaining it. The derivation is
 *      exactly that explanation, so the instructor is never asked to justify
 *      arithmetic the grid did for them.
 */
export function presenceEvidence(summary: StudentSummary): string {
	const parts = [`${summary.covered} of ${summary.total} check-ins filed`];
	if (summary.excused > 0) {
		parts.push(`${summary.excused} excused (not counted as covered)`);
	}
	// A DENOMINATOR THAT SHRANK HAS TO SAY SO (0140). `summary.total` counts only
	// the check-ins that have come due, so a unit whose remaining days are
	// already scheduled grades out of the days that have happened -- which is the
	// right number and an inexplicable one if the comment does not name the rest.
	// It is the same job the excused clause above does, one state along.
	if (summary.scheduled > 0) {
		parts.push(`${summary.scheduled} not due yet (not counted either way)`);
	}
	if (summary.flagged > 0) {
		parts.push(`${summary.flagged} still flagged`);
	}
	return `From the notebook grid: ${parts.join(' · ')}.`;
}

/** "not dated x2 · illegible x1" -- the flag evidence for the judged criteria. */
export function flagEvidence(summary: StudentSummary): string[] {
	const labels: Record<string, string> = {
		not_dated: 'not dated',
		illegible: 'illegible',
		insufficient_detail: 'not specific enough',
		appears_reconstructed: 'appears reconstructed',
		other: 'other'
	};
	return Object.entries(summary.flags)
		.filter(([, n]) => n > 0)
		.map(([reason, n]) => `${labels[reason] ?? reason} x${n}`);
}

// ---------------------------------------------------------------------------
// The link, and what the grading view is handed
// ---------------------------------------------------------------------------

/** A `notebook_unit_items` row (0097). */
export interface UnitItemLink {
	section_id: string;
	unit_number: number;
	item_id: string;
}

/** An assignment this section could be graded on: what the picker offers. */
export interface LinkableItem {
	id: string;
	title: string;
	points: number | null;
}

/**
 * Everything the Documentation Check panel needs for one (section, unit),
 * loaded in one go. `link` null is the ordinary unlinked state.
 */
export interface DocCheckData {
	link: UnitItemLink | null;
	item: LinkableItem | null;
	rubric: RubricCriterion[] | null;
	/** Existing grades on the linked item, keyed by lowercased student email. */
	submissions: Record<string, DocCheckSubmission>;
	/** Assignments posted to this section, for the picker. */
	candidates: LinkableItem[];
}

export interface DocCheckSubmission {
	student_email: string;
	state: 'draft' | 'submitted' | 'returned';
	score: number | null;
	rubric_scores: Record<string, number> | null;
	criterion_comments: Record<string, string> | null;
	teacher_comment: string | null;
	graded_at: string | null;
	returned_at: string | null;
}

/**
 * Every server call the panel makes, injected the way ReviewTransports is, so
 * the dev harness answers them in memory and each real RPC call has exactly
 * one named home. `gradeSubmission` deliberately mirrors the CLASSROOM
 * transport's signature -- it is the same RPC, called from a different screen.
 */
export interface DocCheckTransports {
	load: (sectionId: string, unitNumber: number) => Promise<DocCheckResult<DocCheckData>>;
	linkItem: (
		sectionId: string,
		unitNumber: number,
		itemId: string
	) => Promise<DocCheckResult<undefined>>;
	unlinkItem: (sectionId: string, unitNumber: number) => Promise<DocCheckResult<undefined>>;
	installRubric: (
		itemId: string,
		criteria: RubricCriterion[]
	) => Promise<DocCheckResult<undefined>>;
	gradeSubmission: (
		itemId: string,
		studentEmail: string,
		scores: Record<string, number>,
		comment: string | null,
		release: boolean,
		criterionComments: Record<string, string>
	) => Promise<DocCheckResult<GradeOutcome>>;
}

/** What classroom_grade_submission answers with, verbatim. */
export type GradeOutcome =
	| { ok: true; score: number; state: string }
	| { ok: false; reason: string; missing?: string[] };

export type DocCheckResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A student on the grid who can actually be graded. The roster is email-keyed
 * (0094) but a student who holds entries without an active enrollment can have
 * no email at all, and classroom_grade_submission takes an email -- so those
 * rows are surfaced as ungradeable rather than silently dropped.
 */
export function gradableEmail(summary: StudentSummary): string | null {
	const email = summary.student.email?.trim().toLowerCase();
	return email && email.includes('@') ? email : null;
}
