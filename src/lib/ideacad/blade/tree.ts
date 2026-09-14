export type Rotation = 'cw' | 'ccw';

export interface Station {
	r: number;
	z: number;
}

/** The stored schema-1 body contract, shared by validation and tree operations. */
export const MIN_BODY_STATIONS = 3;
export const MAX_BODY_STATIONS = 8;

/** Metadata shared by every feature. Optional fields keep schema-1 documents compatible. */
export interface FeatureState {
	id: string;
	name?: string;
	suppressed?: boolean;
}

export interface RevolveFeature extends FeatureState {
	type: 'revolve';
	stations: Station[];
}
export interface HexFeature extends FeatureState {
	type: 'hexBoss';
	acrossFlats: number;
	height: number;
}
export interface BladeSketchFeature extends FeatureState {
	type: 'bladeSketch';
	rootWidth: number;
	tipWidth: number;
	length: number;
	sweepDeg: number;
	mountRadius: number;
}
export interface ExtrudeFeature extends FeatureState {
	type: 'extrude';
	sketch: string;
	thickness: 'stock';
}
export interface PatternFeature extends FeatureState {
	type: 'circularPattern';
	feature: string;
	count: number;
}
export interface MountFeature extends FeatureState {
	type: 'mount';
	feature: string;
	z: number;
}

export type BladeFeature =
	| RevolveFeature
	| HexFeature
	| BladeSketchFeature
	| ExtrudeFeature
	| PatternFeature
	| MountFeature;

export interface BladeTree {
	schema: 1;
	editor: 'blade';
	units: 'in';
	rotation: Rotation;
	materials: { body: string; bodySolidFraction: number; bladeStock: string };
	features: BladeFeature[];
}

export function featureOf<T extends BladeFeature['type']>(
	tree: BladeTree,
	type: T
): Extract<BladeFeature, { type: T }> {
	return tree.features.find((f) => f.type === type) as Extract<BladeFeature, { type: T }>;
}

/** Dependencies come from the reference fields in the stored feature itself. */
export function featureDependencies(feature: BladeFeature): string[] {
	switch (feature.type) {
		case 'extrude':
			return [feature.sketch];
		case 'circularPattern':
		case 'mount':
			return [feature.feature];
		default:
			return [];
	}
}

/** `validateBladeTree` requires an active body; no other feature type is required. */
export function isStructuralFeature(feature: BladeFeature): boolean {
	return feature.type === 'revolve';
}

export function cloneTree(tree: BladeTree): BladeTree {
	return structuredClone(tree);
}
