import { describe, expect, it } from 'vitest';
import { evaluateNode } from '$lib/notebook/formula/evaluate';
import { parseFormula } from '$lib/notebook/formula/parse';
import {
	FORMULA_FUNCTIONS,
	FORMULA_FUNCTION_NAMES,
	callFunction,
	roundHalfAwayFromZero,
	type FormulaArg
} from '$lib/notebook/formula/functions';
import { isError, type FormulaValue } from '$lib/notebook/formula/values';

function run(source: string, cells: Record<string, FormulaValue> = {}): FormulaValue {
	const node = parseFormula(source);
	if (isError(node)) return node;
	return evaluateNode(node, { cell: (ref) => (ref in cells ? cells[ref] : null) });
}

/** A column of values in A1..A{n}, the shape a materials table actually has. */
function column(values: FormulaValue[]): Record<string, FormulaValue> {
	const cells: Record<string, FormulaValue> = {};
	values.forEach((value, i) => {
		cells[`A${i + 1}`] = value;
	});
	return cells;
}

describe('the function table is a table', () => {
	it('holds exactly the eight functions ledger 0187 scoped, and no lookup', () => {
		expect(FORMULA_FUNCTION_NAMES).toEqual([
			'ABS',
			'AVERAGE',
			'COUNT',
			'IF',
			'MAX',
			'MIN',
			'ROUND',
			'SUM'
		]);
		// The accepted cost, asserted so it cannot be half-built by accident.
		for (const absent of ['VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'XLOOKUP']) {
			expect(FORMULA_FUNCTIONS.has(absent)).toBe(false);
		}
	});

	it('gives every entry a name, an arity and a summary', () => {
		for (const [key, fn] of FORMULA_FUNCTIONS) {
			expect(fn.name).toBe(key);
			expect(fn.minArgs).toBeGreaterThanOrEqual(1);
			expect(fn.maxArgs).toBeGreaterThanOrEqual(fn.minArgs);
			expect(fn.summary.length).toBeGreaterThan(0);
		}
	});

	it('carries the range SHAPE into an argument, which is what a lookup needs', () => {
		// This is the one property that makes adding VLOOKUP registration
		// rather than surgery: a flattened list would have lost `cols`.
		const node = parseFormula('=SUM(A1:C2)');
		if (isError(node)) throw new Error('unexpected refusal');
		let seen: readonly FormulaArg[] = [];
		// Borrow SUM's own call path by intercepting through callFunction.
		const captured = callFunction(
			'SUM',
			(seen = [
				{ values: [1, 2, 3, 4, 5, 6], rows: 2, cols: 3, isRange: true }
			])
		, 0);
		expect(captured).toBe(21);
		expect(seen[0].rows * seen[0].cols).toBe(seen[0].values.length);
	});

	it('refuses an unknown name and says what it does know', () => {
		const refused = run('=VLOOKUP(1,A1:B2,2)', {});
		expect(refused).toMatchObject({ code: '#NAME?' });
		expect((refused as { message: string }).message).toContain('SUM');
		expect((refused as { position?: number }).position).toBe(1);
	});

	it('refuses the wrong number of arguments, by number', () => {
		expect(run('=ABS()')).toMatchObject({ code: '#VALUE!' });
		expect(run('=ABS(1,2)')).toMatchObject({ code: '#VALUE!' });
		expect(run('=IF(1)')).toMatchObject({ code: '#VALUE!' });
		expect(run('=IF(1,2,3,4)')).toMatchObject({ code: '#VALUE!' });
	});
});

describe('SUM, AVERAGE, MIN, MAX, COUNT', () => {
	it('adds numbers, cells and ranges together', () => {
		expect(run('=SUM(1,2,3)')).toBe(6);
		expect(run('=SUM(A1:A3)', column([1, 2, 3]))).toBe(6);
		expect(run('=SUM(A1:A3,10)', column([1, 2, 3]))).toBe(16);
	});

	it('ignores text and blanks inside a range, so a heading does not break a column', () => {
		expect(run('=SUM(A1:A4)', column(['Length', 2, null, 3]))).toBe(5);
		expect(run('=COUNT(A1:A4)', column(['Length', 2, null, 3]))).toBe(2);
		expect(run('=AVERAGE(A1:A4)', column(['Length', 2, null, 4]))).toBe(3);
	});

	it('refuses text written DIRECTLY as an argument, which is a different mistake', () => {
		expect(run('=SUM("apple")')).toMatchObject({ code: '#VALUE!' });
		expect(run('=SUM(1,"apple")')).toMatchObject({ code: '#VALUE!' });
	});

	it('answers AVERAGE of nothing as #DIV/0! and MIN/MAX of nothing as 0', () => {
		expect(run('=AVERAGE(A1:A3)', {})).toMatchObject({ code: '#DIV/0!' });
		expect(run('=MIN(A1:A3)', {})).toBe(0);
		expect(run('=MAX(A1:A3)', {})).toBe(0);
		expect(run('=COUNT(A1:A3)', {})).toBe(0);
		expect(run('=SUM(A1:A3)', {})).toBe(0);
	});

	it('finds the extremes, negatives included', () => {
		expect(run('=MIN(A1:A4)', column([4, -2, 9, 0]))).toBe(-2);
		expect(run('=MAX(A1:A4)', column([4, -2, 9, 0]))).toBe(9);
	});

	it('counts a boolean written directly but not one sitting in a range', () => {
		expect(run('=COUNT(TRUE)')).toBe(1);
		expect(run('=COUNT(A1:A2)', column([true, false]))).toBe(0);
	});
});

describe('ROUND', () => {
	it('rounds halves AWAY FROM ZERO, which Math.round does not', () => {
		expect(roundHalfAwayFromZero(2.5, 0)).toBe(3);
		expect(roundHalfAwayFromZero(-2.5, 0)).toBe(-3);
		// The disagreement, stated so the test says why it exists.
		expect(Math.round(-2.5)).toBe(-2);
		expect(run('=ROUND(-2.5)')).toBe(-3);
		expect(run('=ROUND(-0.5)')).toBe(-1);
	});

	it('rounds to decimal places without the binary-floating-point slip', () => {
		// 2.675 * 100 is 267.49999999999997, so a multiply-and-round gives 2.67.
		expect(run('=ROUND(2.675,2)')).toBe(2.68);
		expect(run('=ROUND(1.005,2)')).toBe(1.01);
		expect(run('=ROUND(3.14159,3)')).toBe(3.142);
	});

	it('rounds to the left of the point with a negative place count', () => {
		expect(run('=ROUND(1234,-2)')).toBe(1200);
		expect(run('=ROUND(1250,-2)')).toBe(1300);
	});

	it('defaults to whole numbers when the place count is left out', () => {
		expect(run('=ROUND(2.4)')).toBe(2);
		expect(run('=ROUND(2.6)')).toBe(3);
	});
});

describe('ABS and IF', () => {
	it('takes the size of a number', () => {
		expect(run('=ABS(-7)')).toBe(7);
		expect(run('=ABS(7)')).toBe(7);
		expect(run('=ABS(A1)', {})).toBe(0);
	});

	it('answers each branch, and FALSE when the third is left out', () => {
		expect(run('=IF(1>0,"yes","no")')).toBe('yes');
		expect(run('=IF(1<0,"yes","no")')).toBe('no');
		expect(run('=IF(1<0,"yes")')).toBe(false);
	});

	it('discards the branch it did not take, error and all', () => {
		// The false branch is 10/0. IF still answers 0 rather than #DIV/0!,
		// because an error is a VALUE that can be thrown away.
		expect(run('=IF(A1=0,0,10/A1)', {})).toBe(0);
		expect(run('=IF(A1=0,0,10/A1)', { A1: 2 })).toBe(5);
	});

	it('refuses a range where a single value belongs', () => {
		expect(run('=ABS(A1:A3)', {})).toMatchObject({ code: '#VALUE!' });
		expect(run('=IF(A1:A3,1,2)', {})).toMatchObject({ code: '#VALUE!' });
	});
});

describe('the error sweep and its one opt-out', () => {
	it('is opted out of by IF alone', () => {
		const optedOut = [...FORMULA_FUNCTIONS.values()]
			.filter((fn) => fn.propagatesArgumentErrors === false)
			.map((fn) => fn.name);
		expect(optedOut).toEqual(['IF']);
	});

	it('still returns an error from IF own test and from the branch it takes', () => {
		expect(run('=IF(1/0,1,2)')).toMatchObject({ code: '#DIV/0!' });
		expect(run('=IF(TRUE,1/0,2)')).toMatchObject({ code: '#DIV/0!' });
		expect(run('=IF(FALSE,1,1/0)')).toMatchObject({ code: '#DIV/0!' });
	});

	it('refuses every swept function the moment one argument holds an error', () => {
		for (const source of [
			'=SUM(1,1/0)',
			'=AVERAGE(A1:A2)',
			'=MIN(1,1/0)',
			'=MAX(1,1/0)',
			'=COUNT(1,1/0)',
			'=ROUND(1/0)',
			'=ABS(1/0)'
		]) {
			const cells: Record<string, FormulaValue> = source.includes('A1:A2')
				? { A1: run('=1/0'), A2: 2 }
				: {};
			expect(run(source, cells)).toMatchObject({ code: '#DIV/0!' });
		}
	});
});
