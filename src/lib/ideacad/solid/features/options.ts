/**
 * THE FEATURE PANEL'S OPTIONS, as one plain module-level object. The panel
 * (`FeaturePanel.svelte`) writes it; `SolidWorkspace.svelte`'s `commandFor`
 * reads it through `withOptions` when a drag builds a fillet, chamfer or
 * shell, so tangent propagation, a variable end radius, an asymmetric or
 * angled chamfer and per-face shell thickness ride on the same gesture the
 * radius or distance already comes from.
 *
 * It is deliberately NOT reactive: nothing renders from it. The panel keeps
 * its own `$state` for the screen and mirrors every change here, and the
 * workspace reads it at the moment a command is built. A store two surfaces
 * both render from would be a second source of truth for the panel's boxes.
 *
 * NOTHING IS CLAMPED HERE. A value is a finite number or absent; what the
 * kernel refuses is the feature row's sentence.
 */
import type { BodyProjection, FaceProjection, FaceRef, Feature, Selection, Vec3 } from '../types';
import { drop, planeFromNormal } from '../sketch/model';
import { refFromSelection } from '../naming';
import type { HoleFit } from './holes';

export interface FeatureOptions {
	fillet: { propagate: boolean; variableEnd: number | null; law: 'linear' | 'scurve' };
	chamfer: { propagate: boolean; distance2: number | null; angle: number | null };
	shell: { faceThickness: { face: FaceRef; thickness: number }[] };
	hole: { standard: string; fit: HoleFit; diameter: number | null; depth: number | 'through' };
}
export const DEFAULT_FEATURE_OPTIONS = (): FeatureOptions => ({
	fillet: { propagate: false, variableEnd: null, law: 'linear' },
	chamfer: { propagate: false, distance2: null, angle: null },
	shell: { faceThickness: [] },
	hole: { standard: '1/4-20', fit: 'close', diameter: null, depth: 'through' }
});
export const featureOptions: FeatureOptions = DEFAULT_FEATURE_OPTIONS();
export function resetFeatureOptions() { Object.assign(featureOptions, DEFAULT_FEATURE_OPTIONS()); }

/** A feature a drag built, with the panel's options folded in. Any other feature type passes through untouched. */
export function withOptions<F extends Partial<Feature> & { type: Feature['type'] }>(feature: F): F {
	const o = featureOptions;
	if (feature.type === 'fillet') {
		const f = feature as F & { propagate?: boolean; variable?: { end: number; law?: 'linear' | 'scurve' } };
		return { ...f, ...(o.fillet.propagate ? { propagate: true } : {}), ...(o.fillet.variableEnd !== null ? { variable: { end: o.fillet.variableEnd, law: o.fillet.law } } : {}) };
	}
	if (feature.type === 'chamfer') {
		const f = feature as F & { propagate?: boolean; distance2?: number; angle?: number };
		return { ...f, ...(o.chamfer.propagate ? { propagate: true } : {}), ...(o.chamfer.angle !== null ? { angle: o.chamfer.angle } : o.chamfer.distance2 !== null ? { distance2: o.chamfer.distance2 } : {}) };
	}
	if (feature.type === 'shell') {
		const f = feature as F & { openFaces?: FaceRef[]; faceThickness?: FeatureOptions['shell']['faceThickness'] };
		if (!o.shell.faceThickness.length) return f;
		/* A face given its own wall thickness is a wall, so it cannot also be an open face. */
		const thick = new Set(o.shell.faceThickness.map((t) => `${t.face.body}/${t.face.name}`));
		return { ...f, openFaces: (f.openFaces ?? []).filter((x) => !thick.has(`${x.body}/${x.name}`)), faceThickness: o.shell.faceThickness.map((t) => ({ face: t.face, thickness: t.thickness })) };
	}
	return feature;
}
/**
 * The hole feature for a press at `point` on `face` of `body`, in the
 * face's own plane coordinates (the same basis `engine.ts` resolves a face
 * plane to), with the panel's standard, fit and depth. Throws in the
 * student's terms when the face is not flat, because a hole is placed on a
 * face plane; a curved face takes a point reference instead.
 */
export function holeFeatureAt(body: BodyProjection, face: FaceProjection, point: Vec3): Omit<Extract<Feature, { type: 'hole' }>, 'id' | 'name'> {
	if (face.kind !== 'plane') throw Error('Drill into a flat face. For a curved face, add a reference point on it and drill there.');
	const selection: Selection = { bodyId: body.id, kind: 'face', id: face.id };
	const plane = planeFromNormal(face.normal, face.center);
	const o = featureOptions.hole;
	return { type: 'hole', face: refFromSelection(selection, body) as FaceRef, center: drop(plane, point), standard: o.standard, fit: o.fit, ...(o.fit === 'custom' && o.diameter !== null ? { diameter: o.diameter } : {}), depth: o.depth };
}
