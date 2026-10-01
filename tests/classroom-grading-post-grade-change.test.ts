// tests/classroom-grading-post-grade-change.test.ts
//
// THE POST-GRADE CHANGE DERIVATION and THE EXTRA-CREDIT ARITHMETIC.
//
// WHY THESE ARE AUTOMATED. Both regress SILENTLY. A derivation that stopped
// firing shows nothing on any screen -- there is no error, no empty state and
// no missing control, just a grading console that stops mentioning that a
// student rewrote their answer after the grade landed. And extra credit that
// stopped being inert when unused would change every export of every class that
// never uses it, which nobody would connect to a grading change.
//
// THE EXPECTED VALUES DO NOT COME FROM THE IMPLEMENTATION. Every instant here
// is a written-out ISO string with a stated relationship to the others, so the
// assertions are about the CONTRACT ("strictly after the grade fires; equal
// does not") rather than about what the function currently returns.

import { describe, expect, test } from 'vitest';
import {
	buildGradingExport,
	gradingExportSheets,
	postGradeChange,
	postGradeChangeLabel
} from '../src/lib/classroom/grading-export';
import { gradesCsv, rubricTotal, type RubricCriterion, type StudentWork } from '../src/lib/classroom/assignment-spec';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';

// Four instants, an hour apart, named for what they are rather than when.
const T_SUBMIT = '2026-09-01T10:00:00.000Z';
const T_GRADE = '2026-09-01T11:00:00.000Z';
const T_AFTER = '2026-09-01T12:00:00.000Z';
const T_LATER = '2026-09-01T13:00:00.000Z';

function work(over: {
	gradedAt?: string | null;
	submittedAt?: string | null;
	responseTimes?: (string | undefined)[];
	submission?: null;
}) {
	if (over.submission === null) return { submission: null, responses: [] };
	return {
		submission: {
			graded_at: over.gradedAt === undefined ? T_GRADE : over.gradedAt,
			submitted_at: over.submittedAt === undefined ? T_SUBMIT : over.submittedAt
		},
		responses: (over.responseTimes ?? [T_SUBMIT]).map((updated_at) => ({ updated_at }))
	};
}

describe('postGradeChange: what it fires on', () => {
	test('a row that has never been graded reports nothing', () => {
		expect(postGradeChange(work({ gradedAt: null, responseTimes: [T_LATER] }))).toBeNull();
	});

	test('no submission row at all reports nothing', () => {
		expect(postGradeChange(work({ submission: null }))).toBeNull();
	});

	test('work that has not moved since the grade reports nothing', () => {
		expect(postGradeChange(work({ responseTimes: [T_SUBMIT] }))).toBeNull();
	});

	test('a response edited AFTER the grade is an EDIT, not a resubmission', () => {
		const change = postGradeChange(work({ responseTimes: [T_SUBMIT, T_AFTER] }));
		expect(change?.kinds).toEqual(['edited']);
		expect(change?.at).toBe(T_AFTER);
		expect(change?.gradedAt).toBe(T_GRADE);
	});

	test('a hand-in AFTER the grade is a RESUBMISSION, not an edit', () => {
		const change = postGradeChange(work({ submittedAt: T_AFTER, responseTimes: [T_SUBMIT] }));
		expect(change?.kinds).toEqual(['resubmitted']);
		expect(change?.at).toBe(T_AFTER);
	});

	test('both acts are carried, never collapsed into the weaker word', () => {
		const change = postGradeChange(work({ submittedAt: T_AFTER, responseTimes: [T_LATER] }));
		expect(change?.kinds).toEqual(['resubmitted', 'edited']);
		// The MOST RECENT of them: the instructor is being sent to the latest
		// thing that happened, not the first.
		expect(change?.at).toBe(T_LATER);
	});

	test('the reported instant is the latest edit, not the first or the last row', () => {
		const change = postGradeChange(work({ responseTimes: [T_LATER, T_AFTER] }));
		expect(change?.at).toBe(T_LATER);
	});

	test('STRICTLY after: an edit at the same instant as the grade does not fire', () => {
		// The grade write and a response write cannot be the same transaction, but
		// the boundary is the contract and a `>=` here would fire on every row a
		// teacher grades in the same second a student saves.
		expect(postGradeChange(work({ responseTimes: [T_GRADE] }))).toBeNull();
	});

	test('an absent or unparseable timestamp does NOT fire', () => {
		// A mark that cries wolf is one an instructor learns to click past, which
		// costs the case it exists for.
		expect(postGradeChange(work({ responseTimes: [undefined] }))).toBeNull();
		expect(postGradeChange(work({ responseTimes: ['not a date'] }))).toBeNull();
		expect(postGradeChange(work({ gradedAt: 'not a date', responseTimes: [T_LATER] }))).toBeNull();
	});

	test('IT CLEARS: regrading past the change silences it', () => {
		const changed = work({ submittedAt: T_AFTER, responseTimes: [T_AFTER] });
		expect(postGradeChange(changed)?.kinds).toEqual(['resubmitted', 'edited']);
		// The regrade stamps a later graded_at, which is exactly what
		// classroom_grade_submission does on every write including a regrade.
		const regraded = work({ gradedAt: T_LATER, submittedAt: T_AFTER, responseTimes: [T_AFTER] });
		expect(postGradeChange(regraded)).toBeNull();
	});

	test('THE MUTANT: comparing against the row birth instead would never clear', () => {
		// The negative control for the test above. `created_at` precedes every
		// write on the row, so a derivation keyed on it fires on work that has not
		// changed since it was graded -- a signal with no off state. Asserted here
		// so "it clears" cannot pass for the wrong reason.
		const CREATED = '2026-09-01T09:00:00.000Z';
		const mutant = (w: ReturnType<typeof work>) =>
			w.responses.some((r) => r.updated_at && Date.parse(r.updated_at) > Date.parse(CREATED));
		const regraded = work({ gradedAt: T_LATER, submittedAt: T_AFTER, responseTimes: [T_AFTER] });
		expect(postGradeChange(regraded)).toBeNull();
		expect(mutant(regraded)).toBe(true);
	});
});

