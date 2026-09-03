// tests/dom/classroom-module-collapse-mount.test.ts
//
// A MODULE COLLAPSING AS IT IS FINISHED, rather than two fixtures rendered
// either side of the moment.
//
// `tests/classroom-module-collapse.test.ts` is the other half and keeps every
// claim about what a browser RECEIVES: the disclosure's structure, the
// expanded/halfway/complete states, the header surviving the collapse, the
// fields and their values still being in the DOM, and role parity. What it
// could not do is move between those states, because SSR renders one frame:
//
//     "SAME CONVENTION AS disclosure-instructions-collapse.test.ts: the REAL
//      SpecRenderer, server-rendered (`svelte/server`'s `render()`), no DOM."
//
// TWO THINGS THAT NEEDS A DOM FOR:
//
//   1. WHAT HAPPENS AT THE MOMENT A MODULE *BECOMES* COMPLETE. The SSR file
//      proves a complete module renders collapsed and a halfway one renders
//      open. It cannot show the frame between them, and that frame is where
//      the reported defect lived: finishing the last field used to close the
//      panel over the very textarea being typed into (prompt 0018). Here the
//      module is finished a field at a time, on one mounted panel, and the
//      chip and the `aria-expanded` are read at each step.
//   2. THE MANUAL OVERRIDE FROM A REAL CLICK. The SSR file simulated a
//      person's toggle by writing the value into a fake `localStorage` and
//      re-rendering. That test is DELETED and replaced by the two here: a
//      press on the real trigger, writing to the real store, and the answer
//      surviving a remount.
//
// MUTATION-CHECKED, both directions; see this bundle's history entry.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import { mountInto, viewerIs } from './mount';
import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';

const Spec = SpecRenderer as unknown as Component<Record<string, unknown>>;

const PROSE = 'Read this before you start measuring.';
const ANSWER = 'The density came out higher than expected.';

/** TWO constrained blocks, so "halfway" is a real distinguishable state and
 *  not merely "nothing entered". The SSR file's fixture. */
const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'mc-1', title: 'Module collapse test', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Write-up',
			points: 10,
			blocks: [
				{ type: 'instructions', content: PROSE },
				{ type: 'textField', id: 'tf1', prompt: 'Explain your result.', minSentences: 1 },
				{ type: 'table', id: 't1', columns: [{ key: 'sample', label: 'Sample' }], minRows: 1 }
			]
		}
	]
} as AssignmentSpec;

function open(values: Record<string, ResponseValue> = {}) {
	return mountInto(Spec, {
		spec: SPEC,
		initialValues: values,
		readonly: false,
		uploadEnabled: false
	});
}

/** The key the module panel writes under, spelled out rather than imported:
 *  an expected value taken from the code under test cannot fail. */
const MODULE_KEY = 'idea:disclosure:1:user-a:mc-1:m1:module';

const chip = (m: { all<T extends Element>(s: string): T[] }) =>
	(m.all('.done-chip')[0]?.textContent ?? '').trim().replace(/\s+/g, ' ');

beforeEach(() => {
	localStorage.clear();
});

/**
 * `collapseWhen` DECIDES HOW A MODULE ARRIVES, NEVER WHEN IT SHUTS.
 *
 * The first test in here used to be called "stays open through the halfway
 * state and closes on the last field", and the closing half was the defect
 * (prompt 0018): a module folding itself away as somebody finished typing into
 * it, blurring the caret and taking the page's height with it. What survives
 * unchanged is the ARRIVAL rule -- a module that is already complete when the
 * page loads is handed over collapsed, which is what the third test here
 * asserts and what keeps these two claims from being one.
 */
