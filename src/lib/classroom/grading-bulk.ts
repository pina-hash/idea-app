// src/lib/classroom/grading-bulk.ts
//
// GRADING AT SCALE: the arithmetic and the vocabulary for grading many students
// at once, and for grading one assignment across every class it is posted to.
//
// WHY IT IS A MODULE AND NOT PART OF THE CONSOLE. Everything here is a pure
// function over plain data, so the plan an instructor is shown before they
// commit and the payload that is actually sent are the SAME OBJECT rather than
// two derivations of one intention -- which is the shape in which a preview
// quietly stops describing the write. The console renders it; the dev harness
// asserts it; the browser pass reads it off the screen. There is one of it.
//
// WHAT IT IS NOT. It does not decide who may grade whom. That question is
// `classroom_can_review_submission`, asked inside `classroom_grade_submission`
// on every single row, and this module cannot widen it: a section that turns up
// here that the caller does not manage produces a refusal per student with the
// database's own sentence, not a grade. What the grouping below is for is
// keeping the instructor from grading the WRONG section's student by accident,
// which is a different failure and an entirely silent one.

import {
	criterionMax,
	isOverrideScore,
	rubricTotal,
	scoresTotal,
	type RubricCriterion,
	type StudentWork
} from '$lib/classroom/assignment-spec';
import type { GradingData } from '$lib/classroom/assignment-spec';
import {
	sectionTitle,
	sortSections,
	type ClassroomEnrollment,
	type ClassroomSection,
	type TxResult
} from '$lib/classroom/classroom';

// ---------------------------------------------------------------------------
// 1. The transport. ABSENCE IS THE MECHANISM.
// ---------------------------------------------------------------------------

/**
 * The cross-section, many-student capability, handed to `GradingConsole` as ONE
 * optional prop.
 *
 * OMITTING IT REMOVES THE WHOLE SURFACE -- the checkboxes, the batch bar, the
 * section grouping and the cross-section load -- down through the component, so
 * the per-section console at `/classroom/<section>/item/<item>/grade` is
 * structurally the console it has always been rather than the same console with
 * a flag turned off. A read-only or single-section mode that had to be
 * remembered is the shape this avoids.
 *
 * IT IS ITS OWN OBJECT rather than three more methods on
 * `AssignmentTeacherTransports` because the two are handed out at different
 * times: every grading surface has the teacher transports, and only the
 * cross-class route has this.
 */
export interface BulkGradingTransports {
	/**
	 * The item's work across EVERY section the caller manages that it is posted
	 * to, plus those sections themselves.
	 *
	 * ONE CALL, because the sections and the roster have to agree: a section in
	 * the list with no roster rows behind it is a class name shown to somebody
	 * who cannot see into it, and two independent reads are how that comes
	 * about.
	 */
	loadAcross(itemId: string): Promise<TxResult<BulkGradingLoad>>;
	/**
	 * One statement, one transaction, one line per student
	 * (`classroom_grade_submissions`, 0175).
	 */
	gradeMany(
		itemId: string,
		grades: BulkGrade[],
		release: boolean
	): Promise<TxResult<BulkGradeReport>>;
}

export interface BulkGradingLoad {
	/** Ordered by course code then label. Never a section the caller cannot manage. */
	sections: ClassroomSection[];
	data: GradingData;
}

/** One student's entry in a batch. Exactly the jsonb 0175 reads. */
export interface BulkGrade {
	student_email: string;
	scores: Record<string, number>;
	comment?: string | null;
	criterion_comments?: Record<string, string>;
	/**
	 * ABSENT means "leave whatever is stored alone" and 0 means "take the award
	 * back" -- 0171's contract, and the reason this is optional rather than
	 * nullable-with-a-default. A batch that always sent a number would erase
	 * every award on every student it did not mention.
	 */
	extra_credit?: number;
}

/** One line of the database's own report. */
export interface BulkGradeRow {
	email: string;
	ok: boolean;
	/** `override_needs_comment`, `incomplete_scores`, or `error`. */
	reason?: string;
	message?: string;
	missing?: string[];
	score?: number;
	state?: string;
	extra_credit?: number | null;
}

export interface BulkGradeReport {
	ok: boolean;
	total: number;
	succeeded: number;
	refused: number;
	results: BulkGradeRow[];
}

