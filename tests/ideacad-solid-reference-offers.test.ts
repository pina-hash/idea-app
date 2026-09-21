// tests/ideacad-solid-reference-offers.test.ts
//
// WHAT THE REFERENCE PANEL OFFERS FROM A SELECTION, asserted without a kernel
// or a mount. `referenceOffers` is the one function that turns the projection,
// the selection and the panel's own inputs into the list of buttons, each
// READY (with the feature it would add and the sentence naming what it makes)
// or NOT (with the reason). The panel renders that list verbatim.
//
// WHY THIS IS AUTOMATED. A construction offered for the wrong selection sends
// a feature the engine refuses, which reads as a kernel fault; one not offered
// for the right selection is a plane a student cannot reach, and nothing on
// screen says so. Both regress silently. EVERY absence is paired with its
// positive control on the same fixture and both counts are reported. The
// expected reference shapes come from `refFromSelection`, the function every
// gesture already uses, never from the module under test.
import { describe, expect, it } from 'vitest';
import { datumSelection, referenceOffers, type ReferenceChoices, type ReferenceOffer } from '../src/lib/ideacad/solid/features/reference';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';
import type { BodyProjection, ModelProjection, Selection, Vec3 } from '../src/lib/ideacad/solid/types';

const face = (id: string, kind: string, normal: Vec3, center: Vec3 = [0, 0, 0], area = 1) => ({ id, kind, center, normal, area, surface: {}, edges: [], positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const edge = (id: string, curve: string, faces: string[], mid: Vec3, length: number) => ({ id, curve, points: new Float32Array(), faces, length, mid });
const vertex = (id: string, point: Vec3, faces: string[]) => ({ id, point, faces });
function body(id: string, name: string, faces: BodyProjection['faces'], edges: BodyProjection['edges'], vertices: BodyProjection['vertices']): BodyProjection {
	return { id, name, materialId: null, role: 'part', createdBy: id.split('#')[0], faces, edges, vertices, mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, bounds: [0, 0, 0, 4, 3, 1], volume: 12, centerOfMass: [2, 1.5, 0.5], inertia: [] };
}
/** A 4x3x1 box with a hole through it: two flat faces, one round one, a straight edge, a curved edge, three corners. */
const BOX = body('x1#0', 'Body 1',
	[face('x1.end', 'plane', [0, 0, 1], [2, 1.5, 1], 12), face('x1.side.0', 'plane', [0, -1, 0], [2, 0, 0.5], 4), face('h1.side', 'cylinder', [0, 0, 0], [2, 1.5, 0.5], 3.14)],
	[edge('edge:x1.end|x1.side.0', 'LINE', ['x1.end', 'x1.side.0'], [2, 0, 1], 4), edge('edge:h1.side|x1.end', 'CIRCLE', ['h1.side', 'x1.end'], [2.5, 1.5, 1], 3.14)],
	[vertex('vertex:a', [0, 0, 1], ['x1.end', 'x1.side.0', 'x1.side.3']), vertex('vertex:b', [4, 0, 1], ['x1.end', 'x1.side.0', 'x1.side.1']), vertex('vertex:c', [4, 3, 1], ['x1.end', 'x1.side.1', 'x1.side.2'])]);
const OTHER = body('y1#0', 'Body 2', [face('y1.end', 'plane', [0, 0, 1], [0, 0, 5], 2)], [], []);
const MODEL: ModelProjection = {
	bodies: [BOX, OTHER], sketches: [], features: [], mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false,
	references: [
		{ feature: 'pl1', name: 'Plane 1', kind: 'plane', origin: [0, 0, 2], normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], size: 3 },
		{ feature: 'ax1', name: 'Axis 1', kind: 'axis', origin: [0, 0, 0], direction: [0, 0, 1], size: 3 },
		{ feature: 'pt1', name: 'Point 1', kind: 'point', origin: [1, 1, 1], size: 3 }
	]
};
const CHOICES: ReferenceChoices = { datum: 'XY', axis: 'Z', offset: 1, angle: 45, coordinates: [0, 0, 0] };
const sel = (kind: Selection['kind'], id: string, bodyId = 'x1#0'): Selection => ({ bodyId, kind, id });
const ref = (id: string): Selection => sel('reference', id, '');
const offers = (selections: Selection[], choices: Partial<ReferenceChoices> = {}) => referenceOffers(MODEL, selections, { ...CHOICES, ...choices });
const ready = (list: ReferenceOffer[]) => list.filter((o) => o.feature).map((o) => o.id);
const by = (list: ReferenceOffer[], id: string) => list.find((o) => o.id === id)!;
const ALL = ['plane-face', 'axis-face', 'axis-edge', 'axis-points', 'point-vertex', 'point-edge', 'point-face', 'point-body', 'plane-offset', 'plane-angle', 'plane-mid', 'plane-points', 'axis-planes', 'point-axis-plane', 'axis-datum', 'point-coordinates'];
const NO_SELECTION_READY = ['plane-offset', 'plane-angle', 'axis-datum', 'point-coordinates'];

describe('the catalogue', () => {
	it('lists sixteen constructions in one fixed order, eight from the selection and eight by construction, each with a word', () => {
		const list = offers([]);
		expect(list.map((o) => o.id)).toEqual(ALL);
		expect(list.filter((o) => o.group === 'selection')).toHaveLength(8);
		expect(list.filter((o) => o.group === 'construction')).toHaveLength(8);
		for (const o of list) { expect(o.title.length).toBeGreaterThan(3); expect(o.sentence.length).toBeGreaterThan(8); expect(['plane', 'axis', 'point']).toContain(o.kind); }
	});
	it('with nothing selected exactly the four that need no selection are ready, and each of the other twelve carries its reason', () => {
		const list = offers([]);
		expect(ready(list)).toEqual(NO_SELECTION_READY);
		const unready = list.filter((o) => !o.feature);
		expect(unready).toHaveLength(12);
		for (const o of unready) expect(o.sentence).toMatch(/^Select /);
		expect(by(list, 'plane-face').sentence).toBe('Select one flat face.');
		expect(by(list, 'plane-offset').sentence).toBe('Plane 1 in from the XY plane.');
		expect(by(list, 'plane-offset').feature).toEqual({ id: '', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 1 } });
		expect(by(list, 'plane-angle').sentence).toBe('Plane at 45° from the XY plane, turned about the Z axis.');
		expect(by(list, 'axis-datum').feature).toEqual({ id: '', name: '', type: 'axis', definition: { kind: 'datum', axis: 'Z' } });
		expect(by(list, 'point-coordinates').feature).toEqual({ id: '', name: '', type: 'point', definition: { kind: 'coordinates', point: [0, 0, 0] } });
		/* The chosen datum and axis are what the sentences name. */
		expect(by(offers([], { datum: 'YZ', axis: 'X' }), 'plane-angle').sentence).toBe('Plane at 45° from the YZ plane, turned about the X axis.');
	});
});
describe('from the geometry', () => {
	it('a flat face gives the plane on it, with the face reference and its hint, and is refused for an axis in words that say why', () => {
		const s = sel('face', 'x1.end'), list = offers([s]);
		expect(ready(list)).toEqual(['plane-face', 'point-face', 'point-body', 'plane-offset', 'plane-angle', 'plane-mid', 'axis-planes', 'point-axis-plane', 'axis-datum', 'point-coordinates']);
		expect(by(list, 'plane-face').sentence).toBe('Plane on the selected flat face of Body 1.');
		expect(by(list, 'plane-face').feature).toEqual({ id: '', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'face', face: refFromSelection(s, BOX) }, offset: 0 } });
		expect(by(list, 'axis-face').feature).toBeNull();
		expect(by(list, 'axis-face').sentence).toMatch(/^The selected face is flat\./);
		/* The face is the base of every construction that takes a plane. */
		expect(by(list, 'plane-offset').feature!.definition).toEqual({ kind: 'offset', from: { kind: 'face', face: refFromSelection(s, BOX) }, offset: 1 });
		expect(by(list, 'plane-mid').sentence).toBe('Plane midway between the selected flat face of Body 1 and the XY plane.');
		expect(by(list, 'point-face').feature!.definition).toEqual({ kind: 'face-center', face: refFromSelection(s, BOX) });
		expect(by(list, 'point-body').feature!.definition).toEqual({ kind: 'body-center', body: 'x1#0' });
		expect(by(list, 'point-body').sentence).toBe('Point at the center of mass of Body 1.');
	});
	it('a round face gives its axis and not a plane, and stands in as the axis of a construction', () => {
		const s = sel('face', 'h1.side'), list = offers([s]);
		expect(by(list, 'axis-face').feature).toEqual({ id: '', name: '', type: 'axis', definition: { kind: 'cylinder', face: refFromSelection(s, BOX) } });
		expect(by(list, 'axis-face').sentence).toBe('Axis through the middle of the selected round face of Body 1.');
		expect(by(list, 'plane-face').feature).toBeNull();
		expect(by(list, 'plane-face').sentence).toBe('The selected face is round. A round face gives an axis; pick a flat face for a plane.');
		expect(by(list, 'point-face').feature).not.toBeNull();
		expect(by(list, 'point-axis-plane').feature!.definition).toEqual({ kind: 'axis-plane', axis: { kind: 'face', face: refFromSelection(s, BOX) }, plane: { kind: 'datum', datum: 'XY' } });
		expect(by(list, 'plane-angle').sentence).toBe('Plane at 45° from the XY plane, turned about the axis of the selected round face of Body 1.');
		expect(ready(list)).toHaveLength(8);
	});
	it('a straight edge gives an axis and a middle; a curved edge gives only the middle, and says it is curved', () => {
		const straight = sel('edge', 'edge:x1.end|x1.side.0'), curved = sel('edge', 'edge:h1.side|x1.end');
		const a = offers([straight]);
		expect(by(a, 'axis-edge').feature).toEqual({ id: '', name: '', type: 'axis', definition: { kind: 'edge', edge: refFromSelection(straight, BOX) } });
		expect(by(a, 'point-edge').feature).toEqual({ id: '', name: '', type: 'point', definition: { kind: 'edge-midpoint', edge: refFromSelection(straight, BOX) } });
		const b = offers([curved]);
		expect(by(b, 'axis-edge').feature).toBeNull();
		expect(by(b, 'axis-edge').sentence).toBe('The selected edge is curved. Pick a straight edge for an axis.');
		expect(by(b, 'point-edge').feature!.definition).toEqual({ kind: 'edge-midpoint', edge: refFromSelection(curved, BOX) });
		/* A straight edge is also the axis of "Point where axis meets plane"; a curved one is not. */
		expect(ready(a)).toEqual(['axis-edge', 'point-edge', 'point-body', 'plane-offset', 'plane-angle', 'point-axis-plane', 'axis-datum', 'point-coordinates']);
		expect(ready(b)).toEqual(['point-edge', 'point-body', 'plane-offset', 'plane-angle', 'axis-datum', 'point-coordinates']);
	});
	it('one corner is a point, two are an axis, three are a plane, and each count refuses the other two in words', () => {
		const a = sel('vertex', 'vertex:a'), b = sel('vertex', 'vertex:b'), c = sel('vertex', 'vertex:c');
		const one = offers([a]);
		expect(by(one, 'point-vertex').feature).toEqual({ id: '', name: '', type: 'point', definition: { kind: 'vertex', vertex: refFromSelection(a, BOX) } });
		expect(by(one, 'axis-points').sentence).toBe('Select two corners or points (1 selected).');
		expect(by(one, 'plane-points').sentence).toBe('Select three corners or points (1 selected).');
		const two = offers([a, b]);
		expect(by(two, 'axis-points').feature).toEqual({ id: '', name: '', type: 'axis', definition: { kind: 'two-points', a: { kind: 'vertex', vertex: refFromSelection(a, BOX) }, b: { kind: 'vertex', vertex: refFromSelection(b, BOX) } } });
		expect(by(two, 'axis-points').sentence).toBe('Axis through the two selected corners.');
		expect(by(two, 'point-vertex').sentence).toBe('Select one corner, not 2.');
		expect(by(two, 'point-vertex').feature).toBeNull();
		const three = offers([a, b, c]);
		expect(by(three, 'plane-points').feature!.definition).toEqual({ kind: 'through-points', points: [a, b, c].map((v) => ({ kind: 'vertex', vertex: refFromSelection(v, BOX) })) });
		expect(by(three, 'axis-points').feature).toBeNull();
		expect(by(three, 'axis-points').sentence).toBe('Select two corners or points (3 selected).');
	});
});
describe('from other references and the datums', () => {
	it('a reference plane and a reference axis are the base and the turn of an angled plane, and meet in a point', () => {
		const list = offers([ref('pl1'), ref('ax1')]);
		expect(by(list, 'plane-angle').feature!.definition).toEqual({ kind: 'angle', from: { kind: 'reference', feature: 'pl1' }, about: { kind: 'reference', feature: 'ax1' }, angle: 45 });
		expect(by(list, 'plane-angle').sentence).toBe('Plane at 45° from Plane 1, turned about Axis 1.');
		expect(by(list, 'point-axis-plane').feature!.definition).toEqual({ kind: 'axis-plane', axis: { kind: 'reference', feature: 'ax1' }, plane: { kind: 'reference', feature: 'pl1' } });
		expect(by(list, 'point-axis-plane').sentence).toBe('Point where Axis 1 meets Plane 1.');
		expect(by(list, 'plane-offset').feature!.definition).toEqual({ kind: 'offset', from: { kind: 'reference', feature: 'pl1' }, offset: 1 });
		expect(by(list, 'plane-offset').sentence).toBe('Plane 1 in from Plane 1.');
		/* A reference point pairs with a corner. */
		const mixed = offers([ref('pt1'), sel('vertex', 'vertex:a')]);
		expect(by(mixed, 'axis-points').feature!.definition).toEqual({ kind: 'two-points', a: { kind: 'vertex', vertex: refFromSelection(sel('vertex', 'vertex:a'), BOX) }, b: { kind: 'reference', feature: 'pt1' } });
		expect(by(mixed, 'axis-points').sentence).toBe('Axis through the two selected corners and points.');
	});
	it('two flat faces are a mid plane and a meeting axis, and refuse the constructions that take one base', () => {
		const list = offers([sel('face', 'x1.end'), sel('face', 'y1.end', 'y1#0')]);
		expect(by(list, 'plane-mid').feature!.definition).toEqual({ kind: 'mid', a: { kind: 'face', face: refFromSelection(sel('face', 'x1.end'), BOX) }, b: { kind: 'face', face: refFromSelection(sel('face', 'y1.end', 'y1#0'), OTHER) } });
		expect(by(list, 'plane-mid').sentence).toBe('Plane midway between the selected flat face of Body 1 and the selected flat face of Body 2.');
		expect(by(list, 'axis-planes').feature!.definition).toMatchObject({ kind: 'plane-plane' });
		expect(by(list, 'plane-offset').feature).toBeNull();
		expect(by(list, 'plane-offset').sentence).toBe('Select one plane or flat face to offset from, not 2.');
		expect(by(list, 'plane-face').sentence).toBe('Select one flat face, not 2.');
		expect(by(list, 'point-body').sentence).toBe('Select one body, not 2.');
		expect(by(list, 'point-face').sentence).toBe('Select one face, not 2.');
	});
	it('a datum plane the viewport drew, selected, is a base like any other', () => {
		const list = offers([datumSelection('XZ')]);
		expect(by(list, 'plane-offset').feature!.definition).toEqual({ kind: 'offset', from: { kind: 'datum', datum: 'XZ' }, offset: 1 });
		expect(by(list, 'plane-offset').sentence).toBe('Plane 1 in from the XZ plane.');
		expect(by(list, 'plane-mid').sentence).toBe('Plane midway between the XZ plane and the XY plane.');
	});
});
describe('numbers', () => {
	it('pass as typed, negative, tiny or huge, and only a non-number is refused, in the executor\'s own sentence', () => {
		expect(by(offers([], { offset: -3.5 }), 'plane-offset').feature!.definition).toMatchObject({ offset: -3.5 });
		expect(by(offers([], { offset: 1e9 }), 'plane-offset').feature!.definition).toMatchObject({ offset: 1e9 });
		expect(by(offers([], { offset: 0.0001 }), 'plane-offset').sentence).toBe('Plane 0.0001 in from the XY plane.');
		expect(by(offers([], { angle: -720 }), 'plane-angle').feature!.definition).toMatchObject({ angle: -720 });
		expect(by(offers([], { coordinates: [-2, 0.001, 1e6] }), 'point-coordinates').feature!.definition).toEqual({ kind: 'coordinates', point: [-2, 0.001, 1e6] });
		const nan = offers([], { offset: NaN });
		expect(by(nan, 'plane-offset').feature).toBeNull();
		expect(by(nan, 'plane-offset').sentence).toBe('Enter a finite offset.');
		expect(by(nan, 'plane-angle').feature).not.toBeNull();
		expect(by(offers([], { angle: Infinity }), 'plane-angle').sentence).toBe('Enter a finite angle.');
		expect(by(offers([], { coordinates: [1, NaN, 3] }), 'point-coordinates').sentence).toBe('Enter x, y, z as three finite numbers.');
		expect(by(offers([], { coordinates: [1, NaN, 3] }), 'point-coordinates').feature).toBeNull();
	});
});
describe('stale selections', () => {
	it('a selection naming a body or a reference no longer on the model changes nothing', () => {
		expect(ready(offers([sel('face', 'gone', 'nobody'), ref('never')]))).toEqual(NO_SELECTION_READY);
		/* Positive control: the same face on a body that IS there moves the list. */
		expect(ready(offers([sel('face', 'x1.end')])).length).toBeGreaterThan(NO_SELECTION_READY.length);
	});
});
