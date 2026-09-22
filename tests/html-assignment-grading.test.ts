// tests/html-assignment-grading.test.ts
//
// THE GRADING CONSOLE CAN SEE A PORTED STUDENT'S WORK, WHICH IT COULD NOT.
//
// MEASURED IN PRODUCTION AT `89b8154` ON 2026-09-10: opening
// `/classroom/<s>/item/<i>/grade` on a schema-3 assignment gave a roster
// reading "In progress", a rubric that rendered, and an EMPTY WORK PANE.
// Mr. Pina could not grade at all. Nothing above the screen was wrong -- the
// responses were stored, the manifest was stored, the rubric was stored, and
// `GradingConsole` had carried the `htmlWork` seam since 0195. The grade LOAD
// simply never asked whether the item was a ported document, so `spec` came
// back null, no snippet was passed, and the work column fell through every
// branch it has.
//
// THAT IS A WIRING DEFECT, AND WIRING IS WHAT THIS FILE ASSERTS. A type check
// cannot see it (every prop is optional and null is a legal value), and a unit
// test of either component passes straight through it. So the ladder is driven
// directly, and the two call sites are swept as SOURCE -- which is the only
// thing that reddens if somebody deletes the snippet again.
//
// WHAT IT DOES NOT DO: measure the pane. Geometry, contrast and tap targets
// belong to `npm run verify:browser`, which drives a real Chromium; the pane
// was measured there at 1440 and 375 and the numbers are in this bundle's
// history entry.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadHtmlAssignment } from '../src/lib/classroom/html-assignment/load';
import {
	htmlAnswerSheet,
	htmlAnswerText,
	htmlAssignmentMount,
	htmlAssignmentServed
} from '../src/lib/classroom/html-assignment/mount';
import { hxFrameSeed } from '../src/lib/classroom/html-assignment/answers';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import type { SupabaseClient } from '@supabase/supabase-js';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const GRADE_PAGE = '../src/routes/classroom/[sectionId]/item/[itemId]/grade/+page.svelte';
const GRADE_LOAD = '../src/routes/classroom/[sectionId]/item/[itemId]/grade/+page.server.ts';
const ITEM_LOAD = '../src/routes/classroom/[sectionId]/item/[itemId]/+page.server.ts';

/**
 * A CLIENT THAT ANSWERS THE TWO READS THE LADDER MAKES, and nothing else.
 *
 * Cast on the way in because the parameter is a whole `SupabaseClient` -- see
 * `loadHtmlAssignment`'s header for why a narrow structural interface is not
 * available here.
 */
function client(answers: Record<string, { data: unknown; error: unknown }>): SupabaseClient {
	const asked: string[] = [];
	const c = {
		from(table: string) {
			asked.push(table);
			return {
				select: () => ({
					eq: () => ({ maybeSingle: async () => answers[table] ?? { data: null, error: null } })
				})
			};
		},
		asked
	};
	return c as unknown as SupabaseClient;
}

const DOC_ROW = {
	data: {
		document_id: 'doc-uuid-1',
		manifest: { schemaVersion: 3, kind: 'html-assignment' },
		filename: 'smoke.html',
		updated_at: '2026-09-10T12:00:00Z'
	},
	error: null
};

