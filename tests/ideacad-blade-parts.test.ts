import { describe, expect, it } from 'vitest';
import { DEFAULT_BLADE_CONFIG } from '../src/lib/ideacad/blade/materials';
import { evaluate } from '../src/lib/ideacad/blade/evaluate';
import {
	addPart,
	deletePart,
	duplicatePart,
	movePart,
	reorderPart,
	rotatePart,
	type BladePartOperationResult
} from '../src/lib/ideacad/blade/ops';
import {
	upgradeBladeParts,
	validatePartCollection,
	type BladePartDefinition,
	type BladePartsTree
} from '../src/lib/ideacad/blade/parts';
import type { BladeTree } from '../src/lib/ideacad/blade/tree';
import { validateBladeTree } from '../src/lib/ideacad/blade/validate';

// Hand-written pre-0255 fixture: intentionally has no `parts` property.
const LEGACY_TREE: BladeTree = {
	schema: 1,
	editor: 'blade',
	units: 'in',
	rotation: 'cw',
	materials: { body: 'pla', bodySolidFraction: 0.42, bladeStock: 'steel-0125' },
	features: [
		{ id: 'body-revolve', type: 'revolve', stations: [{ r: 0.7, z: 0.125 }, { r: 0.7, z: 1.4 }, { r: 0.55, z: 2.5 }] },
		{ id: 'hex-boss', type: 'hexBoss', acrossFlats: 0.5, height: 0.5 },
		{ id: 'blade-sketch', type: 'bladeSketch', rootWidth: 0.45, tipWidth: 0.3, length: 0.65, sweepDeg: 18, mountRadius: 1.45 },
		{ id: 'blade-extrude', type: 'extrude', sketch: 'blade-sketch', thickness: 'stock' },
		{ id: 'blade-pattern', type: 'circularPattern', feature: 'blade-extrude', count: 4 },
		{ id: 'blade-mount', type: 'mount', feature: 'blade-pattern', z: 1.6 }
	]
};

function success(result: BladePartOperationResult): BladePartsTree {
	expect(result.ok, result.ok ? undefined : result.message).toBe(true);
	if (!result.ok) throw new Error(result.message);
	return result.tree;
}

function blade(id: string): BladePartDefinition {
	return {
		id,
		name: id,
		kind: 'blade',
		z: 2,
		angleDeg: 30,
		parameters: { rootWidth: 0.4, tipWidth: 0.25, length: 0.6, sweepDeg: -12, mountRadius: 1.4, count: 3, stock: 'steel-0125' }
	};
}

describe('IdeaCAD free part collection', () => {
	it('upgrades a fixed-feature document without changing its evaluation or stored feature data', () => {
		const before = structuredClone(LEGACY_TREE);
		const expected = evaluate(LEGACY_TREE, DEFAULT_BLADE_CONFIG);
		const upgraded = upgradeBladeParts(LEGACY_TREE);

		expect(evaluate(upgraded, DEFAULT_BLADE_CONFIG)).toEqual(expected);
		expect(upgraded.features).toEqual(before.features);
		expect(upgraded.parts.map((part) => part.kind)).toEqual(['body', 'blade']);
		expect(upgraded.parts[1]).toMatchObject({ z: 1.6, angleDeg: 0 });
		expect(LEGACY_TREE).toEqual(before);
	});

	it('supports multiple independently placed blade rows and body sections', () => {
		let tree = upgradeBladeParts(LEGACY_TREE);
		tree = success(addPart(tree, blade('upper-row')));
		tree = success(duplicatePart(tree, 'body-revolve'));
		tree = success(movePart(tree, 'upper-row', 2.35));
		tree = success(rotatePart(tree, 'upper-row', 45));
		tree = success(reorderPart(tree, 'upper-row', 0));

		expect(tree.parts.filter((part) => part.kind === 'blade')).toHaveLength(2);
		expect(tree.parts.filter((part) => part.kind === 'body')).toHaveLength(2);
		expect(tree.parts[0]).toMatchObject({ id: 'upper-row', z: 2.35, angleDeg: 45 });
		expect(validatePartCollection(tree)).toEqual([]);
		expect(validateBladeTree(tree)).toEqual([]);
	});

	it('refuses only deletion of the last structurally required body', () => {
		const tree = upgradeBladeParts(LEGACY_TREE);
		const bladeGone = success(deletePart(tree, 'blade-pattern'));
		expect(bladeGone.parts.every((part) => part.kind === 'body')).toBe(true);
		const refusal = deletePart(bladeGone, 'body-revolve');
		expect(refusal).toMatchObject({ ok: false, code: 'structural-part' });
		if (!refusal.ok) expect(refusal.message).toMatch(/[.!?]$/);
	});

	it('keeps valid trees valid through many deterministic random operation sequences', () => {
		for (let seed = 1; seed <= 100; seed += 1) {
			let state = seed;
			const random = (max: number) => ((state = (state * 1664525 + 1013904223) >>> 0) % max);
			let tree = upgradeBladeParts(LEGACY_TREE);
			for (let step = 0; step < 100; step += 1) {
				const before = structuredClone(tree);
				const part = tree.parts[random(tree.parts.length)];
				let result: BladePartOperationResult;
				switch (random(6)) {
					case 0: result = addPart(tree, blade(`row-${seed}-${step}`), random(tree.parts.length + 1)); break;
					case 1: result = duplicatePart(tree, part.id); break;
					case 2: result = deletePart(tree, part.id); break;
					case 3: result = reorderPart(tree, part.id, random(tree.parts.length)); break;
					case 4: result = movePart(tree, part.id, random(500) / 100 - 1); break;
					default: result = rotatePart(tree, part.id, random(1440) / 2 - 360);
				}
				expect(tree).toEqual(before);
				if (result.ok) {
					tree = result.tree;
					expect(validatePartCollection(tree), `parts seed ${seed}, step ${step}`).toEqual([]);
					expect(validateBladeTree(tree), `features seed ${seed}, step ${step}`).toEqual([]);
				} else expect(result.message).toMatch(/[.!?]$/);
			}
		}
	});
});
