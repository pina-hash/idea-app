// tests/ideacad-solid-tree-params.test.ts
//
// THE PARAMETER FORM AS DATA: which fields a feature type offers, that a
// reference reads as words with its standing on the model, and that the patch
// a field edit produces carries the exact key and the exact typed value.
//
// NOTHING IS CLAMPED, AND THAT IS ASSERTED WITH VALUES A CLAMP WOULD CATCH:
// a negative distance and a million inches both come through untouched. The
// kernel is the only judge of a number and its verdict lands on the row.
import { describe, expect, it } from 'vitest';
import { fieldsFor, patchFor, REF_STATUS_WORDS, isVertexRef, type Field } from '../src/lib/ideacad/solid/tree/params';
import { TYPE_LABELS } from '../src/lib/ideacad/solid/features';
import { FEATURES, fixtureManifest, fixtureModel, fixtureRows } from './ideacad-solid-tree-fixture';
import type { Feature, FeatureType } from '../src/lib/ideacad/solid/types';

const manifest = fixtureManifest(), model = fixtureModel(), rows = fixtureRows();
const ctx = (id: string) => ({ manifest, model, row: rows.find((r) => r.id === id) });
const feature = <T extends Feature>(id: string) => FEATURES.find((f) => f.id === id) as T;
const field = (fields: Field[], id: string) => fields.find((f) => f.id === id)!;