describe('loadHtmlAssignment, the one ladder both loads run', () => {
	it('answers a ported item with its document and READY', async () => {
		const out = await loadHtmlAssignment(
			client({
				classroom_items: { data: { assignment_schema_version: 3 }, error: null },
				classroom_html_assignments: DOC_ROW
			}),
			{ id: 'i-1' },
			'assignment'
		);
		expect(out.htmlAssignmentReady).toBe(true);
		expect(out.htmlAssignment?.documentId).toBe('doc-uuid-1');
		expect(htmlAssignmentMount(out.item, out.htmlAssignment)).toBe('html');
	});

	it('answers a v1 spec assignment READY with no document -- knowing IS the capability', async () => {
		const out = await loadHtmlAssignment(
			client({ classroom_items: { data: { assignment_schema_version: 1 }, error: null } }),
			{ id: 'i-1' },
			'assignment'
		);
		expect(out.htmlAssignmentReady).toBe(true);
		expect(out.htmlAssignment).toBeNull();
		expect(htmlAssignmentMount(out.item, out.htmlAssignment)).toBe('spec');
	});

	it('a probe that could not answer is NOT ready, and does not claim schema 3', async () => {
		// "Cannot tell" must never render as "this is a ported assignment": a
		// deployment sitting short of 0195 has no such column to select.
		const out = await loadHtmlAssignment(
			client({ classroom_items: { data: null, error: { message: 'column does not exist' } } }),
			{ id: 'i-1' },
			'assignment'
		);
		expect(out.htmlAssignmentReady).toBe(false);
		expect(out.htmlAssignment).toBeNull();
	});

	it('a schema-3 item whose document row is missing is NOT ready', async () => {
		// The third answer: it IS a ported document and there is nothing to point
		// the frame at. Neither engine may absorb that.
		const out = await loadHtmlAssignment(
			client({
				classroom_items: { data: { assignment_schema_version: 3 }, error: null },
				classroom_html_assignments: { data: null, error: null }
			}),
			{ id: 'i-1' },
			'assignment'
		);
		expect(out.htmlAssignmentReady).toBe(false);
		expect(htmlAssignmentMount(out.item, out.htmlAssignment)).toBe('unavailable');
	});

	it('asks NOTHING at all for an item that is not an assignment', async () => {
		const c = client({}) as unknown as { asked: string[] };
		const out = await loadHtmlAssignment(c as unknown as SupabaseClient, { id: 'i-1' }, 'material');
		expect(c.asked).toEqual([]);
		expect(out.htmlAssignmentReady).toBe(true);
	});
});

describe('htmlAssignmentServed, the client half of the serving gate', () => {
	const now = new Date('2026-09-10T12:00:00Z');
	it('is false for an unpublished item', () => {
		expect(htmlAssignmentServed({ published: false, publish_at: null }, now)).toBe(false);
	});
	it('is false for one scheduled ahead of now', () => {
		expect(
			htmlAssignmentServed({ published: true, publish_at: '2026-09-11T12:00:00Z' }, now)
		).toBe(false);
	});
	it('is true once the go-live moment has passed', () => {
		expect(
			htmlAssignmentServed({ published: true, publish_at: '2026-09-09T12:00:00Z' }, now)
		).toBe(true);
	});
	it('reads a column the read could not select as LIVE', () => {
		// `isScheduled`'s own rule, and the safer direction: the cost is one
		// sentence not shown, against a sentence calling a live item unpublished.
		expect(htmlAssignmentServed({ published: true }, now)).toBe(true);
	});
});

describe('hxFrameSeed', () => {
	const manifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 't',
		course: 'IDEA100',
		points: 1,
		header: [{ id: 'b-name', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'm1',
				title: 'm',
				points: 1,
				blocks: [{ id: 'b-photo', field: 'photo', type: 'image' }],
				criteria: []
			}
		]
	} as unknown as HtmlAssignmentManifest;

	it('keys a stored row back to the document\'s own field name', () => {
		const seed = hxFrameSeed(
			manifest,
			[{ block_id: 'b-name', value: { text: 'Ana' } }],
			[
				{
					id: 'f1',
					submission_id: 's1',
					block_id: 'b-photo',
					filename: 'p.png',
					caption: 'c',
					mime_type: 'application/octet-stream'
				}
			]
		);
		// The ids and the fields are deliberately different strings, so a lookup
		// that is the identity function cannot pass for a working mapping.
		expect(seed.values).toEqual({ studentName: 'Ana' });
		expect(seed.images.photo?.name).toBe('p.png');
	});

	it('drops a row whose block the manifest no longer declares', () => {
		// A re-uploaded document that removed a module leaves exactly these rows
		// behind, and there is no field to put them in.
		const seed = hxFrameSeed(manifest, [{ block_id: 'b-gone', value: { text: 'x' } }], []);
		expect(seed.values).toEqual({});
	});

	it('is empty for a manifest it cannot map, and for a student with no rows', () => {
		expect(hxFrameSeed(null, [{ block_id: 'b-name', value: { text: 'Ana' } }], [])).toEqual({
			values: {},
			images: {}
		});
		// A student who has not started renders the UNTOUCHED document, which is
		// the same thing an untouched worksheet holds -- not a blank pane.
		expect(hxFrameSeed(manifest, [], [])).toEqual({ values: {}, images: {} });
	});
});