// ---------------------------------------------------------------------------
// 2. SECTION IDENTITY. The failure mode is grading the wrong class's student,
//    and it is silent, so the section travels with every row.
// ---------------------------------------------------------------------------

/**
 * Which section each student is on, from the ROSTER and never from the work.
 *
 * The roster is the only thing that knows: `classroom_submissions` is keyed
 * `(item_id, student_email)` and carries no section at all, because the
 * assignment is one canonical row posted to N classes. So a response set with
 * no enrollment behind it has no section, and inventing one -- from the
 * posting list, from the address, from anything -- would put a student in a
 * class on the strength of a guess.
 *
 * FIRST ROW WINS on a duplicate, deliberately: a student legitimately enrolled
 * in two sections of the same course would otherwise flip between two labels
 * across two page loads. `classroom_section_roster` orders by display name and
 * then address, so "first" is stable rather than incidental.
 */
export function sectionOfStudent(roster: ClassroomEnrollment[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const e of roster) {
		if (!out.has(e.student_email)) out.set(e.student_email, e.section_id);
	}
	return out;
}

/** One row of `classroom_postings`, with its section embedded. */
export interface PostedSection {
	section_id: string;
	section: ClassroomSection | null;
}

/**
 * WHICH CLASSES OF THIS ASSIGNMENT THE CALLER MAY GRADE. The intersection of
 * what the item is POSTED to and what the caller MANAGES, in the app's own
 * section order.
 *
 * BOTH HALVES ARE LOAD-BEARING AND THE MANAGED HALF IS THE ONE THAT MATTERS.
 * The postings policy (0109) admits a section the caller is merely ENROLLED in,
 * because a student has to be able to see that their assignment is posted. So
 * postings alone would list a class somebody else teaches: every grade in it
 * would be refused by `classroom_can_review_submission`, but the class would be
 * NAMED on screen, which is a disclosure rather than a grading bug. The managed
 * set comes from `classroom_section_roster(null)`, which gates on
 * `classroom_manages_section` inside its own SECURITY DEFINER body -- so a
 * section appears here only because the database said so.
 *
 * IT IS ONE IMPLEMENTATION WITH THREE CALLERS: the page load that decides
 * whether to render at all, the transport that fills the console, and the dev
 * harness. A copy of this clause in any of them is a copy that can stop
 * agreeing about who may see which class.
 */
export function managedPostedSections(
	postings: PostedSection[],
	managedSectionIds: Iterable<string>
): ClassroomSection[] {
	const managed = new Set(managedSectionIds);
	const seen = new Set<string>();
	const out: ClassroomSection[] = [];
	for (const row of postings) {
		const id = row.section_id;
		if (!id || !managed.has(id) || seen.has(id) || !row.section) continue;
		seen.add(id);
		out.push(row.section);
	}
	return sortSections(out);
}

export interface SectionGroup {
	section: ClassroomSection;
	/** Its own name, resolved once. `sectionTitle` is the one spelling. */
	title: string;
	students: StudentWork[];
}

/**
 * The roster split into its classes, in the order the rest of the app lists
 * sections in (`sortSections`: course code, then a numeric-aware label, so
 * Period 2 comes before Period 10).
 *
 * A SECTION WITH NO STUDENTS IS STILL A GROUP. An empty class is a real state
 * -- a roster import that has not run, a block that has not started -- and
 * dropping it would make "this assignment is in three of my classes" read as
 * two, which is the kind of quiet miscount that sends somebody looking for work
 * that was never assigned.
 *
 * A STUDENT WITH NO SECTION IS RETURNED SEPARATELY, never filed under the first
 * group. `studentWorkRows` has already dropped work belonging to nobody on any
 * roster; what can still land here is a row the roster read could not place,
 * and putting it in a class it may not be in is exactly the mistake the
 * grouping exists to prevent.
 */
export function groupBySection(
	students: StudentWork[],
	sections: ClassroomSection[],
	sectionOf: Map<string, string>
): { groups: SectionGroup[]; unplaced: StudentWork[] } {
	const groups = sortSections(sections).map((section) => ({
		section,
		title: sectionTitle(section),
		students: [] as StudentWork[]
	}));
	const byId = new Map(groups.map((g) => [g.section.id, g]));
	const unplaced: StudentWork[] = [];
	for (const s of students) {
		const id = sectionOf.get(s.email);
		const group = id ? byId.get(id) : undefined;
		if (group) group.students.push(s);
		else unplaced.push(s);
	}
	return { groups, unplaced };
}

