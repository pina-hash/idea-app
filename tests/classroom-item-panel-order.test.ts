// tests/classroom-item-panel-order.test.ts
//
// THE ITEM PAGE RENDERS ITS PANELS IN THIS PERSON'S ORDER, AROUND THE WORK
// (ledger 0360, report R23 phase 1, and report R20 for where the rubric goes).
//
// `ItemDetail` hands its panels to `PanelStack` through `resolvePanels`. The
// page with no stored layout was characterized against the shipping render
// before the refactor (fourteen fixtures, every engine, both roles, a material
// and a post): identical markup except that the "How this is graded" card
// moved from before the work to after it, which is R20's one stated change.
// This file pins what that characterization established and what the layout
// adds, so a regression in either is red rather than a page that quietly
// reads in a different order:
//   * the DEFAULT order, including the author's 0193 placement of the links
//     and the files above or below the body;
//   * a stored ORDER moves panels, and never the work;
//   * a stored HIDDEN set removes exactly the hideable panels it names, and
//     the hidden note names them (absent when nothing is hidden, the control);
//   * the two wave-A mounts on a ported worksheet's rail: the save `status`
//     reaches `Progress`, and `HtmlLinkCheck` renders for a link block.
//
// NO GEOMETRY: `svelte/server` has no layout, so order is DOCUMENT ORDER, with
// every landmark's presence asserted first so an absent one cannot pass an
// index comparison.

import { describe, expect, test } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import ItemDetail from '../src/lib/classroom/ItemDetail.svelte';
import { SAMPLE_REFERENCE } from '../src/lib/classroom/dev-reference-fixture';
import type { PanelLayout } from '../src/lib/classroom/panel-layout';

const SECTION = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	course: null
};

const RUBRIC = [
	{
		id: 'c1',
		criterion: 'RUBRIC-SENTINEL accuracy',
		points: 10,
		levels: [
			{ points: 10, label: 'Exemplary', descriptor: 'Within tolerance.' },
			{ points: 2, label: 'Beginning', descriptor: 'Not attempted.' }
		]
	}
];

const SPEC_V1 = {
	schemaVersion: 1,
	meta: { assignmentId: 'a1', title: 'Truss', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Measure',
			points: 10,
			blocks: [{ type: 'shortText', id: 'b1', prompt: 'Span', label: 'Span' }]
		}
	]
};

const NO_TRANSPORTS = new Proxy(
	{},
	{ get: () => () => Promise.resolve({ ok: false, message: 'not in this test' }) }
);

function item(over: Record<string, unknown> = {}) {
	return {
		id: 'item-1',
		kind: 'assignment',
		title: 'Truss',
		body: 'Measure the truss you built.',
		body_doc: null,
		points: 10,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: null,
		published: true,
		pinned: false,
		created_at: '2026-09-01T00:00:00.000Z',
		postings: [{ section_id: 'sec-1' }],
		attachments: [
			{ id: 'a-1', filename: 'truss.pdf', mime_type: 'application/octet-stream', size_bytes: 9120, sort_order: 1 }
		],
		links: [{ id: 'l-1', label: 'Truss calculator', url: 'https://example.org/truss' }],
		assignment_schema_version: 1,
		...over
	};
}

function engine(spec: unknown = SPEC_V1) {
	return { spec, rubric: RUBRIC, submission: null, responses: [], files: [], approvals: [] };
}

const CHECK_IN = {
	session_id: 'ns-1',
	section_id: 'sec-1',
	unit_number: 2,
	session_date: '2026-08-20',
	session_label: 'Truss sketch',
	status: 'missing',
	flag_reason: null,
	item_id: 'item-1',
	guidance_doc: null
};
const DECK = { item_id: 'item-1', title: 'Walkthrough', slides: [], has_state_file: true };

/** Every landmark the item page can render below its hero, by panel id. */
const LANDMARK: Record<string, string> = {
	deck: 'data-testid="deck-',
	notebook: 'data-testid="item-check-ins"',
	links: 'data-testid="item-links-card"',
	files: 'data-testid="item-files-card"',
	body: 'data-testid="item-body-disclosure"',
	reference: 'class="card ref-card',
	rubric: 'data-testid="item-rubric"',
	work: 'class="engine-host',
	footer: 'class="page-footer'
};

