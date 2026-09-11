// tests/html-assignment-instructor-readonly.test.ts
//
// THE GRADING CONSOLE'S VIEW OF A STUDENT'S PORTED WORKSHEET IS READ-ONLY, AND
// IT IS READ-ONLY STRUCTURALLY: no answers controller is handed down, so there
// is no write to execute rather than one that is merely hidden (ledger 0134).
//
// WHY THIS IS A TEST. `HtmlAssignmentFrame` takes four optional write callbacks
// and a `readOnly` flag. Adding one callback to the grading mount is a
// one-attribute edit that throws nothing, type-checks perfectly, and looks
// right on screen -- and it would let a teacher type into a student's hand-in
// on the surface where they are grading it. The regression is SILENT, which is
// this repository's bar for an automated test.
//
// IT IS A SOURCE SWEEP, DELIBERATELY, AND IT CARRIES A POSITIVE CONTROL.
// `tests/dom/` has no layout engine and mounting the grading route means a
// session, a section and a Supabase client; what actually has to hold is a
// property of the MARKUP, so the markup is what is read. The control is the
// ItemDetail mount, which legitimately DOES hand callbacks down for a student
// -- parsed by the same parser, in the same run. Without it, a parser that
// silently matched nothing would report every mount as callback-free and this
// file would be a green tick over code it never saw.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

/** The four write callbacks `HtmlAssignmentFrame` accepts. A fifth added to the
    frame without being added here would not be swept, which is why the list is
    asserted against the component's own props below. */
const WRITE_PROPS = ['onchange', 'onimage', 'onimageremove', 'onimagecaption'] as const;

/**
 * Every `<HtmlAssignmentFrame ... />` element in a file, as raw attribute text.
 *
 * Deliberately dumb: it finds the tag and takes everything up to the matching
 * `/>`. A component whose mount stopped matching this would report ZERO mounts,
 * which the control below is what catches.
 */
function frameMounts(file: string): string[] {
	const source = readFileSync(resolve(ROOT, file), 'utf8');
	const out: string[] = [];
	let from = 0;
	for (;;) {
		const start = source.indexOf('<HtmlAssignmentFrame', from);
		if (start === -1) break;
		const end = source.indexOf('/>', start);
		expect(end, `an unterminated <HtmlAssignmentFrame in ${file}`).toBeGreaterThan(start);
		out.push(source.slice(start, end));
		from = end + 2;
	}
	return out;
}

const GRADING_ROUTE = 'src/routes/classroom/[sectionId]/item/[itemId]/grade/+page.svelte';
const ITEM_DETAIL = 'src/lib/classroom/ItemDetail.svelte';

describe('the grading console hands down no write path for a ported worksheet', () => {
	it('mounts the frame exactly once, so the sweep below has something to sweep', () => {
		const mounts = frameMounts(GRADING_ROUTE);
		console.log(`    [readonly] grading route: ${mounts.length} HtmlAssignmentFrame mount(s)`);
		expect(mounts).toHaveLength(1);
	});

	it('passes readOnly and NONE of the four write callbacks', () => {
		const [mount] = frameMounts(GRADING_ROUTE);
		// PRESENT: the flag that stops the DOCUMENT taking input.
		expect(mount).toContain('readOnly');
		// ABSENT: every path a change could travel back on. Absence is the
		// mechanism; `readOnly` alone is presentational.
		const found = WRITE_PROPS.filter((p) => mount.includes(p));
		console.log(`    [readonly] grading route write callbacks: ${found.length ? found.join(', ') : 'none'}`);
		expect(found).toEqual([]);
		// AND NO CONTROLLER AT ALL. `values`/`images` are seeded from the
		// student's stored rows and `saved` is pinned null, so there is nothing
		// an acknowledgement could even come back through.
		expect(mount).toContain('saved={null}');
	});

	it('the POSITIVE CONTROL: the item page DOES hand all four down, read by the same parser', () => {
		// If this went to zero, the parser has stopped finding attributes and the
		// assertion above would be passing over nothing.
		const mounts = frameMounts(ITEM_DETAIL);
		expect(mounts).toHaveLength(1);
		const found = WRITE_PROPS.filter((p) => mounts[0].includes(p));
		console.log(`    [readonly] item page write callbacks: ${found.join(', ')}`);
		expect(found.sort()).toEqual([...WRITE_PROPS].sort());
	});

	it('the item page gates all four on the answers controller, so a manager gets none', () => {
		// THE STUDENT SLICE IS NEVER LOADED FOR A MANAGER, so `htmlWrites` is
		// null on their page and `readOnly={!htmlWrites}` is true. Asserted on
		// the markup because that is where the gate is: every callback reads
		// through the same optional chain, so there is one condition rather than
		// four that could drift apart.
		const [mount] = frameMounts(ITEM_DETAIL);
		for (const p of WRITE_PROPS) {
			expect(mount, `${p} must be gated on htmlWrites`).toContain(`${p}={htmlWrites?.`);
		}
		expect(mount).toContain('readOnly={!htmlWrites}');
	});

	it('the four swept names are the four the frame actually accepts', () => {
		// THE SWEEP IS ONLY AS GOOD AS ITS LIST. A fifth write callback added to
		// the frame and not to WRITE_PROPS would be invisible here -- so the list
		// is checked against the component's own props declaration rather than
		// maintained by hand and hoped over.
		const frame = readFileSync(
			resolve(ROOT, 'src/lib/classroom/html-assignment/HtmlAssignmentFrame.svelte'),
			'utf8'
		);
		const declared = [...frame.matchAll(/^\t{1,3}(on[a-z]+)\??:/gm)].map((m) => m[1]);
		const unique = [...new Set(declared)].sort();
		console.log(`    [readonly] frame declares: ${unique.join(', ')}`);
		for (const p of WRITE_PROPS) expect(unique).toContain(p);
		/**
		 * THE OTHER THREE ARE NOTIFICATIONS AND CARRY NO ANSWER, which is why
		 * the grading console may hold them and why they are named here with the
		 * reason rather than quietly excluded by a pattern:
		 *   `onready`   -- the document announced its schema version
		 *   `onheight`  -- the document reported its own height
		 *   `ondropped` -- a message was refused by the bridge
		 * None of them can reach `classroom_save_response`.
		 *
		 * THE LIST IS PINNED, so a FIFTH callback added to the frame lands in
		 * neither set and reddens here -- a new write path would otherwise be
		 * invisible to this whole file, which is the one way a sweep like this
		 * goes quietly wrong.
		 */
		const NOTIFY_PROPS = ['ondropped', 'onheight', 'onready'];
		const unaccounted = unique.filter(
			(p) => !WRITE_PROPS.includes(p as (typeof WRITE_PROPS)[number]) && !NOTIFY_PROPS.includes(p)
		);
		expect(
			unaccounted,
			`HtmlAssignmentFrame declares a callback this file has not classified: ` +
				`${unaccounted.join(', ')}. Decide whether it can carry an answer. If it can, add it to ` +
				`WRITE_PROPS and check the grading mount; if it cannot, add it to NOTIFY_PROPS with the reason.`
		).toEqual([]);
		expect(unique).toHaveLength(WRITE_PROPS.length + NOTIFY_PROPS.length);
	});
});
