import { describe, expect, it } from 'vitest';
import { FormulaSheet } from '$lib/notebook/formula/sheet';

/**
 * THE DEPENDENCY GRAPH, which is the half that makes this an engine rather than
 * a calculator. `lastRecalculated` is what turns "recomputes when what it
 * depends on changes, and not otherwise" into a measurement: the second half of
 * that sentence is invisible in the values and would regress silently, so every
 * test here asserts the SET that recomputed as well as the answers.
 */

describe('literals', () => {
	it('reads a number, a blank, text and a typed TRUE/FALSE', () => {
		const sheet = new FormulaSheet({ A1: '5', A2: '', A3: 'Length', A4: 'TRUE' });
		expect(sheet.value('A1')).toBe(5);
		expect(sheet.value('A2')).toBeNull();
		expect(sheet.value('A3')).toBe('Length');
		expect(sheet.value('A4')).toBe(true);
		expect(sheet.value('Z99')).toBeNull();
	});

	it('keeps the source a student typed, and answers a canonical key', () => {
		const sheet = new FormulaSheet();
		sheet.setCell('b7', '=1+ 1');
		expect(sheet.source('B7')).toBe('=1+ 1');
		expect(sheet.value('B07')).toBe(2);
		expect(sheet.refs()).toEqual(['B7']);
	});

	it('throws on a cell address the grid itself invented, which is not a student error', () => {
		const sheet = new FormulaSheet();
		expect(() => sheet.setCell('nonsense', '1')).toThrow(RangeError);
	});
});

describe('recalculation order', () => {
	it('computes a chain in dependency order in one pass', () => {
		const sheet = new FormulaSheet({ A1: '2', B1: '=A1*3', C1: '=B1+1', D1: '=C1*C1' });
		expect(sheet.value('D1')).toBe(49);
		sheet.setCell('A1', '3');
		expect(sheet.value('B1')).toBe(9);
		expect(sheet.value('C1')).toBe(10);
		expect(sheet.value('D1')).toBe(100);
		// Precedents before dependents, which is what makes one pass enough.
		// Asserted as the RULE rather than as one literal order, so adding a
		// cell to the fixture cannot break it for the wrong reason.
		const order = [...sheet.lastRecalculated];
		expect(order.sort()).toEqual(['A1', 'B1', 'C1', 'D1']);
		const at = (ref: string) => sheet.lastRecalculated.indexOf(ref);
		expect(at('A1')).toBeLessThan(at('B1'));
		expect(at('B1')).toBeLessThan(at('C1'));
		expect(at('C1')).toBeLessThan(at('D1'));
	});

	it('loads a whole sheet in one recalculation, forward references included', () => {
		// B1 refers to C1, which is written after it. One setCell at a time
		// would have computed B1 against an empty C1 on the way through.
		const sheet = new FormulaSheet({ B1: '=C1+1', C1: '=D1*2', D1: '5' });
		expect(sheet.value('B1')).toBe(11);
	});

	it('recomputes ONLY what depends on the cell that changed', () => {
		const sheet = new FormulaSheet({
			A1: '1',
			B1: '=A1+1',
			C1: '=B1+1',
			X1: '9',
			Y1: '=X1+1'
		});
		sheet.setCell('A1', '2');
		const touched = [...sheet.lastRecalculated].sort();
		expect(touched).toEqual(['A1', 'B1', 'C1']);
		// The positive control: the untouched half is a real dependency chain
		// that WOULD have appeared had the sweep been "everything".
		expect(touched).not.toContain('X1');
		expect(touched).not.toContain('Y1');
		expect(sheet.value('Y1')).toBe(10);
	});

	it('recomputes through a RANGE, including a cell that was empty', () => {
		const sheet = new FormulaSheet({ T1: '=SUM(A1:A3)', A1: '1' });
		expect(sheet.value('T1')).toBe(1);
		sheet.setCell('A3', '4');
		expect([...sheet.lastRecalculated].sort()).toEqual(['A3', 'T1']);
		expect(sheet.value('T1')).toBe(5);
	});

	it('stops recomputing a cell once nothing points at it any more', () => {
		const sheet = new FormulaSheet({ A1: '1', B1: '=A1+1' });
		sheet.setCell('B1', '=99');
		sheet.setCell('A1', '5');
		expect([...sheet.lastRecalculated]).toEqual(['A1']);
		expect(sheet.value('B1')).toBe(99);
	});

	it('picks up a new dependency the moment a formula names it', () => {
		const sheet = new FormulaSheet({ A1: '1', B1: '=99' });
		sheet.setCell('B1', '=A1+1');
		sheet.setCell('A1', '5');
		expect([...sheet.lastRecalculated].sort()).toEqual(['A1', 'B1']);
		expect(sheet.value('B1')).toBe(6);
	});

	it('clears a cell and carries the blank through as zero', () => {
		const sheet = new FormulaSheet({ A1: '10', B1: '=A1+1' });
		sheet.clearCell('A1');
		expect(sheet.value('A1')).toBeNull();
		expect(sheet.value('B1')).toBe(1);
	});

	it('handles a diamond without computing the shared cell twice', () => {
		const sheet = new FormulaSheet({ A1: '2', B1: '=A1*2', C1: '=A1*3', D1: '=B1+C1' });
		sheet.setCell('A1', '4');
		expect(sheet.value('D1')).toBe(20);
		const order = [...sheet.lastRecalculated];
		// Once each, and last: both arms reach D1 and neither recomputes it.
		expect(order.filter((k) => k === 'D1').length).toBe(1);
		expect(order.indexOf('D1')).toBe(order.length - 1);
		expect(order.filter((k) => k === 'A1').length).toBe(1);
	});

	it('recalculates everything on demand', () => {
		const sheet = new FormulaSheet({ A1: '1', B1: '=A1+1', C1: '=B1+1' });
		sheet.recalculateAll();
		expect([...sheet.lastRecalculated].sort()).toEqual(['A1', 'B1', 'C1']);
		expect(sheet.value('C1')).toBe(3);
	});
});

describe('scale', () => {
	it('carries a thousand-cell chain without exhausting the stack', () => {
		// The reason the walk uses an explicit stack. A recursive evaluator
		// overflows here and a stack overflow is not a cell error.
		const cells: Record<string, string> = { A1: '1' };
		for (let row = 2; row <= 1000; row += 1) cells[`A${row}`] = `=A${row - 1}+1`;
		const sheet = new FormulaSheet(cells);
		expect(sheet.value('A1000')).toBe(1000);
		sheet.setCell('A1', '2');
		expect(sheet.value('A1000')).toBe(1001);
		expect(sheet.lastRecalculated.length).toBe(1000);
	});

	it('sums a wide range', () => {
		const cells: Record<string, string> = { Z1: '=SUM(A1:A500)' };
		for (let row = 1; row <= 500; row += 1) cells[`A${row}`] = String(row);
		const sheet = new FormulaSheet(cells);
		// 500 * 501 / 2, arithmetic rather than a value read off the engine.
		expect(sheet.value('Z1')).toBe(125250);
	});
});
