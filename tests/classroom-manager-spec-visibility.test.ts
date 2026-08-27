// tests/classroom-manager-spec-visibility.test.ts
//
// An instructor opening an assignment whose instructions live entirely in the
// spec (an empty `body`) used to see a title and nothing else: ItemDetail
// loaded `spec` for a manager but only ever handed it to SpecImporter and
// RubricBuilder, both inside the collapsed instructor inspector -- there was
// no reading-order path to the content at all. The fix renders it through
// SpecRenderer's existing `readonly` flag, in the same DOM slot a student's
// `AssignmentEngine` occupies, so a manager reads the same content a student
// does without a fourth bespoke rendering path.
//
// THE BOUNDARY THIS PINS: that render must be look-but-do-not-touch. A
// manager has no submission, no `engineTransports`, and must never be able to
// write into an engine slot from this page -- the grading console is the only
// instructor-side window onto ANY student's actual answers.
//
// THERE IS NO DOM/EVENT-DISPATCH HARNESS IN THIS REPO (no jsdom, no
// @testing-library -- `vitest.config.ts` runs `environment: 'node'` and uses
// `svelte/server`'s `render()`, the same SSR-only pattern
// `classroom-body-render.test.ts` established, deliberately not extended
// here to keep this file dependency-free). So "dispatched input reaches a
// control" is proven the way it is provable without one: by asserting on the
// REAL component's REAL SSR markup that no writable control exists in the
// output at all -- no `<textarea>`, no un-disabled `<input>` for a table cell
// or an image caption, and the one control that IS always present
// (checklist checkboxes, which SpecRenderer renders unconditionally and
// disables rather than omitting) carries `disabled`, which is what stops a
// browser from ever firing that control's `onchange` from user input in the
// first place. There is no input to dispatch TO, which is the strongest
// available claim short of an actual DOM.
//
// POSITIVE CONTROLS, both directions, so a check that always passes cannot
// hide behind this file:
//   - the SAME spec rendered with `readonly: false` (the student path) is
//     asserted to contain the writable controls that readonly must not --
//     proving the assertions below are sensitive to the flag, not vacuous.
//   - `onvalue`/`onupload`/`ondeletefile`/`oncaption` are asserted absent
//     from the manager's call site in ItemDetail.svelte, so even a future
//     regression that reintroduced a writable control there would have
//     nothing to call.
//
// MUTATION-CHECKED (manually, during this session, the
// classroom-edit-visibility.test.ts convention -- not left as runnable
// code): flipping the manager branch's `readonly` to `readonly={false}` in
// ItemDetail.svelte reddened "the manager's render carries no writable spec
// controls" and "checklist checkboxes are disabled" while leaving every other
// test in this file green (the student-path control is unaffected because it
// renders AssignmentEngine, not this call site). Reverted byte-identical
// afterwards and this file re-run fully green.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import type { AssignmentSpec } from '$lib/classroom/assignment-spec';

/** One of every interactive block type SpecRenderer knows how to draw. */
const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-1', title: 'Bridge design', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Design notes',
			points: 10,
			intro: 'Read this before you start.',
			blocks: [
				{ type: 'instructions', content: 'Sketch your bridge before you build it.' },
				{ type: 'textField', id: 'reasoning', prompt: 'Why this design?' },
				{
					type: 'table',
					id: 'materials',
					columns: [{ key: 'part', label: 'Part' }, { key: 'qty', label: 'Qty' }]
				},
				{ type: 'imageZone', id: 'photos', minImages: 1, captions: true },
				{ type: 'checklist', id: 'safety', items: ['Goggles on', 'Area clear'] }
			]
		}
	]
};

