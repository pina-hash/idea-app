import { describe, expect, it } from 'vitest';
import { FormulaSheet } from '$lib/notebook/formula/sheet';
import { parseFormula } from '$lib/notebook/formula/parse';
import { ERROR_CODES, isError, toDisplay, type FormulaError } from '$lib/notebook/formula/values';

/**
 * THE FOUR REFUSALS LEDGER 0187 NAMES, each one here, each one a cell ERROR
 * rather than a hang, a throw or a number that is quietly wrong.
 *
 * They are tested through `FormulaSheet` and not through the evaluator, because
 * three of the four are only answerable by the whole engine: a cycle is a
 * property of the graph, a blank is a property of a cell that was never
 * written, and a parse failure has to survive being STORED as a cell's value.
 */

function errorAt(sheet: FormulaSheet, ref: string): FormulaError {
	const value = sheet.value(ref);
	expect(isError(value)).toBe(true);
	return value as FormulaError;
}

describe('refusal 1: a circular reference reports the cycle', () => {
	it('names a cell that refers to itself', () => {
		const sheet = new FormulaSheet();
		sheet.setCell('A1', '=A1+1');
		const refused = errorAt(sheet, 'A1');
		expect(refused.code).toBe('#CYCLE!');
		expect(refused.cycle).toEqual(['A1', 'A1']);
		expect(refused.message).toContain('A1 -> A1');
	});

	it('names every cell on a two-step cycle, in order, closing on itself', () => {
		const sheet = new FormulaSheet({ A1: '=B1+1', B1: '=A1+1' });
		const a = errorAt(sheet, 'A1');
		const b = errorAt(sheet, 'B1');
		expect(a.code).toBe('#CYCLE!');
		expect(b.code).toBe('#CYCLE!');
		expect(a.cycle?.length).toBe(3);
		expect(a.cycle?.[0]).toBe(a.cycle?.[2]);
		expect(new Set(a.cycle)).toEqual(new Set(['A1', 'B1']));
	});

	it('names all three cells on a three-step cycle', () => {
		const sheet = new FormulaSheet({ A1: '=B1', B1: '=C1', C1: '=A1' });
		const refused = errorAt(sheet, 'A1');
		expect(refused.code).toBe('#CYCLE!');
		expect(new Set(refused.cycle)).toEqual(new Set(['A1', 'B1', 'C1']));
		expect(refused.cycle?.[0]).toBe(refused.cycle?.[refused.cycle.length - 1]);
	});

	it('finds a cycle reached through a RANGE', () => {
		const sheet = new FormulaSheet({ A1: '=SUM(A1:A3)', A2: '1', A3: '2' });
		expect(errorAt(sheet, 'A1').code).toBe('#CYCLE!');
	});

	it('returns rather than hanging or overflowing on a long cycle', () => {
		// 2000 cells in one ring. A naive recursive walk overflows and an
		// unguarded one never terminates; this has to come back.
		const cells: Record<string, string> = {};
		for (let row = 1; row <= 2000; row += 1) {
			cells[`A${row}`] = `=A${row === 2000 ? 1 : row + 1}+1`;
		}
		const started = Date.now();
		const sheet = new FormulaSheet(cells);
		expect(Date.now() - started).toBeLessThan(10000);
		expect(errorAt(sheet, 'A1').code).toBe('#CYCLE!');
		expect(errorAt(sheet, 'A1000').code).toBe('#CYCLE!');
	});

	it('hands a cell that merely READS a cycle the same error, without joining the ring', () => {
		const sheet = new FormulaSheet({ A1: '=B1', B1: '=A1', C1: '=A1+1' });
		const inherited = errorAt(sheet, 'C1');
		expect(inherited.code).toBe('#CYCLE!');
		// C1 inherits the value, so the reported ring is still A1/B1 and names
		// the cells a student has to go and fix. C1 is not one of them.
		expect(inherited.cycle).not.toContain('C1');
		expect(new Set(inherited.cycle)).toEqual(new Set(['A1', 'B1']));
	});

	it('clears the error when the cycle is broken, and does not leave it stuck', () => {
		const sheet = new FormulaSheet({ A1: '=B1+1', B1: '=A1+1' });
		expect(errorAt(sheet, 'A1').code).toBe('#CYCLE!');
		sheet.setCell('B1', '4');
		expect(sheet.value('A1')).toBe(5);
		expect(sheet.value('B1')).toBe(4);
	});
});

describe('refusal 2: a reference to an empty cell is zero, not an error', () => {
	it('adds, subtracts and multiplies through a blank', () => {
		const sheet = new FormulaSheet({ B1: '=A1+5', B2: '=A1*5', B3: '=10-A1' });
		expect(sheet.value('B1')).toBe(5);
		expect(sheet.value('B2')).toBe(0);
		expect(sheet.value('B3')).toBe(10);
		for (const ref of ['B1', 'B2', 'B3']) expect(isError(sheet.value(ref))).toBe(false);
	});

	it('leaves a blank out of COUNT and AVERAGE rather than counting it as zero', () => {
		const sheet = new FormulaSheet({ A1: '4', A3: '6', T1: '=COUNT(A1:A3)', T2: '=AVERAGE(A1:A3)' });
		expect(sheet.value('T1')).toBe(2);
		// 5, not 10/3: a blank is not a measurement of zero.
		expect(sheet.value('T2')).toBe(5);
	});

	it('shows an empty cell as nothing, which is not the same as showing 0', () => {
		const sheet = new FormulaSheet({ A1: '', B1: '0' });
		expect(sheet.display('A1')).toBe('');
		expect(sheet.display('B1')).toBe('0');
	});
});

