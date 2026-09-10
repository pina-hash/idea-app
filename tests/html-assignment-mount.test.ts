// tests/html-assignment-mount.test.ts
//
// WHICH ENGINE AN ASSIGNMENT MOUNTS (0195): the predicate, and the branch that
// reads it, asserted in BOTH directions on the SHIPPING component.
//
// WHY THIS IS A TEST RATHER THAN A HARNESS DRIVE, which is the default in this
// repo. The regression is SILENT in both of its directions and neither is
// visible to `svelte-check`:
//
//   * A schema-3 item that falls to the v1 branch. There is no
//     `classroom_assignment_specs` row for a ported document, so the spec
//     branch renders NOTHING for a manager and, for a student, renders the
//     sentence "This assignment has no online hand-in" -- a false statement, in
//     the exact place the work surface belongs, on a page that otherwise looks
//     completely normal. Nothing throws and no type is wrong.
//   * A schema-1 item that reaches the FRAME. `htmlAssignment` would be null so
//     the frame would have no `src`; the student loses the work surface they
//     have always had.
//
// AND BOTH ARE ONE CHARACTER APART FROM CORRECT. The branch is an ordering
// decision inside a five-arm `{#if}` chain: moving the html arm BELOW
// `{:else if canManage}` reproduces the first failure exactly, for a converted
// item that kept its old spec row, and reproduces it only for that item. That
// is why the fixtures below give the schema-3 item the SAME spec as the
// schema-1 one -- the version is then the only difference between the two
// renders, and an arm in the wrong order cannot hide behind a missing spec.
//
// THE PREDICATE'S EXPECTED VALUES COME FROM THE MIGRATION, not from the module
// under test: 0195's own CHECK constraint is read off disk and the constant is
// asserted against it. A test whose expected value is the implementation's own
// rule cannot fail.
//
// MUTATION-CHECKED (manually, during this session -- the
// classroom-rich-body.test.ts convention, not left as runnable code; every file
// was copied first and restored FROM THAT COPY, never with `git checkout --`,
// which discards a session's uncommitted work and makes the remaining mutants
// pass against a pristine tree):
//   * letting a converted item's stale spec win the branch
//     (`htmlMount === 'html' && htmlAssignment && !spec`) reddened 2 -- the
//     manager's frame assertion and the student's, which is precisely the
//     ordering failure described above, and left every predicate assertion
//     green;
//   * coercing the version loosely (`Number(raw)`) so a string '3' reads as the
//     ported engine reddened 3, and none of them was a render assertion;
//   * folding `unavailable` back into `spec` reddened 3, including both halves
//     of the stated-absence pair.
// `ItemDetail.svelte` and `mount.ts` were both diffed byte-identical afterwards
// and the file re-run green.
//
// WHAT THIS FILE DOES NOT COVER, deliberately. Nothing here measures geometry,
// contrast or a tap target -- `render()` from `svelte/server` produces markup
// and no layout at all, so any such number would be read off a page that was
// never laid out. The frame's own containment (the sandbox attribute, the
// bridge's refusals) is `bridge.ts`'s and the boundary harness's; this file
// asserts only WHICH component the item page mounts.

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { render } from 'svelte/server';
import ItemDetail from '../src/lib/classroom/ItemDetail.svelte';
import {
	HTML_ASSIGNMENT_SCHEMA_VERSION,
	HTML_ASSIGNMENT_UNAVAILABLE,
	htmlAssignmentMount,
	htmlAssignmentSchemaVersion,
	htmlAssignmentSrc,
	htmlFieldToBlockId,
	isHtmlAssignment,
	type HtmlAssignmentData
} from '../src/lib/classroom/html-assignment/mount';

// ---------------------------------------------------------------------------
// Fixtures. The two items differ in ONE field.
// ---------------------------------------------------------------------------

/** A string no component and no token can produce on its own, so finding it in
    the markup means SpecRenderer walked this spec. */
const SPEC_SENTINEL = 'SPEC-MODULE-SENTINEL-0195';

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'a1', title: 'Bench work', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: SPEC_SENTINEL,
			points: 10,
			blocks: [{ type: 'shortText', id: 'b1', prompt: 'Name the datum', label: 'Datum' }]
		}
	]
};

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
		title: 'Ported worksheet',
		body: '',
		points: 10,
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

const DOCUMENT: HtmlAssignmentData = {
	documentId: '11111111-2222-3333-4444-555555555555',
	manifest: {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Ported worksheet',
		course: 'IDEA209H',
		points: 10,
		header: [{ id: 'h_name', field: 'studentName', type: 'text', label: 'Name' }],
		modules: [
			{
				id: 'm1',
				title: 'Datum',
				points: 10,
				blocks: [{ id: 'b_datum', field: 'datum', type: 'text', label: 'Datum' }],
				criteria: []
			}
		]
	},
	filename: 'worksheet.html',
	updatedAt: '2026-09-01T00:00:00.000Z'
};

