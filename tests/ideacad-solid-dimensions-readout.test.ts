// tests/ideacad-solid-dimensions-readout.test.ts
//
// THE WORDS BESIDE THE CURSOR, FOR EVERY TOOL. `dragReadout` is total over
// the `Tool` union at the type level (a `Record<Tool, ...>`), and this file is
// the runtime half: every tool the palette lists produces a non-empty sentence
// carrying a unit, the tools that mean different things read differently, and
// the drawing readout says width x height, a diameter, a radius and a side
// count, a segment length with its angle, and an arc radius.
//
// WHY AUTOMATED: a readout that silently fell back to `inches(distance)` for a
// rotate would show "45.000 in" while turning a body 45 degrees, and nothing
// on screen would say the unit was wrong. The expected strings here are
// written by hand from the tool's meaning, never read off the function.
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/lib/ideacad/solid/tools';
import type { DragValue, Tool } from '../src/lib/ideacad/solid/viewport';
import { dragReadout, drawingReadout, numericPrompt, numericUnit } from '../src/lib/ideacad/solid/viewport/readout';

const value = (over: Partial<DragValue> = {}): DragValue => ({ distance: 1.5, delta: [0.3, 0.4, 0], angle: 45, count: 4, point: { x: 10, y: 20 }, handle: null, ...over });
const EVERY_TOOL: Tool[] = TOOLS.map((t) => t.id);

describe('dragReadout over every Tool value', () => {
	it('the palette lists every tool, and every tool answers with a unit', () => {
		expect(EVERY_TOOL).toHaveLength(23);
		for (const tool of EVERY_TOOL) {
			const text = dragReadout(tool, value());
			expect(text.length, tool).toBeGreaterThan(3);
			expect(text, tool).toMatch(/ in\b|°|copies|× /);
			expect(text).not.toMatch(/—/);
		}
	});
	const expected: Record<Tool, string> = {
		select: 'Push 1.500 in', rectangle: 'Push 1.500 in', circle: 'Push 1.500 in', line: 'Push 1.500 in', polygon: 'Push 1.500 in', arc: 'Push 1.500 in',
		extrude: 'Extrude 1.500 in', revolve: 'Revolve 45.0°', fillet: 'Fillet R 1.500 in', chamfer: 'Chamfer 1.500 in', shell: 'Shell 1.500 in',
		move: 'Move 1.500 in', rotate: 'Rotate 45.0°', scale: 'Scale × 2.500', 'linear-pattern': '4 copies × 1.500 in', 'circular-pattern': '4 copies × 90.0°',
		measure: 'Push 1.500 in', hole: 'Push 1.500 in', mate: 'Push 1.500 in', reference: 'Push 1.500 in',
		draft: 'Push 1.500 in', sweep: 'Push 1.500 in', loft: 'Push 1.500 in'
	};
	it.each(EVERY_TOOL)('%s reads as written', (tool) => { expect(dragReadout(tool, value())).toBe(expected[tool]); });
	it('what was grabbed changes the word: a face pushes, an edge or corner moves, a sketch extrudes or revolves', () => {
		expect(dragReadout('select', value(), { kind: 'face' })).toBe('Push 1.500 in');
		expect(dragReadout('select', value(), { kind: 'edge' })).toBe('Move 0.500 in');
		expect(dragReadout('select', value(), { kind: 'vertex' })).toBe('Move 0.500 in');
		expect(dragReadout('extrude', value(), { kind: 'sketch' })).toBe('Extrude 1.500 in');
		expect(dragReadout('extrude', value(), { kind: 'face' })).toBe('Push 1.500 in');
		expect(dragReadout('extrude', value(), { kind: 'edge' })).toBe('Move 0.500 in');
		expect(dragReadout('revolve', value(), { kind: 'sketch' })).toBe('Revolve 45.0°');
		expect(dragReadout('revolve', value(), { kind: 'face' })).toBe('Push 1.500 in');
	});
	it('a negative extrude and a negative push keep their sign; a fillet, chamfer and shell read the magnitude', () => {
		expect(dragReadout('extrude', value({ distance: -0.5 }), { kind: 'sketch' })).toBe('Extrude -0.500 in');
		expect(dragReadout('select', value({ distance: -0.25 }), { kind: 'face' })).toBe('Push -0.250 in');
		expect(dragReadout('fillet', value({ distance: -0.25 }))).toBe('Fillet R 0.250 in');
		expect(dragReadout('chamfer', value({ distance: -0.125 }))).toBe('Chamfer 0.125 in');
		expect(dragReadout('shell', value({ distance: -0.1 }))).toBe('Shell 0.100 in');
	});
	it('move names its handle: along an axis, in a plane, or free', () => {
		expect(dragReadout('move', value({ handle: { mode: 'axis', axis: [1, 0, 0], label: 'X' } }))).toBe('Move 1.500 in along X');
		expect(dragReadout('move', value({ handle: { mode: 'plane', axis: [0, 0, 1], label: 'XY' } }))).toBe('Move 0.500 in in XY');
		expect(dragReadout('move', value({ handle: { mode: 'free', axis: [0, 0, 1], label: 'free' } }))).toBe('Move 0.500 in free');
		expect(dragReadout('rotate', value({ handle: { mode: 'ring', axis: [0, 0, 1], label: 'about Z' } }))).toBe('Rotate 45.0° about Z');
	});
	it('patterns read count times spacing, and a circular one divides the turn', () => {
		expect(dragReadout('linear-pattern', value({ count: 3, distance: 2 }))).toBe('3 copies × 2.000 in');
		expect(dragReadout('circular-pattern', value({ count: 6 }))).toBe('6 copies × 60.0°');
		expect(dragReadout('circular-pattern', value({ count: 2 }))).toBe('2 copies × 180.0°');
	});
	it('scale reads the factor, which is one plus the drag', () => {
		expect(dragReadout('scale', value({ distance: 0.25 }))).toBe('Scale × 1.250');
		expect(dragReadout('scale', value({ distance: -0.5 }))).toBe('Scale × 0.500');
	});
});