describe('a module is not folded by the work being done inside it', () => {
	it('stays open through the halfway state and through the last field', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			// Nothing entered.
			expect(m.expanded('module-body')).toBe('true');
			expect(chip(m)).toBe('0/2 done');

			// One of two blocks met. THE CASE THE COLLAPSE MUST NOT BURY: a
			// signal keyed on `started` instead of `complete` closes here.
			const answer = m.one<HTMLTextAreaElement>('textarea.answer');
			answer.value = ANSWER;
			answer.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();

			expect(chip(m)).toBe('1/2 done');
			expect(m.expanded('module-body')).toBe('true');

			// The last field, entered on the SAME mounted panel.
			m.all<HTMLButtonElement>('button')
				.find((b) => /add row/i.test(b.textContent ?? ''))!
				.click();
			m.flush();
			const cell = m.one<HTMLTextAreaElement>('textarea.cell');
			cell.value = '1';
			cell.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();

			// COMPLETE, AND STILL OPEN. The chip moving 0/2 -> 1/2 -> 2/2 is this
			// test's own positive control: `collapseWhen` genuinely went true
			// under the panel, and the panel did not act on it.
			expect(chip(m)).toBe('2/2 done');
			expect(m.expanded('module-body')).toBe('true');
			// Nothing was written, either. Staying open is the rule, not a
			// choice recorded on this person's behalf.
			expect(Object.keys(localStorage)).toHaveLength(0);
		} finally {
			await m.stop();
			restore();
		}
	});

	it('re-opens on its own when the work is taken back out', async () => {
		// Completion is DERIVED, never stored, so a module that stops being
		// complete stops being collapsed. A stamped flag would not come back.
		//
		// AND THIS IS THE DIRECTION THE LATCH DELIBERATELY LEAVES ALIVE. The
		// fix for the typing collapse lets `collapseWhen` FALL and never rise:
		// opening a closed panel takes nothing away from anybody, while closing
		// an open one is the reported defect. `SpecImporter` depends on the same
		// direction -- a refused clipboard copy opens its JSON panel -- so a fix
		// that merely sampled the signal once would have killed that silently.
		const restore = viewerIs('user-a');
		const m = open({ tf1: { text: ANSWER }, t1: { rows: [{ sample: '1' }] } });
		try {
			expect(m.expanded('module-body')).toBe('false');
			expect(chip(m)).toBe('2/2 done');

			const answer = m.one<HTMLTextAreaElement>('textarea.answer');
			answer.value = '';
			answer.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();

			expect(chip(m)).toBe('1/2 done');
			expect(m.expanded('module-body')).toBe('true');
			// And nothing was written: this is a signal, not a choice.
			expect(Object.keys(localStorage)).toHaveLength(0);
		} finally {
			await m.stop();
			restore();
		}
	});

	it('collapses the module without taking its heading or its work with it', async () => {
		const restore = viewerIs('user-a');
		const m = open({ tf1: { text: ANSWER }, t1: { rows: [{ sample: '1' }] } });
		try {
			expect(m.expanded('module-body')).toBe('false');
			// Legible as DONE rather than as a gap in the page.
			expect(m.target.textContent).toContain('Write-up');
			expect(chip(m)).toBe('2/2 done');
			// HIDES, NEVER REMOVES: the prose, the answer and the row are all
			// still in the DOM, so it prints and re-opening costs nothing.
			expect(m.target.textContent).toContain(PROSE);
			expect(m.one<HTMLTextAreaElement>('textarea.answer').value).toBe(ANSWER);
			expect(m.one<HTMLTextAreaElement>('textarea.cell').value).toBe('1');
		} finally {
			await m.stop();
			restore();
		}
	});
});

/**
 * THE OVERRIDE IS ASSERTED ON ARRIVAL, AND IT HAS TO BE.
 *
 * The first test here used to open a module by hand and then finish it under
 * the panel, on the grounds that the choice was what held it open. Since the
 * typing collapse was fixed nothing closes an open panel but the person's own
 * press, so that test would pass with an EMPTY STORE -- an assertion that
 * cannot fail is not a test. Where the stored choice still does real work is
 * the state a returning person is handed, which is what both tests below
 * measure, each against the arrival it is overriding.
 */
describe("a person's own press beats the completion signal", () => {
	it('holds a complete module open across a reload', async () => {
		const restore = viewerIs('user-a');
		const DONE = { tf1: { text: ANSWER }, t1: { rows: [{ sample: '1' }] } };

		// Arrives collapsed, because it is complete. This person opens it.
		const first = open(DONE);
		try {
			expect(first.expanded('module-body')).toBe('false');
			first.trigger('module-body')!.click();
			first.flush();
			expect(localStorage.getItem(MODULE_KEY)).toBe('open');
		} finally {
			await first.stop();
		}

		// They come back. The module is still complete, so the signal still
		// says collapse; their own answer outranks it. Without the store this
		// remount reads 'false' -- which is the line above, unchanged.
		const second = open(DONE);
		try {
			expect(second.expanded('module-body')).toBe('true');
			expect(chip(second)).toBe('2/2 done');
		} finally {
			await second.stop();
			restore();
		}
	});

	it('holds an unfinished module closed, and the answer survives a remount', async () => {
		const restore = viewerIs('user-a');
		const first = open();
		try {
			first.trigger('module-body')!.click();
			first.flush();
			expect(first.expanded('module-body')).toBe('false');
			expect(localStorage.getItem(MODULE_KEY)).toBe('closed');
		} finally {
			await first.stop();
		}

		// A reload. Nothing has been entered, so the signal alone would open it.
		const second = open();
		try {
			expect(second.expanded('module-body')).toBe('false');
			expect(chip(second)).toBe('0/2 done');
		} finally {
			await second.stop();
			restore();
		}
	});

	it('the module panel and the instructions panel remember separately', async () => {
		// Two disclosures on one module. Collapsing the module must not be read
		// as an answer about the instructions inside it, or a student who closed
		// a finished module would find the next module's reading gone too.
		const restore = viewerIs('user-a');
		const m = open();
		try {
			m.trigger('module-body')!.click();
			m.flush();
			expect(Object.keys(localStorage)).toEqual([MODULE_KEY]);
			expect(m.expanded('module-instructions')).toBe('true');

			m.trigger('module-instructions')!.click();
			m.flush();
			expect(Object.keys(localStorage).sort()).toEqual(
				[MODULE_KEY, 'idea:disclosure:1:user-a:mc-1:m1:instructions:0'].sort()
			);
		} finally {
			await m.stop();
			restore();
		}
	});
});
