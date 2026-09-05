// tests/dom/spec-table-autoresize-mount.test.ts
//
// A CELL MOUNTED INSIDE A COLLAPSED MODULE MUST NOT FIT ITSELF TO A BOX THAT
// IS NOT BEING LAID OUT, AND MUST FIT ITSELF WHEN THAT BOX ARRIVES.
//
// The defect (prompt 0051, found by prompt 0048's page-cost route): `Disclosure`
// hides a collapsed region with `display: none`, so a textarea mounted inside a
// module that arrives closed -- which is every module a student has FINISHED,
// `collapseWhen={complete}` -- reports `scrollHeight` 0. `use:autoresize` ran
// once at mount, wrote `height: 2px` (0 plus the border allowance), and then
// re-ran only on `input`. Re-opening the module therefore left the cell at its
// `min-height: 44px` floor with `overflow: hidden` over taller content.
// Measured in Chromium at 375px on `/dev/spec-table?rows=12`: 19 of 60 cells
// clipped, worst 118px of writing showing in a 42px box, 0 of 60 under the 44px
// tap floor -- so nothing about reach, and a student simply could not see the
// answer they had typed.
//
// NO GEOMETRY IS ASSERTED HERE, and happy-dom having none is what makes this
// file possible rather than what limits it. See `tests/dom/mount.ts`: there is
// no layout engine, so EVERY element reports `clientWidth` 0 and `scrollHeight`
// 0 -- which is exactly the state a `display: none` ancestor produces in a real
// browser. The unlaid-out case is the DEFAULT here and needs no fixture at all;
// what has to be faked is the opposite, a box with a size, and it is faked
// explicitly and named as such. The measured pixel claims belong to
// `tools/browser-verify/routes/spec-table-rows-12.mjs`, which gates them.
//
// EVERY ABSENCE HERE HAS ITS POSITIVE CONTROL IN THE SAME TEST. "No inline
// height was written" is also what a tree with `fit()` deleted outright would
// report, so each such assertion is paired with a box that DOES get one.
//
// Mutation-checked; see this bundle's history entry for both directions.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import { mountInto, viewerIs } from './mount';
import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';

const Spec = SpecRenderer as unknown as Component<Record<string, unknown>>;

/** Long enough that a real browser wraps it well past one line. The value is
 *  never measured here -- it is what makes the fixture honest about being a
 *  cell somebody actually wrote in. */
const LONG = 'Displacement reading repeated twice for this one, and the second run agreed.';

const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'ar-1', title: 'Autoresize fixture', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Sample log',
			points: 10,
			blocks: [
				{
					type: 'table',
					id: 't1',
					columns: [
						{ key: 'sample', label: 'Sample' },
						{ key: 'notes', label: 'Notes' }
					],
					minRows: 2
				},
				{ type: 'textField', id: 'tf1', prompt: 'Explain your result.', minSentences: 1 }
			]
		}
	]
} as AssignmentSpec;

const VALUES: Record<string, ResponseValue> = {
	t1: {
		rows: [
			{ sample: 'B-1', notes: LONG },
			{ sample: 'B-2', notes: LONG }
		]
	},
	tf1: { text: LONG }
};

/**
 * THE OBSERVER IS RECORDED, NOT MOCKED. The real `ResizeObserver` happy-dom
 * provides still constructs and still holds the callback; this wrapper only
 * writes down which instances were made, what they were told to watch, and --
 * critically -- keeps the callback so a test can DELIVER to it. There is no
 * layout here, so nothing will ever deliver on its own; a visibility change
 * that a browser reports has to be played by hand, and playing it is the whole
 * point of the second describe block below.
 */
type Watch = { cb: ResizeObserverCallback; observed: Element[]; unobserved: Element[] };
let watches: Watch[] = [];
let RealRO: typeof ResizeObserver;

