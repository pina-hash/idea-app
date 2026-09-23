// tests/ideacad-solid-dimensions-model.test.ts
//
// DIMENSIONAL CONTROL'S PURE LAYER: what a typed string becomes, which
// numbers every feature type offers, and that a patch is a real edit of the
// document rather than a picture of one.
//
// WHY THESE ARE AUTOMATED: each regression is silent on screen.
//   * A parser that read "25.4mm" as 25.4 inches would store a wrong number
//     and render a plausible one.
//   * A feature type that lost its dimension would render a panel with one
//     fewer row and nothing to say a row went missing; the census below is
//     the whole union, taken from `TYPE_LABELS`, so a type added without its
//     numbers (or its deliberate lack of them) reddens.
//   * A patch that returned the right number in the wrong key would leave the
//     feature unchanged with the input reading the new value. Every patch is
//     put through the REAL reducer and read back through `featureDimensions`
//     again; the extrude and the sketch go through the REAL kernel and are
//     judged by an analytic volume and area, never a number read off the
//     kernel and typed back in.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE; the panel is mounted in
// `tests/dom/ideacad-dimensions-mount.test.ts` and measured in a real
// Chromium.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { reduce } from '../src/lib/ideacad/solid/commands';
import { TYPE_LABELS } from '../src/lib/ideacad/solid/features';
import { DIMENSIONED, regions, solveSketch } from '../src/lib/ideacad/solid/sketch/model';
import { createKernel } from '../src/lib/ideacad/kernel/remus';
import { emptyManifest, type Feature, type FeatureOf, type FeatureType, type ModelProjection, type SolidManifest } from '../src/lib/ideacad/solid/types';
import { boundsSize, decomposeMatrix, drivenDimensions, editText, featureDimensions, formatDimension, parseDimension, sketchDimensions, unitWord, type DimensionUnit } from '../src/lib/ideacad/solid/dimensions/model';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

/* ------------------------------------------------------------ parsing */
describe('parseDimension', () => {
	const table: [string, DimensionUnit, number][] = [
		['1.5', 'in', 1.5], ['  1.5  ', 'in', 1.5], ['-0.25', 'in', -0.25], ['.5', 'in', 0.5], ['2.', 'in', 2],
		['1 1/2', 'in', 1.5], ['3/8', 'in', 0.375], ['-3/8', 'in', -0.375], ['1  1/2', 'in', 1.5],
		['2in', 'in', 2], ['2 in', 'in', 2], ['2"', 'in', 2], ['2 inches', 'in', 2], ['1/2in', 'in', 0.5],
		['25.4mm', 'in', 1], ['25.4 mm', 'in', 1], ['12.7mm', 'in', 0.5], ['2.54cm', 'in', 1],
		['45', 'deg', 45], ['45deg', 'deg', 45], ['45°', 'deg', 45], ['-90 degrees', 'deg', -90], ['22 1/2 deg', 'deg', 22.5],
		['3', 'count', 3], ['2.5', 'count', 2.5],
		['1.5', 'factor', 1.5], ['x1.5', 'factor', 1.5], ['× 2', 'factor', 2], ['150%', 'factor', 1.5],
		['0', 'in', 0], ['1e3', 'in', 1000], ['1000000', 'in', 1000000]
	];
	it.each(table)('%s as %s is %d', (text, unit, expected) => {
		const parsed = parseDimension(text, unit);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(parsed.value).toBeCloseTo(expected, 12);
	});
	const refusals: [string, DimensionUnit][] = [
		['abc', 'in'], ['', 'in'], ['   ', 'in'], ['Infinity', 'in'], ['-Infinity', 'in'], ['NaN', 'in'], ['1/0', 'in'], ['0x10', 'in'], ['1,5', 'in'], ['1.5.5', 'in'], ['--1', 'in'],
		['45deg', 'in'], ['2in', 'deg'], ['25.4mm', 'deg'], ['2in', 'count'], ['150%', 'in'], ['3mm', 'factor']
	];
	it.each(refusals)('refuses %s as %s with a sentence', (text, unit) => {
		const parsed = parseDimension(text, unit);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) { expect(parsed.reason.length).toBeGreaterThan(10); expect(parsed.reason).not.toMatch(/—/); }
	});
	it('names the mistake when the unit is from the wrong family', () => {
		const angle = parseDimension('45deg', 'in'), length = parseDimension('2in', 'deg');
		expect(angle).toEqual({ ok: false, reason: 'This is a length. Enter inches, like 1.5, 3/8 or 25.4mm.' });
		expect(length).toEqual({ ok: false, reason: 'This is an angle. Enter degrees, like 45 or 45deg.' });
	});
	it('does not clamp: a huge, a zero and a negative number all pass through as typed', () => {
		for (const text of ['1e9', '0', '-500', '-0.0001']) expect(parseDimension(text, 'in')).toEqual({ ok: true, value: Number(text) });
	});
});

