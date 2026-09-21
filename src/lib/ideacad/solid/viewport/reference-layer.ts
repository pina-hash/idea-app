/**
 * HOW REFERENCE GEOMETRY IS DRAWN: a plane as a dashed square with a faint
 * fill, an axis as a long dashed line, a point as a small cross with a pick
 * target. Pure: takes the projection, returns objects; `SolidViewport` adds
 * them to its reference group and to its pick list. Every object carries
 * `userData.selection`, a plane also carries `plane` (so a drawing tool can
 * draw on it) and an axis carries `axis`.
 *
 * THIS MODULE IS THE REFERENCE-GEOMETRY SURFACE'S: labels, the datum planes'
 * own look when shown, hover and selection emphasis all belong here.
 */
import * as THREE from 'three';
import type { ReferenceProjection, ResolvedPlane, Selection } from '../types';

export const REFERENCE_COLOUR = '#d9b96a';

export function referenceObjects(ref: ReferenceProjection): THREE.Object3D[] {
	const out: THREE.Object3D[] = [];
	const selection: Selection = { bodyId: '', kind: 'reference', id: ref.feature }, color = REFERENCE_COLOUR, s = ref.size;
	const o = new THREE.Vector3(...ref.origin);
	if (ref.kind === 'plane') {
		const u = new THREE.Vector3(...ref.u!).multiplyScalar(s), v = new THREE.Vector3(...ref.v!).multiplyScalar(s);
		const corners = [o.clone().sub(u).sub(v), o.clone().add(u).sub(v), o.clone().add(u).add(v), o.clone().sub(u).add(v)];
		const geometry = new THREE.BufferGeometry().setFromPoints(corners);
		geometry.setIndex([0, 1, 2, 0, 2, 3]);
		geometry.computeVertexNormals();
		const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
		const plane: ResolvedPlane = { origin: ref.origin, u: ref.u!, v: ref.v!, normal: ref.normal! };
		fill.userData = { selection, normal: ref.normal, plane, base: color };
		out.push(fill);
		const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineDashedMaterial({ color, dashSize: s * 0.08, gapSize: s * 0.05 }));
		outline.computeLineDistances();
		outline.userData = { selection, normal: ref.normal, plane, base: color };
		out.push(outline);
	} else if (ref.kind === 'axis') {
		const d = new THREE.Vector3(...ref.direction!).multiplyScalar(s * 1.4);
		const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([o.clone().sub(d), o.clone().add(d)]), new THREE.LineDashedMaterial({ color, dashSize: s * 0.1, gapSize: s * 0.06 }));
		line.computeLineDistances();
		line.userData = { selection, axis: ref.direction, base: color };
		out.push(line);
	} else {
		const r = s * 0.06, pts = [[-r, 0, 0], [r, 0, 0], [0, -r, 0], [0, r, 0], [0, 0, -r], [0, 0, r]].map((p) => o.clone().add(new THREE.Vector3(...p)));
		const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
		cross.userData = { selection, base: color };
		out.push(cross);
		const pick = new THREE.Points(new THREE.BufferGeometry().setFromPoints([o]), new THREE.PointsMaterial({ color, size: 8, sizeAttenuation: false }));
		pick.userData = { selection, base: color };
		out.push(pick);
	}
	return out;
}
