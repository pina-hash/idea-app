import { describe, expect, it } from 'vitest';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '../src/lib/ideacad/blade/materials';
import { bladePlanform, evaluate, frustumProperties, polygonProperties, repairVoxelEdgeContacts, type SolidMesh } from '../src/lib/ideacad/blade/evaluate';
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

function meshVolume(mesh: SolidMesh) {
	return Math.abs(mesh.faces.reduce((volume6, [a, b, c]) => {
		const va = mesh.vertices[a], vb = mesh.vertices[b], vc = mesh.vertices[c];
		return volume6 + va.x * (vb.y * vc.z - vb.z * vc.y) + va.y * (vb.z * vc.x - vb.x * vc.z) + va.z * (vb.x * vc.y - vb.y * vc.x);
	}, 0) / 6);
}

function analyticVolumeUpperBound(tree: typeof DEFAULT_BLADE_TREE, collarExposed = true) {
	const body = tree.features.find((feature) => feature.type === 'revolve')!;
	const hex = tree.features.find((feature) => feature.type === 'hexBoss')!;
	const sketch = tree.features.find((feature) => feature.type === 'bladeSketch')!;
	const pattern = tree.features.find((feature) => feature.type === 'circularPattern')!;
	if (body.type !== 'revolve' || hex.type !== 'hexBoss' || sketch.type !== 'bladeSketch' || pattern.type !== 'circularPattern') throw new Error('bad fixture');
	let volume = 0;
	for (let i = 1; i < body.stations.length; i++) {
		const a = body.stations[i - 1], b = body.stations[i];
		volume += frustumProperties(a.r, b.r, b.z - a.z, 1).volume;
	}
	const hexSide = hex.acrossFlats / Math.sqrt(3);
	if (collarExposed) {
		volume += 3 * Math.sqrt(3) * hexSide ** 2 * hex.height / 2;
		const collarHeight = Math.max(0.125, Math.min(0.5, body.stations.at(-1)!.z * 0.1));
		volume += Math.PI * (hex.acrossFlats / Math.sqrt(3) + 0.5) ** 2 * collarHeight;
	}
	if (tree.spinBolt !== false) volume += Math.PI * Math.min(0.125, body.stations[0].r) ** 2 * Math.min(0.25, body.stations.at(-1)!.z * 0.08);
	const polygon = bladePlanform(sketch.rootWidth, sketch.tipWidth, sketch.length, sketch.sweepDeg, sketch.mountRadius);
	volume += polygonProperties(polygon).area * DEFAULT_BLADE_CONFIG.stock[0].thicknessIn * pattern.count;
	return volume;
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
	it('sweeps a smooth body whose adjacent circumferential normals turn by less than 4 degrees', () => {
		const solid = evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG).geometry.solid;
		const normals = solid.faces.slice(0, 192).filter((_, index) => index % 2 === 0).map(([a, b, c]) => {
			const A = solid.vertices[a], B = solid.vertices[b], C = solid.vertices[c];
			const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
			const v = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
			const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
			const length = Math.hypot(n.x, n.y, n.z);
			return { x: n.x / length, y: n.y / length, z: n.z / length };
		});
		const greatestTurn = Math.max(...normals.map((normal, i) => {
			const next = normals[(i + 1) % normals.length];
			return Math.acos(Math.min(1, Math.max(-1, normal.x * next.x + normal.y * next.y + normal.z * next.z))) * 180 / Math.PI;
		}));
		expect(greatestTurn).toBeLessThan(4);
	});
	it('closes only a diagonal edge contact, not an ordinary surface staircase', () => {
		const contact = new Set(['2,1,2', '1,2,2']);
		expect(repairVoxelEdgeContacts(contact, 4, 4, 4)).toEqual([2]);
		expect(contact).toEqual(new Set(['2,1,2', '1,2,2', '1,1,2', '2,2,2']));

		const staircase = new Set(['2,1,2', '1,2,2', '2,2,2']);
		expect(repairVoxelEdgeContacts(staircase, 4, 4, 4)).toEqual([]);
		expect(staircase.size).toBe(3);
	});
	it('raises when edge-contact additions grow instead of converging', () => {
		const diverging = new Set(['1,3,4', '2,4,5', '2,5,4']);
		expect(() => repairVoxelEdgeContacts(diverging, 6, 6, 6)).toThrow(
			'Voxel edge-contact repair diverged: pass 2 would add 2 cells after 1.'
		);
	});
	it('keeps analytic volume within its analytic upper bound across the tree spread', () => {
		for (const stationCount of [3, 4, 6, 8]) for (const bladeCount of [2, 3, 4, 5, 6, 7, 8]) for (const spinBolt of [false, true]) for (const collarExposed of [false, true]) {
			const tree = cloneTree(DEFAULT_BLADE_TREE);
			const body = tree.features.find((feature) => feature.type === 'revolve')!;
			const hex = tree.features.find((feature) => feature.type === 'hexBoss')!;
			const pattern = tree.features.find((feature) => feature.type === 'circularPattern')!;
			if (body.type !== 'revolve' || hex.type !== 'hexBoss' || pattern.type !== 'circularPattern') throw new Error('bad fixture');
			body.stations = Array.from({length:stationCount}, (_,i) => ({ r: 0.2 + 1.45 * Math.sin(Math.PI * i / (stationCount - 1)), z: 0.125 + 2.75 * i / (stationCount - 1) }));
			pattern.count = bladeCount;
			tree.spinBolt = spinBolt;
			hex.suppressed = !collarExposed;
			const solid = evaluate(tree, DEFAULT_BLADE_CONFIG).geometry.solid;
			const upper = analyticVolumeUpperBound(tree, collarExposed);
			expect(meshVolume(solid), `${stationCount} stations, ${bladeCount} blades, spin ${spinBolt}, collar ${collarExposed}`).toBeLessThanOrEqual(upper * 1.04);
			expectWatertight(solid);
		}
	});
	it('repairs the zero-width edge contact produced by a corpus-shaped tree', () => {
		const tree = cloneTree(DEFAULT_BLADE_TREE);
		const body = tree.features.find((feature) => feature.type === 'revolve')!;
		const hex = tree.features.find((feature) => feature.type === 'hexBoss')!;
		const pattern = tree.features.find((feature) => feature.type === 'circularPattern')!;
		if (body.type !== 'revolve' || hex.type !== 'hexBoss' || pattern.type !== 'circularPattern') throw new Error('bad fixture');
		body.stations = Array.from({length:3}, (_,i) => ({ r: 0.2 + 1.45 * Math.sin(Math.PI * i / 2), z: 0.125 + 2.75 * i / 2 }));
		pattern.count = 3;
		tree.spinBolt = false;
		hex.suppressed = true;
		const solid = evaluate(tree, DEFAULT_BLADE_CONFIG).geometry.solid;
		expect(solid.voxel).toBeUndefined();
		expectWatertight(solid);
	});
	it('holds the default model to its independently calculated 20.317 in³ bound', () => {
		const solid = evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG).geometry.solid;
		expect(meshVolume(solid)).toBeLessThanOrEqual(analyticVolumeUpperBound(DEFAULT_BLADE_TREE) * 1.000001);
		expect(solid.faces.length).toBeLessThan(2_000);
		expect(solid.voxel).toBeUndefined();
		expectWatertight(solid);
	});
	it('generates the heaviest analytic mesh below 3,000 triangles without grid work', () => {
		const tree = cloneTree(DEFAULT_BLADE_TREE);
		const body = tree.features.find((feature) => feature.type === 'revolve')!;
		const pattern = tree.features.find((feature) => feature.type === 'circularPattern')!;
		if (body.type !== 'revolve' || pattern.type !== 'circularPattern') throw new Error('bad fixture');
		body.stations = Array.from({ length: 8 }, (_, i) => ({ r: 0.2 + 1.45 * Math.sin(Math.PI * i / 7), z: 0.125 + 2.75 * i / 7 }));
		pattern.count = 8;
		const started = performance.now();
		const solid = evaluate(tree, DEFAULT_BLADE_CONFIG).geometry.solid;
		expect(solid.faces.length).toBeLessThan(3_000);
		expect(performance.now() - started).toBeLessThan(50);
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
