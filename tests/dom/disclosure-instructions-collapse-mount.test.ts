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
//   2. THE OVERRIDE AS A TRANSITION. The SSR file proves `disclosureOpen(true,
//      true)` is `true`. That is the arithmetic. What it cannot show is ONE
//      panel, opened by hand, STAYING open as `collapseWhen` flips underneath
//      it -- which is the moment the rule exists for and the moment a
//      refactor to "store the current state" would break.
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

describe('a manual choice beats the collapse signal AS A TRANSITION', () => {
	it('keeps one panel open while the student starts work underneath it', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			// This person opened the panel deliberately on an item they had not
			// started. (Open -> closed -> open, so a choice is genuinely stored:
			// the default is already open, and "no choice" is a different state
			// from "chose open".)
			const trigger = m.trigger('module-instructions')!;
			trigger.click();
			m.flush();
			trigger.click();
			m.flush();
			expect(localStorage.getItem(keyFor('user-a'))).toBe('open');
			expect(m.expanded('module-instructions')).toBe('true');

			// Now they start typing. `collapseWhen` (SpecRenderer's `started`)
			// flips under the SAME mounted panel -- no remount, no second
			// fixture. Without a stored choice this would collapse.
			const answer = m.one<HTMLTextAreaElement>('textarea.answer');
			answer.value = 'The density came out higher than expected.';
			answer.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();

			expect(m.expanded('module-instructions')).toBe('true');
		} finally {
			await m.stop();
			restore();
		}
	});

	it('POSITIVE CONTROL: the identical typing collapses a panel nobody chose', async () => {
		// Same mount, same keystroke, no stored choice. If this did not
		// collapse, the assertion above would be agreeing with a signal that
		// never moved.
		const restore = viewerIs('user-a');
		const m = open();
		try {
			expect(m.expanded('module-instructions')).toBe('true');
			const answer = m.one<HTMLTextAreaElement>('textarea.answer');
			answer.value = 'The density came out higher than expected.';
			answer.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();
			expect(m.expanded('module-instructions')).toBe('false');
		} finally {
			await m.stop();
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