function strip(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

/** One row on the table block, so the editable-cell path is actually exercised
 *  (an empty table renders a placeholder row, not a `<td>` at all). */
const VALUES = { materials: { rows: [{ part: 'Beam', qty: '2' }] } };

function renderSpec(readonly: boolean): string {
	return strip(
		render(SpecRenderer, {
			props: { spec: SPEC, initialValues: VALUES, readonly, uploadEnabled: false }
		}).body
	);
}

describe("a manager's read-only spec render carries no path to a write", () => {
	const managerHtml = renderSpec(true);
	const studentHtml = renderSpec(false);

	it('the instructions and prompt text are genuinely there -- this is a visibility fix, not a blank', () => {
		expect(managerHtml).toContain('Sketch your bridge before you build it.');
		expect(managerHtml).toContain('Why this design?');
		expect(managerHtml).toContain('Design notes');
	});

	it('renders no <textarea> for the text field', () => {
		expect(managerHtml).not.toContain('<textarea');
		// Positive control: the identical spec, not readonly, DOES render one --
		// so the absence above is the flag's doing, not an artifact of the fixture.
		expect(studentHtml).toContain('<textarea');
	});

	it('renders no editable table-cell <textarea>', () => {
		// Svelte's SSR output appends a scoping-hash class (`class="cell
		// svelte-xxxx"`), so this matches the class as a PREFIX, not the whole
		// attribute value. A table cell is a `<textarea>`, not an `<input>`, so
		// a long value can wrap and be read while editing rather than scrolling
		// out of view in a single-line box.
		expect(managerHtml).not.toMatch(/<textarea[^>]*class="cell[ "]/);
		expect(studentHtml).toMatch(/<textarea[^>]*class="cell[ "]/);
	});

	it('renders no editable image-caption <input>, and no upload control', () => {
		expect(managerHtml).not.toMatch(/<input[^>]*class="caption[ "]/);
		expect(managerHtml).not.toMatch(/type="file"/);
	});

	it('the one control SpecRenderer always emits -- the checklist checkbox -- is disabled', () => {
		const boxes = [...managerHtml.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]);
		expect(boxes.length).toBeGreaterThan(0);
		for (const box of boxes) expect(box).toContain('disabled');
		// Positive control: the student's own render has the same checkboxes,
		// enabled -- proving "disabled" above is the readonly flag's effect.
		const studentBoxes = [...studentHtml.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(
			(m) => m[0]
		);
		expect(studentBoxes.length).toBe(boxes.length);
		for (const box of studentBoxes) expect(box).not.toContain('disabled');
	});

	it('renders no row-ops or add-row buttons for the table', () => {
		expect(managerHtml).not.toMatch(/row-ops|Add row/);
		expect(studentHtml).toMatch(/Add row/);
	});
});

describe('ItemDetail wires the manager render with no write transport at all', () => {
	const src = readFileSync(
		new URL('../src/lib/classroom/ItemDetail.svelte', import.meta.url),
		'utf8'
	);

	// The manager branch: `{#if item.kind === 'assignment'} {#if canManage}
	// ... {#if spec} <SpecRenderer ...>`. Isolate just that call site rather
	// than matching anywhere in the file -- both so this cannot be satisfied
	// by the STUDENT call site (AssignmentEngine's, which legitimately does
	// wire transports) sitting later in the same file, and because the exact
	// literal text "{#if item.kind === 'assignment'}" ALSO appears once
	// earlier, in the hero's due-date chip logic, and "{#if canManage}" also
	// appears once up in this component's OWN doc comment (describing the
	// unrelated instructor-inspector `{#if canManage && hasInspector}`
	// region) -- so both need a landmark unique enough to skip past every
	// false match. "THE ENGINE SLOT" (this block's own leading comment,
	// written once) is that landmark.
	const engineSlotAt = src.indexOf('THE ENGINE SLOT');
	const elseIfEngineAt = src.indexOf('{:else if engine');
	const managerBranch = src.slice(engineSlotAt, elseIfEngineAt === -1 ? undefined : elseIfEngineAt);

	// The prose comment ABOVE this branch talks ABOUT `readonly` at length (see
	// the file's own header), so a check against the whole branch text would
	// happily match those words and never actually look at the tag. Pull out
	// just the `<SpecRenderer ... />` tag itself.
	const specRendererTag = managerBranch.match(/<SpecRenderer\b[^>]*\/>/)?.[0] ?? '';

	it('renders the manager spec view inside the canManage branch, tagged readonly', () => {
		expect(engineSlotAt).toBeGreaterThan(-1);
		expect(elseIfEngineAt).toBeGreaterThan(engineSlotAt);
		expect(specRendererTag).not.toBe('');
		expect(specRendererTag).toMatch(/(^|[\s{])readonly([\s}]|$)/);
		expect(specRendererTag).not.toMatch(/readonly\s*=\s*\{?\s*false/);
	});

	it('passes no onvalue/onupload/ondeletefile/oncaption handler -- nothing for a dispatched write to reach', () => {
		expect(managerBranch).not.toMatch(/onvalue\s*=/);
		expect(managerBranch).not.toMatch(/onupload\s*=/);
		expect(managerBranch).not.toMatch(/ondeletefile\s*=/);
		expect(managerBranch).not.toMatch(/oncaption\s*=/);
	});

	it('is gated on canManage the same way the rest of the inspector is -- no bare `spec` render outside it', () => {
		const beforeEngineSlot = src.slice(0, engineSlotAt);
		expect(beforeEngineSlot).not.toContain('<SpecRenderer');
	});
});
