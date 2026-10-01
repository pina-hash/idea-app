// tests/dom/classroom-panel-stack.test.ts
//
// A REORDER NEVER MOVES THE ANCHOR (ledger 0360, report R23). Moving an
// `<iframe>` in the DOM reloads it, and the item page's work slot holds a
// ported worksheet's iframe, so a student reordering their item page must not
// reload the worksheet they have open. `PanelStack` renders the anchor once,
// between two keyed lists and outside both; this mounts the REAL component and
// holds the anchor's NODE across every reorder, hide and side change.
//
// The negative control is the shape the component exists to avoid: the same
// panels in ONE keyed list with the anchor among them, where moving a panel
// across it moves the anchor's node. Both directions are measured on the same
// instrument, so a green row here cannot be a node-identity check that would
// pass anything.

import { afterEach, describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import PanelStack from '../../src/lib/classroom/PanelStack.svelte';
import { itemPanelDefaults, resolvePanels, type PanelLayout } from '../../src/lib/classroom/panel-layout';
import { reactiveProps } from './reactive-props.svelte';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const c of cleanups.splice(0)) await c();
});

const panel = createRawSnippet((id: () => string) => ({
	render: () => `<section data-panel="${id()}">${id()}</section>`
}));
const anchor = createRawSnippet(() => ({
	render: () => `<section data-panel="work" data-testid="anchor"><div class="frame-stand-in"></div></section>`
}));

/** Count the times `node` is removed from or inserted into `root`: a moved iframe is a removed-and-inserted one. */
function watchMoves(root: HTMLElement, node: Element) {
	let n = 0;
	const tally = (records: MutationRecord[]) => {
		for (const r of records) if ([...r.removedNodes, ...r.addedNodes].includes(node)) n += 1;
	};
	const watcher = new MutationObserver(tally);
	watcher.observe(root, { childList: true, subtree: true });
	return {
		stop() {
			tally(watcher.takeRecords());
			watcher.disconnect();
			return n;
		}
	};
}

function mountStack(layout: PanelLayout | null) {
	const defaults = itemPanelDefaults();
	const r = resolvePanels('item', defaults, layout, defaults);
	const props = reactiveProps<Record<string, unknown>>({ above: r.above, below: r.below, panel, anchor });
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(PanelStack as never, { target, props });
	flushSync();
	cleanups.push(async () => {
		await unmount(app);
		target.remove();
	});
	const relayout = (next: PanelLayout | null) => {
		const n = resolvePanels('item', defaults, next, defaults);
		props.above = n.above;
		props.below = n.below;
		flushSync();
	};
	const order = () => Array.from(target.querySelectorAll<HTMLElement>('[data-panel]')).map((e) => e.dataset.panel);
	return { target, relayout, order };
}

describe('PanelStack holds the anchor still', () => {
	it('the anchor node is the same node through reorders, hides and a panel changing sides', () => {
		const { target, relayout, order } = mountStack(null);
		expect(order()).toEqual(['deck', 'notebook', 'body', 'reference', 'links', 'files', 'work', 'rubric']);
		const node = target.querySelector('[data-testid="anchor"]');
		expect(node).not.toBeNull();
		const layouts: (PanelLayout | null)[] = [
			{ order: ['deck', 'notebook', 'reference', 'links', 'files', 'work', 'body', 'rubric'], hidden: [] },
			{ order: ['rubric', 'deck', 'notebook', 'body', 'reference', 'links', 'files', 'work'], hidden: [] },
			{ order: [], hidden: ['rubric', 'deck'] },
			{ order: ['work', 'deck', 'notebook', 'body', 'reference', 'links', 'files', 'rubric'], hidden: ['links'] },
			null
		];
		let checked = 0;
		for (const l of layouts) {
			relayout(l);
			expect(target.querySelector('[data-testid="anchor"]')).toBe(node);
			checked += 1;
		}
		expect(checked).toBe(layouts.length);
		// And the order really moved each time (positive control): the last
		// layout before the reset put everything below the work.
		relayout(layouts[3]);
		expect(order()).toEqual(['work', 'deck', 'notebook', 'body', 'reference', 'files', 'rubric']);
	});

	it('NEGATIVE CONTROL: one keyed list with the anchor inside it moves the anchor node', async () => {
		// The rejected shape, through the same instrument: ONE list, the anchor
		// one of its items. Moving a panel from above the anchor to below it
		// moves the anchor's own node in the keyed reconcile.
		const one = createRawSnippet((id: () => string) => ({
			render: () =>
				id() === 'work'
					? `<section data-panel="work" data-testid="anchor"></section>`
					: `<section data-panel="${id()}">${id()}</section>`
		}));
		const props = reactiveProps<Record<string, unknown>>({
			above: ['body', 'work', 'rubric'],
			below: [],
			panel: one,
			anchor: null
		});
		const target = document.createElement('div');
		document.body.appendChild(target);
		const app = mount(PanelStack as never, { target, props });
		flushSync();
		cleanups.push(async () => {
			await unmount(app);
			target.remove();
		});
		const node = target.querySelector('[data-testid="anchor"]')!;
		const moves = watchMoves(target, node);
		props.above = ['body', 'rubric', 'work'];
		flushSync();
		props.above = ['work', 'body', 'rubric'];
		flushSync();
		// Svelte keeps the node object (a keyed move) but it is MOVED in the
		// document, and a moved iframe is a reloaded one. The two-list shape
		// below records no such move on the same instrument.
		expect(moves.stop()).toBeGreaterThan(0);
		expect(Array.from(target.querySelectorAll('[data-panel]')).indexOf(node)).toBe(0);
	});

	it('with the two-list shape the anchor is never moved in the document either', () => {
		const { target, relayout } = mountStack(null);
		const node = target.querySelector('[data-testid="anchor"]')!;
		const moves = watchMoves(target, node);
		relayout({ order: ['deck', 'notebook', 'reference', 'links', 'files', 'work', 'body', 'rubric'], hidden: [] });
		relayout({ order: ['rubric', 'files', 'links', 'reference', 'body', 'notebook', 'deck', 'work'], hidden: [] });
		relayout(null);
		expect(moves.stop()).toBe(0);
	});
});
