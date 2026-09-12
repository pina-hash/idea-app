/**
 * THE ACTION LOG'S ARITHMETIC -- apply, invert, diff, replay -- with no
 * database and no DOM in it.
 *
 * The four things prompt 0189 names each get a test. THREE of them can only be
 * answered against real Postgres and live in `tests/db/ideacad-history-*`. The
 * fourth -- a scrub to an arbitrary point is the same state whether reached by
 * replaying forward or undoing back -- is a claim about two pure functions over
 * the same rows, so it is answered here, over a corpus of real blade edits, at
 * every point in it rather than at one.
 */
import { describe, expect, it } from 'vitest';
import {
	applyAction,
	applyActions,
	diffTrees,
	foldHistory,
	invertAction,
	IDEACAD_ACTION_BUDGET_BYTES,
	ordered,
	pointerChild,
	pointerGet,
	pointerTokens,
	stateAt,
	unwindTo,
	type IdeacadAction,
	type IdeacadHistoryRow
} from '../src/lib/ideacad/history';
import { bladeCorpus, CORPUS_ORIGIN } from './ideacad-history-corpus';
import type { BladeTree } from '../src/lib/ideacad/blade/tree';

/** Build a log the way the database does: origin at 0, then the actions. */
function logOf(steps: ReturnType<typeof bladeCorpus>): {
	rows: IdeacadHistoryRow[];
	stored: BladeTree;
	actionCount: number;
} {
	const rows: IdeacadHistoryRow[] = [
		{ seq: 0, kind: 'origin', path: '', before: null, after: CORPUS_ORIGIN }
	];
	let seq = 1;
	for (const step of steps)
		for (const action of diffTrees(step.before, step.after))
			rows.push({ ...action, seq: seq++ });
	return { rows, stored: steps[steps.length - 1].after, actionCount: seq - 1 };
}

describe('JSON pointers', () => {
	it('round trips a token that needs escaping, in both directions', () => {
		const pointer = pointerChild(pointerChild('', 'a/b'), '~c');
		expect(pointer).toBe('/a~1b/~0c');
		expect(pointerTokens(pointer)).toEqual(['a/b', '~c']);
		expect(pointerGet({ 'a/b': { '~c': 7 } }, pointer)).toBe(7);
	});

	it('answers undefined for a path that is not there rather than throwing', () => {
		expect(pointerGet({ a: 1 }, '/b/c')).toBeUndefined();
		expect(pointerTokens('')).toEqual([]);
	});

	it('REFUSES to walk onto a parent that does not exist rather than creating one', () => {
		// A log that does not describe the tree it is replayed onto must fail
		// loudly. Autovivifying the missing container would turn that into a
		// silently different document.
		expect(() => applyAction({ a: 1 }, { kind: 'set', path: '/b/c', after: 2 })).toThrow(
			/Cannot walk/
		);
	});
});

describe('apply and invert, on every kind', () => {
	const tree = { rotation: 'cw', list: [10, 20, 30], features: [{ id: 'a' }, { id: 'b' }] };

	const cases: Array<[string, IdeacadAction]> = [
		['set a scalar', { kind: 'set', path: '/rotation', before: 'cw', after: 'ccw' }],
		['set an array element', { kind: 'set', path: '/list/1', before: 20, after: 99 }],
		['insert an object key', { kind: 'insert', path: '/units', before: null, after: 'in' }],
		['insert an array element', { kind: 'insert', path: '/list/1', before: null, after: 15 }],
		['remove an object key', { kind: 'remove', path: '/rotation', before: 'cw', after: null }],
		['remove an array element', { kind: 'remove', path: '/list/0', before: 10, after: null }],
		['move within an array', { kind: 'move', path: '/features', before: 1, after: 0 }]
	];

	for (const [label, action] of cases) {
		it(`${label}: applying the inverse returns the original, byte for byte`, () => {
			const changed = applyAction(tree, action);
			expect(changed).not.toEqual(tree);
			expect(applyAction(changed, invertAction(action))).toEqual(tree);
		});
	}

	it('never mutates the tree it was handed', () => {
		const before = JSON.stringify(tree);
		for (const [, action] of cases) applyAction(tree, action);
		expect(JSON.stringify(tree)).toBe(before);
	});

	it('REFUSES to invert the origin, which is the floor of the history', () => {
		expect(() => invertAction({ kind: 'origin', path: '', after: tree })).toThrow(
			/creation of the part cannot be undone/
		);
	});

	it('refuses a move whose index is outside the array, rather than silently clamping', () => {
		expect(() =>
			applyAction(tree, { kind: 'move', path: '/features', before: 0, after: 9 })
		).toThrow(/outside the array/);
	});
});

