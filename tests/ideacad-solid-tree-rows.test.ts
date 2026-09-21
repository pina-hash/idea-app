// tests/ideacad-solid-tree-rows.test.ts
//
// THE DESIGN TREE'S PURE HALF: what a press selects, where a feature may
// move, and that every refusal the tree shows is the REDUCER's own sentence.
//
// WHY THIS IS AUTOMATED. A tree whose Up button computed its own idea of
// "may move" would render identically to one asking the reducer, and would
// drift the first time `reorderRange` changed. The expected sentences below
// are matched against the words `commands.ts` throws -- the thing the tree
// SURFACES, not the thing under test -- and every refusal is paired with an
// allowed move or delete on the same fixture so a helper answering "refused"
// to everything cannot pass.
import { describe, expect, it } from 'vitest';
import { FIRST_IN_TREE, LAST_IN_TREE, STATUS_WORDS, deleteRefusal, dropAllowed, dropIndex, moveOptions, refusalFor, rowSelections, selectedFeatureId, selectionKindFor } from '../src/lib/ideacad/solid/tree/rows';
import { fixtureManifest, fixtureRows } from './ideacad-solid-tree-fixture';
import type { FeatureStatus } from '../src/lib/ideacad/solid/types';

const rows = fixtureRows();
const row = (id: string) => rows.find((r) => r.id === id)!;

describe('status words', () => {
	it('gives every status a glyph AND a word, none shared', () => {
		const statuses: FeatureStatus[] = ['ok', 'error', 'warning', 'suppressed'];
		expect(Object.keys(STATUS_WORDS).sort()).toEqual([...statuses].sort());
		expect(new Set(statuses.map((s) => STATUS_WORDS[s].word)).size).toBe(4);
		expect(new Set(statuses.map((s) => STATUS_WORDS[s].glyph)).size).toBe(4);
		for (const s of statuses) expect(STATUS_WORDS[s].word.length).toBeGreaterThan(1);
	});
});
describe('what a row press selects', () => {
	it('selects the bodies the feature made first, then the feature itself', () => {
		expect(rowSelections(row('x1'))).toEqual([{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, { bodyId: '', kind: 'feature', id: 'x1' }]);
		expect(rowSelections(row('s1'))).toEqual([{ bodyId: '', kind: 'sketch', id: 's1' }]);
		expect(rowSelections(row('pl1'))).toEqual([{ bodyId: '', kind: 'reference', id: 'pl1' }]);
	});
	it('kinds a feature by its type', () => {
		expect(selectionKindFor('sketch')).toBe('sketch');
		for (const t of ['plane', 'axis', 'point'] as const) expect(selectionKindFor(t)).toBe('reference');
		for (const t of ['extrude', 'fillet', 'mate', 'body', 'boolean'] as const) expect(selectionKindFor(t)).toBe('feature');
	});
	it('finds the row a selection list names, and none when only geometry is selected', () => {
		expect(selectedFeatureId([{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, { bodyId: '', kind: 'feature', id: 'x1' }], rows)).toBe('x1');
		expect(selectedFeatureId([{ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }], rows)).toBeNull();
		expect(selectedFeatureId([{ bodyId: '', kind: 'feature', id: 'gone' }], rows)).toBeNull();
		expect(selectedFeatureId([], rows)).toBeNull();
	});
});
describe('moves and deletes ask the reducer', () => {
	const m = fixtureManifest();
	it('refuses a move above a dependency and below a dependent, in the reducer\'s words', () => {
		const x1 = moveOptions(m, 'x1');
		expect(x1.up).toEqual({ to: 0, refusal: expect.stringMatching(/Extrude 1 uses Sketch 1, so it cannot move above it/) });
		expect(x1.down).toEqual({ to: 2, refusal: expect.stringMatching(/Fillet 1 uses Extrude 1, so it cannot move below it/) });
		const s1 = moveOptions(m, 's1');
		expect(s1.up).toEqual({ to: null, refusal: FIRST_IN_TREE });
		expect(s1.down.refusal).toMatch(/cannot move below/);
	});
	it('allows a move nothing depends on, and names the end of the tree', () => {
		const pl1 = moveOptions(m, 'pl1');
		expect(pl1.up).toEqual({ to: 4, refusal: null });
		expect(pl1.down).toEqual({ to: null, refusal: LAST_IN_TREE });
	});
	it('refuses a delete with dependents by naming them, and allows one without', () => {
		expect(deleteRefusal(m, 's1')).toMatch(/A later feature depends on Sketch 1 \(Extrude 1\)/);
		expect(deleteRefusal(m, 'x1')).toMatch(/3 later features depend on Extrude 1 \(Fillet 1, Push face 1, Chamfer 1\)/);
		expect(deleteRefusal(m, 'pl1')).toBeNull();
	});
	it('never changes the manifest it asks about', () => {
		const before = JSON.stringify(m);
		refusalFor(m, { type: 'remove-feature', id: 'pl1' });
		refusalFor(m, { type: 'move-feature', id: 'pl1', to: 0 });
		refusalFor(m, { type: 'move-feature', id: 'x1', to: 0 });
		expect(JSON.stringify(m)).toBe(before);
	});
});
describe('drop targets', () => {
	it('computes the move-feature index for before and after, and a drop on itself is a no-op', () => {
		/* [A B C D]: A(0) after C(2) -> [B C A D], index 2; D(3) before B(1) -> [A D B C], index 1. */
		expect(dropIndex(0, 2, false)).toBe(2);
		expect(dropIndex(3, 1, true)).toBe(1);
		expect(dropIndex(0, 2, true)).toBe(1);
		expect(dropIndex(3, 1, false)).toBe(2);
		expect(dropIndex(1, 1, true)).toBe(1);
		expect(dropIndex(1, 1, false)).toBe(1);
	});
	it('marks a target inside reorderRange as allowed and one outside as not', () => {
		const m = fixtureManifest();
		expect(dropAllowed(m, 'pl1', 0)).toBe(true);
		expect(dropAllowed(m, 'pl1', 5)).toBe(true);
		expect(dropAllowed(m, 'x1', 1)).toBe(true);
		expect(dropAllowed(m, 'x1', 0)).toBe(false);
		expect(dropAllowed(m, 'x1', 2)).toBe(false);
		expect(dropAllowed(m, 'missing', 0)).toBe(false);
	});
});
