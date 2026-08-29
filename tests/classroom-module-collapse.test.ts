// tests/classroom-module-collapse.test.ts
//
// A WHOLE MODULE COLLAPSES, NOT JUST ITS INSTRUCTIONS.
//
// Before this, SpecRenderer wrapped only a module's `instructions` block in a
// Disclosure. A student who finished a module had nothing to close: the
// heading, the intro and every field stayed on screen regardless. This wraps
// each module's BODY (intro + every block) in its own Disclosure, scoped per
// module, collapsing once that module is COMPLETE -- not merely started, so a
// module a student is halfway through stays open.
//
// SAME CONVENTION AS disclosure-instructions-collapse.test.ts: the REAL
// SpecRenderer, server-rendered (`svelte/server`'s `render()`). This file is
// deliberately ONE FRAME -- it asserts what a browser RECEIVES for a given set
// of values, which is a different question from what a browser then does with
// it. The behavioural half is `tests/dom/classroom-module-collapse-mount.test.ts`,
// which mounts the same component and moves BETWEEN these states.
//
// What would fail SILENTLY and is worth pinning here:
//
//   * COMPLETION, NOT "STARTED". A module halfway done collapsing on its own
//     would bury work still in progress.
//   * THE HEADING SURVIVING THE COLLAPSE. If it collapsed WITH the body, a
//     done module would read as a gap in the page rather than as finished.
//   * HIDES, NEVER REMOVES. A collapsed module's fields must still be in the
//     DOM, with their values, so the module still prints and re-opening it
//     costs nothing.
//
// THE MANUAL OVERRIDE IS NO LONGER PINNED HERE. It was, by writing a fake
// `localStorage` and re-rendering; see the note where that test used to sit,
// below.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';

const PROSE = 'Read this before you start measuring.';
const ANSWER = 'The density came out higher than expected.';

/**
 * TWO CONSTRAINED BLOCKS, so "halfway" is a real, distinguishable state:
 * one block met and the other not, as opposed to nothing entered at all.
 */
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
				{
					type: 'table',
					id: 't1',
					columns: [{ key: 'sample', label: 'Sample' }],
					minRows: 2
				}
			]
		}
	]
} as AssignmentSpec;

const FRESH: Record<string, ResponseValue> = {};
/** One of the two blocks met, the other not: complete is FALSE, started is TRUE. */
const HALFWAY: Record<string, ResponseValue> = {
	tf1: { text: ANSWER }
};
/** Both blocks met: complete is TRUE. */
const COMPLETE: Record<string, ResponseValue> = {
	tf1: { text: ANSWER },
	t1: { rows: [{ sample: '1' }, { sample: '2' }] }
};

function draw(initialValues: Record<string, ResponseValue>, readonly = false): string {
	return render(SpecRenderer, {
		props: { spec: SPEC, initialValues, readonly, uploadEnabled: false }
	}).body;
}

/** The module-body trigger's own tag, picked out by its testid rather than by
 *  position -- the same discipline the instructions test applies, and for the
 *  same reason: a panel added above this one must not silently start being
 *  read by this assertion. */
function moduleTrigger(html: string): string {
	const match = html.match(/<button[^>]*data-testid="module-body"[^>]*>/);
	expect(match, 'no module-body disclosure rendered at all').not.toBeNull();
	return match![0];
}

describe('the module body disclosure', () => {
	it('renders as a real disclosure with its own scope, distinct from the instructions one', () => {
		const html = draw(FRESH);
		const tag = moduleTrigger(html);
		expect(tag).toContain('type="button"');
		expect(tag).toMatch(/aria-expanded="(true|false)"/);
		const controls = tag.match(/aria-controls="([^"]+)"/);
		expect(controls, 'the trigger controls nothing').not.toBeNull();
		expect(html).toContain(`id="${controls![1]}"`);
		// Both disclosures render on the same module; they must not collide.
		expect(html).toMatch(/data-testid="module-instructions"/);
	});

	it('is EXPANDED when the module has not been started at all', () => {
		const html = draw(FRESH);
		expect(moduleTrigger(html)).toContain('aria-expanded="true"');
	});

	it('stays EXPANDED when the module is started but not complete', () => {
		// One block met, one not -- the "halfway" case the collapse must not
		// bury. This is the case that distinguishes "complete" from "started":
		// a collapse keyed on `started` would close this module; one keyed on
		// completion must not.
		const html = draw(HALFWAY);
		expect(moduleTrigger(html)).toContain('aria-expanded="true"');
	});

	it('is COLLAPSED once every constrained block in the module is met', () => {
		const html = draw(COMPLETE);
		expect(moduleTrigger(html)).toContain('aria-expanded="false"');
		expect(html).toContain('data-open="false"');
	});

	it('never collapses a module with nothing to complete (instructions-only)', () => {
		const onlyInstructions: AssignmentSpec = {
			...SPEC,
			modules: [{ ...SPEC.modules[0], blocks: [{ type: 'instructions', content: PROSE }] }]
		} as AssignmentSpec;
		const html = render(SpecRenderer, {
			props: { spec: onlyInstructions, initialValues: {}, uploadEnabled: false }
		}).body;
		expect(moduleTrigger(html)).toContain('aria-expanded="true"');
	});

	it('HIDES the module, it never removes it: a collapsed module still prints its fields and their values', () => {
		const html = draw(COMPLETE);
		expect(html).toContain('data-open="false"');
		// The header survives the collapse, and carries the completion state.
		expect(html).toContain('Write-up');
		expect(html).toContain('done-chip');
		expect(html).toMatch(/2\s*\/\s*2\s*done/);
		// The body is still in the DOM: the instructions prose, the answer text
		// and the filled table rows are all still there to print or reopen.
		expect(html).toContain(PROSE);
		expect(html).toContain(ANSWER);
		// The table cell is a <textarea>, so its value is the element's TEXT
		// content, not a `value` attribute.
		expect(html).toMatch(/class="cell[ "][^>]*>1</);
		expect(html).toMatch(/class="cell[ "][^>]*>2</);
	});

	/**
	 * THE MANUAL OVERRIDE MOVED, IT WAS NOT DROPPED.
	 *
	 * There used to be an `it` here called "lets a person's own toggle override
	 * the completion signal in both directions". It installed a fake
	 * `localStorage` on `globalThis`, wrote `open`/`closed` under the panel's key
	 * with `writeDisclosure`, and re-rendered -- SIMULATING the value a press
	 * would have produced, because there was no way to press anything.
	 *
	 * It was a pure stand-in for a client, not a claim about a server render: on
	 * a real server there IS no `localStorage`, `readDisclosure` returns null and
	 * this branch cannot execute, so the only configuration it ever described was
	 * a browser's. `tests/dom/classroom-module-collapse-mount.test.ts` now presses
	 * the real trigger, writes the real store and reads the answer back after a
	 * remount, in both directions ("holds a finished module open while it is
	 * being finished" and "holds an unfinished module closed, and the answer
	 * survives a remount"), which is the same claim without the simulation.
	 *
	 * Everything else in this file stays: it asserts what a browser RECEIVES,
	 * which is a different question from what a browser then does.
	 */

	it('gives the instructor the identical panel in the identical state, with no role branch', () => {
		for (const values of [FRESH, HALFWAY, COMPLETE]) {
			const student = moduleTrigger(draw(values, false)).match(/aria-expanded="(true|false)"/)![1];
			const manager = moduleTrigger(draw(values, true)).match(/aria-expanded="(true|false)"/)![1];
			expect(manager).toBe(student);
		}
	});
});
