import { describe, expect, it } from 'vitest';
import { evaluateNode, type EvalContext } from '$lib/notebook/formula/evaluate';
import { parseFormula } from '$lib/notebook/formula/parse';
import { isError, toBoolean, toDisplay, toNumber, type FormulaValue } from '$lib/notebook/formula/values';

/**
 * EVALUATION against a hand-built context, so every rule here is about the
 * evaluator and nothing about the dependency graph. The expected values are
 * arithmetic and spreadsheet semantics; none of them is read back off the
 * implementation.
 */

function ctxOf(cells: Record<string, FormulaValue>): EvalContext {
	return { cell: (ref) => (ref in cells ? cells[ref] : null) };
}

function run(source: string, cells: Record<string, FormulaValue> = {}): FormulaValue {
	const node = parseFormula(source);
	if (isError(node)) return node;
	return evaluateNode(node, ctxOf(cells));
}

describe('coercion', () => {
	it('reads an empty cell as zero, and a blank is not the number zero', () => {
		expect(toNumber(null)).toBe(0);
		expect(toDisplay(null)).toBe('');
		expect(toDisplay(0)).toBe('0');
	});

	it('reads booleans and numeric text as numbers, and other text as #VALUE!', () => {
		expect(toNumber(true)).toBe(1);
		expect(toNumber(false)).toBe(0);
		expect(toNumber('5')).toBe(5);
		expect(toNumber(' -2.5 ')).toBe(-2.5);
		expect(toNumber('')).toMatchObject({ code: '#VALUE!' });
		expect(toNumber('apple')).toMatchObject({ code: '#VALUE!' });
		// `Number()` accepts all three of these; a spreadsheet does not.
		expect(toNumber('Infinity')).toMatchObject({ code: '#VALUE!' });
		expect(toNumber('0x10')).toMatchObject({ code: '#VALUE!' });
		expect(toNumber(' ')).toMatchObject({ code: '#VALUE!' });
	});

	it('reads TRUE/FALSE text as booleans', () => {
		expect(toBoolean('true')).toBe(true);
		expect(toBoolean('FALSE')).toBe(false);
		expect(toBoolean(null)).toBe(false);
		expect(toBoolean(3)).toBe(true);
		expect(toBoolean('apple')).toMatchObject({ code: '#VALUE!' });
	});

	it('shows an error as its code and a boolean as a word', () => {
		expect(toDisplay(run('=1/0'))).toBe('#DIV/0!');
		expect(toDisplay(true)).toBe('TRUE');
		expect(toDisplay('text')).toBe('text');
	});
});

describe('arithmetic', () => {
	it('computes the four operations and the power', () => {
		expect(run('=1+2')).toBe(3);
		expect(run('=7-10')).toBe(-3);
		expect(run('=6*7')).toBe(42);
		expect(run('=9/2')).toBe(4.5);
		expect(run('=2^10')).toBe(1024);
	});

	it('honours parentheses over precedence', () => {
		expect(run('=1+2*3')).toBe(7);
		expect(run('=(1+2)*3')).toBe(9);
		expect(run('=2*(3+(4-1))')).toBe(12);
	});

	it('applies unary signs, including the spreadsheet reading of -2^2', () => {
		expect(run('=-3')).toBe(-3);
		expect(run('=--3')).toBe(3);
		expect(run('=-2^2')).toBe(4);
		expect(run('=0-2^2')).toBe(-4);
		expect(run('=2^-1')).toBe(0.5);
	});

	it('adds an empty cell as zero rather than refusing it', () => {
		expect(run('=A1+5', {})).toBe(5);
		expect(run('=A1*5', {})).toBe(0);
		expect(run('=5-A1', {})).toBe(5);
	});

	it('refuses text in a calculation, naming the text', () => {
		const refused = run('=A1+1', { A1: 'apple' });
		expect(refused).toMatchObject({ code: '#VALUE!' });
		expect((refused as { message: string }).message).toContain('apple');
	});

	it('never produces a non-finite number', () => {
		const big = run('=9^999');
		expect(big).toMatchObject({ code: '#NUM!' });
		expect(Number.isNaN(big as number)).toBe(false);
	});
});

describe('comparison', () => {
	it('compares numbers, and answers a boolean', () => {
		expect(run('=1<2')).toBe(true);
		expect(run('=2<=2')).toBe(true);
		expect(run('=3>4')).toBe(false);
		expect(run('=3>=4')).toBe(false);
		expect(run('=1=1')).toBe(true);
		expect(run('=1<>1')).toBe(false);
	});

	it('compares text without regard to case', () => {
		expect(run('="apple"="APPLE"')).toBe(true);
		expect(run('="apple"<"banana"')).toBe(true);
	});

	it('takes a blank as the other side idea of empty', () => {
		expect(run('=A1=0', {})).toBe(true);
		expect(run('=A1=""', {})).toBe(true);
		expect(run('=A1=FALSE', {})).toBe(true);
		expect(run('=A1=A2', {})).toBe(true);
		expect(run('=A1=1', {})).toBe(false);
	});

	it('orders across types as number, then text, then TRUE/FALSE', () => {
		expect(run('=1<"a"')).toBe(true);
		expect(run('="a"<TRUE')).toBe(true);
		expect(run('=1<TRUE')).toBe(true);
	});

	it('propagates an error through a comparison instead of answering false', () => {
		expect(run('=(1/0)=1')).toMatchObject({ code: '#DIV/0!' });
	});
});

describe('references and ranges', () => {
	it('reads a cell, whatever the spelling', () => {
		expect(run('=b7', { B7: 11 })).toBe(11);
		expect(run('=B07', { B7: 11 })).toBe(11);
	});

	it('refuses a bare range rather than silently picking a corner', () => {
		const refused = run('=A1:B2', { A1: 1 });
		expect(refused).toMatchObject({ code: '#VALUE!' });
		expect((refused as { message: string }).message).toContain('SUM');
	});

	it('passes a range into a function with its shape intact', () => {
		expect(run('=SUM(A1:B2)', { A1: 1, B1: 2, A2: 3, B2: 4 })).toBe(10);
	});
});