describe('diffTrees, against real blade edits', () => {
	it('turns a single scalar nudge into exactly one narrow set', () => {
		const before = CORPUS_ORIGIN;
		const after = JSON.parse(JSON.stringify(before)) as BladeTree;
		const sketch = after.features.find((f) => f.type === 'bladeSketch');
		if (sketch?.type !== 'bladeSketch') throw new Error('fixture');
		sketch.rootWidth = 0.5;
		const actions = diffTrees(before, after);
		expect(actions).toEqual([
			{ kind: 'set', path: '/features/2/rootWidth', before: 0.45, after: 0.5 }
		]);
	});

	it('turns a REORDER into one move and not six rewritten features', () => {
		const before = CORPUS_ORIGIN;
		const after = JSON.parse(JSON.stringify(before)) as BladeTree;
		[after.features[0], after.features[1]] = [after.features[1], after.features[0]];
		const actions = diffTrees(before, after);
		expect(actions).toEqual([{ kind: 'move', path: '/features', before: 1, after: 0 }]);
		// The positive control for that claim: the naive answer would be six
		// sets, so assert the count is one rather than merely "small".
		expect(actions.filter((a) => a.kind === 'set')).toHaveLength(0);
	});

	it('removes trailing array elements back to front, so every index is still valid', () => {
		const before = { s: [1, 2, 3, 4] };
		const actions = diffTrees(before, { s: [1] });
		expect(actions.map((a) => a.path)).toEqual(['/s/3', '/s/2', '/s/1']);
		expect(applyActions(before, actions)).toEqual({ s: [1] });
	});

	it('is empty for two identical trees, so an edit that changed nothing logs nothing', () => {
		expect(diffTrees(CORPUS_ORIGIN, JSON.parse(JSON.stringify(CORPUS_ORIGIN)))).toEqual([]);
	});

	it('replays its own answer back onto the before tree, over the whole corpus', () => {
		const steps = bladeCorpus(240);
		let reproduced = 0;
		for (const step of steps) {
			expect(applyActions(step.before, diffTrees(step.before, step.after))).toEqual(step.after);
			reproduced += 1;
		}
		// The case count is asserted so a generator that produced nothing
		// cannot pass as a sweep that found no problem.
		expect(reproduced).toBe(steps.length);
		expect(reproduced).toBeGreaterThanOrEqual(240);
	});
});

describe('replay from the creation of the part', () => {
	it('reproduces the final tree from the origin plus every action, over 200+ actions', () => {
		const { rows, stored, actionCount } = logOf(bladeCorpus(220));
		expect(actionCount).toBeGreaterThanOrEqual(200);
		expect(stateAt(rows)).toEqual(stored);
	});

	it('refuses a log with no origin rather than replaying onto nothing', () => {
		expect(() => stateAt([{ seq: 1, kind: 'set', path: '/a', before: 1, after: 2 }])).toThrow(
			/no origin row/
		);
	});

	it('orders rows itself rather than trusting the order it was handed', () => {
		const { rows, stored } = logOf(bladeCorpus(30));
		const shuffled = [...rows].reverse();
		expect(ordered(shuffled).map((r) => r.seq)).toEqual(rows.map((r) => r.seq));
		expect(stateAt(shuffled)).toEqual(stored);
	});
});

describe('A SCRUB AND AN UNDO-BACK LAND IN THE SAME STATE', () => {
	// The fourth of prompt 0189's four. Forward replay is what a scrub uses and
	// backward inversion is what undo uses; they are different code over
	// different rows, and nothing but this makes them agree.
	it('agrees at EVERY point of a 200+ action corpus, not at one chosen point', () => {
		const { rows, stored, actionCount } = logOf(bladeCorpus(220));
		expect(actionCount).toBeGreaterThanOrEqual(200);
		let compared = 0;
		for (let k = 0; k <= actionCount; k += 1) {
			expect(unwindTo(stored, rows, k)).toEqual(stateAt(rows, k));
			compared += 1;
		}
		expect(compared).toBe(actionCount + 1);
	});

	it('lands on the creation state at seq 0, from either direction', () => {
		const { rows, stored } = logOf(bladeCorpus(60));
		expect(stateAt(rows, 0)).toEqual(CORPUS_ORIGIN);
		expect(unwindTo(stored, rows, 0)).toEqual(CORPUS_ORIGIN);
	});

	it('is a no-op at the newest row, which is the control for the loop above', () => {
		const { rows, stored, actionCount } = logOf(bladeCorpus(40));
		expect(unwindTo(stored, rows, actionCount)).toEqual(stored);
		// ...and the loop is not vacuous: an EARLIER point genuinely differs.
		expect(stateAt(rows, 1)).not.toEqual(stored);
	});
});

describe('the budget constant', () => {
	it('is the number the design was sized against, and is not an enforcement', () => {
		expect(IDEACAD_ACTION_BUDGET_BYTES).toBe(400);
		// Nothing in the module reads it. The measurement that matters is
		// tests/db/ideacad-history-row-size.test.ts, against real Postgres.
		expect(foldHistory([]).canUndo).toBe(false);
	});
});