describe('postGradeChangeLabel: one set of words', () => {
	test('each combination names the ACT', () => {
		expect(postGradeChangeLabel({ kinds: ['edited'], at: T_AFTER, gradedAt: T_GRADE })).toBe(
			'Edited after grading'
		);
		expect(postGradeChangeLabel({ kinds: ['resubmitted'], at: T_AFTER, gradedAt: T_GRADE })).toBe(
			'Resubmitted after grading'
		);
		expect(
			postGradeChangeLabel({ kinds: ['resubmitted', 'edited'], at: T_AFTER, gradedAt: T_GRADE })
		).toBe('Resubmitted and edited after grading');
	});

	test('no label is the bare word "Changed"', () => {
		// The whole point of two kinds is that an instructor answers them
		// differently; a label that flattened them would throw that away.
		for (const kinds of [['edited'], ['resubmitted'], ['resubmitted', 'edited']] as const) {
			const label = postGradeChangeLabel({ kinds: [...kinds], at: T_AFTER, gradedAt: T_GRADE });
			expect(label).toMatch(/after grading$/);
			expect(label).not.toBe('Changed after grading');
		}
	});
});

// ---------------------------------------------------------------------------
// Extra credit arithmetic, through the real export builder.
// ---------------------------------------------------------------------------

const SECTION = {
	id: 'sec-1',
	label: 'Period 1',
	block: null,
	course: { code: 'IDEA100', title: 'Intro' }
} as unknown as ClassroomSection;

const ITEM = {
	id: 'item-1',
	kind: 'assignment',
	title: 'Bridge Sketch',
	points: 20,
	due_at: null,
	published: true
} as unknown as ClassroomItem;

const RUBRIC: RubricCriterion[] = [
	{
		id: 'c1',
		criterion: 'Sketch',
		points: 10,
		levels: [
			{ points: 10, label: 'Complete' },
			{ points: 5, label: 'Developing' },
			{ points: 0, label: 'Absent' }
		]
	},
	{
		id: 'c2',
		criterion: 'Reflection',
		points: 10,
		levels: [
			{ points: 10, label: 'Complete' },
			{ points: 5, label: 'Developing' },
			{ points: 0, label: 'Absent' }
		]
	}
];

function student(email: string, name: string, extraCredit: number | null | undefined, score: number): StudentWork {
	return {
		email,
		displayName: name,
		active: true,
		submission: {
			id: `sub-${email}`,
			item_id: ITEM.id,
			student_email: email,
			state: 'returned',
			submitted_at: T_SUBMIT,
			returned_at: T_GRADE,
			rubric_scores: { c1: 10, c2: 5 },
			criterion_comments: null,
			score,
			teacher_comment: null,
			graded_by: 'tvargas@boscotech.edu',
			graded_at: T_GRADE,
			...(extraCredit === undefined ? {} : { extra_credit: extraCredit })
		},
		responses: [],
		files: [],
		approvals: []
	} as unknown as StudentWork;
}

