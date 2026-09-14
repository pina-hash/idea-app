import { describe, expect, it } from 'vitest';
import { DEFAULT_BLADE_TREE } from '../src/lib/ideacad/blade/materials';
import {
	addFeature,
	addBodyStation,
	deleteFeature,
	duplicateFeature,
	renameFeature,
	reorderFeature,
	removeBodyStation,
	suppressFeature,
	type BladeTreeOperationResult
} from '../src/lib/ideacad/blade/ops';
import { cloneTree, type BladeFeature, type BladeTree } from '../src/lib/ideacad/blade/tree';
import { validateBladeTree } from '../src/lib/ideacad/blade/validate';

function success(result: BladeTreeOperationResult): BladeTree {
	expect(result.ok, result.ok ? undefined : result.message).toBe(true);
	if (!result.ok) throw new Error(result.message);
	return result.tree;
}

function refusal(result: BladeTreeOperationResult, code: string): string {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error('Expected this operation to refuse.');
	expect(result.code).toBe(code);
	expect(result.message).toMatch(/[.!?]$/);
	return result.message;
}

describe('IdeaCAD feature-tree operations', () => {
	it('enforces the stated station bounds at the model mutation boundary', () => {
		let tree = cloneTree(DEFAULT_BLADE_TREE);
		for (let count = 5; count <= 8; count += 1) {
			const body = tree.features.find((feature) => feature.type === 'revolve');
			if (!body || body.type !== 'revolve') throw new Error('fixture needs a body');
			const last = body.stations.at(-1)!;
			tree = success(addBodyStation(tree, body.id, { r: last.r, z: last.z + 0.1 }, body.stations.length));
		}

		let body = tree.features.find((feature) => feature.type === 'revolve');
		if (!body || body.type !== 'revolve') throw new Error('fixture needs a body');
		const bodyId = body.id;
		expect(body.stations).toHaveLength(8);
		expect(refusal(addBodyStation(tree, body.id, { r: 0.7, z: 4 }, 8), 'station-limit')).toContain(
			'at most 8'
		);
		expect(body.stations).toHaveLength(8);

		while (body.stations.length > 3) {
			tree = success(removeBodyStation(tree, bodyId, body.stations.length - 1));
			const current = tree.features.find((feature) => feature.id === bodyId);
			if (!current || current.type !== 'revolve') throw new Error('fixture needs a body');
			body = current;
		}
		expect(refusal(removeBodyStation(tree, body.id, 2), 'station-limit')).toContain('at least 3');
	});

	it('rejects a sixteen-station point cloud even when it was constructed outside tree operations', () => {
		const tree = cloneTree(DEFAULT_BLADE_TREE);
		const body = tree.features.find((feature) => feature.type === 'revolve');
		if (!body || body.type !== 'revolve') throw new Error('fixture needs a body');
		body.stations = Array.from({ length: 16 }, (_, index) => ({ r: 0.7, z: 0.125 + index * 0.25 }));
		expect(validateBladeTree(tree)).toContainEqual({
			featureId: body.id,
			parameter: 'stations',
			message: 'Use 3 to 8 body stations.'
		});
	});
	it('adds, duplicates, renames, suppresses, restores, reorders, and deletes without mutation', () => {
		const original = cloneTree(DEFAULT_BLADE_TREE);
		const added: BladeFeature = {
			id: 'student-hex',
			type: 'hexBoss',
			acrossFlats: 0.5,
			height: 0.5
		};
		let tree = success(addFeature(original, added, 2));
		tree = success(renameFeature(tree, 'student-hex', 'Grip idea'));
		tree = success(duplicateFeature(tree, 'student-hex'));
		tree = success(reorderFeature(tree, 'student-hex-copy', 1));
		tree = success(suppressFeature(tree, 'student-hex'));
		tree = success(suppressFeature(tree, 'student-hex', false));
		tree = success(deleteFeature(tree, 'student-hex-copy'));

		expect(validateBladeTree(tree)).toEqual([]);
		expect(tree.features.find((feature) => feature.id === 'student-hex')?.name).toBe('Grip idea');
		expect(original).toEqual(DEFAULT_BLADE_TREE);
		expect(original).not.toBe(tree);
	});

	it('derives the body as structural from the validator invariant, while free leaves can go', () => {
		expect(refusal(deleteFeature(DEFAULT_BLADE_TREE, 'body-revolve'), 'structural-feature')).toContain(
			'body'
		);
		expect(refusal(suppressFeature(DEFAULT_BLADE_TREE, 'body-revolve'), 'structural-feature')).toContain(
			'body'
		);
		const withoutMount = success(deleteFeature(DEFAULT_BLADE_TREE, 'blade-mount'));
		expect(withoutMount.features.some((feature) => feature.id === 'blade-mount')).toBe(false);
		expect(validateBladeTree(withoutMount)).toEqual([]);
	});

	it('names dependents instead of cascading a delete or suppression', () => {
		const deleteMessage = refusal(
			deleteFeature(DEFAULT_BLADE_TREE, 'blade-sketch'),
			'dependency-blocked'
		);
		expect(deleteMessage).toContain('blade-extrude');
		const suppressMessage = refusal(
			suppressFeature(DEFAULT_BLADE_TREE, 'blade-pattern'),
			'dependency-blocked'
		);
		expect(suppressMessage).toContain('blade-mount');
		expect(DEFAULT_BLADE_TREE.features).toHaveLength(6);
	});

	it('refuses a reorder across either side of a declared dependency', () => {
		const childBeforeParent = reorderFeature(DEFAULT_BLADE_TREE, 'blade-extrude', 1);
		expect(refusal(childBeforeParent, 'dependency-blocked')).toContain('blade-extrude');
		const parentAfterChild = reorderFeature(DEFAULT_BLADE_TREE, 'blade-sketch', 4);
		expect(refusal(parentAfterChild, 'dependency-blocked')).toContain('blade-extrude');
	});

	it('returns named, readable refusals for malformed requests', () => {
		refusal(deleteFeature(DEFAULT_BLADE_TREE, 'missing'), 'feature-not-found');
		refusal(addFeature(DEFAULT_BLADE_TREE, DEFAULT_BLADE_TREE.features[0]), 'duplicate-id');
		refusal(renameFeature(DEFAULT_BLADE_TREE, 'blade-mount', '   '), 'invalid-name');
		refusal(reorderFeature(DEFAULT_BLADE_TREE, 'blade-mount', 99), 'invalid-position');
	});

	it('keeps every successful result valid through many deterministic random sequences', () => {
		for (let seed = 1; seed <= 80; seed += 1) {
			let state = seed;
			const random = (maximum: number) => {
				state = (state * 1664525 + 1013904223) >>> 0;
				return state % maximum;
			};
			let tree = cloneTree(DEFAULT_BLADE_TREE);
			for (let step = 0; step < 75; step += 1) {
				const before = cloneTree(tree);
				const feature = tree.features[random(tree.features.length)];
				let result: BladeTreeOperationResult;
				switch (random(6)) {
					case 0:
						result = duplicateFeature(tree, feature.id);
						break;
					case 1:
						result = renameFeature(tree, feature.id, `Idea ${seed}-${step}`);
						break;
					case 2:
						result = reorderFeature(tree, feature.id, random(tree.features.length));
						break;
					case 3:
						result = suppressFeature(tree, feature.id, !feature.suppressed);
						break;
					case 4:
						result = deleteFeature(tree, feature.id);
						break;
					default: {
						const id = `free-${seed}-${step}`;
						result = addFeature(
							tree,
							{ id, type: 'hexBoss', acrossFlats: 0.5, height: 0.5 },
							random(tree.features.length + 1)
						);
					}
				}
				expect(tree).toEqual(before);
				if (result.ok) {
					tree = result.tree;
					expect(validateBladeTree(tree), `seed ${seed}, step ${step}`).toEqual([]);
				} else {
					expect(result.message).toMatch(/[.!?]$/);
				}
			}
		}
	});
});