/** Everything ItemDetail needs beyond the two fields under test. `canManage`
    and the spec are held CONSTANT across the pair on purpose. */
function mount(props: Record<string, unknown>) {
	return render(ItemDetail as never, {
		props: { section: SECTION, spec: SPEC, ...props } as never
	}).body;
}

/** How many times a marker appears. A count rather than a boolean because a
    branch that renders BOTH engines is a real failure and reads as a pass under
    `toContain`. */
function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

/** SpecRenderer mounted, from its own rendered output. */
const specRenders = (html: string) => count(html, SPEC_SENTINEL);
/** HtmlAssignmentFrame mounted. `data-hx-ready` is on its wrapper in both of
    its states, where `data-hx-frame` is on the iframe alone -- and the iframe
    is deliberately not rendered until the parent is listening, which never
    happens under a server render. */
const frameRenders = (html: string) => count(html, 'data-hx-ready');

// ---------------------------------------------------------------------------
// 1. THE PREDICATE.
// ---------------------------------------------------------------------------

describe('the schema version is read strictly, and cannot tell is not yes', () => {
	test('the constant is the value 0195 admits for a ported document', () => {
		const sql = readFileSync(
			new URL('../supabase/migrations/0195_classroom_html_assignments.sql', import.meta.url),
			'utf8'
		);
		// The column's own CHECK, which is where the vocabulary is decided.
		expect(sql).toContain(
			'check (assignment_schema_version is null or assignment_schema_version in (1, 3))'
		);
		expect(sql).toContain(
			`update public.classroom_items set assignment_schema_version = ${HTML_ASSIGNMENT_SCHEMA_VERSION} where id = p_item_id`
		);
		expect(HTML_ASSIGNMENT_SCHEMA_VERSION).toBe(3);
	});

	test.each([
		['the ported engine', { assignment_schema_version: 3 }, 3, true],
		['the v1 engine, stated', { assignment_schema_version: 1 }, 1, false],
		['the v1 engine, null', { assignment_schema_version: null }, null, false],
		['a read that did not ask', {}, null, false],
		// PostgREST hands an integer column back as a number. A string means a
		// value took some other path in, and an unexpected shape must not claim
		// to be a ported document.
		['the version as a string', { assignment_schema_version: '3' }, null, false],
		['a non-integer', { assignment_schema_version: 3.5 }, null, false],
		['a boolean', { assignment_schema_version: true }, null, false],
		['no item at all', null, null, false],
		['undefined', undefined, null, false],
		['not an object', 'item-1', null, false]
	])('%s', (_label, source, version, ported) => {
		expect(htmlAssignmentSchemaVersion(source)).toBe(version);
		expect(isHtmlAssignment(source)).toBe(ported);
	});
});

describe('the mount decision has three answers and no engine absorbs the third', () => {
	test('schema 3 with a document mounts the frame', () => {
		expect(htmlAssignmentMount(item(3), DOCUMENT)).toBe('html');
	});

	test('schema 3 with no document is unavailable, never the spec engine', () => {
		expect(htmlAssignmentMount(item(3), null)).toBe('unavailable');
		expect(htmlAssignmentMount(item(3), undefined)).toBe('unavailable');
	});

	test('schema 1 and an unanswered read both mount the spec engine', () => {
		expect(htmlAssignmentMount(item(1), null)).toBe('spec');
		expect(htmlAssignmentMount(item(null), null)).toBe('spec');
		// A document handed in beside a v1 item does NOT flip the decision: the
		// item is what says which engine this is.
		expect(htmlAssignmentMount(item(1), DOCUMENT)).toBe('spec');
	});
});

describe('the frame url, and unset meaning same origin', () => {
	test('a configured sandbox origin is named in full', () => {
		expect(htmlAssignmentSrc('https://hx.example.com', 'doc-1')).toBe(
			'https://hx.example.com/hx/doc-1'
		);
		// Trailing slashes and whitespace cannot make two spellings of one origin.
		expect(htmlAssignmentSrc('  https://hx.example.com//  ', 'doc-1')).toBe(
			'https://hx.example.com/hx/doc-1'
		);
	});

	test('unset, empty and whitespace all mean same origin, which is a relative url', () => {
		for (const unset of [undefined, null, '', '   ']) {
			expect(htmlAssignmentSrc(unset, 'doc-1')).toBe('/hx/doc-1');
		}
	});
});