describe('formatDimension and editText', () => {
	it('spells each unit once', () => {
		expect(formatDimension(1.5, 'in')).toBe('1.500 in');
		expect(formatDimension(12, 'in2')).toBe('12.000 in²');
		expect(formatDimension(12, 'in3')).toBe('12.000 in³');
		expect(formatDimension(45, 'deg')).toBe('45.0°');
		expect(formatDimension(3, 'count')).toBe('3 copies');
		expect(formatDimension(1, 'count')).toBe('1 copy');
		expect(formatDimension(1.25, 'factor')).toBe('× 1.250');
		expect(formatDimension(NaN, 'in')).toBe('not a number');
		expect(unitWord('in')).toBe('in'); expect(unitWord('deg')).toBe('deg'); expect(unitWord('count')).toBe('copies'); expect(unitWord('factor')).toBe('×');
	});
	it('seeds an input with the stored number, float noise trimmed and nothing a person typed rounded away', () => {
		expect(editText(1.5)).toBe('1.5');
		expect(editText(0.1 + 0.2)).toBe('0.3');
		expect(editText(0.12345)).toBe('0.12345');
		expect(editText(2)).toBe('2');
		expect(editText(NaN)).toBe('');
	});
});

/* -------------------------------------------- every feature type */
const FACE = { body: 'x1#0', name: 'x1.end' };
const EDGE = { body: 'x1#0', faces: ['x1.end', 'x1.side.0'] };
const base = { id: 'f', name: 'F' };
/** One fixture per member of the union, so `Object.keys(TYPE_LABELS)` can be the census. */
const FIXTURES: { [T in FeatureType]: FeatureOf<T> } = {
	body: { ...base, type: 'body', bodyId: 'b', artifact: 'hash' },
	sketch: { ...base, type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [], constraints: [] },
	extrude: { ...base, type: 'extrude', sketch: 's', distance: 1.25, operation: 'new' },
	revolve: { ...base, type: 'revolve', sketch: 's', angle: 270, axis: { kind: 'datum', axis: 'Z' }, operation: 'new' },
	push: { ...base, type: 'push', face: FACE, value: 0.5 },
	'move-selection': { ...base, type: 'move-selection', entity: EDGE, delta: [0.1, 0.2, 0.3] },
	fillet: { ...base, type: 'fillet', edges: [EDGE], radius: 0.25, variable: { end: 0.5 } },
	chamfer: { ...base, type: 'chamfer', edges: [EDGE], distance: 0.1, distance2: 0.2, angle: 30 },
	shell: { ...base, type: 'shell', body: 'x1#0', thickness: 0.08, openFaces: [FACE], faceThickness: [{ face: FACE, thickness: 0.12 }] },
	transform: { ...base, type: 'transform', bodies: ['x1#0'], matrix: [1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 1, 4, 0, 0, 0, 1] },
	mirror: { ...base, type: 'mirror', bodies: ['x1#0'], plane: { kind: 'datum', datum: 'YZ', offset: 1.5 } },
	pattern: { ...base, type: 'pattern', body: 'x1#0', mode: 'linear', axis: { kind: 'datum', axis: 'X' }, spacing: 2, count: 3 },
	boolean: { ...base, type: 'boolean', operation: 'union', bodies: ['a', 'b'] },
	delete: { ...base, type: 'delete', bodies: ['a'] },
	plane: { ...base, type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 0.75 } },
	axis: { ...base, type: 'axis', definition: { kind: 'datum', axis: 'Z' } },
	point: { ...base, type: 'point', definition: { kind: 'coordinates', point: [1, 2, 3] } },
	mate: { ...base, type: 'mate', kind: 'distance', a: { kind: 'face', ...FACE }, b: { kind: 'face', body: 'y', name: 'y.end' }, value: 0.5 },
	hole: { ...base, type: 'hole', face: FACE, center: [1, 1], standard: '#10', fit: 'custom', diameter: 0.2, depth: 0.6 },
	draft: { ...base, type: 'draft', faces: [FACE], angle: 3, pull: { kind: 'datum', axis: 'Z' }, neutral: { kind: 'datum', datum: 'XY' } },
	sweep: { ...base, type: 'sweep', profile: 's', path: 't', operation: 'new' },
	loft: { ...base, type: 'loft', profiles: ['s', 't'], operation: 'new' },
	rib: { ...base, type: 'rib', sketch: 's', thickness: 0.1, target: 'x1#0' }
};
/** What each type offers, as `key:unit` -- the expected value is written by hand, not read off the implementation. */
const EXPECTED: Record<FeatureType, string[]> = {
	body: [], sketch: [], boolean: [], delete: [], axis: [], sweep: [], loft: [],
	extrude: ['distance:in'], revolve: ['angle:deg'], push: ['value:in'], 'move-selection': ['x:in', 'y:in', 'z:in'],
	fillet: ['radius:in', 'end:in'], chamfer: ['distance:in', 'distance2:in', 'angle:deg'], shell: ['thickness:in', 'face.0:in'],
	transform: ['x:in', 'y:in', 'z:in'], mirror: ['offset:in'], pattern: ['count:count', 'spacing:in'], plane: ['offset:in'],
	point: ['x:in', 'y:in', 'z:in'], mate: ['value:in'], hole: ['diameter:in', 'depth:in'], draft: ['angle:deg'], rib: ['thickness:in']
};
describe('featureDimensions over every feature type', () => {
	const census = Object.keys(TYPE_LABELS) as FeatureType[];
	it('has a fixture and an expectation for every member of the union', () => {
		expect(census.length).toBeGreaterThanOrEqual(23);
		expect(Object.keys(FIXTURES).sort()).toEqual([...census].sort());
		expect(Object.keys(EXPECTED).sort()).toEqual([...census].sort());
	});
	it.each(census)('%s offers exactly its numbers, every one driving', (type) => {
		const dims = featureDimensions(FIXTURES[type]);
		expect(dims.map((d) => `${d.key}:${d.unit}`)).toEqual(EXPECTED[type]);
		for (const d of dims) { expect(d.driving).toBe(true); expect(d.label.length).toBeGreaterThan(0); expect(Number.isFinite(d.value)).toBe(true); }
	});
	it('a type with no numeric parameter returns [] (7 of them), the rest at least one (16)', () => {
		const empty = census.filter((t) => featureDimensions(FIXTURES[t]).length === 0), full = census.filter((t) => featureDimensions(FIXTURES[t]).length > 0);
		expect(empty.sort()).toEqual(['axis', 'body', 'boolean', 'delete', 'loft', 'sketch', 'sweep']);
		expect(full).toHaveLength(census.length - 7);
	});
	it('reads the stored value, not a default: the fixture numbers come back exactly', () => {
		expect(featureDimensions(FIXTURES.extrude)[0].value).toBe(1.25);
		expect(featureDimensions(FIXTURES.pattern).map((d) => d.value)).toEqual([3, 2]);
		expect(featureDimensions(FIXTURES.chamfer).map((d) => d.value)).toEqual([0.1, 0.2, 30]);
		expect(featureDimensions(FIXTURES.shell).map((d) => d.value)).toEqual([0.08, 0.12]);
		expect(featureDimensions(FIXTURES.transform).map((d) => d.value)).toEqual([2, 3, 4]);
	});
	it('a circular pattern spells its spacing in degrees and a linear one in inches', () => {
		expect(featureDimensions({ ...FIXTURES.pattern, mode: 'circular' }).map((d) => `${d.label}:${d.unit}`)).toEqual(['Copies:count', 'Angle between:deg']);
		expect(featureDimensions(FIXTURES.pattern).map((d) => `${d.label}:${d.unit}`)).toEqual(['Copies:count', 'Spacing:in']);
	});
	it('optional numbers appear only when the feature carries them', () => {
		expect(featureDimensions({ ...FIXTURES.fillet, variable: undefined }).map((d) => d.key)).toEqual(['radius']);
		expect(featureDimensions({ ...FIXTURES.chamfer, distance2: undefined, angle: undefined }).map((d) => d.key)).toEqual(['distance']);
		expect(featureDimensions({ ...FIXTURES.hole, fit: 'close', diameter: undefined, depth: 'through' }).map((d) => d.key)).toEqual([]);
		expect(featureDimensions({ ...FIXTURES.mate, kind: 'coincident' })).toEqual([]);
		expect(featureDimensions({ ...FIXTURES.mirror, plane: { kind: 'face', face: FACE } })).toEqual([]);
		expect(featureDimensions({ ...FIXTURES.plane, definition: { kind: 'mid', a: { kind: 'datum', datum: 'XY' }, b: { kind: 'datum', datum: 'XZ' } } })).toEqual([]);
	});
});