describe('fields per type', () => {
	it('an extrude offers its distance, direction, operation and the sketch it consumed', () => {
		const fields = fieldsFor(feature('x1'), ctx('x1'));
		expect(field(fields, 'distance')).toMatchObject({ kind: 'number', value: 1, unit: 'in' });
		expect(field(fields, 'operation')).toMatchObject({ kind: 'enum', value: 'new' });
		expect((field(fields, 'operation') as Extract<Field, { kind: 'enum' }>).options.map((o) => o.value)).toEqual(['new', 'add', 'cut']);
		expect(field(fields, 'direction')).toMatchObject({ kind: 'enum', value: 'normal' });
		expect(field(fields, 'sketch')).toMatchObject({ kind: 'ref', ref: { words: 'sketch Sketch 1', status: 'found' } });
	});
	it('a reference the model no longer holds reads "not on the model", one it does reads "found", and a reattached one says so', () => {
		const fillet = field(fieldsFor(feature('f1'), ctx('f1')), 'edges') as Extract<Field, { kind: 'refs' }>;
		expect(fillet.refs).toHaveLength(1);
		expect(fillet.refs[0].status).toBe('missing');
		expect(fillet.refs[0].words).toContain('Body 1');
		const chamfer = field(fieldsFor(feature('c1'), ctx('c1')), 'edges') as Extract<Field, { kind: 'refs' }>;
		expect(chamfer.refs[0].status).toBe('found');
		const push = field(fieldsFor(feature('p1'), ctx('p1')), 'face') as Extract<Field, { kind: 'ref' }>;
		expect(push.ref.status).toBe('reattached');
		expect(push.ref.words).toBe('face x1.side.0 on Body 1');
		/* The same push with no warning on its row reads found: the reattached word comes from the row, not the reference. */
		expect((field(fieldsFor(feature('p1'), { manifest, model }), 'face') as Extract<Field, { kind: 'ref' }>).ref.status).toBe('found');
		expect(Object.values(REF_STATUS_WORDS).every((w) => w.length > 3)).toBe(true);
	});
	it('a plane offers its offset as a number inside its definition', () => {
		const fields = fieldsFor(feature('pl1'), ctx('pl1'));
		expect(field(fields, 'definition.offset')).toMatchObject({ kind: 'number', value: 2 });
		expect(field(fields, 'definition.from')).toMatchObject({ kind: 'ref', ref: { words: 'XY plane', status: 'found' } });
	});
	it('optional numbers are offered empty, booleans as checkboxes', () => {
		const fields = fieldsFor(feature('c1'), ctx('c1'));
		expect(field(fields, 'distance2')).toMatchObject({ kind: 'number', value: undefined, optional: true });
		expect(field(fields, 'propagate')).toMatchObject({ kind: 'boolean', value: false });
	});
	it('every feature type has a form with at least one field, and no type throws', () => {
		const ref = { body: 'x1#0', name: 'x1.end' }, edge = { body: 'x1#0', faces: ['x1.end', 'x1.side.0'] }, vertex = { body: 'x1#0', faces: ['a', 'b', 'c'] };
		const samples: Record<FeatureType, Feature> = {
			body: { id: 'b', name: 'B', type: 'body', bodyId: 'x1#0', artifact: 'f'.repeat(64), source: 'legacy' },
			sketch: feature('s1'), extrude: feature('x1'), fillet: feature('f1'), push: feature('p1'), chamfer: feature('c1'), plane: feature('pl1'),
			revolve: { id: 'r', name: 'R', type: 'revolve', sketch: 's1', angle: 90, axis: { kind: 'datum', axis: 'Z' }, operation: 'new' },
			'move-selection': { id: 'm', name: 'M', type: 'move-selection', entity: edge, delta: [1, 0, 0] },
			shell: { id: 'sh', name: 'S', type: 'shell', body: 'x1#0', thickness: 0.1, openFaces: [ref], faceThickness: [{ face: ref, thickness: 0.2 }] },
			transform: { id: 't', name: 'T', type: 'transform', bodies: ['x1#0'], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
			mirror: { id: 'mi', name: 'Mi', type: 'mirror', bodies: ['x1#0'], plane: { kind: 'datum', datum: 'YZ' } },
			pattern: { id: 'pa', name: 'P', type: 'pattern', body: 'x1#0', mode: 'circular', axis: { kind: 'line', origin: [0, 0, 0], direction: [0, 0, 1] }, spacing: 90, count: 4 },
			boolean: { id: 'bo', name: 'Bo', type: 'boolean', operation: 'union', bodies: ['x1#0', 'x1#1'] },
			delete: { id: 'd', name: 'D', type: 'delete', bodies: ['x1#0'] },
			axis: { id: 'ax', name: 'A', type: 'axis', definition: { kind: 'point-direction', point: { kind: 'origin' }, direction: { kind: 'datum', axis: 'Z' } } },
			point: { id: 'pt', name: 'Pt', type: 'point', definition: { kind: 'coordinates', point: [1, 2, 3] } },
			mate: { id: 'ma', name: 'Ma', type: 'mate', kind: 'distance', a: { kind: 'face', ...ref }, b: { kind: 'vertex', ...vertex }, value: 0.5 },
			hole: { id: 'h', name: 'H', type: 'hole', face: ref, center: [1, 1], standard: '#10-24', fit: 'tapped', depth: 'through' },
			draft: { id: 'dr', name: 'Dr', type: 'draft', faces: [ref], angle: 3, pull: { kind: 'datum', axis: 'Z' }, neutral: { kind: 'datum', datum: 'XY' } },
			sweep: { id: 'sw', name: 'Sw', type: 'sweep', profile: 's1', path: [edge], operation: 'new' },
			loft: { id: 'lo', name: 'Lo', type: 'loft', profiles: ['s1', 's2'], operation: 'new', smooth: true },
			rib: { id: 'ri', name: 'Ri', type: 'rib', sketch: 's1', thickness: 0.125, target: 'x1#0' }
		};
		const types = Object.keys(TYPE_LABELS) as FeatureType[];
		expect(types.length).toBe(23);
		for (const type of types) {
			const fields = fieldsFor(samples[type], { manifest, model });
			expect(fields.length, type).toBeGreaterThan(0);
			expect(new Set(fields.map((f) => f.id)).size, `${type} field ids are unique`).toBe(fields.length);
		}
		/* A corner is told from an edge by how many faces meet there, or by its hint. */
		expect(isVertexRef(edge)).toBe(false); expect(isVertexRef(vertex)).toBe(true); expect(isVertexRef({ ...edge, hint: { point: [0, 0, 0] } })).toBe(true);
		expect(field(fieldsFor(samples['move-selection'], { manifest, model }), 'entity').label).toBe('Edge');
		expect(field(fieldsFor(samples.hole, { manifest, model }), 'depth.through')).toMatchObject({ kind: 'boolean', value: true });
		expect(fieldsFor(samples.hole, { manifest, model }).some((f) => f.id === 'depth')).toBe(false);
	});
});
describe('the patch a field edit produces', () => {
	it('carries the exact key and the exact typed value, with nothing clamped', () => {
		expect(patchFor(feature('x1'), 'distance', -3.5)).toEqual({ distance: -3.5 });
		expect(patchFor(feature('x1'), 'distance', 1e6)).toEqual({ distance: 1000000 });
		expect(patchFor(feature('x1'), 'operation', 'cut')).toEqual({ operation: 'cut' });
		expect(patchFor(feature('f1'), 'propagate', true)).toEqual({ propagate: true });
		expect(patchFor(feature('c1'), 'distance2', undefined)).toEqual({ distance2: undefined });
	});
	it('writes inside a nested definition by returning the whole object, leaving the feature untouched', () => {
		const plane = feature<Extract<Feature, { type: 'plane' }>>('pl1');
		expect(patchFor(plane, 'definition.offset', 5)).toEqual({ definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 5 } });
		expect((plane.definition as { offset: number }).offset).toBe(2);
	});
	it('a variable fillet appears with its end radius and disappears when it is cleared', () => {
		const fillet = feature<Extract<Feature, { type: 'fillet' }>>('f1');
		expect(patchFor(fillet, 'variable.end', 0.5)).toEqual({ variable: { end: 0.5 } });
		const variable = { ...fillet, variable: { end: 0.5, law: 'scurve' as const } };
		expect(patchFor(variable, 'variable.law', 'linear')).toEqual({ variable: { end: 0.5, law: 'linear' } });
		expect(patchFor(variable, 'variable.end', undefined)).toEqual({ variable: undefined });
	});
	it('a hole is through or has a depth, never both', () => {
		const hole: Feature = { id: 'h', name: 'H', type: 'hole', face: { body: 'x1#0', name: 'x1.end' }, center: [1, 1], standard: '#10-24', fit: 'tapped', depth: 0.75 };
		expect(patchFor(hole, 'depth.through', true)).toEqual({ depth: 'through' });
		expect(patchFor({ ...hole, depth: 'through' }, 'depth.through', false)).toEqual({ depth: 1 });
		expect(patchFor(hole, 'depth', 2)).toEqual({ depth: 2 });
	});
	it('refuses a field the feature does not have', () => {
		expect(() => patchFor(feature('x1'), 'radius', 1)).toThrow(/no radius/);
		expect(() => patchFor(feature('x1'), 'depth.through', true)).toThrow(/hole/);
	});
});
