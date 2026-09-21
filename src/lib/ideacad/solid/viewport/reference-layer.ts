/**
 * HOW REFERENCE GEOMETRY IS DRAWN: a plane as a dashed square with a faint
 * fill, an axis as a long dashed line, a point as a small cross with a pick
 * target, and beside each its NAME. Pure: takes the projection, returns
 * objects; `SolidViewport` adds them to its reference group and to its pick
 * list. Every object carries `userData.selection`, a plane also carries
 * `plane` (so a drawing tool can draw on it) and an axis carries `axis`; the
 * label carries whatever its geometry carries, so a press on a name selects
 * the reference and a drawing press on a plane's name draws on that plane.
 *
 * THIS MODULE IS THE REFERENCE-GEOMETRY SURFACE'S: labels, the datum planes'
 * own look when shown, hover and selection emphasis all belong here.
 *
 * THE SELECTED LOOK IS THE VIEWPORT'S OWN COLOUR SWAP, APPLIED TO THREE
 * OBJECTS AT ONCE. `SolidViewport.highlight()` sets every pick object's
 * material colour to the selection green and restores `userData.base`
 * otherwise; a reference is its fill, its outline and its label, so all three
 * turn green together and the name reads in green beside a green outline.
 * The label is white on a dark pill so that tint lands on the WORD.
 *
 * THE DATUM PLANES ARE A MODULE-LEVEL SETTING the panel writes and this
 * layer reads. They are drawn faintly, at the engine's own reference size, and
 * they are NOT pickable: their `raycast` is a no-op, so a faint square across
 * the model never steals a press meant for a face. `onDatumPlanesChange` is
 * how the viewport learns to redraw when the setting moves.
 */
import * as THREE from 'three';
import { PLANES } from '../math';
import { DATUM_SELECTION_PREFIX, type Datum } from '../features/reference';
import type { ModelProjection, ReferenceProjection, ResolvedPlane, Selection } from '../types';

export const REFERENCE_COLOUR = '#d9b96a';
export const DATUM_COLOUR = '#7d8d97';

/* -------------------------------------------------------------------------
 * THE DATUM-PLANE SETTING
 * ---------------------------------------------------------------------- */
let datumShown = false;
const listeners = new Set<() => void>();
export const datumPlanesShown = () => datumShown;
/** Writes the setting and tells every listener; a write that changes nothing tells nobody. */
export function setDatumPlanesShown(on: boolean) {
	if (datumShown === on) return;
	datumShown = on;
	for (const listener of [...listeners]) listener();
}
/** The viewport subscribes here and re-displays the model on a change. Returns the unsubscribe. */
export function onDatumPlanesChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

/* -------------------------------------------------------------------------
 * LABELS
 * ---------------------------------------------------------------------- */
export type LabelTexture = (text: string) => { texture: THREE.Texture; aspect: number } | null;
/** A name drawn on a canvas: white on a dark pill, so the material colour tints the word. Null where there is no canvas; a node test hands in its own factory. */
export const canvasLabel: LabelTexture = (text) => {
	if (typeof document === 'undefined') return null;
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	const px = 30, pad = 12, font = `600 ${px}px Rajdhani, "Share Tech Mono", sans-serif`;
	ctx.font = font;
	const w = Math.max(1, Math.ceil(ctx.measureText(text).width) + pad * 2), h = px + pad;
	canvas.width = w; canvas.height = h;
	ctx.font = font;
	ctx.fillStyle = 'rgba(21,25,29,0.82)';
	if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(0, 0, w, h, 7); ctx.fill(); } else ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(text, pad, h / 2);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return { texture, aspect: w / h };
};
/** The sprite beside a piece of geometry. `center` is the sprite's own anchor in [0, 1]: (0, 0.5) hangs the label to the right of `at`. */
function labelSprite(text: string, at: THREE.Vector3, height: number, color: string, userData: Record<string, unknown>, make: LabelTexture, center: [number, number]): THREE.Sprite | null {
	const made = make(text);
	if (!made) return null;
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: made.texture, color, transparent: true, depthTest: false, depthWrite: false }));
	sprite.position.copy(at);
	sprite.scale.set(height * made.aspect, height, 1);
	sprite.center.set(center[0], center[1]);
	sprite.renderOrder = 11;
	sprite.userData = { ...userData, label: text };
	return sprite;
}

/* -------------------------------------------------------------------------
 * REFERENCES
 * ---------------------------------------------------------------------- */