/* --------------------------------------------- patch round trips */
function manifestWith(f: Feature): SolidManifest { return { ...emptyManifest(), features: [f] }; }
describe('a patch is a real edit: reducer, then read back', () => {
	const census = Object.keys(TYPE_LABELS) as FeatureType[];
	it.each(census.filter((t) => EXPECTED[t].length))('%s: every dimension patched to a new value reads back as that value and moves nothing else', (type) => {
		const before = FIXTURES[type];
		featureDimensions(before).forEach((d, i) => {
			const target = d.unit === 'count' ? 7 : d.unit === 'deg' ? 12.5 : 9.75;
			const next = reduce(manifestWith(before), { type: 'set-feature', id: before.id, patch: d.patch(target) }).features[0];
			const after = featureDimensions(next);
			expect(after).toHaveLength(featureDimensions(before).length);
			expect(after[i].value).toBeCloseTo(target, 9);
			after.forEach((o, j) => { if (j !== i) expect(o.value).toBeCloseTo(featureDimensions(before)[j].value, 9); });
			expect(next.type).toBe(before.type); expect(next.id).toBe(before.id);
		});
	});
	it('a shell face thickness patch rewrites that entry and keeps the face it names', () => {
		const next = reduce(manifestWith(FIXTURES.shell), { type: 'set-feature', id: 'f', patch: featureDimensions(FIXTURES.shell)[1].patch(0.3) }).features[0] as FeatureOf<'shell'>;
		expect(next.faceThickness).toEqual([{ face: FACE, thickness: 0.3 }]); expect(next.thickness).toBe(0.08);
	});
});

