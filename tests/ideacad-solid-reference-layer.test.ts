// tests/ideacad-solid-reference-layer.test.ts
//
// HOW REFERENCE GEOMETRY IS DRAWN, asserted on the objects the layer returns
// and not on pixels: every object carries the selection the viewport's pick
// pipeline reads and the base colour its highlight restores; a plane's label
// carries the plane so a drawing press on the name draws on it; the three
// datum planes (Front, Top, Right) are drawn while the document has no body
// or while the setting says always, answer a press with the datum's own
// selection and never with a plane that could pass for a reference feature,
// the Origin marker is drawn with them and never picked, and the setting
// tells its listeners exactly when it moves.
//
// WHY THIS IS AUTOMATED. An object without `userData.selection` throws inside
// `SolidViewport.highlight()` on the next click, which reads as a dead viewport
// with no sentence anywhere; a datum square that carried `plane` would let a
// drawing press name a reference feature that does not exist, silently, and
// the viewport decides which datum PART each tool may press (`part`). Every
// absence is paired with a positive control on the same fixture. What a label
// LOOKS like, and which press wins against a face, belong to a browser.
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { DATUM_COLOUR, DATUM_NAMES, REFERENCE_COLOUR, canvasLabel, datumPlaneMode, datumPlaneObjects, datumPlanesShown, datumPlanesVisible, datumSize, onDatumPlanesChange, originMarkerObjects, referenceObjects, setDatumPlaneMode, setDatumPlanesShown, type LabelTexture } from '../src/lib/ideacad/solid/viewport/reference-layer';
import { DATUM_SELECTION_PREFIX } from '../src/lib/ideacad/solid/features/reference';
import type { ModelProjection, ReferenceProjection } from '../src/lib/ideacad/solid/types';

/** A label made without a canvas: node has no `document`, so a test hands in its own texture and a width-to-height ratio. */
const stubLabel: LabelTexture = (text) => ({ texture: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), aspect: text.length * 0.6 });
const PLANE: ReferenceProjection = { feature: 'pl1', name: 'Plane 1', kind: 'plane', origin: [0, 0, 0], normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], size: 3 };
const AXIS: ReferenceProjection = { feature: 'ax1', name: 'Axis 1', kind: 'axis', origin: [1, 1, 0], direction: [0, 0, 1], size: 2 };
const POINT: ReferenceProjection = { feature: 'pt1', name: 'Point 1', kind: 'point', origin: [2, 3, 4], size: 2 };
const model = (bounds: number[][]): ModelProjection => ({ bodies: bounds.map((b, i) => ({ id: `b${i}`, name: `Body ${i + 1}`, materialId: null, role: 'part', createdBy: `f${i}`, faces: [], edges: [], vertices: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, bounds: b, volume: 1, centerOfMass: [0, 0, 0], inertia: [] })), sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false });
const sprites = (objects: THREE.Object3D[]) => objects.filter((o) => (o as THREE.Sprite).isSprite) as THREE.Sprite[];
/** A ray straight down the z axis at (x, y): what a press at that screen point asks every pick object. (1, -1) is inside one triangle of a square at the origin and off its shared diagonal, which both triangles would answer. */
const hits = (object: THREE.Object3D, x = 1, y = -1) => { const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1)); const out: THREE.Intersection[] = []; object.raycast(ray, out); return out.length; };
afterEach(() => setDatumPlaneMode('auto'));