describe('the wiring, swept as source', () => {
	it('the grade load runs the ladder and returns what the page reads', () => {
		const s = src(GRADE_LOAD);
		expect(s).toContain('loadHtmlAssignment');
		expect(s).toContain('htmlAssignment,');
		expect(s).toContain('htmlAssignmentReady');
	});

	it('the grade page passes an htmlWork snippet, which is the whole fix', () => {
		const s = src(GRADE_PAGE);
		expect(s).toContain('htmlWork');
		expect(s).toContain('HtmlAssignmentFrame');
		// READ-ONLY IS THE ABSENCE OF A WRITE PATH. A grader handed any of these
		// four is a grader editing a student's answers, so their absence is
		// asserted rather than `readOnly` alone.
		for (const cb of ['onchange=', 'onimage=', 'onimageremove=', 'onimagecaption=']) {
			expect(s, `the grading mount must not hand down ${cb}`).not.toContain(cb);
		}
		expect(s).toContain('readOnly');
	});

	it('withholds a leftover spec from a ported item, so one engine renders', () => {
		// A schema-3 item may carry a spec row from before its conversion, and
		// `GradingConsole` branches `{#if spec}` first -- so handing both down
		// would render the superseded engine in the grading console while the
		// student's own page renders the document. The manifest decides, which is
		// the order every other rendering surface takes.
		const s = src(GRADE_PAGE);
		expect(s).toContain("spec={htmlMount === 'spec' ? data.spec : null}");
		expect(s, 'the two props read ONE expression').toContain(
			"htmlWork={htmlMount === 'spec' ? null : htmlWork}"
		);
		expect(s, 'never the raw spec').not.toContain('spec={data.spec}');
	});

	it('both loads share ONE ladder rather than each carrying a copy', () => {
		// The cheaper-looking fix was a second copy in the grade load. The probe's
		// failure mode is a `ready` flag that has to start false, and two
		// spellings of that are two answers.
		for (const [name, file] of [
			['the grade load', GRADE_LOAD],
			['the item load', ITEM_LOAD]
		] as const) {
			const s = src(file);
			expect(s, `${name} should call the shared ladder`).toContain('loadHtmlAssignment(');
			expect(
				s,
				`${name} should not re-select the document row itself`
			).not.toContain("from('classroom_html_assignments')");
		}
	});
});

/**
 * =========================================================================
 * LEDGER 0278: THE ANSWERS WITHOUT THE DOCUMENT.
 * =========================================================================
 *
 * Mr. Pina graded an item that was not published and got
 * `HTML_ASSIGNMENT_NOT_LIVE` where the work belongs -- a paragraph about
 * publishing, standing in for answers that were in `classroom_responses` the
 * whole time. The notice is correct and stays; what was wrong is that it was
 * the only thing there.
 *
 * AND THE FRAME CANNOT SIMPLY BE MOUNTED INSTEAD, which the four cases in
 * `htmlAssignmentServed` above are the other half of: `/hx/<docId>` refuses an
 * unpublished or scheduled item with a bodyless 404, on a host that holds no
 * session, so publication status IS that route's whole authorization. Mounting
 * the frame would draw an empty box BESIDE the sentence rather than instead of
 * it. So the answers are projected from the same seed the document would have
 * been given.
 *
 * WHAT THIS FILE CANNOT SAY, and it is said out loud rather than left implied:
 * no `/dev` route drives the grade page's `!served` branch. The harness at
 * `/dev/html-assignment-grading` mounts its OWN `htmlWork` snippet, which has
 * never carried that branch, so the MARKUP around this projection has not been
 * rendered in a browser -- before this bundle or after it. What is pinned here
 * is every decision the projection makes; adding an unpublished state to that
 * harness is the follow-up.
 */
