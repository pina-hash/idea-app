/**
 * HOW A SKETCH IS DRAWN IN THE VIEWPORT: its closed regions as translucent
 * fills, every entity as a line, faint once the sketch has been consumed by a
 * feature. Pure: takes the projection, returns objects; `SolidViewport` adds
 * them to its sketch group and to its pick list.
 *
 * THIS MODULE IS THE SKETCHING SURFACE'S. Selection highlighting of a single
 * entity, constraint glyphs, dimension labels and the editing state's own
 * look belong here too; `userData.entity` on each line is the hook the pick
 * pipeline already reads.
 */
import * as THREE from 'three';
import { dot, sub } from '../math';
import { lift, samples } from '../sketch/model';
import type { Selection, SketchProjection, Vec3 } from '../types';
import { polyline } from './shared';

export const SKETCH_COLOUR = '#a5ecff';
export const CONSTRUCTION_COLOUR = '#6d8391';

/** The objects that draw one sketch. Every object carries `userData.selection`; fills carry `region`, lines carry `entity`. */
export function sketchObjects(sketch: SketchProjection): THREE.Object3D[] {
	const out: THREE.Object3D[] = [];
	const selection: Selection = { bodyId: '', kind: 'sketch', id: sketch.feature }, opacity = sketch.consumed ? 0.35 : 1, color = SKETCH_COLOUR;
	const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...sketch.plane.u), new THREE.Vector3(...sketch.plane.v), new THREE.Vector3(...sketch.plane.normal));
	basis.setPosition(...sketch.plane.origin);
	const local = (p: Vec3) => { const d = sub(p, sketch.plane.origin); return new THREE.Vector2(dot(d, sketch.plane.u), dot(d, sketch.plane.v)); };
	for (const region of sketch.regions) {
		const shape = new THREE.Shape(region.outline.map(local));
		for (const hole of region.holes) shape.holes.push(new THREE.Path(hole.map(local)));
		const fillGeometry = new THREE.ShapeGeometry(shape);
		fillGeometry.applyMatrix4(basis);
		const fill = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 * opacity, side: THREE.DoubleSide, depthWrite: false }));
		fill.userData = { selection, normal: sketch.plane.normal, plane: sketch.plane, base: color, region: region.id };
		out.push(fill);
	}
	for (const e of sketch.entities) {
		if (e.type === 'point') continue;
		const pts = samples(sketch.entities, e).map((p) => lift(sketch.plane, p));
		const line = polyline(pts, e.construction ? CONSTRUCTION_COLOUR : color, opacity);
		line.userData = { selection, normal: sketch.plane.normal, plane: sketch.plane, base: color, entity: e.id };
		out.push(line);
	}
	return out;
}