/* ------------------------------------------------------ transforms */
/** The exact shape `SolidWorkspace.commandFor` writes: three's matrix about a centre, transposed to row-major. */
function workspaceMatrix(build: (m: THREE.Matrix4) => void, center: [number, number, number], aboutCenter = true): number[] {
	const matrix = new THREE.Matrix4(); build(matrix);
	if (aboutCenter) { const c = new THREE.Vector3(...center); matrix.premultiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)); }
	return matrix.clone().transpose().toArray();
}
const applyRow = (m: number[], p: [number, number, number]): [number, number, number] => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
describe('transform dimensions recover what the tool wrote', () => {
	const center: [number, number, number] = [2, 1.5, 0.5];
	it('a move offers X, Y, Z and the patch writes a pure translation', () => {
		const f: FeatureOf<'transform'> = { ...base, type: 'transform', bodies: ['b'], matrix: workspaceMatrix((m) => m.makeTranslation(1, 0, 0), center, false) };
		const dims = featureDimensions(f);
		expect(dims.map((d) => [d.label, d.value])).toEqual([['Move X', 1], ['Move Y', 0], ['Move Z', 0]]);
		const next = dims[1].patch(2.5).matrix as number[];
		expect(applyRow(next, [0, 0, 0])).toEqual([1, 2.5, 0]);
		expect(decomposeMatrix(next).angle).toBeCloseTo(0, 9); expect(decomposeMatrix(next).scale).toBeCloseTo(1, 9);
	});
	it('a rotation offers its angle, and a retyped angle turns about the same centre', () => {
		const f: FeatureOf<'transform'> = { ...base, type: 'transform', bodies: ['b'], matrix: workspaceMatrix((m) => m.makeRotationAxis(new THREE.Vector3(0, 0, 1), 30 * Math.PI / 180), center) };
		const dims = featureDimensions(f);
		expect(dims.map((d) => [d.label, d.unit])).toEqual([['Angle', 'deg']]);
		expect(dims[0].value).toBeCloseTo(30, 6);
		const next = dims[0].patch(45).matrix as number[];
		/* The centre is a fixed point of the new matrix, and the new angle reads back. */
		expect(applyRow(next, center).map((n) => Number(n.toFixed(9)))).toEqual(center);
		expect(decomposeMatrix(next).angle).toBeCloseTo(45, 6);
		expect(decomposeMatrix(next).axis.map((n) => Number(n.toFixed(9)))).toEqual([0, 0, 1]);
		/* Compared against three.js building the same 45° turn about the same centre: byte-for-byte the same shape. */
		const expected = workspaceMatrix((m) => m.makeRotationAxis(new THREE.Vector3(0, 0, 1), 45 * Math.PI / 180), center);
		next.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 9));
	});
	it('a rotation about a tilted axis keeps its axis through a retype', () => {
		const axis = new THREE.Vector3(1, 1, 0).normalize();
		const f: FeatureOf<'transform'> = { ...base, type: 'transform', bodies: ['b'], matrix: workspaceMatrix((m) => m.makeRotationAxis(axis, 60 * Math.PI / 180), center) };
		const next = featureDimensions(f)[0].patch(20).matrix as number[];
		const expected = workspaceMatrix((m) => m.makeRotationAxis(axis, 20 * Math.PI / 180), center);
		next.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 9));
	});
	it('a uniform scale offers its factor, and a retyped factor scales about the same centre', () => {
		const f: FeatureOf<'transform'> = { ...base, type: 'transform', bodies: ['b'], matrix: workspaceMatrix((m) => m.makeScale(1.5, 1.5, 1.5), center) };
		const dims = featureDimensions(f);
		expect(dims.map((d) => [d.label, d.unit])).toEqual([['Scale', 'factor']]);
		expect(dims[0].value).toBeCloseTo(1.5, 9);
		const next = dims[0].patch(2).matrix as number[];
		const expected = workspaceMatrix((m) => m.makeScale(2, 2, 2), center);
		next.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 9));
		expect(applyRow(next, center).map((n) => Number(n.toFixed(9)))).toEqual(center);
	});
});

