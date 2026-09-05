// tests/dom/disclosure-instructions-collapse-mount.test.ts
//
// THE BEHAVIOURAL HALF OF THE INSTRUCTIONS COLLAPSE.
//
// `tests/disclosure-instructions-collapse.test.ts` is the other half and stays
// exactly as it is: it asserts the pure rule (`disclosureOpen`,
// `disclosureKey`, `readDisclosure`), the SSR markup a browser RECEIVES, and
// ItemDetail's wiring read from source. What it says it cannot do, in its own
// words, is the toggle:
//
//     "The fourth claim -- that pressing the trigger toggles -- fails loudly
//      the first time anyone looks, and belongs in the harness
//      (/dev/classroom), not here. There is no DOM or event-dispatch harness
//      in this repo (`environment: 'node'`, `svelte/server`'s `render()`
//      only)"
//
// There is one now. This file presses the real control on the real component
// and reads what happened.
//
// THREE THINGS IT REACHES THAT NO SSR RENDER CAN:
//
//   1. THE PRESS ITSELF. `aria-expanded` moving because a person clicked,
//      rather than because two fixtures were rendered with different inputs.
//   2. `collapseWhen` FLIPPING UNDER ONE MOUNTED PANEL. The SSR file renders
//      one frame, so it can show a started item arriving collapsed and a fresh
//      one arriving open; it cannot show the MOMENT between them, which is
//      where the reported defect lived -- a panel folding itself away while
//      somebody was typing inside it (prompt 0018).
//   3. THE PER-VIEWER KEY, WHICH NOTHING ANYWHERE ASSERTED BEFORE THIS FILE.
//
// (3) IS NOT A TEST-QUALITY POINT AND IS THE REASON THIS FILE EXISTS. The
// viewer segment is in the key because these are SHARED SHOP WORKSTATIONS: two
// students sign into the same machine, open the same assignment, and one of
// them collapsing the instructions must not hide them from the other.
// `disclosureKey` had a unit test proving two viewer strings produce two
// strings; nothing proved the component ever puts a viewer into it, nothing
// proved the write and the read use the same key, and nothing proved the
// answer survives a reload. A regression to a single shared key -- the tidier
// shape, and the one a future session would write -- passes every existing
// assertion in the repo.
//
// MUTATION-CHECKED, both directions; the mutations and their outcomes are in
// this bundle's history entry.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import { mountInto, viewerIs } from './mount';
import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';

const Spec = SpecRenderer as unknown as Component<Record<string, unknown>>;

const PROSE = 'Measure every dimension twice with the caliper.';

/** The same shape the SSR file uses: one instructions block and one
 *  constrained block, so `started` is a state a test can actually reach. */
const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-1', title: 'Density lab', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Measurement',
			points: 10,
			blocks: [
				{ type: 'instructions', content: PROSE },
				{ type: 'textField', id: 'tf1', prompt: 'Explain your result.', minSentences: 1 }
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

/** The key the component writes under, spelled out ONCE here rather than
 *  imported from `$lib/disclosure` -- a test whose expected value comes from
 *  the thing it is testing cannot fail. This is the string a person reading
 *  the store on a shop workstation would see. */
const keyFor = (viewer: string) => `idea:disclosure:1:${viewer}:a-1:m1:instructions:0`;

beforeEach(() => {
	localStorage.clear();
});

describe('pressing the real trigger', () => {
	it('toggles the panel, and the word on the control moves with it', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			const trigger = m.trigger('module-instructions');
			expect(trigger, 'no instructions disclosure mounted at all').not.toBeNull();

			// A fresh item: expanded, and the control offers to Hide.
			expect(m.expanded('module-instructions')).toBe('true');
			expect(trigger!.textContent).toContain('Hide');
			expect(m.one('[data-open]').getAttribute('data-open')).toBe('true');

			trigger!.click();
			m.flush();

			expect(m.expanded('module-instructions')).toBe('false');
			expect(trigger!.textContent).toContain('Show');

			// HIDES, NEVER REMOVES: still one press away, and still on the
			// printed sheet. This is the claim an `{#if}` would break silently.
			expect(m.target.textContent).toContain(PROSE);

			trigger!.click();
			m.flush();
			expect(m.expanded('module-instructions')).toBe('true');
		} finally {
			await m.stop();
			restore();
		}
	});

	it('writes the manual choice, and only on a press', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			// Rendering it did not write anything. What is stored is a CHOICE.
			expect(Object.keys(localStorage)).toHaveLength(0);

			m.trigger('module-instructions')!.click();
			m.flush();

			expect(localStorage.getItem(keyFor('user-a'))).toBe('closed');

			m.trigger('module-instructions')!.click();
			m.flush();
			expect(localStorage.getItem(keyFor('user-a'))).toBe('open');
		} finally {
			await m.stop();
			restore();
		}
	});
});

/**
 * THE TYPING COLLAPSE (prompt 0018), asserted at the level a browser cannot be
 * asked about in CI.
 *
 * THIS BLOCK USED TO ASSERT THE DEFECT, AND SAID SO IN A TEST NAME: "POSITIVE
 * CONTROL: the identical typing collapses a panel nobody chose". It was a
 * correct reading of the code and a wrong reading of the standard.
 * IDEA_INTERFACE_STANDARDS 1 is about what a person is HANDED -- "reading
 * material does not sit between a person and their work on every return
 * visit" -- so `collapseWhen` decides how a panel ARRIVES. Read live it also
 * closed a panel somebody was inside, and because the region is hidden with
 * `display: none` that blurred the caret and took the page's height with it,
 * which is exactly what an instructor reported from a real classroom.
 *
 * WHICH IS WHY THE OVERRIDE IS NOW ASSERTED ON ARRIVAL AND NOT AS A LIVE
 * TRANSITION. Under the latch NOTHING closes an open panel but the person's
 * own press, so a live-transition test of the stored choice would pass with an
 * empty store -- it would be agreeing with a signal that can no longer do
 * anything. The store's work is visible where it is real: the state the panel
 * is handed to somebody who has chosen before.
 */
