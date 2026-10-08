// tests/dom/class-view-pane-keeps-children.svelte.test.ts
//
// OPENING AN ITEM MUST NOT REBUILD THE CLASS PAGE (ledger 0368, report R02).
//
// ClassView's root used to be `<svelte:element this={asPane ? 'section' :
// 'main'}>`. Svelte keys that block on the TAG, so every flip of `asPane` (the
// section layout passes `!!selectedItemId`) built a new element and re-ran
// every child: the banner's arrival drift and the badge's draw replayed, the
// header's pollers restarted, an open theme vote closed, and a half-typed quick
// post was lost. A remount renders the same markup, so nothing on screen or in
// a type check says it happened; the only instrument is NODE IDENTITY, which is
// what this file asserts, plus a typed value that only survives on the same
// node.
//
// Both directions of the landmark switch are asserted too: the one stable
// element carries `role="main"` while the list IS the page, and drops it (with
// an `aria-label` instead) while an item is open beside it.
//
// A `.svelte.test.ts`, so `props` can be a `$state` proxy whose `asPane` the
// test flips on the SAME mounted instance; `mountInto` takes plain props.

import { afterEach, describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount, type Component } from 'svelte';
import ClassView from '$lib/classroom/ClassView.svelte';
import { resolveClassTheme } from '$lib/classroom/class-theme';
import { CLOCK, ITEMS, SECTION } from '../classroom-panel-layout-render-cases';

const View = ClassView as unknown as Component<Record<string, unknown>>;
const THEME = resolveClassTheme({ winners: { palette: 'ocean', pattern: 'rings' }, accent: 'gold' });
const BULLETIN = createRawSnippet(() => ({
	render: () => '<div data-testid="pane-keeps-bulletin"><input data-testid="pane-keeps-input" /></div>'
}));

const live: { app: Record<string, unknown>; target: HTMLElement }[] = [];
afterEach(async () => {
	for (const m of live.splice(0)) {
		await unmount(m.app);
		m.target.remove();
	}
});

function mountView() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({
		section: SECTION,
		items: ITEMS,
		sections: [SECTION],
		canManage: false,
		clock: CLOCK,
		basePath: '/classroom',
		theme: THEME,
		bulletin: BULLETIN,
		asPane: false
	});
	const app = mount(View, { target, props });
	flushSync();
	live.push({ app, target });
	const q = <T extends Element>(sel: string) => target.querySelector(sel) as T | null;
	return { target, props, q };
}

describe('the class page is one element whatever the pane is doing', () => {
	it('flipping asPane keeps the header, the pattern layer and a typed value on the SAME nodes', () => {
		const v = mountView();
		const header = v.q('[data-testid="class-header"]');
		const pattern = v.q('[data-testid="class-banner-pattern"]');
		const input = v.q<HTMLInputElement>('[data-testid="pane-keeps-input"]');
		const root = v.q('.classroom-page');
		// POSITIVE CONTROL: every node under test is really there to be kept.
		expect(header).not.toBeNull();
		expect(pattern).not.toBeNull();
		expect(input).not.toBeNull();
		expect(root).not.toBeNull();
		input!.value = 'Bring your calipers tomorrow';

		v.props.asPane = true;
		flushSync();
		expect(v.q('.classroom-page')).toBe(root);
		expect(v.q('[data-testid="class-header"]')).toBe(header);
		expect(v.q('[data-testid="class-banner-pattern"]')).toBe(pattern);
		expect(v.q('[data-testid="pane-keeps-input"]')).toBe(input);

		v.props.asPane = false;
		flushSync();
		expect(v.q('.classroom-page')).toBe(root);
		expect(v.q('[data-testid="class-header"]')).toBe(header);
		expect(v.q('[data-testid="class-banner-pattern"]')).toBe(pattern);
		expect(v.q<HTMLInputElement>('[data-testid="pane-keeps-input"]')).toBe(input);
		expect(input!.value).toBe('Bring your calipers tomorrow');
	});

	it('the landmark is a role on that element: main while the list is the page, a labelled region beside an item', () => {
		const v = mountView();
		const root = v.q('.classroom-page')!;
		expect(root.tagName).toBe('SECTION');
		expect(root.getAttribute('role')).toBe('main');
		expect(root.hasAttribute('aria-label')).toBe(false);
		expect(root.classList.contains('as-pane')).toBe(false);
		expect(v.target.querySelectorAll('[role="main"], main')).toHaveLength(1);

		v.props.asPane = true;
		flushSync();
		expect(root.hasAttribute('role')).toBe(false);
		expect(root.getAttribute('aria-label')).toBe('Class content');
		expect(root.classList.contains('as-pane')).toBe(true);
		expect(v.target.querySelectorAll('[role="main"], main')).toHaveLength(0);
	});
});
