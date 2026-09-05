// tests/classroom-grading-bulk.test.ts
//
// THE PURE HALF OF GRADING AT SCALE: what a batch is about to write, and what
// it reports afterwards.
//
// WHY THIS IS AUTOMATED when feature correctness normally belongs in a harness.
// Three of the guarantees here fail SILENTLY and produce a plausible screen
// either way:
//   * THE PLAN IS THE PAYLOAD. `bulkPlan` returns the preview table AND the
//     request body from one call precisely so a surface cannot show a total it
//     is not about to write. Nothing on screen would report the two coming
//     apart -- the table would still be a table.
//   * AN OMITTED `extra_credit` KEY IS THE ONLY THING THAT LEAVES A STORED
//     AWARD ALONE (0171). Sending `null`, or `0`, or the key with `undefined`
//     in it, each erases an award; the grade still lands, the student's score is
//     just quietly lower.
//   * A REFUSAL THAT STOPPED BEING REPORTED reads, from the console, as a grade
//     that saved. That is the assertion most likely to go vacuous, so it is
//     asserted from both ends and mutated in both directions.
//
// The expected values here come from the RUBRIC, never from the functions under
// test: a criterion's maximum is its top level's points, so a two-criterion
// rubric of 10 and 10 is out of 20 and that number is written down here rather
// than read back out of `rubricTotal`.

import { describe, expect, test } from 'vitest';
import {
	BULK_PRESET_LABEL,
	applyPreset,
	bulkCanSend,
	bulkOutcome,
	bulkPlan,
	bulkRefusalSentence,
	groupBySection,
	managedPostedSections,
	sectionOfStudent,
	selectionSummary,
	type BulkGradeReport,
	type BulkPlanInput,
	type PostedSection
} from '../src/lib/classroom/grading-bulk';
import type { RubricCriterion, StudentWork } from '../src/lib/classroom/assignment-spec';
import type { ClassroomEnrollment, ClassroomSection } from '../src/lib/classroom/classroom';

const P1 = 's-p1';
const P2 = 's-p2';
const P4 = 's-p4';

function section(id: string, label: string, block: string): ClassroomSection {
	return {
		id,
		course_id: 'c-1',
		label,
		block,
		teacher_email: 'tvargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA100', title: 'Engineering I Honors', active: true }
	};
}
const SEC1 = section(P1, 'Period 1', '1');
const SEC2 = section(P2, 'Period 2', '2');
const SEC4 = section(P4, 'Period 4', '4');

const TITLES = new Map([
	[P1, 'IDEA100 · Period 1'],
	[P2, 'IDEA100 · Period 2']
]);

