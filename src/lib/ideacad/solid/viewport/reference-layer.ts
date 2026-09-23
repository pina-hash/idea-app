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
 * THE DATUM PLANES ARE FRONT, TOP AND RIGHT, AND A MODULE-LEVEL SETTING
 * DECIDES WHEN THEY ARE DRAWN: `auto` (the default) draws them while the
 * document has no body, so a new part opens on the three planes a student can
 * press to start sketching; `always` and `never` are the student's own
 * choice, stored in preferences. They are NOT features and never enter the
 * manifest. They ARE pickable once drawn: the outline and the name answer a
 * press (so Select can pick a plane without a plane swallowing every click on
 * empty space), and the fill answers a drawing tool, which sketches on it.
 * Their selection id is `datum:<XY|XZ|YZ>`, and they carry `datum` rather
 * than `plane`, so a drawing press resolves to the datum and never to a
 * reference feature that does not exist. `onDatumPlanesChange` is how the
 * viewport learns to redraw when the setting moves.
 *
 * THE NAMES ARE SOLIDWORKS', ON A Z-UP SCENE: Top is XY, Front is XZ (seen
 * from -Y), Right is YZ (seen from +X). `DATUM_NAMES` is the one spelling.
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
export type DatumPlaneMode = 'auto' | 'always' | 'never';
export const DATUM_PLANE_MODES: readonly DatumPlaneMode[] = ['auto', 'always', 'never'];
let datumMode: DatumPlaneMode = 'auto';
const listeners = new Set<() => void>();
export const datumPlaneMode = () => datumMode;
/** Writes the setting and tells every listener; a write that changes nothing tells nobody. */
export function setDatumPlaneMode(mode: DatumPlaneMode) {
	if (datumMode === mode || !DATUM_PLANE_MODES.includes(mode)) return;
	datumMode = mode;
	for (const listener of [...listeners]) listener();
}
/** Whether the planes are shown on purpose, whatever the model holds. The reference panel's box reads and writes this: ticked is `always`, unticked goes back to `auto`. */
export const datumPlanesShown = () => datumMode === 'always';
export function setDatumPlanesShown(on: boolean) { setDatumPlaneMode(on ? 'always' : 'auto'); }
/** Whether the planes are drawn for this model: always, never, or while there is no body yet. `forced` draws them regardless, for a moment a student asked to sketch on a plane. */
export function datumPlanesVisible(model: ModelProjection, forced = false): boolean {
	return forced || datumMode === 'always' || (datumMode === 'auto' && model.bodies.length === 0);
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
/** Front, Top, Right: the order SolidWorks lists them. */
export const DATUM_PLANES: readonly Datum[] = ['XZ', 'XY', 'YZ'];
/** What a student calls each datum plane. */
export const DATUM_NAMES: Readonly<Record<Datum, string>> = { XZ: 'Front', XY: 'Top', YZ: 'Right' };
export interface DatumLayerOptions extends ReferenceLayerOptions { /** Draw the planes whatever the setting says. */ forced?: boolean }
/**
 * The three datum planes, faintly, named Front, Top and Right, when they are
 * visible for this model; nothing otherwise. Each part carries the datum's
 * selection and `datum`, and says which part it is: the viewport lets a
 * drawing tool press the `fill` and lets Select pick only the `outline` and
 * the `label`.
 */
export function datumPlaneObjects(model: ModelProjection, options: DatumLayerOptions = {}): THREE.Object3D[] {
	if (!datumPlanesVisible(model, options.forced)) return [];
	const out: THREE.Object3D[] = [];
	const s = datumSize(model), make = options.label ?? canvasLabel, color = DATUM_COLOUR;
	for (const name of DATUM_PLANES) {
		const p = PLANES[name];
		const selection: Selection = { bodyId: '', kind: 'reference', id: `${DATUM_SELECTION_PREFIX}${name}` };
		const userData = { selection, base: color, datum: name };
		const o = new THREE.Vector3(...p.origin), u = new THREE.Vector3(...p.u).multiplyScalar(s), v = new THREE.Vector3(...p.v).multiplyScalar(s);
		const corners = [o.clone().sub(u).sub(v), o.clone().add(u).sub(v), o.clone().add(u).add(v), o.clone().sub(u).add(v)];
		const geometry = new THREE.BufferGeometry().setFromPoints(corners);
		geometry.setIndex([0, 1, 2, 0, 2, 3]);
		const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
		fill.userData = { ...userData, part: 'fill' };
		out.push(fill);
		const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }));
		outline.userData = { ...userData, part: 'outline' };
		out.push(outline);
		const label = labelSprite(DATUM_NAMES[name], corners[2], s * 0.13, color, { ...userData, part: 'label' }, make, [0, 0.5]);
		if (label) { (label.material as THREE.SpriteMaterial).opacity = 0.8; out.push(label); }
	}
	return out;
}
/** The axis colors of the corner triad, which the Origin marker repeats so the two read as one system. */
export const AXIS_COLOURS = { x: '#ff6a5c', y: '#86e25f', z: '#5aa9ff' } as const;
/**
 * THE ORIGIN, drawn with the planes and only with them: three short arrows
 * along +X, +Y and +Z from the origin in the triad's colors, a fifth of a
 * plane's half-size long. It is a marker, not a pick target.
 */
export function originMarkerObjects(model: ModelProjection, options: DatumLayerOptions = {}): THREE.Object3D[] {
	if (!datumPlanesVisible(model, options.forced)) return [];
	const len = datumSize(model) * 0.22, head = len * 0.28;
	const out: THREE.Object3D[] = [];
	const axes: [THREE.Vector3, THREE.Vector3, string][] = [[new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), AXIS_COLOURS.x], [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), AXIS_COLOURS.y], [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), AXIS_COLOURS.z]];
	for (const [dir, side, color] of axes) {
		const tip = dir.clone().multiplyScalar(len), back = dir.clone().multiplyScalar(len - head), wing = side.clone().multiplyScalar(head * 0.45);
		const points = [new THREE.Vector3(), tip, tip, back.clone().add(wing), tip, back.clone().sub(wing)];
		const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
		line.renderOrder = 12;
		line.userData = { origin: true };
		line.raycast = () => {};
		out.push(line);
	}
	return out;
}
