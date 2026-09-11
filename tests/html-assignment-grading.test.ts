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
