// "Score out of N", typed, and the Perfect Score award (0242, IDEA Coin V2):
// the pure vocabulary in grading-direct.ts, the direct-score batch in
// grading-bulk.ts, and the export reading the score of record.
//
// WHY THESE ARE TESTED AND NOT ONLY HARNESSED. Two of them fail silently: a
// batch that sent a typed score through the rubric door would write the rubric
// sum and report success, and an export that re-summed the rubric would print a
// number the database never stamped. Both look right on screen.
import { describe, expect, test } from 'vitest';
import {
	bulkCanSend,
	bulkPlan,
	gradeDirectMany,
	type BulkPlanInput
} from '../src/lib/classroom/grading-bulk';
import {
	directGradingOf,
	directRefusalSentence,
	directScoreOf,
	normalizePerfectScores,
	parseDirectScore,
	perfectScoreCoins,
	perfectScoreNote,
	perfectScoreOf,
	withDirectScore,
	type DirectGradingTransports
} from '../src/lib/classroom/grading-direct';
import { buildGradingExport } from '../src/lib/classroom/grading-export';
import type { RubricCriterion, StudentWork, SubmissionRow } from '../src/lib/classroom/assignment-spec';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';

const RUBRIC: RubricCriterion[] = [
	{
		id: 'c1',
		criterion: 'Sketch quality',
		points: 10,
		levels: [
			{ points: 10, label: 'Complete', descriptor: 'All three views.' },
			{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
		]
	},
	{
		id: 'c2',
		criterion: 'Reflection',
		points: 10,
		levels: [
			{ points: 10, label: 'Complete', descriptor: 'Specific.' },
			{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
		]
	}
];

function sub(email: string, over: Partial<SubmissionRow> & { direct_score?: number | null } = {}): SubmissionRow {
	return {
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
	} as SubmissionRow;
}

function student(email: string, name: string, submission: SubmissionRow | null): StudentWork {
	return { email, displayName: name, active: true, submission, responses: [], files: [], approvals: [] };
}

const ALICE = student('alice@x.net', 'Alice Alvarez', sub('alice@x.net'));
const BEN = student(
	'ben@x.net',
	'Ben Okafor',
	sub('ben@x.net', { state: 'returned', graded_at: '2026-09-01T12:00:00.000Z', score: 15 })
);

function planInput(over: Partial<BulkPlanInput> = {}): BulkPlanInput {
	return {
		selected: [ALICE, BEN],
		rubric: RUBRIC,
		scores: { c1: 10, c2: 0 },
		criterionComments: {},
		comment: 'Nice work.',
		extraCredit: '',
		extraCreditReady: true,
		sectionOf: new Map(),
		sectionTitles: new Map(),
		release: false,
		...over
	};
}

describe('parseDirectScore', () => {
	test('blank clears, a number in range is kept, out of range and junk are refused', () => {
		expect(parseDirectScore('', 20)).toEqual({ value: null, error: null });
		expect(parseDirectScore('  ', 20)).toEqual({ value: null, error: null });
		expect(parseDirectScore('17.5', 20)).toEqual({ value: 17.5, error: null });
		expect(parseDirectScore(0, 20)).toEqual({ value: 0, error: null });
		expect(parseDirectScore('20', 20).error).toBeNull();
		expect(parseDirectScore('21', 20).error).toMatch(/from 0 to 20/);
		expect(parseDirectScore('-1', 20).error).toMatch(/from 0 to 20/);
		expect(parseDirectScore('abc', 20).error).toMatch(/number/);
		// Nothing to score out of is the `no_total` refusal, before a round trip.
		expect(parseDirectScore('5', 0).error).toMatch(/no points and no rubric/);
	});
});

describe('directRefusalSentence: every reason 0242 can answer, in words', () => {
	test('no_total and out_of_range name the problem and the total', () => {
		expect(directRefusalSentence({ ok: false, reason: 'no_total' })).toMatch(/nothing to score out of/);
		expect(directRefusalSentence({ ok: false, reason: 'out_of_range', out_of: 30 })).toMatch(
			/from 0 to 30/
		);
		expect(directRefusalSentence({ ok: false, reason: 'override_needs_comment', missing: ['c1'] })).toMatch(
			/1 criterion/
		);
		expect(directRefusalSentence({ ok: false, reason: 'something_new' })).toBe('The grade was refused.');
	});
});

describe('the stored direct score', () => {
	test('three states survive: undefined (older rung), null (none), a number', () => {
		expect(directScoreOf(sub('a'))).toBeUndefined();
		expect(directScoreOf(withDirectScore(sub('a'), null))).toBeNull();
		// PostgREST may answer a numeric as a string.
		expect(directScoreOf(withDirectScore(sub('a'), '18.5'))).toBe(18.5);
		expect(withDirectScore(sub('a'), undefined)).not.toHaveProperty('direct_score');
	});
});

describe('transports detection: absence removes the control', () => {
	test('plain teacher transports carry neither capability', () => {
		const plain = { gradeSubmission: async () => ({ ok: true }) };
		expect(directGradingOf(plain)).toBeNull();
		expect(perfectScoreOf(plain)).toBeNull();
		// Positive control: present methods are found.
		const full = {
			...plain,
			gradeDirect: async () => ({ ok: true }),
			perfectScores: async () => ({ ok: true }),
			setPerfectScore: async () => ({ ok: true })
		};
		expect(directGradingOf(full)).toBe(full);
		expect(perfectScoreOf(full)).toBe(full);
		// Half a pair is no pair.
		expect(perfectScoreOf({ perfectScores: async () => null })).toBeNull();
	});
});

describe('the Perfect Score award figure', () => {
	test('round(points / 25), at least 1, null with nothing to score out of', () => {
		expect(perfectScoreCoins(20)).toBe(1);
		expect(perfectScoreCoins(25)).toBe(1);
		expect(perfectScoreCoins(37.5)).toBe(2); // half-up, as Postgres round()
		expect(perfectScoreCoins(100)).toBe(4);
		expect(perfectScoreCoins(0)).toBeNull();
		expect(perfectScoreCoins(null)).toBeNull();
		expect(perfectScoreNote(100)).toContain('4i¢');
		expect(perfectScoreNote(100)).toMatch(/extra credit not counted/);
		expect(perfectScoreNote(0)).toMatch(/nothing is paid/);
	});
	test('normalizePerfectScores keeps each class and drops what it cannot read', () => {
		const rows = normalizePerfectScores([
			{ section_id: 's1', label: 'IDEA100 Period 1', on: true, economy_on: true, out_of: '20' },
			{ section_id: 's2', label: '', on: false, economy_on: false, out_of: null },
			{ label: 'no id' },
			null
		]);
		expect(rows).toEqual([
			{ section_id: 's1', label: 'IDEA100 Period 1', on: true, economy_on: true, out_of: 20 },
			{ section_id: 's2', label: 'This class', on: false, economy_on: false, out_of: null }
		]);
		expect(normalizePerfectScores(null)).toEqual([]);
	});
});

describe('bulkPlan: a typed score is the batch', () => {
	test('blank or not ready keeps the rubric door (the positive control)', () => {
		const rubricPlan = bulkPlan(planInput({ directReady: true, directScore: '' }));
		expect(rubricPlan.mode).toBe('rubric');
		expect(rubricPlan.grades).toHaveLength(2);
		expect(rubricPlan.direct).toEqual([]);
		// Typed, but the console cannot send it: still the rubric door.
		expect(bulkPlan(planInput({ directReady: false, directScore: '18' })).mode).toBe('rubric');
	});

	test('typed: every student gets the score, the rubric is not summed, nothing goes to gradeMany', () => {
		const plan = bulkPlan(planInput({ directReady: true, directScore: '18', extraCredit: '2' }));
		expect(plan.mode).toBe('direct');
		expect(plan.grades).toEqual([]);
		expect(plan.direct).toEqual([
			{ student_email: ALICE.email, score: 18, comment: 'Nice work.', extra_credit: 2 },
			{ student_email: BEN.email, score: 18, comment: 'Nice work.', extra_credit: 2 }
		]);
		expect(plan.rows.map((r) => r.awarded)).toEqual([20, 20]);
		expect(plan.rows[1]).toMatchObject({ previous: 15, regrade: true });
		expect(plan.outOf).toBe(20);
		expect(bulkCanSend(plan)).toBe(true);
	});

	test('out of range is a problem before any round trip', () => {
		const plan = bulkPlan(planInput({ directReady: true, directScore: '25' }));
		expect(plan.problems.map((p) => p.message).join(' ')).toMatch(/from 0 to 20/);
		expect(bulkCanSend(plan)).toBe(false);
	});

	test('no rubric: out of the item points, and releasing needs no criterion', () => {
		const plan = bulkPlan(
			planInput({ rubric: null, scores: {}, directReady: true, directScore: '7', itemPoints: 10, release: true })
		);
		expect(plan.mode).toBe('direct');
		expect(plan.outOf).toBe(10);
		expect(plan.problems).toEqual([]);
		expect(plan.direct.map((d) => d.score)).toEqual([7, 7]);
	});

	test('no rubric and nothing typed says how to grade it rather than refusing forever', () => {
		const plan = bulkPlan(planInput({ rubric: null, scores: {}, directReady: true, itemPoints: 10 }));
		expect(plan.mode).toBe('rubric');
		expect(plan.problems[0].message).toMatch(/Type a score out of 10/);
		// And with the typed score unavailable, the old sentence stands.
		const old = bulkPlan(planInput({ rubric: null, scores: {} }));
		expect(old.problems[0].message).toMatch(/Add one on the assignment before grading/);
	});
});

describe('gradeDirectMany: one call per student, every student named either way', () => {
	test('a refusal and a throw are that student only; the rest still land', async () => {
		const calls: string[] = [];
		const transport: DirectGradingTransports = {
			async gradeDirect(_item, email, score, comment, release, extra) {
				calls.push(`${email}:${score}:${release}:${extra}:${comment}`);
				if (email === 'b@x') return { ok: true, data: { ok: false, reason: 'out_of_range', out_of: 20 } };
				if (email === 'c@x') throw new Error('network gone');
				return { ok: true, data: { ok: true, score: (score ?? 0) + (extra ?? 0), state: 'returned' } };
			}
		};
		const report = await gradeDirectMany(
			transport,
			'i-1',
			['a@x', 'b@x', 'c@x', 'd@x'].map((e) => ({ student_email: e, score: 18, comment: null, extra_credit: null })),
			true
		);
		expect(calls).toHaveLength(4);
		expect(report).toMatchObject({ ok: true, total: 4, succeeded: 2, refused: 2 });
		expect(report.results.map((r) => r.ok)).toEqual([true, false, false, true]);
		expect(report.results[1].message).toMatch(/from 0 to 20/);
		expect(report.results[2].message).toBe('network gone');
		expect(report.results[0].score).toBe(18);
	});
});

describe('the export reads the score of record and never re-sums the rubric', () => {
	const section: ClassroomSection = {
		id: 's1',
		course_id: 'c1',
		label: 'A',
		block: '1',
		teacher_email: 't@x.edu',
		active: true,
		course: { id: 'c1', code: 'IDEA100', title: 'Engineering', active: true }
	};
	const item = {
		id: 'i-1',
		kind: 'assignment',
		title: 'Bridge',
		points: 20,
		due_at: null,
		category: null,
		author_email: 't@x.edu'
	} as unknown as ClassroomItem;

	test('a typed score: score is what the database stamped and directScore says why', () => {
		// The rubric would sum to 20; the typed 12 plus 1 extra credit is the score of record.
		const typed = student(
			'a@x',
			'Ann',
			withDirectScore(
				sub('a@x', { state: 'returned', rubric_scores: { c1: 10, c2: 10 }, score: 13, extra_credit: 1 }),
				12
			)
		);
		const plain = student(
			'b@x',
			'Bo',
			sub('b@x', { state: 'returned', rubric_scores: { c1: 10, c2: 0 }, score: 10 })
		);
		const out = buildGradingExport({
			section,
			item,
			spec: null,
			rubric: RUBRIC,
			roster: [typed, plain],
			selectedEmail: null,
			scope: 'section',
			identity: 'included',
			now: new Date('2026-09-02T00:00:00Z')
		});
		const [a, b] = out.assignments[0].students;
		expect(a.submission.score).toBe(13);
		expect(a.scoreTotal).toBe(13);
		expect(a.submission.directScore).toBe(12);
		// No typed score: no key at all, so older exports stay byte-identical.
		expect(b.submission.score).toBe(10);
		expect('directScore' in b.submission).toBe(false);
	});
});
