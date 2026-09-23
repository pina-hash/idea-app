// tests/ideacad-solid-dimensions-labels.test.ts
//
// WHAT A NUMBER IN THE VIEWPORT SAYS, WHAT A TYPED ONE MEANS, AND WHERE THE
// LABELS GO: `dimensions/labels.ts` (ledger 0296, F025).
//
// WHY THESE ARE AUTOMATED: each regression is silent on screen.
//   * A millimeter preference that stored what was typed as inches would make
//     a 25 mm plate 25 in wide and render it plausibly (it is a bigger plate).
//   * A diameter label that stored the typed diameter as the radius doubles
//     every circle a student retypes.
//   * Two labels left on top of each other read as one number.
import { describe, expect, it } from 'vitest';
import { labelEditText, labelTarget, labelText, readLabel, spreadLabels, typedInDisplay, type LabelBox } from '../src/lib/ideacad/solid/dimensions/labels';

describe('what a label says', () => {
	it('a length reads in the display unit: inches to three places, millimeters to two', () => {
		expect(labelText(2, 'in', 'in')).toBe('2.000 in');
		expect(labelText(2, 'in', 'mm')).toBe('50.80 mm');
	});
	it('a circle stores its radius and reads as its diameter, with the sign', () => {
		expect(labelText(0.5, 'in', 'in', '⌀', 2)).toBe('⌀ 1.000 in');
		expect(labelText(0.5, 'in', 'mm', '⌀', 2)).toBe('⌀ 25.40 mm');
		expect(labelText(0.25, 'in', 'in', 'R')).toBe('R 0.250 in');
	});
	it('angles, counts and ratios ignore the length unit', () => {
		expect(labelText(45, 'deg', 'mm')).toBe('45.0°');
		expect(labelText(4, 'count', 'mm')).toBe('4 copies');
		expect(labelText(1.5, 'factor', 'mm')).toBe('× 1.500');
	});
	it('a measured area or volume reads in its own unit', () => {
		expect(labelText(12, 'in2', 'in')).toBe('12.000 in²');
	});
});

describe('what the box opens with', () => {
	it('the shown number, float noise trimmed, in the display unit', () => {
		expect(labelEditText(0.1 + 0.2, 'in', 'in')).toBe('0.3');
		expect(labelEditText(1, 'in', 'mm')).toBe('25.4');
		expect(labelEditText(0.5, 'in', 'in', 2)).toBe('1');
		expect(labelEditText(90, 'deg', 'mm')).toBe('90');
	});
});

describe('what a typed value means', () => {
	it('a bare number is in the display unit; a number with its own unit is taken as named', () => {
		expect(readLabel('2', 'in', 'in')).toEqual({ ok: true, value: 2 });
		const mm = readLabel('25.4', 'in', 'mm'); expect(mm.ok && mm.value).toBeCloseTo(1, 12);
		expect(readLabel('2in', 'in', 'mm')).toEqual({ ok: true, value: 2 });
		const frac = readLabel('3/8', 'in', 'in'); expect(frac.ok && frac.value).toBeCloseTo(0.375, 12);
	});
	it('a typed diameter stores a radius', () => {
		expect(readLabel('2', 'in', 'in', 2)).toEqual({ ok: true, value: 1 });
		const mm = readLabel('50.8', 'in', 'mm', 2); expect(mm.ok && mm.value).toBeCloseTo(1, 12);
	});
	it('angles are never millimeters', () => {
		expect(typedInDisplay('45', 'deg', 'mm')).toBe('45');
		expect(readLabel('45', 'deg', 'mm')).toEqual({ ok: true, value: 45 });
	});
	it('nothing is clamped: negative, zero and huge values go through as typed', () => {
		expect(readLabel('-3', 'in', 'in')).toEqual({ ok: true, value: -3 });
		expect(readLabel('0', 'in', 'in')).toEqual({ ok: true, value: 0 });
		expect(readLabel('1e6', 'in', 'in')).toEqual({ ok: true, value: 1e6 });
	});
	it('text that is not a number is the parser\'s own sentence', () => {
		const r = readLabel('wide', 'in', 'in');
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('Enter a number, like 1.5, 3/8, 1 1/2 or 25.4mm.');
	});
});