function studentPage(over: Record<string, unknown> = {}): string {
	const props = {
		section: SECTION,
		canManage: false,
		item: item(),
		engine: engine(),
		engineTransports: NO_TRANSPORTS,
		deck: DECK,
		checkIns: [CHECK_IN],
		...over
	};
	return render(ItemDetail as never, { props: props as never }).body;
}

function count(html: string, needle: string): number {
	return html.split(needle).length - 1;
}

/** The order the named landmarks appear in, after asserting each is present once. */
function order(html: string, ids: string[]): string[] {
	for (const id of ids) {
		expect(count(html, LANDMARK[id]), `${id} renders once`).toBe(1);
	}
	return [...ids].sort((a, b) => html.indexOf(LANDMARK[a]) - html.indexOf(LANDMARK[b]));
}

describe('the default order, with no stored layout', () => {
	test('deck, check-in, instructions, links, files, the work, then how it is graded', () => {
		const html = studentPage();
		const ids = ['deck', 'notebook', 'body', 'links', 'files', 'work', 'rubric', 'footer'];
		expect(order(html, ids)).toEqual(ids);
		expect(count(html, 'data-testid="panels-hidden-note"'), 'nothing hidden, no note').toBe(0);
	});

	test("the author's top placement (0193) puts links and files above the instructions", () => {
		const html = studentPage({ item: item({ layout: { links: 'top', files: 'top' } }) });
		const ids = ['deck', 'notebook', 'links', 'files', 'body', 'work', 'rubric', 'footer'];
		expect(order(html, ids)).toEqual(ids);
	});

	test('a material has no work, and its reference document follows the body', () => {
		const html = render(ItemDetail as never, {
			props: {
				section: SECTION,
				canManage: false,
				item: item({ kind: 'material', points: null }),
				referenceSpec: SAMPLE_REFERENCE
			} as never
		}).body;
		expect(count(html, LANDMARK.work)).toBe(0);
		expect(count(html, LANDMARK.rubric)).toBe(0);
		const ids = ['body', 'reference', 'links', 'files', 'footer'];
		expect(order(html, ids)).toEqual(ids);
	});
});

describe("a person's stored order moves panels, and never the work", () => {
	test('the rubric and the links ahead of everything', () => {
		const panelLayout: PanelLayout = {
			order: ['rubric', 'links', 'deck', 'notebook', 'body', 'files', 'work'],
			hidden: []
		};
		const html = studentPage({ panelLayout });
		const ids = ['rubric', 'links', 'deck', 'notebook', 'body', 'files', 'work', 'footer'];
		expect(order(html, ids)).toEqual(ids);
	});

	test('a panel stored after the work stays after it, and the work stays one slot', () => {
		const panelLayout: PanelLayout = {
			order: ['deck', 'work', 'notebook', 'body', 'links', 'files', 'rubric'],
			hidden: []
		};
		const html = studentPage({ panelLayout });
		const ids = ['deck', 'work', 'notebook', 'body', 'links', 'files', 'rubric', 'footer'];
		expect(order(html, ids)).toEqual(ids);
		expect(count(html, LANDMARK.work)).toBe(1);
	});
});

