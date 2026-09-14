import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { DEFAULT_BLADE_TREE } from '../src/lib/ideacad/blade/materials';
import { raycastFeatures, renderedFeatureIds } from '../src/lib/ideacad/viewport/picking';

const camera = () => {
	const value = new PerspectiveCamera(45, 1, 0.1, 100);
	value.position.set(0, 0, 10);
	value.lookAt(0, 0, 0);
	value.updateMatrixWorld(true);
	value.updateProjectionMatrix();
	return value;
};

const cube = (z: number) => {
	const value = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
	value.position.z = z;
	value.updateMatrixWorld(true);
	return value;
};

describe('renderedFeatureIds', () => {
	it('maps renderer roles to feature ids and names the terminal blade operation', () => {
		expect(renderedFeatureIds(DEFAULT_BLADE_TREE)).toEqual({
			body: 'body-revolve',
			hex: 'hex-extension',
			blade: 'blade-mount'
		});
	});

	it('falls back through the blade chain without inventing provenance', () => {
		const tree = structuredClone(DEFAULT_BLADE_TREE);
		const mount = tree.features.find((feature) => feature.type === 'mount');
		if (mount) mount.suppressed = true;
		expect(renderedFeatureIds(tree).blade).toBe('blade-pattern');

		const pattern = tree.features.find((feature) => feature.type === 'circularPattern');
		if (pattern) pattern.feature = 'not-the-extrude';
		expect(renderedFeatureIds(tree).blade).toBe('blade-extrude');
	});
});

describe('raycastFeatures', () => {
	it('returns feature hits front-to-back and deduplicates both faces of a solid', () => {
		const front = cube(2);
		const back = cube(-2);
		const result = raycastFeatures({ x: 0, y: 0 }, camera(), [
			{ featureId: 'back-feature', object: back },
			{ featureId: 'front-feature', object: front }
		]);

		expect(result.kind).toBe('hit');
		if (result.kind !== 'hit') return;
		expect(result.hit.featureId).toBe('front-feature');
		expect(result.hits.map((hit) => hit.featureId)).toEqual(['front-feature', 'back-feature']);
	});

	it('breaks equal-distance ties by feature id independent of target order', () => {
		const a = cube(0);
		const z = cube(0);
		for (const targets of [
			[
				{ featureId: 'z-feature', object: z },
				{ featureId: 'a-feature', object: a }
			],
			[
				{ featureId: 'a-feature', object: a },
				{ featureId: 'z-feature', object: z }
			]
		]) {
			const result = raycastFeatures({ x: 0, y: 0 }, camera(), targets);
			expect(result.kind).toBe('hit');
			if (result.kind === 'hit') {
				expect(result.hits.map((hit) => hit.featureId)).toEqual(['a-feature', 'z-feature']);
			}
		}
	});

	it('returns an explicit empty result when nothing is under the pointer', () => {
		expect(raycastFeatures({ x: 0.9, y: 0.9 }, camera(), [{ featureId: 'cube', object: cube(0) }])).toEqual({
			kind: 'empty',
			hits: []
		});
	});
});