/* --------------------------------------------------------- sketches */
const rect = (w: number, h: number): FeatureOf<'sketch'> => ({ id: 's1', name: 'Sketch 1', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [
	{ id: 'p0', type: 'point', x: 0, y: 0, fixed: true }, { id: 'p1', type: 'point', x: w, y: 0 }, { id: 'p2', type: 'point', x: w, y: h }, { id: 'p3', type: 'point', x: 0, y: h },
	{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
], constraints: [
	{ id: 'k0', type: 'horizontal', line: 'l0' }, { id: 'k1', type: 'vertical', line: 'l1' }, { id: 'k2', type: 'horizontal', line: 'l2' }, { id: 'k3', type: 'vertical', line: 'l3' },
	{ id: 'kw', type: 'distance', a: 'p0', b: 'p1', value: w }, { id: 'kh', type: 'distance', a: 'p1', b: 'p2', value: h }
] });
describe('sketchDimensions', () => {
	it('lists only the DIMENSIONED constraints, numbered per word, with the entities as the detail', () => {
		const dims = sketchDimensions({ feature: 's1', constraints: rect(4, 3).constraints });
		expect(dims.map((d) => [d.key, d.label, d.detail, d.value, d.unit])).toEqual([['kw', 'Distance 1', 'p0 to p1', 4, 'in'], ['kh', 'Distance 2', 'p1 to p2', 3, 'in']]);
		expect(dims.every((d) => d.driving)).toBe(true);
		/* The whole DIMENSIONED census gets a row, and nothing outside it does. */
		const all: FeatureOf<'sketch'>['constraints'] = [
			{ id: 'a', type: 'distance', a: 'p', b: 'q', value: 1 }, { id: 'b', type: 'pointLineDistance', point: 'p', line: 'l', value: 2 }, { id: 'c', type: 'angle', l1: 'l', l2: 'm', value: 30 },
			{ id: 'd', type: 'circleRadius', circle: 'c1', value: 0.5 }, { id: 'e', type: 'arcRadius', arc: 'a1', value: 0.25 }, { id: 'f', type: 'fixX', point: 'p', value: 1 }, { id: 'g', type: 'fixY', point: 'p', value: 2 },
			{ id: 'h', type: 'parallel', l1: 'l', l2: 'm' }, { id: 'i', type: 'coincident', a: 'p', b: 'q' }
		];
		const rows = sketchDimensions({ feature: 's', constraints: all });
		expect(rows).toHaveLength(DIMENSIONED.length);
		expect(rows.map((d) => `${d.label}:${d.unit}`)).toEqual(['Distance 1:in', 'Distance 2:in', 'Angle 1:deg', 'Radius 1:in', 'Radius 2:in', 'X 1:in', 'Y 1:in']);
	});
	it('a patch rewrites the constraints array with one value moved and every other constraint intact', () => {
		const sketch = rect(4, 3), dims = sketchDimensions({ feature: 's1', constraints: sketch.constraints });
		const next = reduce(manifestWith(sketch), { type: 'set-feature', id: 's1', patch: dims[1].patch(5) }).features[0] as FeatureOf<'sketch'>;
		expect(next.constraints).toHaveLength(6);
		expect(next.constraints.find((c) => c.id === 'kh')).toEqual({ id: 'kh', type: 'distance', a: 'p1', b: 'p2', value: 5 });
		expect(next.constraints.filter((c) => c.id !== 'kh')).toEqual(sketch.constraints.filter((c) => c.id !== 'kh'));
		expect(next.entities).toEqual(sketch.entities);
	});
	it('through the real solver, the retyped distance is the distance the region has: 4×3 becomes 4×5', async () => {
		const k = await createKernel(WASM);
		try {
			const sketch = rect(4, 3), dims = sketchDimensions({ feature: 's1', constraints: sketch.constraints });
			const before = solveSketch(k, { entities: sketch.entities, constraints: sketch.constraints });
			expect(before.report.classification).not.toBe('unsatisfied');
			expect(regions(before.entities)[0].area).toBeCloseTo(12, 6);
			const patched = { ...sketch, ...dims[1].patch(5) } as FeatureOf<'sketch'>;
			const after = solveSketch(k, { entities: patched.entities, constraints: patched.constraints });
			expect(after.report.converged).toBe(true);
			expect(regions(after.entities)[0].area).toBeCloseTo(20, 4);
			/* An unsatisfiable retype comes back from the solver as 'unsatisfied', which is the panel's signal; nothing here refused it first. */
			const impossible = { ...sketch, constraints: [...sketch.constraints, { id: 'kx', type: 'distance' as const, a: 'p0', b: 'p2', value: 100 }] };
			const conflict = solveSketch(k, { entities: impossible.entities, constraints: impossible.constraints });
			expect(['unsatisfied', 'redundant']).toContain(conflict.report.classification);
			expect(conflict.report.converged).toBe(false);
		} finally { k.free(); }
	});
});

/* ------------------------------------------- the real kernel */
describe('through the real engine', () => {
	const box = async (e: SolidEngine): Promise<ModelProjection> => {
		await e.apply({ type: 'add-feature', feature: rect(4, 3) });
		return e.apply({ type: 'add-feature', feature: { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' } });
	};
	it('the extrude distance patched to 2 doubles the volume, and a refused value is refused in the kernel\'s words with the model unchanged', async () => {
		const e = await engine(); const m0 = await box(e);
		expect(m0.bodies[0].volume).toBeCloseTo(12, 9);
		const extrude = (await e.snapshot()).manifest.features.find((f) => f.id === 'x1')!;
		const [distance] = featureDimensions(extrude);
		expect(distance.value).toBe(1);
		const m1 = await e.apply({ type: 'set-feature', id: 'x1', patch: distance.patch(2) });
		expect(m1.bodies[0].volume).toBeCloseTo(24, 9);
		expect(featureDimensions((await e.snapshot()).manifest.features.find((f) => f.id === 'x1')!)[0].value).toBe(2);
		/* Zero is typed through unclamped, and it is the KERNEL's own sentence that refuses it: the engine throws the
		   feature's message for a command about its own feature and puts the manifest back, so the box is still 24 in³. */
		await expect(e.apply({ type: 'set-feature', id: 'x1', patch: distance.patch(0) })).rejects.toThrow('Pull the sketch to give it depth.');
		expect((await e.snapshot()).manifest.features.find((f) => f.id === 'x1')).toMatchObject({ distance: 2 });
		expect((await e.apply({ type: 'rename-feature', id: 'x1', name: 'Extrude 1' })).bodies[0].volume).toBeCloseTo(24, 9);
	});
	it('drivenDimensions reads a 4×3×1 box as 4, 3, 1 and 12 in³, an edge as its length, a face as its area', async () => {
		const e = await engine(); const m = await box(e);
		const body = m.bodies[0];
		expect(boundsSize(body.bounds).map((n) => Number(n.toFixed(9)))).toEqual([4, 3, 1]);
		const size = drivenDimensions({ bodyId: body.id, kind: 'body', id: body.id }, m);
		expect(size.map((d) => [d.label, Number(d.value.toFixed(9)), d.unit, d.driving])).toEqual([['Size X', 4, 'in', false], ['Size Y', 3, 'in', false], ['Size Z', 1, 'in', false], ['Volume', 12, 'in3', false]]);
		const end = body.faces.find((f) => f.id === 'x1.end')!;
		expect(drivenDimensions({ bodyId: body.id, kind: 'face', id: end.id }, m).map((d) => [d.label, Number(d.value.toFixed(9)), d.unit])).toEqual([['Area', 12, 'in2']]);
		const edge = body.edges.find((ed) => ed.faces.includes('x1.end') && ed.faces.includes('x1.side.0'))!;
		expect(drivenDimensions({ bodyId: body.id, kind: 'edge', id: edge.id }, m).map((d) => [d.label, Number(d.value.toFixed(9)), d.unit])).toEqual([['Length', 4, 'in']]);
		const vertex = body.vertices[0];
		expect(drivenDimensions({ bodyId: body.id, kind: 'vertex', id: vertex.id }, m).map((d) => d.label)).toEqual(['At X', 'At Y', 'At Z']);
		/* Nothing measured for a feature selection, for a missing body, or for no selection at all. */
		expect(drivenDimensions({ bodyId: '', kind: 'feature', id: 'x1' }, m)).toEqual([]);
		expect(drivenDimensions({ bodyId: 'nope', kind: 'body', id: 'nope' }, m)).toEqual([]);
		expect(drivenDimensions(null, m)).toEqual([]);
		/* A sketch measures its enclosed area from the projection's regions. */
		expect(drivenDimensions({ bodyId: '', kind: 'sketch', id: 's1' }, m).map((d) => [d.label, Number(d.value.toFixed(6)), d.unit])).toEqual([['Enclosed area', 12, 'in2']]);
		/* A straight edge has no diameter (the positive control is the cylinder below). */
		expect(drivenDimensions({ bodyId: body.id, kind: 'edge', id: edge.id }, m).some((d) => d.key === 'diameter')).toBe(false);
	});
	it('a round edge off the real kernel also reads as its diameter: a 0.75 in radius disk\'s rim is 1.5 across and 2 pi 0.75 around', async () => {
		const e = await engine();
		await e.apply({ type: 'add-feature', feature: { id: 'c1', name: 'Disk', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [{ id: 'o', type: 'point', x: 1, y: 2 }, { id: 'k', type: 'circle', center: 'o', radius: 0.75 }], constraints: [] } });
		const m = await e.apply({ type: 'add-feature', feature: { id: 'x2', name: 'Extrude', type: 'extrude', sketch: 'c1', distance: 0.5, operation: 'new' } });
		const body = m.bodies[0], rim = body.edges.find((ed) => ed.curve === 'CIRCLE');
		expect(rim).toBeDefined();
		const read = drivenDimensions({ bodyId: body.id, kind: 'edge', id: rim!.id }, m);
		expect(read.map((d) => d.key)).toEqual(['length', 'diameter']);
		expect(read[0].value).toBeCloseTo(2 * Math.PI * 0.75, 3);
		expect(read[1].value).toBeCloseTo(1.5, 3);
		expect(read.every((d) => d.driving === false)).toBe(true);
	});
});
