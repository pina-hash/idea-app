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

describe('the map behind the active tab', () => {
	it('nests the contract and the starter under the publish flow', () => {
		expect(locateFoundry('/foundry/contract')).toBe('submit');
		expect(locateFoundry('/foundry/starter')).toBe('submit');
		expect(locateFoundry('/foundry/submit')).toBe('submit');
	});

	it('answers each top-level surface as itself, trailing slash included', () => {
		expect(locateFoundry('/foundry')).toBe('gallery');
		expect(locateFoundry('/foundry/')).toBe('gallery');
		expect(locateFoundry('/foundry/mine')).toBe('mine');
		expect(locateFoundry('/foundry/review')).toBe('review');
	});

	it('marks nothing for a path it does not know', () => {
		expect(locateFoundry('/foundry/nope')).toBeNull();
		expect(locateFoundry('/classroom')).toBeNull();
	});
});
