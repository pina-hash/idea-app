// tests/classroom-grading-late.test.ts
//
// The grading rules the console shows before it saves (ledger 0457, items 16
// to 19). Every expected number is worked by hand from the queue's own words
// ("on-time + 0.5 x (all - on-time)", "Hook 03: rubric 70 on a 20-point post"),
// never taken from the functions under test.

import { describe, expect, it } from 'vitest';
import {
	hiddenRubricLines,
	lateCreditLines,
	lateLinesFor,
	mergeTeamAnswers,
	round2,
	rubricScale,
	scaledScore
} from '../src/lib/classroom/grading-late';
import type { RubricCriterion } from '../src/lib/classroom/assignment-spec';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/rubric';

const lv = (max: number) => [
	{ label: 'Full', short: 'Full', points: max, descriptor: '' },
	{ label: 'None', short: 'None', points: 0, descriptor: '' }
];
const RUBRIC: RubricCriterion[] = [
	{ id: 'a', criterion: 'Accuracy', points: 40, levels: lv(40) },
	{ id: 'b', criterion: 'Drawing', points: 30, levels: lv(30) }
];

describe('late credit per rubric line', () => {
	it('on time + rate x the late improvement', () => {
		const r = lateCreditLines(RUBRIC, { a: 20, b: 30 }, { a: 40, b: 30 }, 0.5);
		expect(r.lines.map((l) => [l.id, l.credited, l.late])).toEqual([
			['a', 30, true],
			['b', 30, false]
		]);
		expect(r.total).toBe(60);
		expect(r.invalid).toEqual([]);
	});
	it('a line with no on-time score was all on time; a lower final is refused', () => {
		expect(lateCreditLines(RUBRIC, {}, { a: 40 }, 0.5).total).toBe(40);
		expect(lateCreditLines(RUBRIC, { a: 30 }, { a: 20 }, 0.5).invalid).toEqual(['a']);
	});
	it('a late line with no on-time score is named, never counted as on time; an on-time line is not', () => {
		const late = new Set(['a']);
		// Control: a line that is not late, left blank, is all on time and named nowhere.
		expect(lateCreditLines(RUBRIC, {}, { a: 40, b: 30 }, 0.5, new Set(['b'])).needOnTime).toEqual(['b']);
		expect(lateCreditLines(RUBRIC, {}, { a: 40, b: 30 }, 0.5, late).needOnTime).toEqual(['a']);
		expect(lateCreditLines(RUBRIC, { a: 20 }, { a: 40, b: 30 }, 0.5, late).needOnTime).toEqual([]);
	});
	it('rounds to two places, half away from zero', () => {
		expect(round2(15.714285)).toBe(15.71);
		expect(round2(0.125)).toBe(0.13);
	});
});

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Hook 03',
	course: 'IDEA100',
	points: 20,
	modules: [
		{ id: 'sketch', title: 'Sketch', points: 10, blocks: [{ id: 'q1', field: 'f1', type: 'longText' }], criteria: [{ id: 'dims', text: 'Every dimension labeled in millimeters', points: 10, levels: [] }] },
		{ id: 'test', title: 'Test', points: 10, blocks: [{ id: 'q2', field: 'f2', type: 'text' }], criteria: [{ id: 'load', text: 'Record the load the hook holds', points: 10, levels: [] }] }
	]
} as unknown as HtmlAssignmentManifest;

describe('late lines for one student', () => {
	it('the rubric lines of a module with an answer saved after that student\'s due date', () => {
		const due = '2026-10-20T06:59:00Z';
		const late = lateLinesFor(MANIFEST, [{ block_id: 'q1', updated_at: '2026-10-19T00:00:00Z' }, { block_id: 'q2', updated_at: '2026-10-21T00:00:00Z' }], due);
		expect([...late]).toEqual(['test-load']);
	});
});

describe('a rubric scaled to the post\'s points', () => {
	it('Hook 03: 70 rubric points on a 20 point post', () => {
		const s = rubricScale(70, 20, true)!;
		expect(s).toMatchObject({ mismatch: true, on: true });
		expect(scaledScore(55, s)).toBe(15.71);
		expect(scaledScore(70, s)).toBe(20);
	});
	it('off, or agreeing, leaves the sum alone; the mismatch is still reported off', () => {
		expect(scaledScore(55, rubricScale(70, 20, false))).toBe(55);
		expect(rubricScale(70, 20, false)?.mismatch).toBe(true);
		expect(rubricScale(20, 20, true)?.on).toBe(false);
	});
});

describe('a team merged, newest answer per box with who wrote it', () => {
	it('newest wins, blanks never win, and other teams are ignored', () => {
		const rows = [
			{ student_email: 'ana@x.net', block_id: 'q1', value: { text: 'Ana first' }, updated_at: '2026-10-01T00:00:00Z' },
			{ student_email: 'ben@x.net', block_id: 'q1', value: { text: 'Ben newer' }, updated_at: '2026-10-02T00:00:00Z' },
			{ student_email: 'cy@x.net', block_id: 'q1', value: { text: '' }, updated_at: '2026-10-03T00:00:00Z' },
			{ student_email: 'zed@x.net', block_id: 'q1', value: { text: 'other team' }, updated_at: '2026-10-09T00:00:00Z' },
			{ student_email: 'ana@x.net', block_id: 'q2', value: { text: 'Only Ana' }, updated_at: '2026-10-01T00:00:00Z' }
		];
		const merged = mergeTeamAnswers(rows, ['ana@x.net', 'ben@x.net', 'cy@x.net']);
		expect(merged.map((m) => [m.blockId, (m.value as { text: string }).text, m.by, m.answeredBy]).sort()).toEqual([
			['q1', 'Ben newer', 'ben@x.net', 2],
			['q2', 'Only Ana', 'ana@x.net', 1]
		]);
	});
});

describe('a rubric line the page hides', () => {
	const HTML = `
		<section data-module="sketch"><h2>Sketch</h2><p>Draw your hook.</p>
			<span class="term" data-tip="Every dimension labeled in millimeters">dimensions</span>
			<textarea data-field="f1"></textarea></section>
		<section data-module="test"><h2>Test</h2><p>Record the load the hook holds before it bends.</p>
			<details><summary>Stuck?</summary><p>Ask a neighbor.</p></details>
			<input data-field="f2"></section>`;
	it('flags the line whose requirement is only in a tooltip, and not the one in plain sight', () => {
		expect(hiddenRubricLines(HTML, MANIFEST)).toEqual([{ id: 'sketch-dims', where: 'a tooltip' }]);
	});
	it('a closed disclosure hides too; an open one does not (control)', () => {
		const closed = HTML.replace('Record the load the hook holds before it bends.', 'Test it.').replace('Ask a neighbor.', 'Record the load the hook holds.');
		expect(hiddenRubricLines(closed, MANIFEST).map((h) => [h.id, h.where])).toContainEqual(['test-load', 'a closed disclosure']);
		const open = closed.replace('<details>', '<details open>');
		expect(hiddenRubricLines(open, MANIFEST).map((h) => h.id)).not.toContain('test-load');
	});
	it('no document, or nothing tucked away, flags nothing', () => {
		expect(hiddenRubricLines(null, MANIFEST)).toEqual([]);
		expect(hiddenRubricLines('<section data-module="sketch"><p>Every dimension labeled in millimeters</p></section>', MANIFEST)).toEqual([]);
	});
});
