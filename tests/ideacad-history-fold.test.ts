/**
 * THE DEPTH RULE, which is the only subtle part of the action log.
 *
 * Undo appends the INVERSE of its target and names it. So the log grows a chain
 * -- 2 <- 3 <- 4 <- 5 -- and whether an action is currently APPLIED is the
 * PARITY of its chain, not whether the row on top of it happens to be an
 * inverse.
 *
 *   EVEN depth  the action is applied. 0 is the edit, 2 is a redo, 4 is a redo
 *               of an undo of a redo.
 *   ODD depth   the action is undone. 1 is the undo, 3 is the undo of a redo.
 *
 * THE SHALLOW RULE THAT DOES NOT WORK, and which this file was written to
 * catch: "a row whose target is itself an inverse is a redo". It classifies
 * depth 3 as a redo, so after undo/redo/undo the student is told there is
 * nothing to redo -- their work is one press away and the control is gone. The
 * four-step trace below is the case; it is walked press by press rather than
 * asserted at the end, because an end-state assertion passes on a fold that was
 * wrong in the middle and happened to come back.
 */
import { describe, expect, it } from 'vitest';
import {
	foldHistory,
	inverseOf,
	stateAt,
	type IdeacadHistoryRow
} from '../src/lib/ideacad/history';

/** A tiny document so the state is readable at every step. */
const ORIGIN: IdeacadHistoryRow = {
	seq: 0,
	kind: 'origin',
	path: '',
	before: null,
	after: { count: 1, rotation: 'cw' }
};

const setCount = (seq: number, from: number, to: number): IdeacadHistoryRow => ({
	seq,
	kind: 'set',
	path: '/count',
	before: from,
	after: to
});

/** Press undo (or redo) the way the store does: fold, invert, append. */
function press(rows: IdeacadHistoryRow[], which: 'undo' | 'redo'): IdeacadHistoryRow[] {
	const fold = foldHistory(rows);
	const target = which === 'undo' ? fold.undoTarget : fold.redoTarget;
	if (!target) throw new Error(`nothing to ${which}`);
	const seq = Math.max(...rows.map((r) => r.seq)) + 1;
	return [...rows, { ...inverseOf(target), seq }];
}

describe('the fold on a fresh part', () => {
	it('offers neither undo nor redo when only the origin is there', () => {
		const fold = foldHistory([ORIGIN]);
		expect([fold.canUndo, fold.canRedo]).toEqual([false, false]);
		expect(fold.undoTarget).toBeNull();
		expect(fold.redoTarget).toBeNull();
	});

	it('never offers the origin as an undo target, even as the only row', () => {
		expect(foldHistory([ORIGIN]).undoTarget).toBeNull();
	});
});

