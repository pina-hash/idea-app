// tests/classroom-item-order.test.ts
//
// Pure-function coverage for the class page's drag-to-order, pin-boundary,
// unit-filing-renumbers-it and bulk-selection rules. Everything here is a
// plain function over ClassroomItem[]/ClassGroup[] with no Supabase, no
// Svelte, no DOM -- the guarantees would be SILENT otherwise: a wrong id
// order reads as items that just happen to render in a slightly different
// spot, a crossed pin boundary reads as a drag that "didn't do anything" with
// nothing on screen saying why, and a selection that survives the wrong
// navigation reads as an ordinary bulk delete until it deletes the wrong
// class's items.

import { describe, expect, it } from 'vitest';
import {
	bulkFailureMessage,
	dragCrossesPinBoundary,
	dragReorder,
	dragReorderedIds,
	reorderedIds,
	renumberedForFiling,
	runBulk,
	selectionScopeKey,
	type ClassGroup,
	type ClassroomItem
} from '../src/lib/classroom/classroom';

function item(id: string, overrides: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'post',
		title: id,
		body: '',
		points: null,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: null,
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: '2026-01-01T00:00:00Z',
		edited_at: null,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		links: [],
		attachments: [],
		postings: [],
		...overrides
	};
}

function group(id: string, items: ClassroomItem[]): ClassGroup {
	return { id, unit: null, label: id, items };
}

