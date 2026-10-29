// tests/classroom-grade-targets.test.ts
//
// POSTED POINTS AGAINST THE SYLLABUS (ledger 0457, report c622b97a). The
// targets are the IDEA100 syllabus's own numbers (materials/idea100), and the
// posts are his Rotation 2 report's shape: 295 posted against 500. Every
// expected sum is added up by hand.

import { describe, expect, it } from 'vitest';
import type { ClassroomItemKind } from '../src/lib/classroom/classroom';
import { categoryFor, parseTargetLines, postedVsTarget, targetLines, type GradeTarget } from '../src/lib/classroom/grading-targets';

const IDEA100: GradeTarget[] = [
	{ category: 'Manufacturing and Assembly', target: 60, source: null },
	{ category: 'Dogtag', target: 40, source: null },
	{ category: 'Hook Competition', target: 130, source: null },
	{ category: 'IDEA-Blade', target: 190, source: null },
	{ category: 'Engineering Documentation', target: 80, source: null }
];
const post = (points: number | null, category: string | null, kind: ClassroomItemKind = 'assignment') => ({ kind, points, category });

describe('posted vs target per category', () => {
	it('Rotation 2: 295 posted of 500, each category with its gap, unfiled posts counted apart', () => {
		const r = postedVsTarget(
			[post(40, 'Dogtag'), post(20, 'Hook competition'), post(20, 'Hook Competition'), post(120, 'IDEA-Blade'), post(70, 'idea blade'), post(25, null), post(5, 'Material'), post(null, 'Dogtag')],
			IDEA100
		);
		expect(r.rows.map((x) => [x.category, x.posted, x.gap])).toEqual([
			['Manufacturing and Assembly', 0, -60],
			['Dogtag', 40, 0],
			['Hook Competition', 40, -90],
			['IDEA-Blade', 190, 0],
			['Engineering Documentation', 0, -80]
		]);
		expect(r.unfiled).toEqual({ posted: 30, posts: 2 });
		expect(r.total).toEqual({ posted: 300, target: 500 });
	});
	it('a category name that starts the post\'s counts it ("Unit Assignment" in "Unit Assignments")', () => {
		expect(categoryFor('Unit Assignment', [{ category: 'Unit Assignments', target: 400, source: null }])).toBe('Unit Assignments');
		expect(categoryFor('Lab', [{ category: 'Unit Labs', target: 200, source: null }])).toBe(null);
	});
	it('a target left blank has no gap and no total', () => {
		const r = postedVsTarget([post(10, 'Final Exam')], [{ category: 'Final Exam', target: null, source: null }]);
		expect(r.rows[0].gap).toBeNull();
		expect(r.total.target).toBeNull();
	});
});

describe('the editor lines', () => {
	it('reads "name points", "name: points" and a bare name', () => {
		expect(parseTargetLines('Unit Labs 200\nFinal Exam: 100 pts\n\nIntegrated Design Challenge')).toEqual([
			{ category: 'Unit Labs', target_points: 200 },
			{ category: 'Final Exam', target_points: 100 },
			{ category: 'Integrated Design Challenge', target_points: null }
		]);
	});
	it('round trips what it prints', () => {
		expect(parseTargetLines(targetLines(IDEA100)).map((r) => r.target_points)).toEqual([60, 40, 130, 190, 80]);
	});
});