describe('THE FOUR-STEP TRACE: edit, edit, undo, redo, undo, redo', () => {
	// A(1): count 1 -> 2. B(2): count 2 -> 3.
	let rows: IdeacadHistoryRow[] = [ORIGIN, setCount(1, 1, 2), setCount(2, 2, 3)];

	it('step 0 -- two edits: undo points at the newer, nothing to redo', () => {
		const fold = foldHistory(rows);
		expect(fold.undoTarget?.seq).toBe(2);
		expect(fold.canRedo).toBe(false);
		expect(stateAt<{ count: number }>(rows).count).toBe(3);
	});

	it('step 1 -- undo: B is undone, undo now points at A, redo points at the undo', () => {
		rows = press(rows, 'undo');
		expect(rows[rows.length - 1]).toMatchObject({ seq: 3, undoesSeq: 2, before: 3, after: 2 });
		const fold = foldHistory(rows);
		expect(fold.depth.get(3)).toBe(1);
		expect(fold.undoTarget?.seq).toBe(1);
		expect(fold.redoTarget?.seq).toBe(3);
		expect(stateAt<{ count: number }>(rows).count).toBe(2);
	});

	it('step 2 -- redo: B is applied again, and there is nothing left to redo', () => {
		rows = press(rows, 'redo');
		expect(rows[rows.length - 1]).toMatchObject({ seq: 4, undoesSeq: 3 });
		const fold = foldHistory(rows);
		expect(fold.depth.get(4)).toBe(2);
		// Depth 2 is EVEN, so row 4 is a live action and is what undo points at.
		expect(fold.undoTarget?.seq).toBe(4);
		expect(fold.canRedo).toBe(false);
		expect(stateAt<{ count: number }>(rows).count).toBe(3);
	});

	it('step 3 -- undo again: THIS IS THE CASE THE SHALLOW RULE GETS WRONG', () => {
		rows = press(rows, 'undo');
		const fold = foldHistory(rows);
		expect(fold.depth.get(5)).toBe(3);
		// Depth 3 is ODD, so row 5 is an UNDONE action and redo must be offered.
		// The shallow rule ("its target is an inverse, so it is a redo") would
		// answer canRedo false here and strand the student's work.
		expect(fold.canRedo).toBe(true);
		expect(fold.redoTarget?.seq).toBe(5);
		expect(fold.undoTarget?.seq).toBe(1);
		expect(stateAt<{ count: number }>(rows).count).toBe(2);
	});

	it('step 4 -- redo again: back to 3, and the whole log is still there', () => {
		rows = press(rows, 'redo');
		expect(foldHistory(rows).depth.get(6)).toBe(4);
		expect(stateAt<{ count: number }>(rows).count).toBe(3);
		// NOTHING WAS EVER DELETED. Six appends for four presses over two edits
		// is the price of "as far back as possible", and it is the point.
		expect(rows.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(rows.filter((r) => r.undoesSeq != null)).toHaveLength(4);
	});

	it('step 5 -- undo past B reaches A, and then the floor', () => {
		rows = press(rows, 'undo'); // undoes the redo at 6
		rows = press(rows, 'undo'); // now A
		expect(foldHistory(rows).undoTarget).toBeNull();
		expect(stateAt<{ count: number }>(rows).count).toBe(1);
		expect(stateAt(rows)).toEqual(ORIGIN.after);
	});
});

describe('a NEW EDIT after an undo does not truncate anything', () => {
	it('leaves the undone action in the log and simply stops offering it', () => {
		let rows: IdeacadHistoryRow[] = [ORIGIN, setCount(1, 1, 2), setCount(2, 2, 3)];
		rows = press(rows, 'undo');
		// A fresh edit lands on top. In a cursor design this is where the
		// future is thrown away; here it is one more append.
		rows = [...rows, { seq: 4, kind: 'set', path: '/rotation', before: 'cw', after: 'ccw' }];
		expect(rows).toHaveLength(5);
		const fold = foldHistory(rows);
		expect(fold.undoTarget?.seq).toBe(4);
		// The audit row stays, but the new decision explicitly closes that branch.
		expect(fold.redoTarget).toBeNull();
		expect(fold.redoDiscarded).toBe(true);
		expect(stateAt(rows)).toEqual({ count: 2, rotation: 'ccw' });
	});
});

describe('random edit streams round-trip exactly', () => {
	it('undoes every edit to the byte-equivalent origin, then redoes to the exact end', () => {
		let seed = 0x262;
		const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
		for (let run = 0; run < 75; run += 1) {
			let rows: IdeacadHistoryRow[] = [ORIGIN];
			let current = { count: 1, rotation: 'cw' };
			const edits = 20 + Math.floor(random() * 100);
			for (let i = 0; i < edits; i += 1) {
				const changeCount = random() < 0.7;
				const path = changeCount ? '/count' : '/rotation';
				const before = changeCount ? current.count : current.rotation;
				const after = changeCount ? Math.floor(random() * 24) + 1 : current.rotation === 'cw' ? 'ccw' : 'cw';
				rows.push({ seq: rows.length, kind: 'set', path, before, after });
				current = stateAt<typeof current>(rows);
			}
			const end = structuredClone(current);
			while (foldHistory(rows).canUndo) rows = press(rows, 'undo');
			expect(stateAt(rows)).toEqual(ORIGIN.after);
			while (foldHistory(rows).canRedo) rows = press(rows, 'redo');
			expect(stateAt(rows)).toEqual(end);
		}
	});
});

describe('the fold over a long log', () => {
	it('skips rows already consumed rather than counting them twice', () => {
		const rows: IdeacadHistoryRow[] = [ORIGIN];
		for (let i = 1; i <= 40; i += 1) rows.push(setCount(i, i, i + 1));
		let live = rows;
		for (let i = 0; i < 15; i += 1) live = press(live, 'undo');
		const fold = foldHistory(live);
		// Fifteen undos consumed the fifteen newest edits, so undo points at 25.
		expect(fold.undoTarget?.seq).toBe(25);
		expect(fold.redoTarget?.seq).toBe(55);
		expect(stateAt<{ count: number }>(live).count).toBe(26);
		expect(live).toHaveLength(56);
	});

	it('reports a depth for every row, which a timeline renders', () => {
		let rows: IdeacadHistoryRow[] = [ORIGIN, setCount(1, 1, 2)];
		rows = press(rows, 'undo');
		const fold = foldHistory(rows);
		expect([...fold.depth.entries()].sort((a, b) => a[0] - b[0])).toEqual([
			[0, 0],
			[1, 0],
			[2, 1]
		]);
	});
});