describe('a panel open on screen is closed by its own control and nothing else', () => {
	it('keeps an open panel open while the student types underneath it', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			// NOTHING STORED. That is the point: this is not the override, it is
			// the panel's own guarantee.
			expect(Object.keys(localStorage)).toHaveLength(0);
			expect(m.expanded('module-instructions')).toBe('true');

			const answer = m.one<HTMLTextAreaElement>('textarea.answer');
			answer.value = 'The density came out higher than expected.';
			answer.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();

			expect(m.expanded('module-instructions')).toBe('true');
			// And still nothing stored: staying open is the rule, not a choice
			// the component wrote down on this person's behalf.
			expect(Object.keys(localStorage)).toHaveLength(0);
		} finally {
			await m.stop();
			restore();
		}
	});

	it('POSITIVE CONTROL: the identical value ARRIVES collapsed', async () => {
		// The same text, present from the first frame instead of typed into an
		// open panel. `collapseWhen` is genuinely true for this value -- so the
		// assertion above is not agreeing with a signal that never moved, and a
		// fix that simply stopped honouring `collapseWhen` reddens here.
		const restore = viewerIs('user-a');
		const m = open({ tf1: { text: 'The density came out higher than expected.' } });
		try {
			expect(m.expanded('module-instructions')).toBe('false');
		} finally {
			await m.stop();
			restore();
		}
	});

	it('a manual choice still beats the signal on arrival', async () => {
		const restore = viewerIs('user-a');
		const started = { tf1: { text: 'The density came out higher than expected.' } };

		// Arrives collapsed (the control above), and this person opens it.
		const first = open(started);
		try {
			expect(first.expanded('module-instructions')).toBe('false');
			first.trigger('module-instructions')!.click();
			first.flush();
			expect(localStorage.getItem(keyFor('user-a'))).toBe('open');
		} finally {
			await first.stop();
		}

		// They come back to the same started item. The signal still says
		// collapse; their own answer outranks it.
		const second = open(started);
		try {
			expect(second.expanded('module-instructions')).toBe('true');
		} finally {
			await second.stop();
			restore();
		}
	});
});

describe('TWO PEOPLE, ONE WORKSTATION, ONE ITEM', () => {
	it('keeps their collapse state apart, and each one survives a remount', async () => {
		// A collapses the instructions.
		let restore = viewerIs('user-a');
		let m = open();
		try {
			m.trigger('module-instructions')!.click();
			m.flush();
			expect(m.expanded('module-instructions')).toBe('false');
		} finally {
			await m.stop();
			restore();
		}

		// B signs in on the same machine and opens the same item. B has chosen
		// nothing, so B gets the default -- NOT A's answer.
		restore = viewerIs('user-b');
		m = open();
		try {
			expect(m.expanded('module-instructions')).toBe('true');
			// And B's own choice goes somewhere else again.
			m.trigger('module-instructions')!.click();
			m.flush();
			expect(m.expanded('module-instructions')).toBe('false');
			m.trigger('module-instructions')!.click();
			m.flush();
			expect(localStorage.getItem(keyFor('user-b'))).toBe('open');
		} finally {
			await m.stop();
			restore();
		}

		// TWO keys in the store, not one. A single shared key is the regression
		// this whole describe exists for, and it would leave exactly one.
		expect(Object.keys(localStorage).sort()).toEqual([keyFor('user-a'), keyFor('user-b')]);
		expect(localStorage.getItem(keyFor('user-a'))).toBe('closed');

		// A comes back. A's own answer is still A's, unchanged by B having been
		// here -- which is the whole rule, and needs the remount to be visible.
		restore = viewerIs('user-a');
		m = open();
		try {
			expect(m.expanded('module-instructions')).toBe('false');
		} finally {
			await m.stop();
			restore();
		}
	});

	it('keeps one person apart from themselves across two items', async () => {
		const restore = viewerIs('user-a');
		const first = open();
		try {
			first.trigger('module-instructions')!.click();
			first.flush();
		} finally {
			await first.stop();
		}

		// A different assignment, same person, same panel label.
		const other = mountInto(Spec, {
			spec: { ...SPEC, meta: { ...SPEC.meta, assignmentId: 'a-2' } },
			initialValues: {},
			readonly: false,
			uploadEnabled: false
		});
		try {
			expect(other.expanded('module-instructions')).toBe('true');
		} finally {
			await other.stop();
			restore();
		}
	});

	it('a signed-out reader is keyed too, rather than colliding on nothing', async () => {
		const restore = viewerIs(null);
		const m = open();
		try {
			m.trigger('module-instructions')!.click();
			m.flush();
			const keys = Object.keys(localStorage);
			expect(keys).toHaveLength(1);
			// `anon`, and NOT `undefined`/`null`: a key built from a missing
			// viewer must still be a key, or every signed-out reader on the
			// machine shares one.
			expect(keys[0]).toBe('idea:disclosure:1:anon:a-1:m1:instructions:0');
		} finally {
			await m.stop();
			restore();
		}
	});
});