describe('the field map comes from the stored manifest and fails closed', () => {
	test('every block, the header included, maps to its own id', () => {
		expect(htmlFieldToBlockId(DOCUMENT.manifest)).toEqual({
			studentName: 'h_name',
			datum: 'b_datum'
		});
	});

	test.each([
		['null', null],
		['a string', 'manifest'],
		['modules that are not an array', { modules: 'nope' }],
		['a block that is not an object', { modules: [{ blocks: [null] }] }],
		['a block with no field', { modules: [{ blocks: [{ id: 'b1' }] }] }],
		['a header that is not an array', { header: {}, modules: [] }]
	])('%s yields an empty map rather than a throw', (_label, manifest) => {
		expect(htmlFieldToBlockId(manifest)).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// 2. THE BRANCH, ON THE REAL COMPONENT, BOTH DIRECTIONS.
// ---------------------------------------------------------------------------

describe('a schema-3 item mounts the frame and a schema-1 item mounts the spec', () => {
	// The MANAGER pair. Both carry the identical spec, so the version is the
	// only difference between the two renders.
	const managerHtml = mount({ item: item(3), canManage: true, htmlAssignment: DOCUMENT });
	const managerSpec = mount({ item: item(1), canManage: true, htmlAssignment: null });

	// The STUDENT pair. No engine slice on either, which is what a ported item
	// genuinely has and what makes the v1 fall-through say something false.
	const studentHtml = mount({ item: item(3), canManage: false, htmlAssignment: DOCUMENT });
	const studentSpec = mount({ item: item(1), canManage: false, htmlAssignment: null });

	test('the manager sees the frame and no spec renderer', () => {
		expect(frameRenders(managerHtml)).toBe(1);
		expect(specRenders(managerHtml)).toBe(0);
	});

	test('the manager POSITIVE CONTROL: the same spec does render at schema 1', () => {
		expect(specRenders(managerSpec)).toBe(1);
		expect(frameRenders(managerSpec)).toBe(0);
	});

	test('the student sees the frame, and is not told there is no online hand-in', () => {
		expect(frameRenders(studentHtml)).toBe(1);
		expect(specRenders(studentHtml)).toBe(0);
		expect(count(studentHtml, 'This assignment has no online hand-in')).toBe(0);
	});

	test('the student POSITIVE CONTROL: schema 1 with no engine still says that', () => {
		expect(count(studentSpec, 'This assignment has no online hand-in')).toBe(1);
		expect(frameRenders(studentSpec)).toBe(0);
	});

});

describe('schema 3 with nothing to serve says so, and mounts neither engine', () => {
	const student = mount({ item: item(3), canManage: false, htmlAssignment: null });
	const manager = mount({ item: item(3), canManage: true, htmlAssignment: null });

	test('the student gets the stated absence, not the false sentence', () => {
		expect(count(student, HTML_ASSIGNMENT_UNAVAILABLE)).toBe(1);
		expect(count(student, 'This assignment has no online hand-in')).toBe(0);
		expect(frameRenders(student)).toBe(0);
		expect(specRenders(student)).toBe(0);
	});

	test('the manager gets the same sentence rather than an empty card', () => {
		expect(count(manager, HTML_ASSIGNMENT_UNAVAILABLE)).toBe(1);
		expect(frameRenders(manager)).toBe(0);
		expect(specRenders(manager)).toBe(0);
	});
});

describe('with no answer controller the worksheet is read only, structurally', () => {
	// Absence is the mechanism: a surface that hands ItemDetail no `htmlAnswers`
	// hands the frame no write callback at all, so there is no write to execute
	// rather than one that is hidden. Asserted on the SOURCE because the
	// callbacks are props of a child component and never reach the markup: a
	// server render can show what was mounted, not what it was handed.
	const src = readFileSync(
		new URL('../src/lib/classroom/ItemDetail.svelte', import.meta.url),
		'utf8'
	);

	test('read-only is derived from the write path, not from a role or a flag', () => {
		expect(src).toContain('readOnly={!htmlWrites}');
	});

	test('every write callback the frame takes goes through that one seam', () => {
		for (const cb of ['onchange', 'onimage', 'onimageremove', 'onimagecaption']) {
			expect(src).toContain(`${cb}={htmlWrites?.${cb}}`);
		}
	});

	test('the frame is pointed at the DOCUMENT handle, never at the item id', () => {
		// SOURCE-LEVEL, and the frame's own design is why: the `<iframe>` does
		// not exist until the parent is listening, so under a server render the
		// placeholder is what comes back and no `src` reaches the markup at all.
		// That absence is deliberate there (a document that speaks before
		// anybody is listening is an empty worksheet), so it is asserted here as
		// the wiring rather than as rendered output.
		expect(src).toContain('src={htmlSrc}');
		expect(src).toContain('htmlAssignmentSrc(publicEnv.PUBLIC_HX_SANDBOX_ORIGIN, htmlAssignment.documentId)');
		// The item id is not a serving handle: 0195 gives the document its own
		// uuid precisely so it stays stable across revisions.
		expect(src).not.toContain('/hx/${item.id}');
	});

	test('nothing re-spells the version test outside the one module', () => {
		// The whole reason `mount.ts` exists. A second comparison here is how a
		// student gets a worksheet and an instructor gets a blank panel.
		expect(src).not.toContain('assignment_schema_version');
	});
});