// ---------------------------------------------------------------------------
// 3. THE PLAN. What is about to be written, before anything is.
// ---------------------------------------------------------------------------

/** Why a student in the selection will not be written. */
export type BulkSkipReason = 'no-rubric' | 'nothing-scored';

/** Why the batch as a whole cannot be committed yet. */
export interface BulkProblem {
	/** Empty for a problem about the batch rather than about one student. */
	email: string;
	label: string;
	message: string;
}

export interface BulkPlanRow {
	email: string;
	displayName: string;
	sectionTitle: string;
	/** The rubric sum for this student under the scores being applied. */
	rubricPoints: number;
	/** Points beyond the rubric, or null where none is being set. */
	extraCredit: number | null;
	/** What `score` will end up as: the rubric sum plus the award. */
	awarded: number;
	/** What the row scored before this batch, or null if it was never graded. */
	previous: number | null;
	/** Would this write replace a grade the student has already been shown? */
	regrade: boolean;
}

export interface BulkPlan {
	rows: BulkPlanRow[];
	/** Students in the selection this batch will NOT write, and why. */
	skipped: { email: string; displayName: string; reason: BulkSkipReason }[];
	/** Refusals this surface makes before a round trip. Empty means committable. */
	problems: BulkProblem[];
	/** The rubric's own maximum, so the plan can print "n / out of". */
	outOf: number;
	/** The exact payload for `gradeMany`, in the same order as `rows`. */
	grades: BulkGrade[];
}

export interface BulkPlanInput {
	/** Everyone the instructor ticked, in the order they are listed. */
	selected: StudentWork[];
	rubric: RubricCriterion[] | null;
	/** The scores being applied to all of them, keyed by criterion id. */
	scores: Record<string, number | null>;
	/** Per-criterion notes, applied to all of them. */
	criterionComments: Record<string, string>;
	/** The shared private comment, or empty for none. */
	comment: string;
	/** As TYPED, so "" is "award nothing" and a malformed value is visible. */
	extraCredit: string;
	/** False where the payload cannot carry an award at all (pre-0171). */
	extraCreditReady: boolean;
	sectionOf: Map<string, string>;
	sectionTitles: Map<string, string>;
	/** Whether the commit will RETURN the grades to students. */
	release: boolean;
}

/** The typed award as a number, or null for blank. NaN survives as NaN. */
function awardOf(typed: string, ready: boolean): number | null {
	if (!ready) return null;
	const t = typed.trim();
	if (!t) return 0;
	return Number(t);
}

/**
 * THE ONE DERIVATION of what a bulk commit will do.
 *
 * It is the preview AND the payload, which is the whole reason it returns both:
 * a plan table built from one function and a request built from another is two
 * statements of one intention, and the pair is what lets a surface show an
 * instructor a total it is not about to write.
 *
 * IT MIRRORS THE SERVER'S REFUSALS AND DOES NOT REPLACE THEM. Every problem
 * listed here is one `classroom_grade_submission` would also refuse; saying it
 * on screen saves a round trip and a mid-batch surprise, and the database is
 * still the boundary. The reverse -- a check here that the server does not make
 * -- is the thing to resist: it would be a rule with one implementation on the
 * client, where anyone can route around it.
 */
