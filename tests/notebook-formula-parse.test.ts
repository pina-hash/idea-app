import { describe, expect, it } from 'vitest';
import { tokenize } from '$lib/notebook/formula/tokenize';
import { formulaReferences, isFormulaSource, parseFormula, MAX_DEPTH } from '$lib/notebook/formula/parse';
import { isError, type FormulaError } from '$lib/notebook/formula/values';
import { columnIndex, columnLabel, expandRange, normalizeRef, parseCellRef } from '$lib/notebook/formula/references';

/**
 * Every PARSE path, tokenizer and parser alike. The expected values here come
 * from spreadsheet semantics and from arithmetic, never from the implementation
 * itself: a precedence test whose expected value is "whatever the parser
 * builds" cannot fail.
 */

function err(value: unknown): FormulaError {
	expect(isError(value as never)).toBe(true);
	return value as FormulaError;
}

describe('A1 references', () => {
	it('round-trips every column label through its index', () => {
		const cases: [number, string][] = [
			[0, 'A'],
			[25, 'Z'],
			[26, 'AA'],
			[27, 'AB'],
			[51, 'AZ'],
			[52, 'BA'],
			[701, 'ZZ'],
			[702, 'AAA'],
			[16383, 'XFD']
		];
		for (const [index, label] of cases) {
			expect(columnLabel(index)).toBe(label);
			expect(columnIndex(label)).toBe(index);
		}
	});

	it('canonicalises spelling, so one cell is one key', () => {
		expect(normalizeRef('b7')).toBe('B7');
		expect(normalizeRef('B7')).toBe('B7');
		expect(normalizeRef('B07')).toBe('B7');
		expect(normalizeRef('aa1')).toBe('AA1');
	});

	it('refuses a reference that is not a cell', () => {
		expect(normalizeRef('A0')).toBeNull();
		expect(normalizeRef('A')).toBeNull();
		expect(normalizeRef('1')).toBeNull();
		expect(normalizeRef('ABCD1')).toBeNull();
		expect(parseCellRef('XFE1')).toBeNull();
		expect(parseCellRef('A1048577')).toBeNull();
	});

	it('expands a range row-major and normalises the corners in both directions', () => {
		const forwards = expandRange('A1', 'B2');
		const backwards = expandRange('B2', 'A1');
		expect(isError(forwards)).toBe(false);
		expect(isError(backwards)).toBe(false);
		if (isError(forwards) || isError(backwards)) return;
		expect([...forwards.cells]).toEqual(['A1', 'B1', 'A2', 'B2']);
		expect([...backwards.cells]).toEqual([...forwards.cells]);
		expect(forwards.rows).toBe(2);
		expect(forwards.cols).toBe(2);
		expect(forwards.cells.length).toBe(forwards.rows * forwards.cols);
	});

	it('refuses a range larger than the cap rather than allocating it', () => {
		const refused = err(expandRange('A1', 'XFD1048576'));
		expect(refused.code).toBe('#REF!');
		expect(refused.message).toContain('20000');
	});
});

describe('the tokenizer', () => {
	it('reads every token kind with a position in the CELL source', () => {
		const tokens = tokenize('A1+SUM(B1:B3)', 1);
		expect(isError(tokens)).toBe(false);
		if (isError(tokens)) return;
		expect(tokens.map((t) => [t.type, t.text, t.position])).toEqual([
			['ref', 'A1', 1],
			['op', '+', 3],
			['name', 'SUM', 4],
			['lparen', '(', 7],
			['ref', 'B1', 8],
			['colon', ':', 10],
			['ref', 'B3', 11],
			['rparen', ')', 13],
			['eof', '', 14]
		]);
	});

	it('takes the longest operator, so <= is never < then =', () => {
		const tokens = tokenize('1<=2<>3>=4');
		if (isError(tokens)) throw new Error('unexpected refusal');
		expect(tokens.filter((t) => t.type === 'op').map((t) => t.text)).toEqual(['<=', '<>', '>=']);
	});

	it('reads a doubled quote inside text as one quote', () => {
		const tokens = tokenize('"he said ""hi"""');
		if (isError(tokens)) throw new Error('unexpected refusal');
		expect(tokens[0]).toMatchObject({ type: 'string', text: 'he said "hi"' });
	});

	it('names $A$1 rather than quietly treating it as A1', () => {
		const refused = err(tokenize('$A$1', 1));
		expect(refused.code).toBe('#PARSE!');
		expect(refused.position).toBe(1);
		expect(refused.message).toContain('$A$1');
	});

	it('refuses an unterminated string, a stray character and a bad number', () => {
		expect(err(tokenize('"open')).code).toBe('#PARSE!');
		expect(err(tokenize('1 # 2')).code).toBe('#PARSE!');
		expect(err(tokenize('1.2.3')).code).toBe('#PARSE!');
	});

	it('ignores whitespace without moving a position', () => {
		const tokens = tokenize('  A1', 1);
		if (isError(tokens)) throw new Error('unexpected refusal');
		expect(tokens[0].position).toBe(3);
	});
});

