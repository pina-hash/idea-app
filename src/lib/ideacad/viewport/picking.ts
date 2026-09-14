import { Raycaster, Vector2, type Camera, type Intersection, type Object3D, type Vector2Like } from 'three';
import type { BladeFeature, BladeTree } from '../blade/tree';

/** A render role is the smallest provenance vocabulary the renderer exposes today. */
export type RenderedFeatureRole = 'body' | 'hex' | 'blade';

export interface RenderedFeatureIds {
	body?: string;
	hex?: string;
	blade?: string;
}

/**
 * Recover the feature ids for the three geometry roles currently emitted by
 * `evaluationGeometries`.
 *
 * The evaluated geometry does not carry feature ids. Body and hex have a
 * one-to-one source. A blade mesh combines sketch, extrude, pattern and mount,
 * so the honest selectable feature is the last valid feature in that chain:
 * mount, then pattern, then extrude, then sketch. This is deliberately not a
 * general provenance graph; the evaluator would have to retain provenance for
 * that to exist.
 */
export function renderedFeatureIds(tree: BladeTree): RenderedFeatureIds {
	const active = tree.features.filter((feature) => !feature.suppressed);
	const byId = new Map(active.map((feature) => [feature.id, feature]));
	const first = <T extends BladeFeature['type']>(type: T) =>
		active.find((feature): feature is Extract<BladeFeature, { type: T }> => feature.type === type);

	const sketch = first('bladeSketch');
	const extrude = active.find(
		(feature) => feature.type === 'extrude' && sketch && feature.sketch === sketch.id
	);
	const pattern = active.find(
		(feature) => feature.type === 'circularPattern' && extrude && feature.feature === extrude.id
	);
	const mount = active.find(
		(feature) => feature.type === 'mount' && pattern && feature.feature === pattern.id
	);
	const terminal = [mount, pattern, extrude, sketch].find(
		(feature): feature is BladeFeature => feature !== undefined && byId.has(feature.id)
	);

	return {
		body: first('revolve')?.id,
		hex: first('hexBoss')?.id,
		blade: terminal?.id
	};
}

export interface FeaturePickTarget {
	featureId: string;
	object: Object3D;
}

export interface FeatureHit {
	featureId: string;
	distance: number;
	point: Readonly<{ x: number; y: number; z: number }>;
}

export type FeaturePickResult =
	| { kind: 'empty'; hits: readonly [] }
	| { kind: 'hit'; hit: FeatureHit; hits: readonly FeatureHit[] };

const compareHits = (a: FeatureHit, b: FeatureHit) =>
	a.distance - b.distance || (a.featureId < b.featureId ? -1 : a.featureId > b.featureId ? 1 : 0);

/**
 * Raycast normalized device coordinates (`-1..1`) into feature-labelled
 * objects. Results are deduplicated per feature and ordered front-to-back;
 * equal-distance hits use the feature id as the deterministic tie-break.
 */
export function raycastFeatures(
	pointer: Vector2Like,
	camera: Camera,
	targets: readonly FeaturePickTarget[]
): FeaturePickResult {
	const raycaster = new Raycaster();
	// `setFromCamera` takes a real `Vector2`, not the structural `Vector2Like`
	// this function accepts; the two numbers are the same either way.
	raycaster.setFromCamera(new Vector2(pointer.x, pointer.y), camera);

	const featureByObject = new Map<Object3D, string>();
	for (const target of targets) {
		target.object.traverse((object) => featureByObject.set(object, target.featureId));
	}

	const closest = new Map<string, FeatureHit>();
	const intersections = raycaster.intersectObjects(
		targets.map((target) => target.object),
		true
	);
	for (const intersection of intersections) {
		const featureId = featureForIntersection(intersection, featureByObject);
		if (!featureId) continue;
		const hit: FeatureHit = {
			featureId,
			distance: intersection.distance,
			point: { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z }
		};
		const previous = closest.get(featureId);
		if (!previous || compareHits(hit, previous) < 0) closest.set(featureId, hit);
	}

	const hits = [...closest.values()].sort(compareHits);
	return hits.length === 0 ? { kind: 'empty', hits: [] } : { kind: 'hit', hit: hits[0], hits };
}

function featureForIntersection(
	intersection: Intersection,
	featureByObject: ReadonlyMap<Object3D, string>
): string | undefined {
	let object: Object3D | null = intersection.object;
	while (object) {
		const featureId = featureByObject.get(object);
		if (featureId) return featureId;
		object = object.parent;
	}
	return undefined;
}