export interface ReferenceLayerOptions { label?: LabelTexture }
export function referenceObjects(ref: ReferenceProjection, options: ReferenceLayerOptions = {}): THREE.Object3D[] {
	const out: THREE.Object3D[] = [];
	const selection: Selection = { bodyId: '', kind: 'reference', id: ref.feature }, color = REFERENCE_COLOUR, s = ref.size, make = options.label ?? canvasLabel;
	const o = new THREE.Vector3(...ref.origin);
	const labelHeight = s * 0.14;
	if (ref.kind === 'plane') {
		const u = new THREE.Vector3(...ref.u!).multiplyScalar(s), v = new THREE.Vector3(...ref.v!).multiplyScalar(s);
		const corners = [o.clone().sub(u).sub(v), o.clone().add(u).sub(v), o.clone().add(u).add(v), o.clone().sub(u).add(v)];
		const geometry = new THREE.BufferGeometry().setFromPoints(corners);
		geometry.setIndex([0, 1, 2, 0, 2, 3]);
		geometry.computeVertexNormals();
		const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
		const plane: ResolvedPlane = { origin: ref.origin, u: ref.u!, v: ref.v!, normal: ref.normal! };
		const userData = { selection, normal: ref.normal, plane, base: color };
		fill.userData = userData;
		out.push(fill);
		const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineDashedMaterial({ color, dashSize: s * 0.08, gapSize: s * 0.05 }));
		outline.computeLineDistances();
		outline.userData = userData;
		out.push(outline);
		/* The name hangs off the +u +v corner, outside the square. */
		const label = labelSprite(ref.name, corners[2], labelHeight, color, userData, make, [0, 0.5]);
		if (label) out.push(label);
	} else if (ref.kind === 'axis') {
		const d = new THREE.Vector3(...ref.direction!).multiplyScalar(s * 1.4);
		const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([o.clone().sub(d), o.clone().add(d)]), new THREE.LineDashedMaterial({ color, dashSize: s * 0.1, gapSize: s * 0.06 }));
		line.computeLineDistances();
		const userData = { selection, axis: ref.direction, base: color };
		line.userData = userData;
		out.push(line);
		/* The name sits at the axis's far end, in its own direction. */
		const label = labelSprite(ref.name, o.clone().add(d), labelHeight, color, userData, make, [0, 0.5]);
		if (label) out.push(label);
	} else {
		const r = s * 0.06, pts = [[-r, 0, 0], [r, 0, 0], [0, -r, 0], [0, r, 0], [0, 0, -r], [0, 0, r]].map((p) => o.clone().add(new THREE.Vector3(...p)));
		const userData = { selection, base: color };
		const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
		cross.userData = userData;
		out.push(cross);
		const pick = new THREE.Points(new THREE.BufferGeometry().setFromPoints([o]), new THREE.PointsMaterial({ color, size: 8, sizeAttenuation: false }));
		pick.userData = userData;
		out.push(pick);
		/* The name sits to the right of the cross, clear of it. */
		const label = labelSprite(ref.name, o, labelHeight, color, userData, make, [-0.3, 0.5]);
		if (label) out.push(label);
	}
	return out;
}

/* -------------------------------------------------------------------------
 * THE DATUM PLANES
 * ---------------------------------------------------------------------- */
/** The engine's own reference size, 0.6 of the model's largest extent and at least 1, so a datum square is the size a reference square would be. */
export function datumSize(model: ModelProjection): number {
	let dims = 0;
	if (model.bodies.length) {
		const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
		for (const b of model.bodies) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.bounds[i]); max[i] = Math.max(max[i], b.bounds[i + 3]); }
		dims = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
	}
	return Math.max(1, dims) * 0.6;
}
export const DATUM_PLANES: readonly Datum[] = ['XY', 'XZ', 'YZ'];
/**
 * The three datum planes, faintly, when the setting is on; nothing when it is
 * off. Not pickable, and carrying no `plane` so a drawing press can never
 * resolve to a reference that is not a feature. The viewport adds these to its
 * reference GROUP only, and redraws through `onDatumPlanesChange`.
 */
export function datumPlaneObjects(model: ModelProjection, options: ReferenceLayerOptions = {}): THREE.Object3D[] {
	if (!datumShown) return [];
	const out: THREE.Object3D[] = [];
	const s = datumSize(model), make = options.label ?? canvasLabel, color = DATUM_COLOUR;
	const unpickable = (object: THREE.Object3D) => { object.raycast = () => {}; return object; };
	for (const name of DATUM_PLANES) {
		const p = PLANES[name];
		const selection: Selection = { bodyId: '', kind: 'reference', id: `${DATUM_SELECTION_PREFIX}${name}` };
		const userData = { selection, base: color, datum: name };
		const o = new THREE.Vector3(...p.origin), u = new THREE.Vector3(...p.u).multiplyScalar(s), v = new THREE.Vector3(...p.v).multiplyScalar(s);
		const corners = [o.clone().sub(u).sub(v), o.clone().add(u).sub(v), o.clone().add(u).add(v), o.clone().sub(u).add(v)];
		const geometry = new THREE.BufferGeometry().setFromPoints(corners);
		geometry.setIndex([0, 1, 2, 0, 2, 3]);
		const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
		fill.userData = userData;
		out.push(unpickable(fill));
		const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }));
		outline.userData = userData;
		out.push(unpickable(outline));
		const label = labelSprite(name, corners[2], s * 0.1, color, userData, make, [0, 0.5]);
		if (label) { (label.material as THREE.SpriteMaterial).opacity = 0.6; out.push(unpickable(label)); }
	}
	return out;
}
