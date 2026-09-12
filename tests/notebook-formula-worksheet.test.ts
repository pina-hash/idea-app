import { describe, expect, it } from 'vitest';
import { FormulaSheet } from '$lib/notebook/formula/sheet';

/**
 * THE ENGINE END TO END, on the two things ledger 0187 says a student actually
 * reaches for: a materials table and a cost estimate. Every expected number
 * here is arithmetic done by hand in the comment beside it, never a value read
 * back off the engine, which is what stops this being a characterisation of
 * whatever the code currently does.
 */

describe('a materials table', () => {
	// A       B         C        D
	// Part    Quantity  Each     Line total
	// Bracket 4         2.50     10.00
	// Bolt    12        0.35      4.20
	// Plate   1        18.99     18.99
	const sheet = new FormulaSheet({
		A1: 'Part',
		B1: 'Quantity',
		C1: 'Each',
		D1: 'Line total',
		A2: 'Bracket',
		B2: '4',
		C2: '2.50',
		D2: '=ROUND(B2*C2,2)',
		A3: 'Bolt',
		B3: '12',
		C3: '0.35',
		D3: '=ROUND(B3*C3,2)',
		A4: 'Plate',
		B4: '1',
		C4: '18.99',
		D4: '=ROUND(B4*C4,2)',
		B6: '=SUM(B2:B4)',
		D6: '=SUM(D2:D4)',
		D7: '=ROUND(D6*0.0875,2)',
		D8: '=D6+D7',
		D9: '=AVERAGE(D2:D4)',
		D10: '=MAX(D2:D4)',
		D11: '=COUNT(D2:D4)'
	});

	it('computes each line and the totals, over a heading row it ignores', () => {
		expect(sheet.value('D2')).toBe(10); // 4 * 2.50
		expect(sheet.value('D3')).toBe(4.2); // 12 * 0.35
		expect(sheet.value('D4')).toBe(18.99); // 1 * 18.99
		expect(sheet.value('B6')).toBe(17); // 4 + 12 + 1
		expect(sheet.value('D6')).toBe(33.19); // 10 + 4.20 + 18.99
	});

	it('sums a column whose first cell is a heading rather than refusing it', () => {
		const withHeading = new FormulaSheet({ A1: 'Each', A2: '2.5', A3: '0.5', T1: '=SUM(A1:A3)' });
		expect(withHeading.value('T1')).toBe(3);
	});

	it('carries tax and a grand total', () => {
		expect(sheet.value('D7')).toBe(2.9); // round(33.19 * 0.0875, 2) = 2.904 -> 2.90
		// 33.19 + 2.90. The STORED value is what IEEE-754 says, which is
		// 36.089999999999996; what a student reads is the displayed one.
		expect(sheet.value('D8')).toBeCloseTo(36.09, 10);
		expect(sheet.display('D8')).toBe('36.09');
	});

	it('shows a number cut to fifteen significant digits and keeps the value exact', () => {
		const money = new FormulaSheet({ A1: '=0.1+0.2', B1: '=33.19+2.90' });
		expect(money.display('A1')).toBe('0.3');
		expect(money.display('B1')).toBe('36.09');
		// The value is untouched, so nothing downstream inherits a rounding
		// nobody asked for.
		expect(money.value('A1')).toBe(0.1 + 0.2);
		expect(money.value('A1')).not.toBe(0.3);
	});

	it('reports the spread of the lines', () => {
		expect(sheet.value('D9')).toBeCloseTo(11.063333, 5); // 33.19 / 3
		expect(sheet.value('D10')).toBe(18.99);
		expect(sheet.value('D11')).toBe(3);
	});

	it('updates every total that depends on one changed quantity, and only those', () => {
		const live = new FormulaSheet({
			B2: '4',
			C2: '2.50',
			D2: '=ROUND(B2*C2,2)',
			B3: '12',
			C3: '0.35',
			D3: '=ROUND(B3*C3,2)',
			D6: '=SUM(D2:D3)',
			D7: '=ROUND(D6*0.0875,2)'
		});
		expect(live.value('D6')).toBe(14.2); // 10 + 4.20
		live.setCell('B2', '5');
		expect(live.value('D2')).toBe(12.5); // 5 * 2.50
		expect(live.value('D6')).toBe(16.7); // 12.50 + 4.20
		expect(live.value('D7')).toBe(1.46); // round(16.70 * 0.0875, 2) = 1.461 -> 1.46
		// D3 and C3 are untouched by a change to B2.
		const touched = [...live.lastRecalculated].sort();
		expect(touched).toEqual(['B2', 'D2', 'D6', 'D7']);
	});
});

describe('a cost estimate with a guard in it', () => {
	it('uses IF to avoid dividing by an empty cell', () => {
		const sheet = new FormulaSheet({
			A1: '120', // total cost
			B1: '', // students, not filled in yet
			C1: '=IF(B1=0,"enter a number of students",ROUND(A1/B1,2))'
		});
		expect(sheet.value('C1')).toBe('enter a number of students');
		sheet.setCell('B1', '8');
		expect(sheet.value('C1')).toBe(15); // 120 / 8
		sheet.setCell('B1', '7');
		expect(sheet.value('C1')).toBe(17.14); // 120 / 7 = 17.142857 -> 17.14
	});

	it('shows the refusal rather than a wrong number when the guard is missing', () => {
		const sheet = new FormulaSheet({ A1: '120', B1: '', C1: '=A1/B1', D1: '=C1+1' });
		expect(sheet.display('C1')).toBe('#DIV/0!');
		expect(sheet.display('D1')).toBe('#DIV/0!');
	});

	it('compares against a budget and says which side it is on', () => {
		const sheet = new FormulaSheet({
			A1: '=SUM(B1:B3)',
			B1: '40',
			B2: '35',
			B3: '50',
			C1: '=IF(A1>100,"over","within")'
		});
		expect(sheet.value('A1')).toBe(125); // 40 + 35 + 50
		expect(sheet.value('C1')).toBe('over');
		sheet.setCell('B3', '10');
		expect(sheet.value('A1')).toBe(85); // 40 + 35 + 10
		expect(sheet.value('C1')).toBe('within');
	});

	it('refuses a range too large to expand, at evaluation, with no edges added', () => {
		const sheet = new FormulaSheet({ A1: '=SUM(A2:XFD100000)' });
		expect(sheet.display('A1')).toBe('#REF!');
		sheet.setCell('A2', '1');
		// Nothing was registered as a dependency, so A1 is not recomputed and
		// still says the same thing.
		expect([...sheet.lastRecalculated]).toEqual(['A2']);
		expect(sheet.display('A1')).toBe('#REF!');
	});
});