describe('refusal 3: division by zero is a cell error, and no NaN reaches a total', () => {
	it('answers #DIV/0! with the position of the division', () => {
		const sheet = new FormulaSheet({ A1: '=10/0' });
		const refused = errorAt(sheet, 'A1');
		expect(refused.code).toBe('#DIV/0!');
		// `=10/0`: the `/` is at index 3 of the cell's own source.
		expect(refused.position).toBe(3);
		expect(sheet.display('A1')).toBe('#DIV/0!');
	});

	it('treats dividing by an EMPTY cell the same way, since a blank is zero', () => {
		const sheet = new FormulaSheet({ B1: '=10/A1' });
		expect(errorAt(sheet, 'B1').code).toBe('#DIV/0!');
	});

	it('carries the error into a total instead of letting NaN in', () => {
		const sheet = new FormulaSheet({ A1: '1', A2: '=1/0', A3: '3', T1: '=SUM(A1:A3)', T2: '=T1*2' });
		expect(errorAt(sheet, 'T1').code).toBe('#DIV/0!');
		expect(errorAt(sheet, 'T2').code).toBe('#DIV/0!');
		// The thing being refused: a silent 4, or a NaN that displays as blank.
		expect(sheet.value('T1')).not.toBe(4);
		expect(Number.isNaN(sheet.value('T1') as number)).toBe(false);
		expect(sheet.display('T1')).toBe('#DIV/0!');
	});

	it('never lets a non-finite number become a value anywhere', () => {
		const sheet = new FormulaSheet({ A1: '=9^999', A2: '=A1+1', A3: '=1E308*10' });
		for (const ref of ['A1', 'A2', 'A3']) {
			const value = sheet.value(ref);
			expect(typeof value === 'number' && !Number.isFinite(value)).toBe(false);
			expect(isError(value)).toBe(true);
		}
	});
});

describe('refusal 4: a malformed formula is a cell error carrying its position', () => {
	const cases: [string, string, number][] = [
		['=1+', '#PARSE!', 3],
		['=(1+2', '#PARSE!', 1],
		['=1+2)', '#PARSE!', 4],
		['=SUM(1;2)', '#PARSE!', 6],
		['=', '#PARSE!', 0],
		['=1 # 2', '#PARSE!', 3],
		['=$A$1', '#PARSE!', 1],
		['="unclosed', '#PARSE!', 1],
		['=WIDGET', '#NAME?', 1],
		['=A0', '#REF!', 1]
	];

	it.each(cases)('refuses %s as %s at position %i', (source, code, position) => {
		const sheet = new FormulaSheet({ A1: source });
		const refused = errorAt(sheet, 'A1');
		expect(refused.code).toBe(code);
		expect(refused.position).toBe(position);
		// The sentence carries its own location, so a surface printing a chip
		// beside it would print the number twice.
		expect(refused.message).toContain(String(position));
	});

	it('generated the whole corpus, so a sweep that produced nothing cannot pass', () => {
		expect(cases.length).toBe(10);
	});

	it('indexes the position into the CELL SOURCE, = included', () => {
		// `=  1 +  ` : the problem is the end of the formula, at index 8.
		const sheet = new FormulaSheet({ A1: '=  1 +  ' });
		expect(errorAt(sheet, 'A1').position).toBe(8);
	});

	it('gives a broken formula no dependencies, so nothing waits on it', () => {
		const sheet = new FormulaSheet({ A1: '1', B1: '=A1+', C1: '=B1' });
		expect(errorAt(sheet, 'B1').code).toBe('#PARSE!');
		sheet.setCell('A1', '2');
		// B1 cannot be recomputed by a change to A1, because it never read it.
		expect([...sheet.lastRecalculated]).toEqual(['A1']);
	});

	it('recovers the moment the formula is fixed', () => {
		const sheet = new FormulaSheet({ A1: '2', B1: '=A1*' });
		expect(errorAt(sheet, 'B1').code).toBe('#PARSE!');
		sheet.setCell('B1', '=A1*3');
		expect(sheet.value('B1')).toBe(6);
		sheet.setCell('A1', '4');
		expect(sheet.value('B1')).toBe(12);
	});
});

describe('the error vocabulary', () => {
	it('is closed, and every code in it is produced by something above', () => {
		expect([...ERROR_CODES]).toEqual([
			'#DIV/0!',
			'#VALUE!',
			'#NAME?',
			'#REF!',
			'#NUM!',
			'#CYCLE!',
			'#PARSE!'
		]);
		const sheet = new FormulaSheet({
			A1: '=1/0',
			A2: '=1+"apple"',
			A3: '=WIDGET',
			A4: '=A0',
			A5: '=9^999',
			A6: '=A6',
			A7: '=1+'
		});
		const produced = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'].map(
			(ref) => (sheet.value(ref) as FormulaError).code
		);
		expect(new Set(produced)).toEqual(new Set(ERROR_CODES));
	});

	it('shows a code in the cell and keeps the sentence off the grid', () => {
		const sheet = new FormulaSheet({ A1: '=1/0' });
		expect(sheet.display('A1')).toBe('#DIV/0!');
		expect(toDisplay(sheet.value('A1')).length).toBeLessThan(
			(sheet.value('A1') as FormulaError).message.length
		);
	});

	it('parses a formula to an error value rather than throwing, every time', () => {
		for (const source of ['=', '=)', '=,', '=1+', '=SUM(', 'not a formula']) {
			expect(() => parseFormula(source)).not.toThrow();
			expect(isError(parseFormula(source))).toBe(true);
		}
	});
});