describe('the typed override', () => {
	it('is parsed in the unit the tool means and is asked for in words', () => {
		expect(numericUnit('revolve')).toBe('deg'); expect(numericUnit('rotate')).toBe('deg');
		expect(numericUnit('linear-pattern')).toBe('count'); expect(numericUnit('circular-pattern')).toBe('count');
		expect(numericUnit('scale')).toBe('factor');
		for (const tool of EVERY_TOOL.filter((t) => !['revolve', 'rotate', 'linear-pattern', 'circular-pattern', 'scale'].includes(t))) expect(numericUnit(tool), tool).toBe('in');
		expect(numericPrompt('extrude')).toBe('Extrude distance (in)');
		expect(numericPrompt('rotate')).toBe('Rotate angle (deg)');
		expect(numericPrompt('scale')).toBe('Scale factor');
		expect(numericPrompt('select')).toBe('Exact value (in)');
		for (const tool of EVERY_TOOL) expect(numericPrompt(tool).length).toBeGreaterThan(3);
	});
});

describe('drawingReadout', () => {
	it('a rectangle reads width × height in inches, unsigned', () => {
		expect(drawingReadout({ tool: 'rectangle', du: -2, dv: 1.5, segment: 2.5 })).toBe('2.000 × 1.500 in');
	});
	it('a circle reads its diameter', () => {
		expect(drawingReadout({ tool: 'circle', du: 0.3, dv: 0.4, segment: 0.5 })).toBe('⌀ 1.000 in');
	});
	it('a polygon reads its radius and side count, six when the tool does not say', () => {
		expect(drawingReadout({ tool: 'polygon', du: 0.6, dv: 0.8, segment: 1 })).toBe('R 1.000 in · 6 sides');
		expect(drawingReadout({ tool: 'polygon', du: 0.6, dv: 0.8, segment: 1, sides: 8 })).toBe('R 1.000 in · 8 sides');
	});
	it('a line segment reads its length, and its angle once the segment offsets are given', () => {
		expect(drawingReadout({ tool: 'line', du: 5, dv: 5, segment: 2 })).toBe('2.000 in');
		expect(drawingReadout({ tool: 'line', du: 5, dv: 5, segment: 2, su: 1, sv: 1 })).toBe('2.000 in at 45.0°');
		expect(drawingReadout({ tool: 'line', du: 5, dv: 5, segment: 3, su: -3, sv: 0 })).toBe('3.000 in at 180.0°');
		expect(drawingReadout({ tool: 'line', du: 5, dv: 5, segment: 3, su: 0, sv: -3 })).toBe('3.000 in at 270.0°');
		/* A zero-length segment has no angle to name. */
		expect(drawingReadout({ tool: 'line', du: 5, dv: 5, segment: 0, su: 0, sv: 0 })).toBe('0.000 in');
	});
	it('an arc reads its radius: the segment while the start is chosen, the given radius after, and the sweep once known', () => {
		expect(drawingReadout({ tool: 'arc', du: 1, dv: 0, segment: 0.75 })).toBe('R 0.750 in');
		expect(drawingReadout({ tool: 'arc', du: 1, dv: 0, segment: 2, radius: 0.75 })).toBe('R 0.750 in');
		expect(drawingReadout({ tool: 'arc', du: 1, dv: 0, segment: 2, radius: 0.75, sweep: 90 })).toBe('R 0.750 in · 90.0°');
	});
});