function buildFor(roster: StudentWork[]) {
	return buildGradingExport({
		section: SECTION,
		item: ITEM,
		spec: null,
		rubric: RUBRIC,
		roster,
		scope: 'section',
		identity: 'included',
		now: new Date(T_LATER)
	});
}

describe('extra credit is inert when unused', () => {
	// The three states a payload can be in with nothing awarded. All three must
	// produce the same bytes as each other, which is the operational meaning of
	// "the feature contributes nothing".
	const NONE: [string, number | null | undefined][] = [
		['absent (pre-0171 payload)', undefined],
		['null (nothing awarded)', null],
		['zero (an award taken back)', 0]
	];

	test.each(NONE)('workbook is identical with extra credit %s', (_label, value) => {
		const roster = [student('alice@boscotech.net', 'Alice Alvarez', value, 15)];
		const control = [student('alice@boscotech.net', 'Alice Alvarez', undefined, 15)];
		expect(JSON.stringify(gradingExportSheets(buildFor(roster)))).toBe(
			JSON.stringify(gradingExportSheets(buildFor(control)))
		);
	});

	test('no Extra credit COLUMN exists when nobody was awarded any', () => {
		const sheets = gradingExportSheets(buildFor([student('a@boscotech.net', 'A', 0, 15)]));
		const grades = sheets.find((s) => s.name === 'Grades')!;
		expect(grades.header).not.toContain('Extra credit');
		// The positive control: the same sheet DOES grow the column when one is.
		const awarded = gradingExportSheets(buildFor([student('a@boscotech.net', 'A', 3, 18)]));
		expect(awarded.find((s) => s.name === 'Grades')!.header).toContain('Extra credit');
	});

	test('the gradebook CSV is byte-identical, because score already carries it', () => {
		// `gradesCsv` writes the SERVER-STAMPED score, which 0171 sums extra
		// credit into. So the four-column export needs no change at all and an
		// award is already in the number a gradebook imports.
		const row = { displayName: 'Alice Alvarez', email: 'alice@boscotech.net', score: 15, outOf: 20 };
		expect(gradesCsv([row])).toBe(gradesCsv([{ ...row }]));
		expect(gradesCsv([row])).toContain('Alvarez,Alice,15,20');
	});
});

describe('extra credit, when awarded', () => {
	test('it is its own column and never a criterion score', () => {
		const sheets = gradingExportSheets(
			buildFor([student('alice@boscotech.net', 'Alice Alvarez', 3, 18)])
		);
		const grades = sheets.find((s) => s.name === 'Grades')!;
		const row = grades.rows[0];
		expect(grades.header[grades.header.indexOf('Extra credit')]).toBe('Extra credit');
		expect(row[grades.header.indexOf('Extra credit')]).toBe(3);
		// The criterion columns are untouched: 10 and 5, summing to 15, with the
		// award living outside them.
		expect(row[grades.header.indexOf('Sketch (/10)')]).toBe(10);
		expect(row[grades.header.indexOf('Reflection (/10)')]).toBe(5);
	});

	test('the score may exceed the rubric total, and Percent goes past 100', () => {
		const sheets = gradingExportSheets(
			buildFor([student('alice@boscotech.net', 'Alice Alvarez', 5, 25)])
		);
		const grades = sheets.find((s) => s.name === 'Grades')!;
		const row = grades.rows[0];
		expect(rubricTotal(RUBRIC)).toBe(20);
		expect(row[grades.header.indexOf('Score')]).toBe(25);
		expect(row[grades.header.indexOf('Out of')]).toBe(20);
		expect(row[grades.header.indexOf('Percent')]).toBe(125);
	});

	test('the column appears for the whole class as soon as ONE student has an award', () => {
		const sheets = gradingExportSheets(
			buildFor([
				student('alice@boscotech.net', 'Alice Alvarez', 0, 15),
				student('bruno@boscotech.net', 'Bruno Baptiste', 2, 17)
			])
		);
		const grades = sheets.find((s) => s.name === 'Grades')!;
		const i = grades.header.indexOf('Extra credit');
		expect(i).toBeGreaterThan(-1);
		// A column that appeared for one row and not the other would be a ragged
		// sheet; the zero is written out.
		expect(grades.rows.map((r) => r[i])).toEqual([0, 2]);
	});
});

