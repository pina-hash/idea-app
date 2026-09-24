// tests/classroom-returned-grade.test.ts
//
// A RETURNED GRADE REACHES THE STUDENT ON EVERY ENGINE, WITH THE TEACHER'S
// COMMENT BEFORE THE BREAKDOWN, AND THE RUBRIC IS FINDABLE BEFORE THE WORK
// (ledger 0297, package ITEM; Phase 0's blocking finding).
//
// WHY A TEST AND NOT ONLY A HARNESS. Both regressions are SILENT:
//   * the v3 (ported HTML) and v4 (IdeaCAD) item pages carried the returned
//     score, the rubric breakdown and the teacher's comment in their payload
//     for as long as those engines existed and rendered none of it -- a page
//     that looks complete with the most important sentence missing;
//   * the comment sat UNDER a 1235px breakdown at 375 (1065px below the grade),
//     present on the page and effectively unread.
// A presence check is green on the second defect, so the ORDER is asserted as
// an index comparison over the rendered markup, with both halves' presence as
// the positive control that keeps the comparison from passing on an absence.
//
// EXPECTED VALUES COME FROM THE FIXTURES, never from the component: the comment
// and criterion strings are sentinels no component can produce on its own.
//
// NO GEOMETRY. `svelte/server`'s render has no layout; "near the top" is
// asserted as DOCUMENT ORDER here and measured in pixels by
// tools/browser-verify/routes/item-returned-*.mjs.

import { describe, expect, test } from 'vitest';
import { render } from 'svelte/server';
import ItemDetail from '../src/lib/classroom/ItemDetail.svelte';
import ReturnedGrade from '../src/lib/classroom/ReturnedGrade.svelte';
import type { HtmlAssignmentData } from '../src/lib/classroom/html-assignment/mount';

const COMMENT = 'COMMENT-SENTINEL: tighten the datum callout and resubmit.';
const CRITERION = 'CRITERION-SENTINEL datum callouts';

const RUBRIC = [
	{
		id: 'c1',
		criterion: CRITERION,
		points: 10,
		levels: [
			{ points: 10, label: 'Exemplary', descriptor: 'Every datum is called out.' },
			{ points: 6, label: 'Developing', descriptor: 'Some are missing.' },
			{ points: 2, label: 'Beginning', descriptor: 'Most are missing.' }
		]
	},
	{
		id: 'c2',
		criterion: 'Second criterion',
		points: 10,
		levels: [
			{ points: 10, label: 'Exemplary', descriptor: 'Clean.' },
			{ points: 6, label: 'Developing', descriptor: 'Some mess.' },
			{ points: 2, label: 'Beginning', descriptor: 'Unreadable.' }
		]
	}
];

function submission(state: 'draft' | 'submitted' | 'returned') {
	return {
		id: 'sub-1',
		item_id: 'item-1',
		student_email: 'ana@boscotech.net',
		state,
		submitted_at: '2026-09-20T15:00:00.000Z',
		returned_at: state === 'returned' ? '2026-09-22T15:00:00.000Z' : null,
		rubric_scores: state === 'returned' ? { c1: 6, c2: 10 } : null,
		criterion_comments: null,
		score: state === 'returned' ? 16 : null,
		teacher_comment: state === 'returned' ? COMMENT : null,
		graded_by: null,
		graded_at: null
	};
}

function engine(state: 'draft' | 'submitted' | 'returned' | null, spec: unknown = null) {
	return {
		spec,
		rubric: RUBRIC,
		submission: state ? submission(state) : null,
		responses: [],
		files: [],
		approvals: []
	};
}

const SECTION = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	course: null
};

function item(version: number | null) {
	const base = {
		id: 'item-1',
		kind: 'assignment' as const,
		title: 'Datum drawing',
		body: 'Draw the part and call out every datum.',
		points: 20,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: null,
		published: true,
		pinned: false,
		attachments: [],
		links: []
	};
	return version === null ? base : { ...base, assignment_schema_version: version };
}

const SPEC_V1 = {
	schemaVersion: 1,
	meta: { assignmentId: 'a1', title: 'Datum drawing', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Callouts',
			points: 20,
			blocks: [{ type: 'shortText', id: 'b1', prompt: 'Name the datum', label: 'Datum' }]
		}
	]
};
const SPEC_V2 = { ...SPEC_V1, schemaVersion: 2, kind: 'assignment' };

const DOCUMENT: HtmlAssignmentData = {
	documentId: '11111111-2222-3333-4444-555555555555',
	manifest: {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Datum drawing',
		course: 'IDEA209H',
		points: 20,
		header: [{ id: 'h_name', field: 'studentName', type: 'text', label: 'Name' }],
		modules: [
			{
				id: 'm1',
				title: 'Callouts',
				points: 20,
				blocks: [{ id: 'b_datum', field: 'datum', type: 'text', label: 'Datum' }],
				criteria: []
			}
		]
	},
	filename: 'worksheet.html',
	updatedAt: '2026-09-01T00:00:00.000Z'
};

/** A transport object whose methods are never reached by a server render. */
const NO_TRANSPORTS = new Proxy(
	{},
	{ get: () => () => Promise.resolve({ ok: false, message: 'not in this test' }) }
);

type Engine = 'v1' | 'v2' | 'v3' | 'v4-link';