describe('labels are moved apart', () => {
	const overlaps = (a: LabelBox, b: LabelBox) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
	it('a lone label keeps its place', () => {
		expect(spreadLabels([{ id: 'a', x: 100, y: 100, w: 90, h: 44 }])).toEqual([{ id: 'a', x: 100, y: 100, w: 90, h: 44 }]);
	});
	it('five labels on one point end with none touching another, the first unmoved', () => {
		const boxes = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, x: 300, y: 300, w: 96, h: 44 }));
		const out = spreadLabels(boxes);
		expect(out[0]).toEqual(boxes[0]);
		let touching = 0;
		for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) if (overlaps(out[i], out[j])) touching++;
		expect(touching).toBe(0);
	});
	it('the same input lands the same way every time', () => {
		const boxes = [{ id: 'a', x: 50, y: 50, w: 80, h: 44 }, { id: 'b', x: 60, y: 55, w: 80, h: 44 }, { id: 'c', x: 40, y: 45, w: 80, h: 44 }];
		expect(spreadLabels(boxes)).toEqual(spreadLabels(boxes));
	});
	it('a label is kept inside the bounds, and pairs pinned against an edge still separate', () => {
		const bounds = { left: 0, top: 0, right: 400, bottom: 300 };
		const out = spreadLabels([{ id: 'a', x: 395, y: 150, w: 100, h: 44 }, { id: 'b', x: 395, y: 150, w: 100, h: 44 }], bounds);
		for (const b of out) { expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0); expect(b.x + b.w / 2).toBeLessThanOrEqual(400); expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0); expect(b.y + b.h / 2).toBeLessThanOrEqual(300); }
		expect(overlaps(out[0], out[1])).toBe(false);
	});
	it('a label wants to sit a fixed distance along the screen direction of its anchor', () => {
		expect(labelTarget({ x: 10, y: 10 }, { x: 13, y: 14 }, 30)).toEqual({ x: 28, y: 34 });
		expect(labelTarget({ x: 10, y: 10 }, null)).toEqual({ x: 10, y: 10 });
		expect(labelTarget({ x: 10, y: 10 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
	});
});

describe('labels keep out from under the chrome', () => {
	const overlaps = (a: LabelBox, b: LabelBox) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
	it('a label under a panel is moved off it, and the panel does not move or come back in the answer', () => {
		/* A 260 x 600 panel down the right of a 960 x 800 area, and a label that wants to sit on it. */
		const panel = { id: '', x: 818, y: 400, w: 260, h: 600 }, label = { id: 'a', x: 800, y: 300, w: 90, h: 44 };
		const out = spreadLabels([label], { left: 0, top: 0, right: 960, bottom: 800 }, 4, [panel]);
		expect(out).toHaveLength(1);
		expect(overlaps(out[0], panel)).toBe(false);
		expect(out[0].x + out[0].w / 2).toBeLessThanOrEqual(panel.x - panel.w / 2);
	});
	it('with the panel across the bottom of a phone, a label below it goes above it rather than off the screen', () => {
		const panel = { id: '', x: 187, y: 560, w: 359, h: 300 }, label = { id: 'a', x: 187, y: 690, w: 90, h: 44 };
		const out = spreadLabels([label], { left: 0, top: 0, right: 375, bottom: 710 }, 4, [panel]);
		expect(overlaps(out[0], panel)).toBe(false);
		expect(out[0].y + out[0].h / 2).toBeLessThanOrEqual(panel.y - panel.h / 2);
	});
	it('labels pushed off one obstacle do not land on each other', () => {
		const panel = { id: '', x: 500, y: 300, w: 200, h: 200 };
		const out = spreadLabels([{ id: 'a', x: 500, y: 300, w: 90, h: 44 }, { id: 'b', x: 500, y: 300, w: 90, h: 44 }, { id: 'c', x: 510, y: 310, w: 90, h: 44 }], { left: 0, top: 0, right: 1000, bottom: 800 }, 4, [panel]);
		for (const b of out) expect(overlaps(b, panel)).toBe(false);
		expect(overlaps(out[0], out[1]) || overlaps(out[0], out[2]) || overlaps(out[1], out[2])).toBe(false);
	});
});

describe('a crowded corner', () => {
	const overlaps = (a: LabelBox, b: LabelBox) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
	it('four labels squeezed between a panel below and the edge of a phone still end apart', () => {
		/* The measured shape from the 375 px harness: a panel across the bottom, labels crowding just above it. */
		const panel = { id: '', x: 187, y: 610, w: 359, h: 150 };
		const boxes = [{ id: 'a', x: 70, y: 505, w: 88, h: 44 }, { id: 'b', x: 272, y: 505, w: 88, h: 44 }, { id: 'c', x: 320, y: 445, w: 88, h: 44 }, { id: 'd', x: 250, y: 492, w: 140, h: 44 }];
		const out = spreadLabels(boxes, { left: 4, top: 4, right: 371, bottom: 700 }, 4, [panel]);
		let touching = 0;
		for (let i = 0; i < out.length; i++) { if (overlaps(out[i], panel)) touching++; for (let j = i + 1; j < out.length; j++) if (overlaps(out[i], out[j])) touching++; }
		expect(touching).toBe(0);
	});
});