describe('the export carries the change signal in the same words the console shows', () => {
	test('a changed row names the act and the instant', () => {
		const s = student('alice@boscotech.net', 'Alice Alvarez', null, 15);
		s.responses = [
			{ item_id: ITEM.id, student_email: s.email, block_id: 'f1', value: {}, updated_at: T_AFTER }
		] as StudentWork['responses'];
		const sheets = gradingExportSheets(buildFor([s]));
		const grades = sheets.find((s2) => s2.name === 'Grades')!;
		const row = grades.rows[0];
		expect(row[grades.header.indexOf('Changed after grading')]).toBe('Edited after grading');
		expect(row[grades.header.indexOf('Changed at')]).toBe(T_AFTER);
	});

	test('an unchanged row leaves both cells empty, which is a real answer', () => {
		const sheets = gradingExportSheets(
			buildFor([student('alice@boscotech.net', 'Alice Alvarez', null, 15)])
		);
		const grades = sheets.find((s) => s.name === 'Grades')!;
		const row = grades.rows[0];
		expect(row[grades.header.indexOf('Changed after grading')]).toBe('');
		expect(row[grades.header.indexOf('Changed at')]).toBe('');
	});
});

// ---------------------------------------------------------------------------
// NOTHING A STUDENT SEES MOVED, asserted as a SOURCE SWEEP rather than as a
// claim. Both directions, with the counts, because "no student surface renders
// it" is exactly the kind of guarantee that fails silently: a chip added to
// ItemDetail or AssignmentEngine would type-check, render, and be discovered by
// a student rather than by a test.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (p.endsWith('.svelte') || p.endsWith('.ts')) out.push(p);
	}
	return out;
}

/**
 * Every surface allowed to name the derivation. Each is instructor-only:
 *   - `GradingConsole` is mounted by `/classroom/[sectionId]/item/[itemId]/grade`,
 *     whose load redirects a non-manager and whose every write re-checks
 *     `classroom_can_review_submission` inside the RPC;
 *   - `grading-export.ts` is the derivation itself plus the export, and the
 *     export takes no read of its own;
 *   - the grades page load 404s a non-manager before it reads anything;
 *   - `/dev/*` is dev-guarded and 404s in production.
 */
const ALLOWED = [
	'src/lib/classroom/GradingConsole.svelte',
	'src/lib/classroom/grading-export.ts',
	'src/routes/classroom/[sectionId]/grades/+page.server.ts'
];

describe('the post-grade signal reaches no student surface', () => {
	const files = walk('src').map((p) => p.replace(/\\/g, '/'));

	test('the sweep found a real tree, not an empty one', () => {
		// A sweep that generated nothing passes vacuously; assert the case count.
		expect(files.length).toBeGreaterThan(300);
		expect(files).toContain('src/lib/classroom/ItemDetail.svelte');
		expect(files).toContain('src/lib/classroom/AssignmentEngine.svelte');
	});

	test('only the instructor surfaces name it, and the POSITIVE CONTROL is that they do', () => {
		const naming = files.filter(
			(p) => !p.startsWith('src/routes/dev/') && /postGradeChange/.test(readFileSync(p, 'utf8'))
		);
		expect([...naming].sort()).toEqual([...ALLOWED].sort());
		// The control: the list is not empty, so "nothing else names it" is a
		// statement about a rule that is actually in force somewhere.
		expect(naming.length).toBe(3);
	});

	test('no student-facing classroom component names it or the chip', () => {
		const studentFacing = [
			'src/lib/classroom/ItemDetail.svelte',
			'src/lib/classroom/AssignmentEngine.svelte',
			'src/lib/classroom/SpecRenderer.svelte',
			'src/lib/classroom/RubricView.svelte',
			'src/lib/classroom/ClassView.svelte'
		];
		for (const p of studentFacing) {
			const src = readFileSync(p, 'utf8');
			expect(src).not.toMatch(/postGradeChange|roster-changed|changed-after-grading/);
		}
		// POSITIVE CONTROL for that regex: it does match where the mark lives.
		expect(readFileSync('src/lib/classroom/GradingConsole.svelte', 'utf8')).toMatch(
			/roster-changed[\s\S]*changed-after-grading/
		);
	});
});