describe('dragReorderedIds: a drop at an arbitrary position', () => {
	it('moves the dragged item to sit at the dropped-on row, everyone else keeping relative order', () => {
		const items = [item('a'), item('b'), item('c'), item('d')];
		// Drag "a" onto "c"'s row (index 2 in the current array).
		expect(dragReorderedIds(items, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
	});

	it('moves an item backward the same way', () => {
		const items = [item('a'), item('b'), item('c'), item('d')];
		expect(dragReorderedIds(items, 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
	});

	it('is null for a drop onto its own row (a no-op)', () => {
		const items = [item('a'), item('b'), item('c')];
		expect(dragReorderedIds(items, 'b', 1)).toBeNull();
	});

	it('is null when the dragged id is not in the group', () => {
		const items = [item('a'), item('b')];
		expect(dragReorderedIds(items, 'ghost', 0)).toBeNull();
	});

	it('clamps a target index past the end of the group', () => {
		const items = [item('a'), item('b'), item('c')];
		expect(dragReorderedIds(items, 'a', 99)).toEqual(['b', 'c', 'a']);
	});
});

describe('dragCrossesPinBoundary + dragReorder: crossing un-pins, and only in that direction', () => {
	it('flags a pinned item dropped after every other pinned item as crossed', () => {
		// Rendered order is pinned-first: p1, p2 pinned, then r1, r2 unpinned.
		const items = [
			item('p1', { pinned: true }),
			item('p2', { pinned: true }),
			item('r1'),
			item('r2')
		];
		// Drag p1 onto r2's row (index 3) -- it lands after r1, which is unpinned.
		const result = dragReorder(items, 'p1', 3);
		expect(result?.ids).toEqual(['p2', 'r1', 'r2', 'p1']);
		expect(result?.unpin).toBe(true);
	});

	it('does not flag a pinned item reordered only among other pinned items', () => {
		const items = [item('p1', { pinned: true }), item('p2', { pinned: true }), item('r1')];
		const result = dragReorder(items, 'p1', 1);
		expect(result?.ids).toEqual(['p2', 'p1', 'r1']);
		expect(result?.unpin).toBe(false);
	});

	it('never un-pins on the strength of an ALREADY-unpinned item crossing the other way', () => {
		// r1 (unpinned) dragged up among the pinned items -- nothing to unpin,
		// since the dragged item was never pinned. Its own arithmetic (never
		// mutation-proven wrong the other way) is what the mutation test below
		// checks: a version of this function that also fires for an unpinned
		// item crossing UP would wrongly claim `unpin: true` here.
		const items = [item('p1', { pinned: true }), item('r1'), item('r2')];
		const result = dragReorder(items, 'r1', 0);
		expect(result?.unpin).toBe(false);
	});

	it('does not flag a reorder entirely within the unpinned block', () => {
		const items = [item('p1', { pinned: true }), item('r1'), item('r2'), item('r3')];
		const result = dragReorder(items, 'r3', 1);
		expect(result?.unpin).toBe(false);
	});

	// MUTATION-PROVEN (not pinned here as a test): forcing `dragCrossesPinBoundary`
	// to always return `false` fails the "flags a pinned item dropped after
	// every other pinned item" case above and nothing else in this describe
	// block, then the source was restored byte-identical (md5-verified). See
	// the session's report for the before/after run.
});

describe('reorderedIds: move up / move down still work', () => {
	it('swaps with the previous item', () => {
		const items = [item('a'), item('b'), item('c')];
		expect(reorderedIds(items, 'b', -1)).toEqual(['b', 'a', 'c']);
	});

	it('swaps with the next item', () => {
		const items = [item('a'), item('b'), item('c')];
		expect(reorderedIds(items, 'b', 1)).toEqual(['a', 'c', 'b']);
	});

	it('is a no-op at the boundary', () => {
		const items = [item('a'), item('b')];
		expect(reorderedIds(items, 'a', -1)).toBeNull();
		expect(reorderedIds(items, 'b', 1)).toBeNull();
	});
});

describe('renumberedForFiling: filing into a unit renumbers that unit', () => {
	it('appends a single filed item after the destination unit\'s existing order', () => {
		const dest = [item('x'), item('y')];
		expect(renumberedForFiling(dest, ['new'])).toEqual(['x', 'y', 'new']);
	});

	it('appends several bulk-filed items in the order they were filed', () => {
		const dest = [item('x')];
		expect(renumberedForFiling(dest, ['b', 'a'])).toEqual(['x', 'b', 'a']);
	});

	it('excludes a filed id from the destination\'s own base list, if somehow already present', () => {
		const dest = [item('x'), item('stray')];
		expect(renumberedForFiling(dest, ['stray'])).toEqual(['x', 'stray']);
	});

	it('is just the filed ids when the destination unit is empty', () => {
		expect(renumberedForFiling([], ['a', 'b'])).toEqual(['a', 'b']);
	});
});

describe('runBulk: a bulk action reports one failure and lets the caller keep it selected', () => {
	it('names the one id that refused while the rest succeed', async () => {
		const outcome = await runBulk(['a', 'b', 'c'], async (id) =>
			id === 'b' ? { ok: false, message: 'That move was refused.' } : { ok: true }
		);
		expect(outcome.succeededIds.sort()).toEqual(['a', 'c']);
		expect(outcome.failedIds).toEqual(['b']);
		expect(outcome.firstFailureMessage).toBe('That move was refused.');
	});

	it('attempts every id regardless of an earlier failure', async () => {
		const attempted: string[] = [];
		await runBulk(['a', 'b', 'c'], async (id) => {
			attempted.push(id);
			return { ok: id !== 'a' };
		});
		expect(attempted.sort()).toEqual(['a', 'b', 'c']);
	});

	it('is a clean success when nothing fails', async () => {
		const outcome = await runBulk(['a', 'b'], async () => ({ ok: true }));
		expect(outcome.failedIds).toEqual([]);
		expect(outcome.firstFailureMessage).toBeNull();
	});
});

describe('bulkFailureMessage', () => {
	it('names the count and the first refusal, with a tally for the rest', () => {
		expect(bulkFailureMessage(2, 5, 'That move was refused.')).toBe(
			'2 of 5 items did not update: That move was refused. (and 1 more).'
		);
	});

	it('drops the tally clause for a single failure', () => {
		expect(bulkFailureMessage(1, 3, 'That unit belongs to another course.')).toBe(
			'1 of 3 items did not update: That unit belongs to another course..'
		);
	});

	it('uses the singular for a single-item selection', () => {
		expect(bulkFailureMessage(1, 1, 'Refused.')).toBe('1 of 1 item did not update: Refused..');
	});
});

describe('selectionScopeKey: a bulk selection is scoped to one class and one unit structure', () => {
	it('changes when the class (section id) changes', () => {
		const groups = [group('unfiled', [])];
		expect(selectionScopeKey('section-1', groups)).not.toBe(selectionScopeKey('section-2', groups));
	});

	it('changes when the set of groups changes (a unit added or removed)', () => {
		const before = [group('unit-a', []), group('unfiled', [])];
		const after = [group('unit-a', []), group('unit-b', []), group('unfiled', [])];
		expect(selectionScopeKey('section-1', before)).not.toBe(selectionScopeKey('section-1', after));
	});

	it('does NOT change when an item merely moves between groups that already existed', () => {
		const before = [group('unit-a', [item('x')]), group('unit-b', [])];
		const after = [group('unit-a', []), group('unit-b', [item('x')])];
		expect(selectionScopeKey('section-1', before)).toBe(selectionScopeKey('section-1', after));
	});

	// MUTATION-PROVEN (not pinned here as a test): forcing `selectionScopeKey`
	// to return `sectionId` alone (ignoring the group set) fails the
	// "changes when the set of groups changes" case above and nothing else in
	// this describe block, then the source was restored byte-identical
	// (md5-verified). See the session's report for the before/after run.
});