/** Two criteria, levels 10 / 5 / 0 each. Out of 20, and 7 is an override. */
const RUBRIC: RubricCriterion[] = [
	{
		id: 'c1',
		criterion: 'Sketch quality',
		// `points` is the criterion's declared maximum; `criterionMax` prefers the
		// top LEVEL, so these agree and the rubric totals 20 either way.
		points: 10,
		levels: [
			{ points: 10, label: 'Complete', descriptor: 'All three views.' },
			{ points: 5, label: 'Developing', descriptor: 'Proportion off.' },
			{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
		]
	},
	{
		id: 'c2',
		criterion: 'Reflection',
		points: 10,
		levels: [
			{ points: 10, label: 'Complete', descriptor: 'Specific.' },
			{ points: 5, label: 'Developing', descriptor: 'General.' },
			{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
		]
	}
];

function student(
	email: string,
	displayName: string,
	over: Partial<StudentWork['submission']> | null = null
): StudentWork {
	return {
		email,
		displayName,
		active: true,
		submission: over
			? ({
					id: `sub-${email}`,
					item_id: 'i-1',
					student_email: email,
					state: 'submitted',
					submitted_at: '2026-09-01T10:00:00.000Z',
					returned_at: null,
					rubric_scores: null,
					criterion_comments: null,
					score: null,
					extra_credit: null,
					teacher_comment: null,
					graded_by: null,
					graded_at: null,
					...over
				} as StudentWork['submission'])
			: null,
		responses: [],
		files: [],
		approvals: []
	};
}

const ALICE = student('alice@boscotech.net', 'Alice Alvarez', { state: 'submitted' });
const BEN = student('ben@boscotech.net', 'Ben Okafor', {
	state: 'returned',
	graded_at: '2026-09-01T12:00:00.000Z',
	score: 15,
	rubric_scores: { c1: 10, c2: 5 }
});
const CARLA = student('carla@boscotech.net', 'Carla Cardenas', { state: 'submitted' });
const DARA = student('dara@boscotech.net', 'Dara Nwosu');
const ELI = student('eli@boscotech.net', 'Eli Ramos', { state: 'submitted' });

const SECTION_OF = new Map([
	[ALICE.email, P1],
	[BEN.email, P1],
	[CARLA.email, P1],
	[DARA.email, P1],
	[ELI.email, P2]
]);

function planInput(over: Partial<BulkPlanInput> = {}): BulkPlanInput {
	return {
		selected: [ALICE, BEN, ELI],
		rubric: RUBRIC,
		scores: { c1: 10, c2: 5 },
		criterionComments: {},
		comment: '',
		extraCredit: '',
		extraCreditReady: true,
		sectionOf: SECTION_OF,
		sectionTitles: TITLES,
		release: false,
		...over
	};
}

// ---------------------------------------------------------------------------
// 1. THE PLAN IS THE PAYLOAD.
// ---------------------------------------------------------------------------

describe('bulkPlan: what is on screen is what will be sent', () => {
	test('one row and one grade per selected student, in the same order', () => {
		const plan = bulkPlan(planInput());
		expect(plan.rows.map((r) => r.email)).toEqual([ALICE.email, BEN.email, ELI.email]);
		expect(plan.grades.map((g) => g.student_email)).toEqual(plan.rows.map((r) => r.email));
		expect(plan.outOf).toBe(20);
	});

	test('the score the table shows is the score the payload produces', () => {
		const plan = bulkPlan(planInput());
		for (const row of plan.rows) {
			expect(row.rubricPoints).toBe(15);
			expect(row.awarded).toBe(15);
		}
		// 10 + 5 out of the rubric, written down from the rubric rather than read
		// back out of the function that computes it.
		for (const g of plan.grades) expect(g.scores).toEqual({ c1: 10, c2: 5 });
	});

	test('a blank criterion is simply not sent, so a partial pass is a legal draft', () => {
		const plan = bulkPlan(planInput({ scores: { c1: 10, c2: null } }));
		expect(plan.grades[0].scores).toEqual({ c1: 10 });
		expect(plan.rows[0].awarded).toBe(10);
		expect(plan.problems).toEqual([]);
		expect(bulkCanSend(plan)).toBe(true);
	});

	test('the previous score and the regrade flag come from the row, not the batch', () => {
		const plan = bulkPlan(planInput());
		const byEmail = new Map(plan.rows.map((r) => [r.email, r]));
		expect(byEmail.get(BEN.email)!.previous).toBe(15);
		expect(byEmail.get(BEN.email)!.regrade).toBe(true);
		// Never graded: there is no previous score, and `null` is not `0`.
		expect(byEmail.get(ALICE.email)!.previous).toBeNull();
		expect(byEmail.get(ALICE.email)!.regrade).toBe(false);
	});

	test('every row carries the class the grade will land in', () => {
		const plan = bulkPlan(planInput());
		expect(plan.rows.map((r) => r.sectionTitle)).toEqual([
			'IDEA100 · Period 1',
			'IDEA100 · Period 1',
			'IDEA100 · Period 2'
		]);
	});

	test('a shared comment and per-criterion notes reach every grade', () => {
		const plan = bulkPlan(
			planInput({ comment: '  See me.  ', criterionComments: { c1: '  Rushed.  ', c2: '   ' } })
		);
		for (const g of plan.grades) {
			expect(g.comment).toBe('See me.');
			// Trimmed, and an empty note is absent rather than an empty string.
			expect(g.criterion_comments).toEqual({ c1: 'Rushed.' });
		}
	});
});

// ---------------------------------------------------------------------------
// 2. EXTRA CREDIT. Absent is not null is not zero.
// ---------------------------------------------------------------------------

describe('extra credit through a batch follows 0171 exactly', () => {
	test('blank sends 0, which is how an award is taken back', () => {
		const plan = bulkPlan(planInput({ extraCredit: '' }));
		expect(plan.grades[0].extra_credit).toBe(0);
		expect(plan.rows[0].awarded).toBe(15);
	});

	test('a number is summed into the awarded total exactly once', () => {
		const plan = bulkPlan(planInput({ extraCredit: '3' }));
		expect(plan.grades[0].extra_credit).toBe(3);
		expect(plan.rows[0].rubricPoints).toBe(15);
		expect(plan.rows[0].extraCredit).toBe(3);
		expect(plan.rows[0].awarded).toBe(18);
	});

	test('a payload that cannot carry an award OMITS THE KEY, never sends null', () => {
		const plan = bulkPlan(planInput({ extraCreditReady: false, extraCredit: '4' }));
		// The key's ABSENCE is what tells the RPC to leave a stored award alone.
		// `null`, `0` and `undefined` in the key would each erase one.
		for (const g of plan.grades) expect('extra_credit' in g).toBe(false);
		for (const r of plan.rows) expect(r.extraCredit).toBeNull();
		expect(plan.rows[0].awarded).toBe(15);
	});

	test('a negative award is refused before a round trip, and refuses the batch', () => {
		const plan = bulkPlan(planInput({ extraCredit: '-2' }));
		expect(plan.problems.map((p) => p.label)).toContain('Extra credit');
		expect(plan.problems[0].message).toContain('0 or more');
		expect(bulkCanSend(plan)).toBe(false);
		// And nothing carries the bad number.
		for (const r of plan.rows) expect(r.extraCredit).toBeNull();
	});

	test('a malformed award is refused the same way', () => {
		const plan = bulkPlan(planInput({ extraCredit: 'three' }));
		expect(bulkCanSend(plan)).toBe(false);
		expect(plan.problems.some((p) => p.label === 'Extra credit')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. THE REFUSALS THIS SURFACE MAKES BEFORE A ROUND TRIP.
// ---------------------------------------------------------------------------

describe('a batch that the server would refuse is refused here first', () => {
	test('an off-level score with no note refuses, naming the criterion', () => {
		// 7 is between the 10 and 5 levels, so the database requires a note.
		const plan = bulkPlan(planInput({ scores: { c1: 7, c2: 10 } }));
		expect(bulkCanSend(plan)).toBe(false);
		expect(plan.problems.map((p) => p.label)).toEqual(['Sketch quality']);
		expect(plan.problems[0].message).toContain('7 of 10');
	});

	test('and the same score WITH a note is committable', () => {
		const plan = bulkPlan(
			planInput({ scores: { c1: 7, c2: 10 }, criterionComments: { c1: 'Third view rushed.' } })
		);
		expect(plan.problems).toEqual([]);
		expect(bulkCanSend(plan)).toBe(true);
		expect(plan.rows[0].awarded).toBe(17);
	});

	test('releasing with a criterion unscored refuses, and saving a draft does not', () => {
		const scores = { c1: 10, c2: null };
		const asDraft = bulkPlan(planInput({ scores, release: false }));
		const asRelease = bulkPlan(planInput({ scores, release: true }));
		expect(bulkCanSend(asDraft)).toBe(true);
		expect(bulkCanSend(asRelease)).toBe(false);
		expect(asRelease.problems[0].message).toContain('Reflection');
	});

	test('no rubric refuses the batch and skips every student', () => {
		const plan = bulkPlan(planInput({ rubric: null }));
		expect(bulkCanSend(plan)).toBe(false);
		expect(plan.rows).toEqual([]);
		expect(plan.grades).toEqual([]);
		expect(plan.skipped.map((s) => s.reason)).toEqual(['no-rubric', 'no-rubric', 'no-rubric']);
	});

	test('an empty rubric pass writes NOTHING rather than blanking three students', () => {
		// A batch of empty scores would clear every selected rubric and stamp
		// `graded_at` over the top, which is a destructive act wearing the clothes
		// of a no-op.
		const plan = bulkPlan(planInput({ scores: { c1: null, c2: null } }));
		expect(plan.grades).toEqual([]);
		expect(plan.rows).toEqual([]);
		expect(plan.skipped.map((s) => s.reason)).toEqual([
			'nothing-scored',
			'nothing-scored',
			'nothing-scored'
		]);
		expect(bulkCanSend(plan)).toBe(false);
	});

	test('an empty selection is not committable, however clean the rubric is', () => {
		const plan = bulkPlan(planInput({ selected: [] }));
		expect(plan.problems).toEqual([]);
		expect(bulkCanSend(plan)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 4. THE OUTCOME. Per student, by name, refusals first.
// ---------------------------------------------------------------------------

const REPORT: BulkGradeReport = {
	ok: true,
	total: 4,
	succeeded: 2,
	refused: 2,
	results: [
		{ email: ALICE.email, ok: true, score: 15, state: 'returned' },
		{ email: BEN.email, ok: false, reason: 'incomplete_scores', missing: ['c2'] },
		{ email: CARLA.email, ok: true, score: 15, state: 'returned' },
		{
			email: ELI.email,
			ok: false,
			reason: 'error',
			message: "Only a teacher of record for this student's class can grade this."
		}
	]
};

describe('bulkOutcome: a refusal is never a count', () => {
	const outcome = bulkOutcome(
		REPORT,
		[ALICE, BEN, CARLA, ELI],
		SECTION_OF,
		TITLES,
		true
	);

	test('the refused rows sort first, then the rest by name', () => {
		expect(outcome.rows.map((r) => r.displayName)).toEqual([
			'Ben Okafor',
			'Eli Ramos',
			'Alice Alvarez',
			'Carla Cardenas'
		]);
	});

	/*
		THE ROW THAT WAS VACUOUS. This suite originally asserted the ORDER of the
		outcome rows and the wording of `bulkRefusalSentence` separately, and never
		that `bulkOutcome` calls the second. Mutating the sentence to read
		"Returned." on every row -- the exact silent half-success this feature
		exists to prevent -- left all 47 assertions green. These two are what bite.
	*/
	test('a refused row SAYS it was not graded, and says why', () => {
		const ben = outcome.rows.find((r) => r.email === BEN.email)!;
		expect(ben.ok).toBe(false);
		expect(ben.sentence).toBe(
			'Not graded: 1 criterion is unscored, and a grade cannot be returned unfinished.'
		);
		const eli = outcome.rows.find((r) => r.email === ELI.email)!;
		expect(eli.sentence).toBe(
			"Not graded: Only a teacher of record for this student's class can grade this."
		);
	});

	test('and the successes say the opposite thing, so the two are distinguishable', () => {
		const landed = outcome.rows.filter((r) => r.ok);
		expect(landed).toHaveLength(2);
		for (const r of landed) expect(r.sentence).toBe('Returned.');
		// The whole point: no two rows in this report read the same way.
		expect(new Set(outcome.rows.map((r) => r.sentence)).size).toBe(3);
	});

	test('every row carries a name and a class, refusals included', () => {
		for (const r of outcome.rows) {
			expect(r.displayName).not.toBe(r.email);
			expect(r.sectionTitle).toMatch(/IDEA100/);
		}
	});

	test('the headline names the failures rather than only counting the successes', () => {
		expect(outcome.headline).toBe('2 of 4 returned. 2 not graded, named below.');
	});

	test('a clean batch says so without a second clause', () => {
		const clean = bulkOutcome(
			{ ok: true, total: 2, succeeded: 2, refused: 0, results: [
				{ email: ALICE.email, ok: true }, { email: CARLA.email, ok: true }
			] },
			[ALICE, CARLA],
			SECTION_OF,
			TITLES,
			false
		);
		expect(clean.headline).toBe('2 of 2 saved as drafts.');
		expect(clean.rows.every((r) => r.sentence === 'Draft saved.')).toBe(true);
	});

	test('a name that is no longer on the roster falls back to the address, never to nothing', () => {
		const orphan = bulkOutcome(
			{ ok: true, total: 1, succeeded: 0, refused: 1, results: [
				{ email: 'gone@boscotech.net', ok: false, reason: 'error', message: 'No.' }
			] },
			[],
			SECTION_OF,
			TITLES,
			false
		);
		expect(orphan.rows[0].displayName).toBe('gone@boscotech.net');
	});
});

describe('bulkRefusalSentence: the reason code is not a sentence', () => {
	test('an incomplete release says what is unscored', () => {
		expect(
			bulkRefusalSentence({ email: 'x', ok: false, reason: 'incomplete_scores', missing: ['c1', 'c2'] })
		).toBe(
			'Not graded: 2 criteria are unscored, and a grade cannot be returned unfinished.'
		);
	});

	test('an override with no note says so, singular and plural', () => {
		expect(
			bulkRefusalSentence({ email: 'x', ok: false, reason: 'override_needs_comment', missing: ['c1'] })
		).toContain('one criterion was scored between levels');
		expect(
			bulkRefusalSentence({
				email: 'x',
				ok: false,
				reason: 'override_needs_comment',
				missing: ['c1', 'c2']
			})
		).toContain('2 criteria were scored between levels');
	});

	test("a raised error carries the server's own words VERBATIM", () => {
		// The single-student console renders this exact string. A bulk surface
		// that re-toned it would give an instructor two accounts of one refusal.
		const message = "Only a teacher of record for this student's class can grade this.";
		expect(bulkRefusalSentence({ email: 'x', ok: false, reason: 'error', message })).toBe(
			`Not graded: ${message}`
		);
	});

	test('a refusal with no message still says it was not graded', () => {
		expect(bulkRefusalSentence({ email: 'x', ok: false })).toBe(
			'Not graded, and the server gave no reason.'
		);
	});

	test('a successful row has no refusal sentence at all', () => {
		expect(bulkRefusalSentence({ email: 'x', ok: true })).toBe('');
	});
});

// ---------------------------------------------------------------------------
// 5. SECTION IDENTITY. The silent failure is grading the wrong class's student.
// ---------------------------------------------------------------------------

function enrollment(sectionId: string, email: string, name: string): ClassroomEnrollment {
	return {
		section_id: sectionId,
		student_email: email,
		display_name: name,
		active: true,
		manages: false
	};
}

describe('sectionOfStudent comes from the roster and nowhere else', () => {
	test('every enrolled student maps to their class', () => {
		const map = sectionOfStudent([
			enrollment(P1, ALICE.email, 'Alice Alvarez'),
			enrollment(P2, ELI.email, 'Eli Ramos')
		]);
		expect(map.get(ALICE.email)).toBe(P1);
		expect(map.get(ELI.email)).toBe(P2);
	});

	test('a student enrolled twice keeps the FIRST row, so a card cannot flip between loads', () => {
		const map = sectionOfStudent([
			enrollment(P1, ALICE.email, 'Alice Alvarez'),
			enrollment(P2, ALICE.email, 'Alice Alvarez')
		]);
		expect(map.get(ALICE.email)).toBe(P1);
	});

	test('somebody with no enrollment has no class, rather than a guessed one', () => {
		const map = sectionOfStudent([enrollment(P1, ALICE.email, 'Alice Alvarez')]);
		expect(map.get(ELI.email)).toBeUndefined();
	});
});

describe('groupBySection', () => {
	test('groups in the app section order, and a student with no class is held out', () => {
		const { groups, unplaced } = groupBySection(
			[ELI, ALICE, DARA],
			[SEC2, SEC1],
			new Map([
				[ALICE.email, P1],
				[ELI.email, P2]
			])
		);
		expect(groups.map((g) => g.section.id)).toEqual([P1, P2]);
		expect(groups[0].students.map((s) => s.email)).toEqual([ALICE.email]);
		expect(groups[1].students.map((s) => s.email)).toEqual([ELI.email]);
		// NOT filed under the first group: putting a row in a class it may not be
		// in is the mistake the grouping exists to prevent.
		expect(unplaced.map((s) => s.email)).toEqual([DARA.email]);
	});

	test('an empty class is still a group, so "three of my classes" cannot read as two', () => {
		const { groups } = groupBySection([ALICE], [SEC1, SEC2], new Map([[ALICE.email, P1]]));
		expect(groups).toHaveLength(2);
		expect(groups[1].students).toEqual([]);
	});

	test('each group resolves its own title once', () => {
		const { groups } = groupBySection([], [SEC1], new Map());
		expect(groups[0].title).toContain('IDEA100');
		expect(groups[0].title).toContain('Period 1');
	});
});

describe('managedPostedSections is the cross-section clause', () => {
	const POSTINGS: PostedSection[] = [
		{ section_id: P2, section: SEC2 },
		{ section_id: P4, section: SEC4 },
		{ section_id: P1, section: SEC1 }
	];

	test('a class the caller does not manage is not returned, even though it is posted to', () => {
		const out = managedPostedSections(POSTINGS, [P1, P2]);
		expect(out.map((s) => s.id)).toEqual([P1, P2]);
	});

	test('THE POSITIVE CONTROL: managing it is exactly what makes it appear', () => {
		// Without this the row above cannot tell "the clause holds" from "the
		// fixture never had a Period 4 in it".
		const out = managedPostedSections(POSTINGS, [P1, P2, P4]);
		expect(out.map((s) => s.id)).toEqual([P1, P2, P4]);
	});

	test('a managed section this assignment is NOT posted to is not returned either', () => {
		const out = managedPostedSections([{ section_id: P1, section: SEC1 }], [P1, P2, P4]);
		expect(out.map((s) => s.id)).toEqual([P1]);
	});

	test('a duplicate posting row yields one section', () => {
		const out = managedPostedSections(
			[
				{ section_id: P1, section: SEC1 },
				{ section_id: P1, section: SEC1 }
			],
			[P1]
		);
		expect(out).toHaveLength(1);
	});

	test('a posting whose section did not come back is dropped rather than half-rendered', () => {
		const out = managedPostedSections([{ section_id: P1, section: null }], [P1]);
		expect(out).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 6. SELECTION.
// ---------------------------------------------------------------------------

describe('the presets pick genuinely different sets', () => {
	const ROSTER = [ALICE, BEN, CARLA, DARA, ELI];

	test('all and none are the ends', () => {
		expect(applyPreset('all', ROSTER)).toHaveLength(5);
		expect(applyPreset('none', ROSTER)).toEqual([]);
	});

	test('"handed in" excludes the student who never handed anything in', () => {
		expect(applyPreset('submitted', ROSTER)).not.toContain(DARA.email);
		expect(applyPreset('submitted', ROSTER)).toHaveLength(4);
	});

	test('"not graded yet" excludes the one who already has a grade', () => {
		const out = applyPreset('ungraded', ROSTER);
		expect(out).not.toContain(BEN.email);
		expect(out).toHaveLength(4);
	});

	test('the two are different sets, which is why both exist', () => {
		expect(applyPreset('submitted', ROSTER)).not.toEqual(applyPreset('ungraded', ROSTER));
	});

	test('every preset has a label and no label is reused', () => {
		const labels = Object.values(BULK_PRESET_LABEL);
		expect(labels).toHaveLength(4);
		expect(new Set(labels).size).toBe(4);
	});
});

describe('selectionSummary names the classes as well as the count', () => {
	test('one class says which one', () => {
		expect(selectionSummary([ALICE, BEN], SECTION_OF, TITLES)).toBe(
			'2 students selected, all in IDEA100 · Period 1.'
		);
	});

	test('two classes name both, because "12 students" is how the wrong class gets graded', () => {
		const summary = selectionSummary([ALICE, ELI], SECTION_OF, TITLES);
		expect(summary).toContain('across 2 classes');
		expect(summary).toContain('IDEA100 · Period 1');
		expect(summary).toContain('IDEA100 · Period 2');
	});

	test('nobody selected says so plainly', () => {
		expect(selectionSummary([], SECTION_OF, TITLES)).toBe('Nobody selected.');
	});

	test('a student with no resolvable class is counted without inventing one', () => {
		expect(selectionSummary([DARA], new Map(), TITLES)).toBe('1 student selected.');
	});
});