describe('the parser', () => {
	it('knows a formula from a literal', () => {
		expect(isFormulaSource('=A1')).toBe(true);
		expect(isFormulaSource('  =A1')).toBe(true);
		expect(isFormulaSource('A1')).toBe(false);
		expect(isFormulaSource('')).toBe(false);
	});

	it('builds left-associative additive and multiplicative chains', () => {
		const node = parseFormula('=1-2-3');
		if (isError(node)) throw new Error('unexpected refusal');
		// (1-2)-3, not 1-(2-3): the difference is -4 against 2.
		expect(node).toMatchObject({
			kind: 'binary',
			op: '-',
			left: { kind: 'binary', op: '-', left: { value: 1 }, right: { value: 2 } },
			right: { value: 3 }
		});
	});

	it('makes ^ right-associative', () => {
		const node = parseFormula('=2^3^2');
		if (isError(node)) throw new Error('unexpected refusal');
		// 2^(3^2) is 512; (2^3)^2 would be 64.
		expect(node).toMatchObject({
			kind: 'binary',
			op: '^',
			left: { value: 2 },
			right: { kind: 'binary', op: '^', left: { value: 3 }, right: { value: 2 } }
		});
	});

	it('binds unary minus TIGHTER than ^, as a spreadsheet does', () => {
		const node = parseFormula('=-2^2');
		if (isError(node)) throw new Error('unexpected refusal');
		// (-2)^2 is 4. Most programming languages would parse -(2^2) = -4.
		expect(node).toMatchObject({
			kind: 'binary',
			op: '^',
			left: { kind: 'unary', op: '-' },
			right: { value: 2 }
		});
	});

	it('puts comparison below arithmetic', () => {
		const node = parseFormula('=1+2>2*1');
		if (isError(node)) throw new Error('unexpected refusal');
		expect(node).toMatchObject({
			kind: 'binary',
			op: '>',
			left: { kind: 'binary', op: '+' },
			right: { kind: 'binary', op: '*' }
		});
	});

	it('parses calls with no arguments, one argument and several', () => {
		for (const [src, count] of [
			['=SUM()', 0],
			['=SUM(1)', 1],
			['=SUM(1,2,3)', 3]
		] as [string, number][]) {
			const node = parseFormula(src);
			if (isError(node)) throw new Error(`unexpected refusal for ${src}`);
			expect(node).toMatchObject({ kind: 'call', name: 'SUM' });
			expect((node as { args: readonly unknown[] }).args.length).toBe(count);
		}
	});

	it('reads TRUE and FALSE as booleans and an unknown bare name as #NAME?', () => {
		expect(parseFormula('=TRUE')).toMatchObject({ kind: 'boolean', value: true });
		expect(parseFormula('=false')).toMatchObject({ kind: 'boolean', value: false });
		expect(err(parseFormula('=WIDGET')).code).toBe('#NAME?');
	});

	it('collects references from the TREE, never from the text', () => {
		const node = parseFormula('=SUM(A1:B2)+C3&"A1"');
		// The `&` is not an operator here, so this one refuses; use a formula
		// that parses and still carries a cell name inside a string.
		expect(isError(node)).toBe(true);
		const ok = parseFormula('=SUM(A1:B2)+IF(C3>0,"see D9","")');
		if (isError(ok)) throw new Error('unexpected refusal');
		const refs = formulaReferences(ok);
		expect(refs.cells.sort()).toEqual(['C3']);
		expect(refs.ranges).toEqual([['A1', 'B2']]);
		// D9 appears in the source and must NOT be a dependency.
		expect(JSON.stringify(refs)).not.toContain('D9');
	});

	it('caps nesting instead of overflowing the stack', () => {
		const deep = `=${'('.repeat(MAX_DEPTH * 4)}1${')'.repeat(MAX_DEPTH * 4)}`;
		const refused = err(parseFormula(deep));
		expect(refused.code).toBe('#PARSE!');
		expect(refused.message).toContain('nested too deeply');
	});
});

describe('the remaining refusal paths', () => {
	it('refuses a colon with nothing usable after it', () => {
		expect(err(parseFormula('=A1:')).code).toBe('#REF!');
		expect(err(parseFormula('=A1:SUM(1)')).code).toBe('#REF!');
		expect(err(parseFormula('=A1:A0')).code).toBe('#REF!');
	});

	it('refuses a source with no = at all', () => {
		const refused = err(parseFormula('1+1'));
		expect(refused.code).toBe('#PARSE!');
		expect(refused.position).toBe(0);
	});

	it('refuses a call missing its comma or its closing bracket', () => {
		expect(err(parseFormula('=SUM(1 2)')).code).toBe('#PARSE!');
		expect(err(parseFormula('=SUM(1,2')).code).toBe('#PARSE!');
	});

	it('answers null for a column label that is not letters', () => {
		expect(columnIndex('1')).toBeNull();
		expect(columnIndex('A1')).toBeNull();
		expect(columnIndex('')).toBeNull();
	});
});