export function bulkPlan(input: BulkPlanInput): BulkPlan {
	const rubric = input.rubric ?? [];
	const outOf = rubric.length ? rubricTotal(rubric) : 0;
	const rows: BulkPlanRow[] = [];
	const grades: BulkGrade[] = [];
	const skipped: BulkPlan['skipped'] = [];
	const problems: BulkProblem[] = [];

	if (!rubric.length) {
		problems.push({
			email: '',
			label: 'No rubric',
			message:
				'This assignment has no rubric, so there is nothing to score against. Add one on the assignment before grading.'
		});
	}

	// The scores actually being applied: a criterion left blank is not sent,
	// which is what makes a partial pass ("everybody got full marks on this one
	// criterion") a legitimate draft rather than a refusal.
	const applied: Record<string, number> = {};
	for (const c of rubric) {
		const v = input.scores[c.id];
		if (v != null && !Number.isNaN(Number(v))) applied[c.id] = Number(v);
	}
	const notes: Record<string, string> = {};
	for (const c of rubric) {
		const note = (input.criterionComments[c.id] ?? '').trim();
		if (note) notes[c.id] = note;
	}

	// AN OVERRIDE NEEDS A COMMENT, and in a batch it needs one before the
	// commit rather than after: the server refuses every row for the same
	// reason, so thirty identical refusals is thirty copies of one sentence.
	const uncommented = rubric.filter(
		(c) => isOverrideScore(c, input.scores[c.id]) && !notes[c.id]
	);
	for (const c of uncommented) {
		problems.push({
			email: '',
			label: c.criterion,
			message: `Say why you scored ${input.scores[c.id]} of ${criterionMax(c)} on "${c.criterion}" rather than picking a level. Every student in this batch gets the same note.`
		});
	}

	// RELEASING NEEDS EVERY CRITERION, exactly as the single-student path does.
	if (input.release && rubric.length) {
		const missing = rubric.filter((c) => applied[c.id] == null);
		if (missing.length) {
			problems.push({
				email: '',
				label: 'Not every criterion is scored',
				message: `Score every criterion before returning these to students (${missing.length} left: ${missing.map((c) => c.criterion).join(', ')}). Save them as drafts instead if you are not finished.`
			});
		}
	}

	const award = awardOf(input.extraCredit, input.extraCreditReady);
	const awardInvalid = award != null && (Number.isNaN(award) || award < 0);
	if (awardInvalid) {
		problems.push({
			email: '',
			label: 'Extra credit',
			message: 'Extra credit must be a number of 0 or more. Leave it blank to award none.'
		});
	}

	const rubricPoints = scoresTotal(rubric, applied);
	const extra = awardInvalid || award == null ? null : award;

	for (const s of input.selected) {
		if (!rubric.length) {
			skipped.push({ email: s.email, displayName: s.displayName, reason: 'no-rubric' });
			continue;
		}
		if (!Object.keys(applied).length) {
			// NOTHING TO WRITE IS NOT A WRITE. A batch of empty scores would
			// blank every selected student's rubric and stamp `graded_at` over
			// the top, which is a destructive act wearing the clothes of a
			// no-op.
			skipped.push({ email: s.email, displayName: s.displayName, reason: 'nothing-scored' });
			continue;
		}
		const previous = s.submission?.graded_at ? (s.submission.score ?? null) : null;
		rows.push({
			email: s.email,
			displayName: s.displayName,
			sectionTitle: input.sectionTitles.get(input.sectionOf.get(s.email) ?? '') ?? '',
			rubricPoints,
			extraCredit: extra,
			awarded: rubricPoints + (extra ?? 0),
			previous,
			regrade: !!s.submission?.graded_at
		});
		const grade: BulkGrade = { student_email: s.email, scores: { ...applied } };
		if (input.comment.trim()) grade.comment = input.comment.trim();
		if (Object.keys(notes).length) grade.criterion_comments = { ...notes };
		// OMITTED, never null, where the payload cannot carry an award: the key
		// being absent is what tells 0175 to leave the stored one alone, and a
		// client that has not been told the column exists must not be able to
		// erase an award by grading again.
		if (extra != null) grade.extra_credit = extra;
		grades.push(grade);
	}

	return { rows, skipped, problems, outOf, grades };
}

/** Can this batch be sent? One predicate, read by the control AND the handler. */
export function bulkCanSend(plan: BulkPlan): boolean {
	return plan.problems.length === 0 && plan.grades.length > 0;
}

// ---------------------------------------------------------------------------
// 4. THE OUTCOME. Per student, by name, always.
// ---------------------------------------------------------------------------

export interface BulkOutcomeRow extends BulkGradeRow {
	displayName: string;
	sectionTitle: string;
	/** The sentence to show beside the name. Never "something went wrong". */
	sentence: string;
}

export interface BulkOutcome {
	total: number;
	succeeded: number;
	refused: number;
	/** Refusals FIRST: what needs doing next is what should be read first. */
	rows: BulkOutcomeRow[];
	/** The one-line summary above the list. */
	headline: string;
	released: boolean;
}

/**
 * THE REFUSAL SENTENCES, in one place, keyed on the database's own `reason`.
 *
 * The structured ones are rewritten because the reason code is not a sentence;
 * an `error` carries the server's own `message` VERBATIM, because that message
 * is the single-student console's message too and a bulk surface that re-toned
 * it would give an instructor two different accounts of one refusal.
 */