describe('a reference draws with its name beside it', () => {
	it('a plane is a fill, an outline and a label; all three carry the selection, the base colour and the plane, and the label hangs off the far corner', () => {
		const objects = referenceObjects(PLANE, { label: stubLabel });
		expect(objects).toHaveLength(3);
		for (const o of objects) {
			expect(o.userData.selection).toEqual({ bodyId: '', kind: 'reference', id: 'pl1' });
			expect(o.userData.base).toBe(REFERENCE_COLOUR);
			expect(o.userData.plane).toEqual({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] });
		}
		const [label] = sprites(objects);
		expect(label.userData.label).toBe('Plane 1');
		expect(label.position.toArray()).toEqual([3, 3, 0]);
		expect(label.center.toArray()).toEqual([0, 0.5]);
		expect(label.scale.y).toBeCloseTo(3 * 0.14, 9);
		expect(label.scale.x).toBeCloseTo(3 * 0.14 * 'Plane 1'.length * 0.6, 9);
		expect((label.material as THREE.SpriteMaterial).color.getHexString()).toBe(REFERENCE_COLOUR.slice(1));
		/* The fill answers a press at its middle, which is what makes a plane something a student can draw on. */
		expect(hits(objects[0])).toBe(1);
		expect(hits(objects[0], 4, 4)).toBe(0);
	});
	it('an axis is a line and a label at its far end; a point is a cross, a pick target and a label to its right', () => {
		const axis = referenceObjects(AXIS, { label: stubLabel });
		expect(axis).toHaveLength(2);
		expect(axis.every((o) => o.userData.selection.id === 'ax1' && o.userData.axis)).toBe(true);
		expect(sprites(axis)[0].position.toArray()).toEqual([1, 1, 2 * 1.4]);
		const point = referenceObjects(POINT, { label: stubLabel });
		expect(point).toHaveLength(3);
		expect(point.every((o) => o.userData.selection.id === 'pt1')).toBe(true);
		expect(sprites(point)[0].position.toArray()).toEqual([2, 3, 4]);
		expect(sprites(point)[0].center.x).toBeLessThan(0);
	});
	it('with no canvas there is no label and nothing else changes; the canvas label answers null here, where there is no document', () => {
		expect(typeof document).toBe('undefined');
		expect(canvasLabel('Plane 1')).toBeNull();
		expect(referenceObjects(PLANE)).toHaveLength(2);
		expect(referenceObjects(AXIS)).toHaveLength(1);
		expect(referenceObjects(POINT)).toHaveLength(2);
		expect(sprites(referenceObjects(PLANE))).toHaveLength(0);
	});
});
describe('the datum planes', () => {
	it('are nothing while there is a body and the setting is auto, and three faint squares named Front, Top and Right while it is always, at the engine\'s reference size', () => {
		const m = model([[0, 0, 0, 4, 3, 1]]);
		expect(datumPlaneMode()).toBe('auto');
		expect(datumPlanesShown()).toBe(false);
		expect(datumPlaneObjects(m, { label: stubLabel })).toEqual([]);
		setDatumPlanesShown(true);
		expect(datumPlaneMode()).toBe('always');
		const objects = datumPlaneObjects(m, { label: stubLabel });
		expect(objects).toHaveLength(9);
		expect(sprites(objects).map((s) => s.userData.label)).toEqual(['Front', 'Top', 'Right']);
		expect(DATUM_NAMES).toEqual({ XZ: 'Front', XY: 'Top', YZ: 'Right' });
		expect(new Set(objects.map((o) => o.userData.selection.id))).toEqual(new Set(['XY', 'XZ', 'YZ'].map((d) => `${DATUM_SELECTION_PREFIX}${d}`)));
		for (const o of objects) { expect(o.userData.base).toBe(DATUM_COLOUR); expect(o.userData.plane).toBeUndefined(); expect(['XY', 'XZ', 'YZ']).toContain(o.userData.datum); }
		expect(objects.map((o) => o.userData.part)).toEqual(['fill', 'outline', 'label', 'fill', 'outline', 'label', 'fill', 'outline', 'label']);
		/* Size: 0.6 of the largest extent, so the Front (XZ) square spans -2.4..2.4 along x. */
		const front = objects[0] as THREE.Mesh; front.geometry.computeBoundingBox();
		expect(front.userData.datum).toBe('XZ');
		expect(front.geometry.boundingBox!.min.x).toBeCloseTo(-2.4, 5); expect(front.geometry.boundingBox!.max.x).toBeCloseTo(2.4, 5);
		expect(datumPlaneObjects(m)).toHaveLength(6);
	});
	it('auto draws them on a document with no body, never hides them even then, and forced draws them regardless', () => {
		const empty = model([]), solid = model([[0, 0, 0, 1, 1, 1]]);
		expect(datumPlanesVisible(empty)).toBe(true);
		expect(datumPlaneObjects(empty, { label: stubLabel })).toHaveLength(9);
		expect(datumPlanesVisible(solid)).toBe(false);
		setDatumPlaneMode('never');
		expect(datumPlanesVisible(empty)).toBe(false);
		expect(datumPlaneObjects(empty, { label: stubLabel })).toEqual([]);
		expect(datumPlanesVisible(empty, true)).toBe(true);
		expect(datumPlaneObjects(solid, { label: stubLabel, forced: true })).toHaveLength(9);
		/* An unknown mode is not a mode. */
		setDatumPlaneMode('sometimes' as never);
		expect(datumPlaneMode()).toBe('never');
	});
	it('answer a press where they are drawn, with the datum and never with a plane, against a reference plane that carries one', () => {
		setDatumPlanesShown(true);
		const [fill, outline] = datumPlaneObjects(model([[0, 0, 0, 4, 3, 1]]), { label: stubLabel });
		/* The Front plane stands in XZ: a ray along +y through (1, -, -1) crosses its fill. */
		const along = (object: THREE.Object3D) => { const ray = new THREE.Raycaster(new THREE.Vector3(1, -10, -1), new THREE.Vector3(0, 1, 0)); const out: THREE.Intersection[] = []; object.raycast(ray, out); return out; };
		expect(along(fill)).toHaveLength(1);
		expect(along(fill)[0].object.userData).toMatchObject({ datum: 'XZ', part: 'fill' });
		expect(outline.userData.part).toBe('outline');
		expect(hits(referenceObjects(PLANE)[0])).toBe(1);
		expect(referenceObjects(PLANE)[0].userData.plane).toBeDefined();
	});
	it('the Origin is drawn with the planes and only with them, in three axis colors, and is never picked', () => {
		const empty = model([]);
		const origin = originMarkerObjects(empty);
		expect(origin).toHaveLength(3);
		expect(new Set(origin.map((o) => ((o as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHexString())).size).toBe(3);
		for (const o of origin) { const ray = new THREE.Raycaster(new THREE.Vector3(0.05, 0.05, 10), new THREE.Vector3(0, 0, -1)); const out: THREE.Intersection[] = []; o.raycast(ray, out); expect(out).toHaveLength(0); }
		expect(originMarkerObjects(model([[0, 0, 0, 1, 1, 1]]))).toEqual([]);
	});
	it('size follows the union of every body\'s bounds and is at least 1', () => {
		expect(datumSize(model([]))).toBe(0.6);
		expect(datumSize(model([[0, 0, 0, 4, 3, 1]]))).toBeCloseTo(2.4, 9);
		expect(datumSize(model([[0, 0, 0, 1, 1, 1], [9, 0, 0, 10, 1, 1]]))).toBeCloseTo(6, 9);
		expect(datumSize(model([[0, 0, 0, 0.5, 0.5, 0.5]]))).toBe(0.6);
	});
	it('the setting tells a listener when it moves, not when it is written to the same value, and not after unsubscribing', () => {
		let calls = 0;
		const off = onDatumPlanesChange(() => calls++);
		setDatumPlanesShown(true); expect(calls).toBe(1); expect(datumPlanesShown()).toBe(true);
		setDatumPlanesShown(true); expect(calls).toBe(1);
		setDatumPlanesShown(false); expect(calls).toBe(2); expect(datumPlanesShown()).toBe(false);
		setDatumPlaneMode('auto'); expect(calls).toBe(2);
		setDatumPlaneMode('never'); expect(calls).toBe(3);
		off();
		setDatumPlanesShown(true); expect(calls).toBe(3);
	});
});