function studentPage(kind: Engine, state: 'draft' | 'submitted' | 'returned' | null): string {
	const props: Record<string, unknown> = { section: SECTION, canManage: false };
	if (kind === 'v1' || kind === 'v2') {
		props.item = item(1);
		props.engine = engine(state, kind === 'v1' ? SPEC_V1 : SPEC_V2);
		props.engineTransports = NO_TRANSPORTS;
	} else if (kind === 'v3') {
		props.item = item(3);
		props.engine = engine(state);
		props.engineTransports = NO_TRANSPORTS;
		props.htmlAssignment = DOCUMENT;
	} else {
		props.item = item(4);
		props.engine = engine(state);
		props.engineTransports = NO_TRANSPORTS;
		props.ideacad = { standalone: true, config: {}, concepts: [], document: null };
	}
	return render(ItemDetail as never, { props: props as never }).body;
}

function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

const ENGINES: Engine[] = ['v1', 'v2', 'v3', 'v4-link'];

describe('the returned card itself: the comment comes before the breakdown', () => {
	test('both halves render, once each, comment first', () => {
		const html = render(ReturnedGrade as never, {
			props: { submission: submission('returned'), rubric: RUBRIC, points: 20 } as never
		}).body;
		// Positive controls: both are there, so the order below cannot pass on
		// an absence.
		expect(count(html, COMMENT)).toBe(1);
		expect(count(html, CRITERION)).toBe(1);
		expect(count(html, 'data-testid="returned-grade-comment"')).toBe(1);
		expect(count(html, 'data-testid="returned-grade-breakdown"')).toBe(1);
		expect(html.indexOf(COMMENT)).toBeLessThan(html.indexOf(CRITERION));
		expect(html.indexOf('data-testid="returned-grade-comment"')).toBeLessThan(
			html.indexOf('data-testid="returned-grade-breakdown"')
		);
		// The headline carries the stored score over the rubric's own total.
		expect(html).toContain('Returned: 16 / 20 pts');
	});

	test('no comment written renders no comment block, and the breakdown still does', () => {
		const html = render(ReturnedGrade as never, {
			props: {
				submission: { ...submission('returned'), teacher_comment: null },
				rubric: RUBRIC
			} as never
		}).body;
		expect(count(html, 'data-testid="returned-grade-comment"')).toBe(0);
		expect(count(html, 'data-testid="returned-grade-breakdown"')).toBe(1);
	});
});

describe('a student sees the returned grade and the comment on EVERY engine', () => {
	test.each(ENGINES)('%s, returned: one card, the comment, before the breakdown', (kind) => {
		const html = studentPage(kind, 'returned');
		expect(count(html, 'data-testid="returned-grade"'), `${kind}: one returned card`).toBe(1);
		expect(count(html, COMMENT), `${kind}: the teacher's comment`).toBe(1);
		expect(count(html, CRITERION), `${kind}: the breakdown`).toBe(1);
		expect(html.indexOf(COMMENT)).toBeLessThan(html.indexOf(CRITERION));
		// The unscored "How this is graded" copy stands down on a return: the
		// card IS the scored copy of the same rubric.
		expect(count(html, 'data-testid="item-rubric"'), `${kind}: no second rubric`).toBe(0);
	});

	test.each(ENGINES)('%s, not returned: no card, no comment (negative control)', (kind) => {
		for (const state of [null, 'draft', 'submitted'] as const) {
			const html = studentPage(kind, state);
			expect(count(html, 'data-testid="returned-grade"'), `${kind} ${state}`).toBe(0);
			expect(count(html, COMMENT), `${kind} ${state}`).toBe(0);
		}
	});
});

describe('the rubric is findable BEFORE the work, on every engine', () => {
	test.each(ENGINES)('%s: one "How this is graded" disclosure, above the work', (kind) => {
		const html = studentPage(kind, null);
		expect(count(html, 'data-testid="item-rubric"'), `${kind}: the rubric`).toBe(1);
		expect(count(html, CRITERION), `${kind}: one copy of the criteria`).toBe(1);
		expect(html).toContain('How this is graded');
		// Above the writing and the work surface. The instructions disclosure
		// is a fixed landmark every engine renders (the item has a body).
		const rubricAt = html.indexOf('data-testid="item-rubric"');
		expect(rubricAt).toBeLessThan(html.indexOf('data-testid="item-body-disclosure"'));
	});

	test('a manager reads the same stored rubric, open, with no returned card', () => {
		const html = render(ItemDetail as never, {
			props: {
				section: SECTION,
				item: item(1),
				canManage: true,
				spec: SPEC_V1,
				rubric: RUBRIC
			} as never
		}).body;
		expect(count(html, 'data-testid="item-rubric"')).toBe(1);
		expect(count(html, CRITERION)).toBe(1);
		expect(count(html, 'data-testid="returned-grade"')).toBe(0);
	});

	test('an item with no stored rubric renders no empty disclosure', () => {
		const html = render(ItemDetail as never, {
			props: {
				section: SECTION,
				item: item(1),
				canManage: false,
				engine: { ...engine(null, SPEC_V1), rubric: null },
				engineTransports: NO_TRANSPORTS
			} as never
		}).body;
		expect(count(html, 'data-testid="item-rubric"')).toBe(0);
	});
});
