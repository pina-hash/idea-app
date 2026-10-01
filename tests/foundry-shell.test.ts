// tests/foundry-shell.test.ts
//
// THE REVIEW TAB'S VISIBILITY, BOTH DIRECTIONS.
//
// The Foundry shell renders a Review tab for admins because a queue nobody is
// reminded of goes stale, and renders it for NOBODY else because the existence
// of a review lane is not public (the same reason /foundry/review answers 404
// rather than 403). The markup gate is convenience -- the route's own 404 and
// `is_admin()` inside the RPCs stay the boundary -- but its regression is
// SILENT in both directions: a tab missing for admins just looks like the old
// URL-typing world, and a tab present for students discloses the lane to the
// whole school with nothing on any screen saying so.
//
// So this asserts PRESENT and ABSENT against the same fixture, SSR-rendered
// from the REAL component (the home-order-and-accent pattern), with the admin
// render as the positive control for the student assertion: "no review link"
// only means something because the identical render with the flag on has one.
//
// EXPECTED VALUES COME FROM THE FIXTURES, never from what the component
// returned: the href is the route's own path and the counts are written here.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import FoundryShell from '$lib/foundry/FoundryShell.svelte';
import { locateFoundry } from '$lib/foundry/nav';
import { createRawSnippet } from 'svelte';

const empty = createRawSnippet(() => ({ render: () => '<span></span>' }));

function shell(props: Record<string, unknown>): string {
	return render(FoundryShell as never, {
		props: { children: empty, ...props } as never
	}).body;
}

describe('the review tab renders for admins and for nobody else', () => {
	it('gives an admin the tab, carrying the pending count', () => {
		const html = shell({ active: 'gallery', isAdmin: true, reviewPending: 3 });
		expect(html).toContain('/foundry/review');
		expect(html).toContain('fg-count');
		expect(html).toMatch(/fg-count[^>]*>\s*3\s*</);
		// The heat marker: the count is lit exactly while work waits.
		expect(html).toContain('data-hot');
	});

	it('goes cold at zero rather than staying lit', () => {
		const html = shell({ active: 'gallery', isAdmin: true, reviewPending: 0 });
		expect(html).toContain('/foundry/review');
		expect(html).toContain('fg-count');
		expect(html).not.toContain('data-hot');
	});

	it('renders NO review link and NO count for a student, on the identical fixture', () => {
		const html = shell({ active: 'gallery', isAdmin: false, reviewPending: null });
		expect(html).not.toContain('/foundry/review');
		expect(html).not.toContain('fg-count');
		// POSITIVE CONTROL for the two absences: the same render with the flag
		// on contains both (asserted above), and this one still renders the
		// three tabs every signed-in student gets -- so "absent" is a statement
		// about the gate, not about a component that rendered nothing.
		expect(html).toContain('/foundry/mine');
		expect(html).toContain('/foundry/submit');
	});
});

/*
 * THE BUILD CONTRACT'S PERMANENT PLACE.
 *
 * It used to have none: the gallery linked it only from the empty state (so
 * the link vanished the moment one app existed anywhere) and `locateFoundry`
 * folded it into the `submit` tab, which is not a link anywhere either. Both
 * halves of the fix are asserted here -- the tab is unconditional on role and
 * on which other tab is active, and the map answers the path as its own place
 * rather than as an alias for `submit`.
 */
describe('the build contract has a permanent tab, unconditional on role', () => {
	it('renders the Build contract tab for a student and for an admin alike', () => {
		for (const isAdmin of [true, false]) {
			const html = shell({ active: 'gallery', isAdmin, reviewPending: isAdmin ? 0 : null });
			expect(html, `isAdmin=${isAdmin}`).toContain('/foundry/contract');
			expect(html, `isAdmin=${isAdmin}`).toContain('Build contract');
		}
	});

	it('marks the tab current when the contract page is the active place', () => {
		const html = shell({ active: 'contract', isAdmin: false, reviewPending: null });
		const match = /<a[^>]*href="\/foundry\/contract"[^>]*>/.exec(html);
		expect(match, 'no Build contract tab in the markup').not.toBeNull();
		expect(match![0]).toContain('aria-current="page"');

		// POSITIVE CONTROL: a different active place leaves it uncurrent, so the
		// assertion above is about the `active` prop and not a tab that is
		// always marked current.
		const elsewhere = shell({ active: 'gallery', isAdmin: false, reviewPending: null });
		const elsewhereMatch = /<a[^>]*href="\/foundry\/contract"[^>]*>/.exec(elsewhere);
		expect(elsewhereMatch![0]).not.toContain('aria-current="page"');
	});

	it('renders every other tab alongside it, so nothing was displaced', () => {
		const html = shell({ active: 'contract', isAdmin: false, reviewPending: null });
		expect(html).toContain('/foundry');
		expect(html).toContain('/foundry/mine');
		expect(html).toContain('/foundry/submit');
	});
});

describe('the map behind the active tab', () => {
	it('resolves the contract to its OWN place, not the publish tab', () => {
		expect(locateFoundry('/foundry/contract')).toBe('contract');
		// POSITIVE CONTROL: this used to be the shared answer, so the assertion
		// above is meaningful only because 'submit' really is a different value
		// something in this map still returns.
		expect(locateFoundry('/foundry/submit')).toBe('submit');
	});

	it('keeps the starter nested under the publish flow', () => {
		// The starter is a download reached WHILE publishing and nowhere else,
		// unlike the contract, so it stays folded into the submit tab.
		expect(locateFoundry('/foundry/starter')).toBe('submit');
	});

	it('answers each top-level surface as itself, trailing slash included', () => {
		expect(locateFoundry('/foundry')).toBe('gallery');
		expect(locateFoundry('/foundry/')).toBe('gallery');
		expect(locateFoundry('/foundry/mine')).toBe('mine');
		expect(locateFoundry('/foundry/contract/')).toBe('contract');
		expect(locateFoundry('/foundry/review')).toBe('review');
	});

	it('marks nothing for a path it does not know', () => {
		expect(locateFoundry('/foundry/nope')).toBeNull();
		expect(locateFoundry('/classroom')).toBeNull();
	});
});