export function bulkRefusalSentence(row: BulkGradeRow): string {
	if (row.ok) return '';
	const missing = row.missing ?? [];
	if (row.reason === 'override_needs_comment') {
		return missing.length === 1
			? 'Not graded: one criterion was scored between levels with no note saying why.'
			: `Not graded: ${missing.length} criteria were scored between levels with no note saying why.`;
	}
	if (row.reason === 'incomplete_scores') {
		return `Not graded: ${missing.length} ${missing.length === 1 ? 'criterion is' : 'criteria are'} unscored, and a grade cannot be returned unfinished.`;
	}
	const message = (row.message ?? '').trim();
	return message ? `Not graded: ${message}` : 'Not graded, and the server gave no reason.';
}

/**
 * The report, joined back to names and classes.
 *
 * IT NEVER COLLAPSES TO A COUNT. "27 of 30 saved" tells an instructor to go
 * hunting; the three names tell them what to do. And a refused row keeps its
 * SECTION, because the likeliest reason a row is refused on a cross-class
 * surface is that it belongs to a class somebody else teaches.
 */
export function bulkOutcome(
	report: BulkGradeReport,
	students: StudentWork[],
	sectionOf: Map<string, string>,
	sectionTitles: Map<string, string>,
	released: boolean
): BulkOutcome {
	const names = new Map(students.map((s) => [s.email, s.displayName]));
	const rows: BulkOutcomeRow[] = (report.results ?? []).map((r) => ({
		...r,
		displayName: names.get(r.email) ?? r.email,
		sectionTitle: sectionTitles.get(sectionOf.get(r.email) ?? '') ?? '',
		sentence: r.ok
			? released
				? 'Returned.'
				: 'Draft saved.'
			: bulkRefusalSentence(r)
	}));
	rows.sort((a, b) => {
		if (a.ok !== b.ok) return a.ok ? 1 : -1;
		return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
	});
	const verb = released ? 'returned' : 'saved as drafts';
	const headline =
		report.refused === 0
			? `${report.succeeded} of ${report.total} ${verb}.`
			: `${report.succeeded} of ${report.total} ${verb}. ${report.refused} not graded, named below.`;
	return {
		total: report.total,
		succeeded: report.succeeded,
		refused: report.refused,
		rows,
		headline,
		released
	};
}

// ---------------------------------------------------------------------------
// 5. SELECTION. Picking a group is the point; picking thirty names is not.
// ---------------------------------------------------------------------------

/**
 * The named selections, and they are DERIVED rather than stored: each one is a
 * question about the rows on screen right now, so a selection cannot describe a
 * class as it was before the last save.
 *
 * `ungraded` is the one an instructor reaches for after a partial pass, and it
 * is why the list is not just "all" and "none".
 */
export type BulkPreset = 'all' | 'none' | 'submitted' | 'ungraded';

export const BULK_PRESET_LABEL: Record<BulkPreset, string> = {
	all: 'Everyone shown',
	none: 'Nobody',
	submitted: 'Handed in',
	ungraded: 'Not graded yet'
};

export function applyPreset(preset: BulkPreset, students: StudentWork[]): string[] {
	switch (preset) {
		case 'all':
			return students.map((s) => s.email);
		case 'none':
			return [];
		case 'submitted':
			return students
				.filter((s) => s.submission?.state === 'submitted' || s.submission?.state === 'returned')
				.map((s) => s.email);
		case 'ungraded':
			return students.filter((s) => !s.submission?.graded_at).map((s) => s.email);
	}
}

/**
 * The count sentence beside the batch bar. Says the SECTIONS as well as the
 * number whenever more than one is involved: "12 students" on a surface holding
 * three classes is the sentence that lets somebody grade Period 2 believing
 * they are grading Period 1.
 */
export function selectionSummary(
	selected: StudentWork[],
	sectionOf: Map<string, string>,
	sectionTitles: Map<string, string>
): string {
	if (!selected.length) return 'Nobody selected.';
	const titles = new Set<string>();
	for (const s of selected) {
		const t = sectionTitles.get(sectionOf.get(s.email) ?? '');
		if (t) titles.add(t);
	}
	const who = `${selected.length} student${selected.length === 1 ? '' : 's'}`;
	const list = [...titles].sort();
	if (list.length === 0) return `${who} selected.`;
	if (list.length === 1) return `${who} selected, all in ${list[0]}.`;
	return `${who} selected, across ${list.length} classes: ${list.join(', ')}.`;
}
