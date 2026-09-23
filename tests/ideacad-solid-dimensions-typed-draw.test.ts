// tests/ideacad-solid-dimensions-typed-draw.test.ts
//
// TYPING A SIZE WHILE A SHAPE IS BEING DRAWN: `dimensions/typed-draw.ts`
// (ledger 0296, friction F007). The drawing tool routes keys here; this is the
// pure half, so every rule is asserted with no viewport.
//
// WHY THESE ARE AUTOMATED: each regression is silent on screen. A typed width
// applied to the wrong side of the first corner draws a rectangle of the right
// size in the wrong place; a millimeter preference ignored makes a 25 mm plate
// 25 inches wide; a letter swallowed into a field before any digit steals a
// shortcut. Expected points are worked out by hand.
import { describe, expect, it } from 'vitest';
import { hasTyped, startTypedDraw, typedPoint, typedReadout, typeKey, typesIntoField, type TypedDraw } from '../src/lib/ideacad/solid/dimensions/typed-draw';

const typed = (tool: string, keys: string[]): TypedDraw => keys.reduce((s, k) => (k === 'Shift+Tab' ? typeKey(s, 'Tab', true) : typeKey(s, k)), startTypedDraw(tool)!);

describe('which tools take a typed size', () => {
	it('rectangle, circle, polygon and line do; an arc does not', () => {
		expect(startTypedDraw('rectangle')!.fields.map((f) => f.key)).toEqual(['width', 'height']);
		expect(startTypedDraw('circle')!.fields.map((f) => f.key)).toEqual(['diameter']);
		expect(startTypedDraw('polygon')!.fields.map((f) => f.key)).toEqual(['radius']);
		expect(startTypedDraw('line')!.fields.map((f) => [f.key, f.unit])).toEqual([['length', 'in'], ['angle', 'deg']]);
		expect(startTypedDraw('arc')).toBeNull();
	});
});

describe('keys', () => {
	it('digits fill the active field, Tab moves on and wraps, Shift+Tab moves back, Backspace takes one off', () => {
		let s = typed('rectangle', ['2', '.', '5']);
		expect(s.fields.map((f) => f.text)).toEqual(['2.5', '']);
		s = typed('rectangle', ['2', 'Tab', '1', 'Backspace', '3']);
		expect(s.fields.map((f) => f.text)).toEqual(['2', '3']);
		expect(typeKey(s, 'Tab').active).toBe(0);
		expect(typed('rectangle', ['Shift+Tab']).active).toBe(1);
	});
	it('a letter before any digit is a shortcut, not part of a number; after one it is a unit', () => {
		expect(typesIntoField('f')).toBe(false);
		expect(typesIntoField('m', '25')).toBe(true);
		expect(typed('rectangle', ['f']).fields[0].text).toBe('');
		expect(typed('rectangle', ['2', '5', 'm', 'm']).fields[0].text).toBe('25mm');
		expect(typeKey(startTypedDraw('rectangle')!, 'Enter')).toEqual(startTypedDraw('rectangle'));
	});
	it('hasTyped says whether Enter finishes at a typed size', () => {
		expect(hasTyped(startTypedDraw('circle'))).toBe(false);
		expect(hasTyped(typed('circle', ['3']))).toBe(true);
		expect(hasTyped(null)).toBe(false);
	});
});

describe('where the shape lands', () => {
	it('a rectangle takes the typed width and height to the side the pointer is on', () => {
		const s = typed('rectangle', ['2', 'Tab', '1']);
		expect(typedPoint(s, [1, 1], [5, 4], 'in')).toEqual([3, 2]);
		expect(typedPoint(s, [1, 1], [-5, -4], 'in')).toEqual([-1, 0]);
	});
	it('an untyped field follows the pointer; a half-typed one too', () => {
		expect(typedPoint(typed('rectangle', ['2']), [0, 0], [5, 4], 'in')).toEqual([2, 4]);
		expect(typedPoint(typed('rectangle', ['-']), [0, 0], [5, 4], 'in')).toEqual([5, 4]);
		expect(typedPoint(startTypedDraw('rectangle')!, [0, 0], [5, 4], 'in')).toEqual([5, 4]);
	});
	it('millimeters: a bare 50.8 is 2 inches', () => {
		const p = typedPoint(typed('rectangle', ['5', '0', '.', '8']), [0, 0], [1, 1], 'mm');
		expect(p[0]).toBeCloseTo(2, 12); expect(p[1]).toBe(1);
	});
	it('a circle\'s typed DIAMETER puts the rim point at half of it, toward the pointer', () => {
		const p = typedPoint(typed('circle', ['4']), [0, 0], [3, 4], 'in');
		expect(p[0]).toBeCloseTo(1.2, 12); expect(p[1]).toBeCloseTo(1.6, 12);
	});
	it('a polygon\'s typed radius puts its first corner that far toward the pointer', () => {
		const p = typedPoint(typed('polygon', ['2']), [1, 0], [1, 5], 'in');
		expect(p[0]).toBeCloseTo(1, 12); expect(p[1]).toBeCloseTo(2, 12);
	});
	it('a line takes its typed length toward the pointer, and a typed angle overrides the pointer\'s direction', () => {
		const a = typedPoint(typed('line', ['5']), [0, 0], [3, 4], 'in');
		expect(a[0]).toBeCloseTo(3, 12); expect(a[1]).toBeCloseTo(4, 12);
		const b = typedPoint(typed('line', ['2', 'Tab', '9', '0']), [1, 1], [3, 4], 'in');
		expect(b[0]).toBeCloseTo(1, 12); expect(b[1]).toBeCloseTo(3, 12);
	});
	it('nothing is clamped: a typed zero draws a zero, and a negative width goes the other way', () => {
		expect(typedPoint(typed('rectangle', ['0']), [0, 0], [2, 2], 'in')).toEqual([0, 2]);
		expect(typedPoint(typed('rectangle', ['-', '1']), [0, 0], [2, 2], 'in')).toEqual([-1, 2]);
	});
});

describe('the words at the pointer', () => {
	it('names every field, marks the active one in brackets, and shows the pointer\'s value where nothing is typed', () => {
		expect(typedReadout(typed('rectangle', ['2']), [0, 0], [5, 4], 'in')).toBe('Width [2]  Height 4.000 in');
		expect(typedReadout(typed('rectangle', ['2', 'Tab']), [0, 0], [5, 4], 'in')).toBe('Width 2  Height [4.000 in]');
		expect(typedReadout(startTypedDraw('circle')!, [0, 0], [3, 4], 'mm')).toBe('Diameter [254.00 mm]');
	});
});