describe('a stored hidden set removes exactly what it names, and says so', () => {
	test('hidden panels are not rendered, and the note names them with an Arrange control', () => {
		const panelLayout: PanelLayout = { order: [], hidden: ['rubric', 'links'] };
		const html = studentPage({ panelLayout, onArrange: () => {} });
		expect(count(html, LANDMARK.rubric), 'rubric hidden').toBe(0);
		expect(count(html, LANDMARK.links), 'links hidden').toBe(0);
		// Positive controls: everything not named still renders.
		for (const id of ['deck', 'notebook', 'body', 'files', 'work']) {
			expect(count(html, LANDMARK[id]), `${id} still renders`).toBe(1);
		}
		expect(count(html, 'data-testid="panels-hidden-note"')).toBe(1);
		expect(html).toContain('Hidden on this page: Links, How this is graded.');
		expect(count(html, 'data-testid="panels-hidden-arrange"')).toBe(1);
	});

	test('with no settings to open, the note stays and the Arrange control is absent', () => {
		const panelLayout: PanelLayout = { order: [], hidden: ['rubric'] };
		const html = studentPage({ panelLayout });
		expect(count(html, 'data-testid="panels-hidden-note"')).toBe(1);
		expect(count(html, 'data-testid="panels-hidden-arrange"')).toBe(0);
	});

	test('the work and an obligation cannot be hidden by a stored value', () => {
		const panelLayout = { order: [], hidden: ['work', 'notebook'] } as PanelLayout;
		const html = studentPage({ panelLayout });
		expect(count(html, LANDMARK.work)).toBe(1);
		expect(count(html, LANDMARK.notebook)).toBe(1);
		expect(count(html, 'data-testid="panels-hidden-note"')).toBe(0);
	});

	test('a hidden panel with nothing to show here is not reported as hidden', () => {
		// No deck on this item: hiding the deck hides nothing, so no note.
		const panelLayout: PanelLayout = { order: [], hidden: ['deck'] };
		const html = studentPage({ panelLayout, deck: null });
		expect(count(html, 'data-testid="panels-hidden-note"')).toBe(0);
	});
});

describe("a ported worksheet's rail carries the save status and the link check", () => {
	const DOC = {
		documentId: '11111111-2222-3333-4444-555555555555',
		manifest: {
			schemaVersion: 3,
			kind: 'html-assignment',
			title: 'Truss',
			course: 'IDEA100',
			points: 10,
			header: [],
			modules: [
				{
					id: 'm1',
					title: 'Present',
					points: 10,
					blocks: [
						{ id: 'b_span', field: 'span', type: 'text', label: 'Span' },
						{ id: 'b_slides', field: 'slides', type: 'text', label: 'Slides', link: 'presentation' }
					],
					criteria: []
				}
			]
		},
		filename: 'worksheet.html',
		updatedAt: '2026-09-01T00:00:00.000Z'
	};
	const VALUES = { span: '12 in', slides: 'https://docs.google.com/presentation/d/abc123/edit' };

	function worksheet(answers: Record<string, unknown> | null, canManage = false): string {
		return render(ItemDetail as never, {
			props: {
				section: SECTION,
				canManage,
				item: item({ assignment_schema_version: 3, attachments: [], links: [] }),
				engine: canManage ? null : engine(null),
				engineTransports: canManage ? null : NO_TRANSPORTS,
				htmlAssignment: DOC,
				htmlAnswers: answers
			} as never
		}).body;
	}
	const answers = (status: unknown) => ({
		values: VALUES,
		images: {},
		saved: null,
		status,
		change() {},
		image() {},
		imageRemove() {},
		imageCaption() {}
	});

	test('the link check renders beside the rail for a pasted presentation link', () => {
		const html = worksheet(answers(null));
		expect(count(html, 'data-testid="html-link-check"')).toBe(1);
		expect(count(html, 'data-testid="html-link-ok"')).toBe(1);
		// After the rail, inside the work.
		expect(html.indexOf('data-testid="html-link-check"')).toBeGreaterThan(html.indexOf('data-hx-progress'));
	});

	test('no answers controller (a read-only view), no rail and no link check', () => {
		const html = worksheet(null, true);
		expect(count(html, 'data-hx-progress')).toBe(0);
		expect(count(html, 'data-testid="html-link-check"')).toBe(0);
	});

	test('the save status reaches the rail: an unsaved field keeps it off 100', () => {
		const settled = worksheet(answers(null));
		expect(settled).toContain('data-percent="100"');
		const owed = worksheet(
			answers({
				unsaved: ['span'],
				save: null,
				ack: null,
				itemId: 'item-1',
				restore: null,
				dismissRestore: null,
				mirror: 'off'
			})
		);
		expect(owed).not.toContain('data-percent="100"');
		expect(owed).toContain('data-percent="99"');
	});
});