describe('htmlAnswerSheet, the answers a grader reads when the document cannot be served', () => {
	const MANIFEST = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Blade CAD 01',
		course: 'IDEA100',
		points: 20,
		header: [
			{ id: 'hdr-name', field: 'student-name', type: 'text' },
			{ id: 'hdr-team', field: 'team', type: 'text' }
		],
		modules: [
			{
				id: 'm1',
				title: 'Setup',
				points: 10,
				blocks: [
					{ id: 'm1-span', field: 'beam-span', type: 'text' },
					{ id: 'm1-why', field: 'why-this-span', type: 'longText' },
					{ id: 'm1-check', field: 'checked-clearance', type: 'checkbox' },
					{ id: 'm1-photo', field: 'bench-photo', type: 'image' }
				],
				criteria: []
			}
		]
	} as unknown as HtmlAssignmentManifest;

	const VALUES = {
		'student-name': 'Ana Reyes',
		'beam-span': '240 mm',
		'why-this-span': 'It fits the vise.\nAnd the stock is 250.',
		'checked-clearance': true
		// `team` and `bench-photo` are UNANSWERED, which is a fact a grader wants.
	};
	const IMAGES = {
		'bench-photo': { url: '/api/x', name: 'bench.jpg', caption: 'the second cut' }
	};

	it('groups the blocks the way the manifest does, header first', () => {
		const sheet = htmlAnswerSheet(MANIFEST, VALUES, {});
		expect(sheet.map((g) => g.title)).toEqual(['Identity', 'Setup']);
		expect(sheet[0].moduleId).toBeNull();
		expect(sheet[1].moduleId).toBe('m1');
		// EVERY BLOCK GETS A CELL, in the manifest's own order.
		expect(sheet[0].cells.map((c) => c.field)).toEqual(['student-name', 'team']);
		expect(sheet[1].cells.map((c) => c.field)).toEqual([
			'beam-span',
			'why-this-span',
			'checked-clearance',
			'bench-photo'
		]);
	});

	it('reports an unanswered block rather than dropping it', () => {
		// "They skipped question 4" and "question 4 is not on this worksheet" are
		// what a grader is telling apart, and a dropped empty makes them identical.
		const sheet = htmlAnswerSheet(MANIFEST, VALUES, {});
		const team = sheet[0].cells.find((c) => c.field === 'team');
		expect(team?.value).toBeNull();
		const span = sheet[1].cells.find((c) => c.field === 'beam-span');
		expect(span?.value).toBe('240 mm');
	});

	it('carries the block id, which is the permanent join key', () => {
		const sheet = htmlAnswerSheet(MANIFEST, VALUES, {});
		expect(sheet[1].cells.map((c) => c.blockId)).toEqual([
			'm1-span',
			'm1-why',
			'm1-check',
			'm1-photo'
		]);
	});

	it('hangs an image off its own block and leaves the others null', () => {
		const sheet = htmlAnswerSheet(MANIFEST, VALUES, IMAGES);
		const photo = sheet[1].cells.find((c) => c.field === 'bench-photo');
		expect(photo?.image?.name).toBe('bench.jpg');
		expect(photo?.image?.caption).toBe('the second cut');
		expect(sheet[1].cells.filter((c) => c.image).length).toBe(1);
	});

	it('yields NO groups for a manifest it cannot walk -- fail closed, never guess', () => {
		// The same answer `htmlFieldToBlockId` gives, and for the same reason: with
		// no field map there is nothing a stored row could be keyed back to, and a
		// guess shows a grader one answer under another question.
		expect(htmlAnswerSheet(null, VALUES, {})).toEqual([]);
		expect(htmlAnswerSheet({ modules: 'nope' }, VALUES, {})).toEqual([]);
		expect(htmlAnswerSheet('not an object', VALUES, {})).toEqual([]);
		// THE POSITIVE CONTROL: the same call over the real manifest is not empty.
		expect(htmlAnswerSheet(MANIFEST, VALUES, {}).length).toBe(2);
	});

	it('a manifest with no header has no Identity group, and one with no modules still walks', () => {
		const noHeader = { ...MANIFEST, header: undefined } as unknown as HtmlAssignmentManifest;
		expect(htmlAnswerSheet(noHeader, VALUES, {}).map((g) => g.title)).toEqual(['Setup']);
		const headerOnly = { ...MANIFEST, modules: [] } as unknown as HtmlAssignmentManifest;
		expect(htmlAnswerSheet(headerOnly, VALUES, {}).map((g) => g.title)).toEqual(['Identity']);
	});
});

describe('htmlAnswerText', () => {
	it('turns a boolean into a word, so a grader never reads "true"', () => {
		expect(htmlAnswerText(true)).toBe('Ticked');
		expect(htmlAnswerText(false)).toBe('Not ticked');
	});
	it('keeps a string exactly as the student typed it, newlines included', () => {
		expect(htmlAnswerText('two\nlines')).toBe('two\nlines');
	});
	it('tells NULL from the EMPTY STRING, which are two different facts', () => {
		// Nothing stored at all, against a box they opened and cleared. The caller
		// renders "No answer saved" for the first and "Left blank" for the second.
		expect(htmlAnswerText(null)).toBeNull();
		expect(htmlAnswerText('')).toBe('');
	});
});