beforeEach(() => {
	watches = [];
	RealRO = globalThis.ResizeObserver;
	globalThis.ResizeObserver = class extends RealRO {
		#w: Watch;
		constructor(cb: ResizeObserverCallback) {
			super(cb);
			this.#w = { cb, observed: [], unobserved: [] };
			watches.push(this.#w);
		}
		observe(el: Element, o?: ResizeObserverOptions) {
			this.#w.observed.push(el);
			return super.observe(el, o);
		}
		unobserve(el: Element) {
			this.#w.unobserved.push(el);
			return super.unobserve(el);
		}
	} as typeof ResizeObserver;
	localStorage.clear();
});

afterEach(() => {
	globalThis.ResizeObserver = RealRO;
});

function open() {
	return mountInto(Spec, { spec: SPEC, initialValues: VALUES, readonly: false, uploadEnabled: false });
}

/** A box with a SIZE, which nothing in this environment has by itself. Both
 *  readings are needed together: `clientWidth` is what the guard consults and
 *  `scrollHeight` is what the fit computes from, so faking one alone measures
 *  the other half of the code rather than the branch. */
function giveItABox(el: HTMLTextAreaElement, width: number, content: number) {
	Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
	Object.defineProperty(el, 'scrollHeight', { value: content, configurable: true });
}

/** Deliver a resize for `el` to every observer watching it, the way a browser
 *  does when a `display: none` ancestor stops hiding the box. */
function deliverResize(el: Element) {
	let delivered = 0;
	for (const w of watches) {
		if (!w.observed.includes(el)) continue;
		delivered += 1;
		w.cb([{ target: el } as unknown as ResizeObserverEntry], null as unknown as ResizeObserver);
	}
	return delivered;
}

const autoresized = (m: { all<T extends Element>(s: string): T[] }) =>
	m.all<HTMLTextAreaElement>('textarea.cell, textarea.answer');

describe('a box with no layout is not fitted to', () => {
	it('writes no inline height at mount, where every box is unlaid-out', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			const boxes = autoresized(m);
			// The fixture is real: two rows of two columns, plus the free-text
			// answer. A count of zero would make every claim below vacuous.
			expect(boxes.length).toBe(5);
			for (const el of boxes) expect(el.clientWidth).toBe(0);

			// THE ASSERTION. On the tree this replaces every one of these read
			// `height: 2px` -- `scrollHeight` 0 plus the 2px border allowance.
			expect(boxes.map((el) => el.style.height)).toEqual(['', '', '', '', '']);
		} finally {
			await m.stop();
			restore();
		}
	});

	it('DOES write one for a box that has a size -- the control for the line above', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			const cell = m.one<HTMLTextAreaElement>('textarea.cell');
			expect(cell.style.height).toBe('');

			// The same cell, now laid out: 96px wide with 127px of content.
			giveItABox(cell, 96, 127);
			cell.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();

			// 127 + the 2px border allowance. The number is the fixture's, not
			// the code's: `scrollHeight` was set to 127 two lines up.
			expect(cell.style.height).toBe('129px');
			// And nothing else moved: a sized box does not fit its neighbours.
			expect(m.all<HTMLTextAreaElement>('textarea.cell')[1].style.height).toBe('');
		} finally {
			await m.stop();
			restore();
		}
	});
});

describe('the box appearing is what refits it', () => {
	it('observes every autoresized box, sharing one observer across the renderer', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			const boxes = autoresized(m);
			const observed = watches.flatMap((w) => w.observed);
			for (const el of boxes) expect(observed).toContain(el);

			// ONE OBSERVER FOR THE RENDERER, NOT ONE PER BOX. A table is sixty
			// textareas at twelve rows by five columns and this is the shape
			// that keeps that one object rather than sixty. Measured in Chromium
			// on `/dev/spec-table?rows=12`: 2 instances for a page carrying 62
			// autoresized boxes across two mounted renderers.
			expect(watches.length).toBe(1);
			expect(watches[0].observed.length).toBe(boxes.length);
		} finally {
			await m.stop();
			restore();
		}
	});

	it('fits a cell when its box arrives, with no input and no press', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			const cell = m.one<HTMLTextAreaElement>('textarea.cell');
			expect(cell.style.height).toBe('');

			// The module opens: the box the browser could not measure now has
			// one, and the browser says so. NOTHING here types or clicks --
			// reading back work already written is the case that was broken.
			giveItABox(cell, 96, 118);
			expect(deliverResize(cell)).toBe(1);
			m.flush();

			expect(cell.style.height).toBe('120px');
		} finally {
			await m.stop();
			restore();
		}
	});

	it('settles instead of looping: a second delivery changes nothing', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		try {
			const cell = m.one<HTMLTextAreaElement>('textarea.cell');
			giveItABox(cell, 96, 118);
			deliverResize(cell);
			const first = cell.style.height;
			// A real browser delivers again after the height it just wrote
			// changed the box. `fit()` recomputes the same string, so the box
			// ends that frame where it started and nothing is reported again.
			deliverResize(cell);
			deliverResize(cell);
			expect(cell.style.height).toBe(first);
		} finally {
			await m.stop();
			restore();
		}
	});

	it('stops watching a box it no longer owns', async () => {
		const restore = viewerIs('user-a');
		const m = open();
		const boxes = autoresized(m);
		try {
			expect(watches[0].unobserved.length).toBe(0);
		} finally {
			await m.stop();
			restore();
		}
		// Unmounted: every observation the action took is given back, so a
		// renderer that comes and goes does not leave the observer holding
		// detached nodes.
		for (const el of boxes) expect(watches[0].unobserved).toContain(el);
	});
});
