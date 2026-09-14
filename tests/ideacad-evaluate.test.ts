import { describe, expect, it } from 'vitest';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '../src/lib/ideacad/blade/materials';
import { evaluate, frustumProperties, polygonProperties, type SolidMesh } from '../src/lib/ideacad/blade/evaluate';
import { cloneTree } from '../src/lib/ideacad/blade/tree';
import { validateBladeTree } from '../src/lib/ideacad/blade/validate';

function expectWatertight(mesh: SolidMesh) {
	const edges = new Map<string, number>();
	let volume6 = 0;
	for (const [a, b, c] of mesh.faces) {
		const va = mesh.vertices[a], vb = mesh.vertices[b], vc = mesh.vertices[c];
		volume6 += va.x * (vb.y * vc.z - vb.z * vc.y) + va.y * (vb.z * vc.x - vb.x * vc.z) + va.z * (vb.x * vc.y - vb.y * vc.x);
		for (const [u, v] of [[a,b], [b,c], [c,a]]) {
			const key = u < v ? `${u}:${v}` : `${v}:${u}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		}
	}
	expect(mesh.faces.length).toBeGreaterThan(0);
	expect([...edges.values()].filter((uses) => uses !== 2)).toEqual([]);
	expect(volume6).toBeGreaterThan(0);
}

describe('IdeaCAD evaluation', () => {
	it('uses the closed-form cylinder mass and inertia', () => {
		const x = frustumProperties(2 * 2.54, 2 * 2.54, 2.54, 1.24);
		expect(x.mass).toBeCloseTo(Math.PI * 5.08 ** 2 * 2.54 * 1.24, 8);
		expect(x.inertia).toBeCloseTo(0.5 * x.mass * 5.08 ** 2, 8);
	});
	it('computes polygon polar moment about the origin', () => {
		const p = polygonProperties([{x:0,y:-1},{x:4,y:-1},{x:4,y:1},{x:0,y:1}]);
		expect(p.area).toBe(8);
		expect(p.polar).toBeCloseTo(8 * (4 ** 2 + 2 ** 2) / 12 + 8 * 2 ** 2, 8);
	});
	it('starts with a legal default concept', () => {
		expect(evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG).rules.every((rule) => rule.pass)).toBe(true);
	});
	it('emits an outward, watertight union across station and blade-count extremes', () => {
		for (const stationCount of [3, 4, 6, 8]) for (const bladeCount of [2, 3, 5, 8]) {
			const tree = cloneTree(DEFAULT_BLADE_TREE);
			const body = tree.features.find((feature) => feature.type === 'revolve')!;
			const pattern = tree.features.find((feature) => feature.type === 'circularPattern')!;
			if (body.type !== 'revolve' || pattern.type !== 'circularPattern') throw new Error('bad fixture');
			body.stations = Array.from({length:stationCount}, (_,i) => ({ r: 0.2 + 1.45 * Math.sin(Math.PI * i / (stationCount - 1)), z: 0.125 + 2.75 * i / (stationCount - 1) }));
			pattern.count = bladeCount;
			expectWatertight(evaluate(tree, DEFAULT_BLADE_CONFIG).geometry.solid);
		}
	});
	it('adds an adaptive collar and defaults old documents to a spin bolt', () => {
		const oldTree = cloneTree(DEFAULT_BLADE_TREE);
		const short = evaluate(oldTree, DEFAULT_BLADE_CONFIG);
		const body = oldTree.features.find((feature) => feature.type === 'revolve')!;
		if (body.type !== 'revolve') throw new Error('bad fixture');
		body.stations.at(-1)!.z = 4;
		const tall = evaluate(oldTree, DEFAULT_BLADE_CONFIG);
		expect(short.geometry.collar.outerRadius - short.geometry.hexAcrossFlats / Math.sqrt(3)).toBeCloseTo(0.5);
		expect(tall.geometry.collar.height).toBeGreaterThan(short.geometry.collar.height);
		expect(short.geometry.spinBolt.present).toBe(true);
	});
	it('allows the optional spin bolt to be removed without invalidating the tree', () => {
		const tree = cloneTree(DEFAULT_BLADE_TREE);
		tree.spinBolt = false;
		expect(validateBladeTree(tree, DEFAULT_BLADE_CONFIG)).toEqual([]);
		expect(evaluate(tree, DEFAULT_BLADE_CONFIG).geometry.spinBolt.present).toBe(false);
	});
	it('enforces only the real hex-extension minimum', () => {
		const tree = cloneTree(DEFAULT_BLADE_TREE);
		const hex = tree.features.find((feature) => feature.type === 'hexBoss')!;
		if (hex.type !== 'hexBoss') throw new Error('bad fixture');
		hex.height = 0.49;
		expect(validateBladeTree(tree, DEFAULT_BLADE_CONFIG)).toContainEqual(expect.objectContaining({ parameter:'height', message:'Extend the hex core at least 0.5 inches; there is no maximum extension.' }));
		hex.height = 12;
		expect(validateBladeTree(tree, DEFAULT_BLADE_CONFIG)).toEqual([]);
		expect(evaluate(tree, DEFAULT_BLADE_CONFIG).rules.find((rule) => rule.id === 'hex-extension')).toMatchObject({ pass:true, limit:'≥ 0.5 in (no maximum)' });
	});
});
