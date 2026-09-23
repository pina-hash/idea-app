// tests/ideacad-solid-tree-references.test.ts
//
// THE TREE'S REFERENCE ROWS AND ROW ICONS, PURE.
//
// WHY THIS IS AUTOMATED. A reference row that selects `datum:XY` under the
// name "Front Plane" renders perfectly and puts a student's sketch on the wrong
// plane; an eye that reads the old on/off switch while the layer draws the
// planes anyway (an empty part) shows "hidden" over planes that are on screen.
// Both are silent. The names are checked against the datum each row selects,
// and against the plane `datumPlane` resolves for it, which is what a sketch
// on that row is drawn on.
import { afterEach, describe, expect, it } from 'vitest';
import { ORIGIN_SELECTION_ID, REFERENCE_ROWS, planesVisible, referenceRowFor, setPlanesVisible } from '../src/lib/ideacad/solid/tree/references';
import { featureIcon, TREE_ICONS } from '../src/lib/ideacad/solid/tree/icons';
import { TOOLS } from '../src/lib/ideacad/solid/tools';
import { TYPE_LABELS } from '../src/lib/ideacad/solid/features';
import { datumPlane } from '../src/lib/ideacad/solid/sketch/model';
import { datumPlanesShown, setDatumPlanesShown } from '../src/lib/ideacad/solid/viewport/reference-layer';
import { datumSelection } from '../src/lib/ideacad/solid/features/reference';
import { EMPTY_MODEL } from '../src/lib/ideacad/solid/viewport';
import type { FeatureType, ModelProjection } from '../src/lib/ideacad/solid/types';
import { fixtureModel } from './ideacad-solid-tree-fixture';

const was = datumPlanesShown();
afterEach(() => setDatumPlanesShown(was));

describe('the reference rows', () => {
	it('are Front, Top, Right and the Origin, in SolidWorks\' order, on a Z-up scene', () => {
		expect(REFERENCE_ROWS.map((r) => [r.name, r.datum ?? null])).toEqual([['Front Plane', 'XZ'], ['Top Plane', 'XY'], ['Right Plane', 'YZ'], ['Origin', null]]);
		/* The plane each name selects faces where that name says: Front looks along Y, Top along Z, Right along X. */
		const normal = (d: 'XY' | 'XZ' | 'YZ') => datumPlane(d).normal.map(Math.abs);
		expect(normal('XZ')).toEqual([0, 1, 0]);
		expect(normal('XY')).toEqual([0, 0, 1]);
		expect(normal('YZ')).toEqual([1, 0, 0]);
	});
	it('each plane selects exactly the datum the viewport draws for it, and the Origin its own id', () => {
		for (const r of REFERENCE_ROWS) if (r.datum) expect(r.selection).toEqual(datumSelection(r.datum));
		expect(REFERENCE_ROWS[3].selection).toEqual({ bodyId: '', kind: 'reference', id: ORIGIN_SELECTION_ID });
		expect(new Set(REFERENCE_ROWS.map((r) => r.selection.id)).size).toBe(4);
		expect(referenceRowFor('datum:YZ')?.name).toBe('Right Plane');
		expect(referenceRowFor('pl1')).toBeNull();
	});
});
describe('the eye', () => {
	const withBody: ModelProjection = fixtureModel();
	const empty: ModelProjection = EMPTY_MODEL;
	it('hides the planes on every part, empty or not, and shows them on every part', () => {
		expect(withBody.bodies.length).toBe(1);
		expect(empty.bodies.length).toBe(0);
		setPlanesVisible(false);
		expect([planesVisible(withBody), planesVisible(empty)]).toEqual([false, false]);
		setPlanesVisible(true);
		expect([planesVisible(withBody), planesVisible(empty)]).toEqual([true, true]);
		setPlanesVisible(false);
		expect([planesVisible(withBody), planesVisible(empty)]).toEqual([false, false]);
	});
});
describe('row icons', () => {
	const types = Object.keys(TYPE_LABELS) as FeatureType[];
	it('every feature type wears a drawing, and a type a palette tool makes wears THAT tool\'s drawing', () => {
		expect(types.length).toBeGreaterThan(20);
		for (const t of types) expect(featureIcon(t).length, t).toBeGreaterThan(4);
		const byTool = Object.fromEntries(TOOLS.map((t) => [t.id, t.icon]));
		for (const t of ['extrude', 'revolve', 'fillet', 'chamfer', 'shell', 'hole', 'mate', 'draft', 'sweep', 'loft'] as const) expect(featureIcon(t), t).toBe(byTool[t]);
		expect(featureIcon('transform')).toBe(byTool.move);
		expect(featureIcon('plane')).toBe(byTool.reference);
		expect(featureIcon('pattern', 'circular')).toBe(byTool['circular-pattern']);
		expect(featureIcon('pattern', 'linear')).toBe(byTool['linear-pattern']);
		expect(featureIcon('sketch')).toBe(TREE_ICONS.sketch);
	});
});
