// tests/classroom-spec-table-autoresize.test.ts
//
// THE GUARD ON THE INSTRUMENT, NOT ON THE CODE. The autoresize fix itself is
// proved in `tests/dom/spec-table-autoresize-mount.test.ts` (behaviour) and
// gated in Chromium by `tools/browser-verify/routes/spec-table-rows-12.mjs`
// (the measured pixel claims). What this file protects is the one thing
// neither of those can protect: that the browser gate keeps REFUSING a state
// it could not measure.
//
// WHY THAT NEEDS A TEST AT ALL. A cell inside a collapsed module has
// `clientHeight` and `scrollHeight` both 0, so `scrollHeight > clientHeight + 1`
// is false for every one of them and the natural count comes back `0 of 60
// clipped` -- a perfect score over a table nobody ever opened. Deleting the
// not-measured refusal from that spec therefore turns the check green and
// reddens NOTHING, anywhere, ever: the harness reports a clean run, the README
// counts a covered route, and the defect is invisible again. That is the
// definition of a silent regression, and it is not hypothetical -- it has
// happened twice on this exact surface. Prompt 0048's first browser spec
// omitted the click-open step and every number came back 0px; so did this
// route's own first draft, and both read as clean passes.
//
// IT ASSERTS THE PROPERTIES, NOT THE WORDING. A gate rewritten to say the same
// thing differently must stay green; a gate that stopped refusing must not.
// So each claim is checked by RUNNING the step's own source against a fabricated
// document, never by matching prose in it.
//
// The fabricated documents are the two states the real page reaches, and they
// are what a browser genuinely produces: a collapsed module (every box 0x0,
// which is what `display: none` yields) and an opened one.

import { describe, expect, it } from 'vitest';
import spec from '../tools/browser-verify/routes/spec-table-rows-12.mjs';

type Step = { click?: string; evaluate?: string; until?: string };
const steps = (spec as { prepare: Step[] }).prepare;

/** The step under test: the one that counts clipped cells. Located by what it
 *  READS rather than by its position, so inserting a step above it does not
 *  quietly point this file at something else. */
const clipStep = steps.find((s) => s.evaluate?.includes('clipped'));

/**
 * A stand-in for the page, holding as much DOM as the step actually touches.
 * `cells` are described by the three readings the gate consults; a collapsed
 * module is every cell at 0, which is what a browser reports for a box with a
 * `display: none` ancestor.
 */
function pageWith(cells: { clientWidth: number; clientHeight: number; scrollHeight: number }[]) {
	const el = (c: (typeof cells)[number]) => ({
		...c,
		getBoundingClientRect: () => ({ height: c.clientHeight + 2 })
	});
	const table = { getBoundingClientRect: () => ({ height: cells.length ? 658.8 : 0 }) };
	return {
		document: {
			querySelectorAll: (s: string) => (s.includes('textarea.cell') ? cells.map(el) : []),
			querySelector: (s: string) => (s.includes('table.entry-table') ? table : null)
		},
		window: { innerWidth: 375 }
	};
}

/** Run the step's own source in a scope carrying that fake page. The step is a
 *  string on purpose (it is shipped to `page.evaluate`), so this is the real
 *  thing and not a paraphrase of it. */
function runClipStep(page: ReturnType<typeof pageWith>): string {
	const fn = new Function('document', 'window', `return (${clipStep!.evaluate})();`);
	return fn(page.document, page.window) as string;
}

const opened = (n: number, clippedCount: number) =>
	Array.from({ length: n }, (_, i) => ({
		clientWidth: 96,
		clientHeight: 42,
		scrollHeight: i < clippedCount ? 118 : 42
	}));

const collapsed = (n: number) =>
	Array.from({ length: n }, () => ({ clientWidth: 0, clientHeight: 0, scrollHeight: 0 }));

describe('the 12-row browser gate reaches the state it measures', () => {
	it('opens the module before measuring anything', () => {
		// THE 0048 LESSON, PINNED. Without a press the table has no height and
		// every reading below it is a zero reported as a result.
		const click = steps.find((s) => s.click);
		expect(click).toBeDefined();
		expect(click!.click).toContain('aria-expanded="false"');
		// And it asserts the EFFECT it wanted, not that a button was pressed.
		expect(click!.until).toContain('height > 0');
	});

	it('no longer dispatches input at the cells to repair the page mid-run', () => {
		// The refit workaround existed only because the cells arrived clipped.
		// Left in place it would repair the page between the gate and the
		// page-cost band, hiding a regression from the band.
		const refits = steps.filter((s) => s.evaluate?.includes('new Event("input"'));
		expect(refits.length).toBe(0);
		// POSITIVE CONTROL for that absence: the same sweep, over the same
		// field, finds the steps that ARE there. A zero from a sweep looking at
		// the wrong property is worth nothing.
		expect(steps.filter((s) => s.evaluate?.includes('querySelectorAll')).length).toBeGreaterThan(0);
	});
});

describe('the gate tells NOT CLIPPED apart from NOT MEASURED', () => {
	it('refuses a module that is still collapsed rather than scoring it perfect', () => {
		expect(() => runClipStep(pageWith(collapsed(60)))).toThrow(/NOT MEASURED/i);
		// The refusal must be about the boxes, not about a count: state the
		// thing that is actually wrong.
		expect(() => runClipStep(pageWith(collapsed(60)))).toThrow(/60 of 60/);
	});

	it('refuses even ONE unmeasured cell among measured ones', () => {
		const mixed = [...opened(59, 0), ...collapsed(1)];
		expect(() => runClipStep(pageWith(mixed))).toThrow(/NOT MEASURED/i);
	});

	it('refuses a clipped cell, and says how many and how much is hidden', () => {
		expect(() => runClipStep(pageWith(opened(60, 19)))).toThrow(/19 of 60/);
		// 118 of content in a 42px box: 76px of a student's writing not on
		// screen. The figures are this test's, set two functions up.
		expect(() => runClipStep(pageWith(opened(60, 19)))).toThrow(/worst 76px hidden/);
	});

	it('passes a table that is open and fits, which is the positive control for all three', () => {
		const said = runClipStep(pageWith(opened(60, 0)));
		expect(said).toContain('0 of 60 cells clipped');
	});

	it('refuses a page with no cells at all rather than passing vacuously', () => {
		expect(() => runClipStep(pageWith([]))).toThrow(/no editable cells/i);
	});
});
