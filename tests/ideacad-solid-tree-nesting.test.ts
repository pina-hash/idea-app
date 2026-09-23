// tests/ideacad-solid-tree-nesting.test.ts
//
// THE DESIGN TREE'S STRUCTURE, PURE: which row a sketch is drawn under, how a
// node (a feature and its nested sketches) moves, where the rollback bar
// stands, and which row a piece of hovered geometry belongs to.
//
// WHY THIS IS AUTOMATED. Every one of these is invisible when it is wrong: a
// sketch nested under the wrong feature still renders a tidy tree; a node move
// that forgot to carry its sketch is refused with a sentence about a row the
// student cannot see; a rollback index one off grays the wrong row and builds
// the wrong model; a hover link to the wrong feature lights a plausible row.
// Every expected move is checked by REPLAYING it through the real reducer, and
// every refusal is the reducer's own sentence, so a helper answering "refused"
// to everything, or "allowed" to everything, cannot pass.
import { describe, expect, it } from 'vitest';
import { FIRST_IN_TREE, LAST_IN_TREE, consumedSketches, nestRows, nodeMembers, nodeMoveOptions, planNodeMove, rollbackIndexAt, rollbackPosition, rolledBack, rowForSelection, visibleRows, type TreeNode } from '../src/lib/ideacad/solid/tree/rows';
import { reduce } from '../src/lib/ideacad/solid/commands';
import { dependsOnFeatures, featureSummary } from '../src/lib/ideacad/solid/features';
import { emptyManifest, type Feature, type FeatureRow, type PlaneRef, type SolidCommand, type SolidManifest } from '../src/lib/ideacad/solid/types';
import { fixtureManifest, fixtureRows } from './ideacad-solid-tree-fixture';

const sketch = (id: string, name = id, plane: PlaneRef = { kind: 'datum', datum: 'XY' }): Feature => ({ id, name, type: 'sketch', plane, entities: [], constraints: [] });
const extrude = (id: string, sketchId: string, extra: Partial<Feature> = {}): Feature => ({ id, name: id, type: 'extrude', sketch: sketchId, distance: 1, operation: 'new', ...extra } as Feature);
function rowsOf(features: Feature[], statuses: Record<string, FeatureRow['status']> = {}): FeatureRow[] {
	return features.map((f, index) => ({ id: f.id, index, type: f.type, name: f.name, status: statuses[f.id] ?? (f.suppressed ? 'suppressed' : 'ok'), summary: featureSummary(f), bodies: [], dependsOn: dependsOnFeatures(f, features), suppressed: !!f.suppressed }));
}
const manifestOf = (features: Feature[]): SolidManifest => ({ ...emptyManifest(), features: structuredClone(features) });
const shape = (nodes: TreeNode[]) => nodes.map((n) => (n.children.length ? `${n.row.id}[${n.children.map((c) => c.id).join(',')}]` : n.row.id));
/** Every row appears exactly once across the nodes: nesting moves where a row is drawn, never whether. */
function once(nodes: TreeNode[], rows: FeatureRow[]) {
	const drawn = nodes.flatMap((n) => [n.row.id, ...n.children.map((c) => c.id)]);
	expect([...drawn].sort()).toEqual(rows.map((r) => r.id).sort());
}
/** The order a list of move commands produces, through the real reducer. */
const replay = (m: SolidManifest, commands: SolidCommand[]) => commands.reduce((acc, c) => reduce(acc, c), m).features.map((f) => f.id);

describe('a sketch nests under the feature made from it', () => {
	it('puts the fixture sketch under its extrude and leaves every other row at the top, in build order', () => {
		const rows = fixtureRows(), nodes = nestRows(rows, fixtureManifest().features);
		expect(shape(nodes)).toEqual(['x1[s1]', 'f1', 'p1', 'c1', 'pl1']);
		once(nodes, rows);
	});
	it('a sketch nobody consumes stays at the top level', () => {
		const features = [sketch('a'), sketch('b'), extrude('e', 'b')];
		const nodes = nestRows(rowsOf(features), features);
		expect(shape(nodes)).toEqual(['a', 'e[b]']);
	});
	it('a sketch two features consume nests under the FIRST of them, once', () => {
		const features = [sketch('s'), extrude('e1', 's'), extrude('e2', 's', { operation: 'cut', distance: -0.5 })];
		const rows = rowsOf(features), nodes = nestRows(rows, features);
		expect(shape(nodes)).toEqual(['e1[s]', 'e2']);
		once(nodes, rows);
		/* Positive control for the consumer rule: e2 DOES depend on s; it is only nesting that stops at the first. */
		expect(rows[2].dependsOn).toContain('s');
	});
	it('a sweep holds both its profile and its path, in build order', () => {
		const features: Feature[] = [sketch('path'), sketch('profile'), { id: 'sw', name: 'Sweep 1', type: 'sweep', profile: 'profile', path: 'path', operation: 'new' }];
		const nodes = nestRows(rowsOf(features), features);
		expect(shape(nodes)).toEqual(['sw[path,profile]']);
		expect(consumedSketches(features[2])).toEqual(['profile', 'path']);
	});
	it('a sweep along model edges holds only its profile; a loft holds every section', () => {
		expect(consumedSketches({ id: 'sw', name: 'S', type: 'sweep', profile: 'p', path: [], operation: 'new' })).toEqual(['p']);
		const features: Feature[] = [sketch('a'), sketch('b'), sketch('c'), { id: 'lo', name: 'Loft 1', type: 'loft', profiles: ['a', 'c'], operation: 'new' }];
		expect(shape(nestRows(rowsOf(features), features))).toEqual(['b', 'lo[a,c]']);
	});
	it('a suppressed consumer still holds its sketch', () => {
		const features = [sketch('s'), extrude('e', 's', { suppressed: true })];
		const rows = rowsOf(features);
		expect(rows[1].status).toBe('suppressed');
		expect(shape(nestRows(rows, features))).toEqual(['e[s]']);
	});
	it('a consumer naming a sketch that is not there nests nothing and throws nothing', () => {
		const features = [sketch('s'), extrude('e', 'gone')];
		const rows = rowsOf(features);
		/* A hand-built row whose dependsOn names the missing sketch too, which the projection never would. */
		rows[1] = { ...rows[1], dependsOn: ['gone'] };
		expect(shape(nestRows(rows, features))).toEqual(['s', 'e']);
		expect(shape(nestRows(rows))).toEqual(['s', 'e']);
	});
	it('only sketch-consuming types absorb: a plane built on a sketch does not', () => {
		const features: Feature[] = [sketch('s'), { id: 'pl', name: 'Plane 1', type: 'plane', definition: { kind: 'offset', from: { kind: 'reference', feature: 's' }, offset: 1 } }];
		const rows = rowsOf(features);
		expect(rows[1].dependsOn).toEqual(['s']);
		expect(shape(nestRows(rows, features))).toEqual(['s', 'pl']);
		expect(shape(nestRows(rows))).toEqual(['s', 'pl']);
	});
	it('reads what a feature is MADE FROM off the manifest, and falls back to dependsOn without it', () => {
		/* A revolve whose axis is a line in a SECOND sketch: it depends on both, but is made from one. */
		const features: Feature[] = [sketch('axisSketch'), sketch('profile'), { id: 'rv', name: 'Revolve 1', type: 'revolve', sketch: 'profile', angle: 360, axis: { kind: 'sketch', feature: 'axisSketch', axis: 'u' }, operation: 'new' }];
		const rows = rowsOf(features);
		/* Positive control: the revolve really does depend on both, through the engine's own dependency walk. */
		expect([...rows[2].dependsOn].sort()).toEqual(['axisSketch', 'profile']);
		expect(shape(nestRows(rows, features))).toEqual(['axisSketch', 'rv[profile]']);
		expect(shape(nestRows(rows))).toEqual(['rv[axisSketch,profile]']);
	});
	it('the keyboard walks nested rows only when their parent is open', () => {
		const nodes = nestRows(fixtureRows(), fixtureManifest().features);
		expect(visibleRows(nodes, () => false).map((r) => r.id)).toEqual(['x1', 'f1', 'p1', 'c1', 'pl1']);
		expect(visibleRows(nodes, (id) => id === 'x1').map((r) => r.id)).toEqual(['x1', 's1', 'f1', 'p1', 'c1', 'pl1']);
		expect(nodeMembers(nodes[0])).toEqual(['s1', 'x1']);
	});
});

describe('a node moves with its nested sketches, and the reducer decides', () => {
	it('the fixture: the first node names the top of the tree, a refused Down is the reducer\'s sentence, an allowed Up is one step', () => {
		const m = fixtureManifest(), nodes = nestRows(fixtureRows(), m.features);
		const x1 = nodeMoveOptions(m, nodes, 'x1');
		expect(x1.up).toEqual({ commands: null, refusal: FIRST_IN_TREE });
		expect(x1.down.commands).toBeNull();
		expect(x1.down.refusal).toMatch(/Fillet 1 uses Extrude 1, so it cannot move below it/);
		const pl1 = nodeMoveOptions(m, nodes, 'pl1');
		expect(pl1.up).toMatchObject({ commands: [{ type: 'move-feature', id: 'pl1', to: 4 }], refusal: null });
		/* The same move as one edit (ledger 0296 W3): it lands the order the steps land. */
		expect(replay(m, [pl1.up.atomic!])).toEqual(replay(m, pl1.up.commands!));
		expect(pl1.down).toEqual({ commands: null, refusal: LAST_IN_TREE });
	});
	it('carries the sketch when the node moves above a row the sketch was below', () => {
		/* Built: plane, sketch, extrude. Drawn: plane, extrude[sketch]. Moving the extrude up must bring its sketch. */
		const features: Feature[] = [{ id: 'pl', name: 'Plane 1', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 2 } }, sketch('sk', 'Sketch 1'), extrude('ex', 'sk')];
		const m = manifestOf(features), nodes = nestRows(rowsOf(features), features);
		expect(shape(nodes)).toEqual(['pl', 'ex[sk]']);
		const up = nodeMoveOptions(m, nodes, 'ex').up;
		expect(up.refusal).toBeNull();
		expect(up.commands!.every((c) => c.type === 'move-feature' && ['sk', 'ex'].includes(c.id))).toBe(true);
		expect(replay(m, up.commands!)).toEqual(['sk', 'ex', 'pl']);
		/* And the same as a drop of the node before the plane. */
		expect(replay(m, planNodeMove(m, ['sk', 'ex'], ['pl'], 'before').commands!)).toEqual(['sk', 'ex', 'pl']);
		/* Carrying the sketch is ONE edit: one command, one history row, one undo. */
		expect(up.atomic).toEqual({ type: 'move-features', ids: ['sk', 'ex'], to: 0 });
		expect(replay(m, [up.atomic!])).toEqual(['sk', 'ex', 'pl']);
	});
	it('refuses, in the reducer\'s words, when a carried sketch is built on the row it would pass', () => {
		const features: Feature[] = [{ id: 'pl', name: 'Plane 1', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 2 } }, sketch('sk', 'Sketch 1', { kind: 'reference', feature: 'pl' }), extrude('ex', 'sk')];
		const m = manifestOf(features), nodes = nestRows(rowsOf(features), features);
		const up = nodeMoveOptions(m, nodes, 'ex').up;
		expect(up.commands).toBeNull();
		expect(up.refusal).toBe('Sketch 1 uses Plane 1, so it cannot move above it.');
		/* The one-edit form refuses with the same sentence, member by member. */
		expect(() => reduce(m, { type: 'move-features', ids: ['sk', 'ex'], to: 0 })).toThrow('Sketch 1 uses Plane 1, so it cannot move above it.');
	});
	it('moves a node down past another node, moving only its own rows, and leaves the manifest it read alone', () => {
		const features: Feature[] = [sketch('s1'), extrude('e1', 's1'), sketch('s2'), extrude('e2', 's2')];
		const m = manifestOf(features), before = JSON.stringify(m), nodes = nestRows(rowsOf(features), features);
		const down = nodeMoveOptions(m, nodes, 'e1').down;
		expect(down.refusal).toBeNull();
		expect(down.commands!.map((c) => (c as { id: string }).id).every((id) => ['s1', 'e1'].includes(id))).toBe(true);
		expect(replay(m, down.commands!)).toEqual(['s2', 'e2', 's1', 'e1']);
		expect(replay(m, nodeMoveOptions(m, nodes, 'e2').up.commands!)).toEqual(['s2', 'e2', 's1', 'e1']);
		expect(replay(m, [down.atomic!])).toEqual(['s2', 'e2', 's1', 'e1']);
		expect(JSON.stringify(m)).toBe(before);
	});
	it('a drop onto its own place is no step at all', () => {
		const m = fixtureManifest();
		expect(planNodeMove(m, ['pl1'], ['c1'], 'after')).toEqual({ commands: [], refusal: null });
	});
});

describe('the rollback bar', () => {
	const nodes = nestRows(fixtureRows(), fixtureManifest().features);
	it('stands before the first row drawn below it, and at the end builds everything', () => {
		/* Drawn: x1[s1] (build 1 and 0), f1 2, p1 3, c1 4, pl1 5. */
		expect([0, 1, 2, 3, 4, 5, 6].map((p) => rollbackIndexAt(nodes, p))).toEqual([0, 2, 3, 4, 5, null, null]);
		expect(rollbackPosition(nodes, null)).toBe(5);
		expect([0, 2, 3, 4, 5].map((i) => rollbackPosition(nodes, i))).toEqual([0, 1, 2, 3, 4]);
		expect(rollbackPosition(nodes, 6)).toBe(5);
		/* Round trip at every position. */
		for (let p = 0; p <= nodes.length; p++) expect(rollbackPosition(nodes, rollbackIndexAt(nodes, p))).toBe(p);
	});
	it('grays exactly the rows at or after the index, and a nested sketch older than every row above the bar stays built', () => {
		const features: Feature[] = [sketch('sk'), { id: 'pl', name: 'Plane 1', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 2 } }, extrude('ex', 'sk')];
		const rows = rowsOf(features), n = nestRows(rows, features);
		expect(shape(n)).toEqual(['pl', 'ex[sk]']);
		const index = rollbackIndexAt(n, 1);
		expect(index).toBe(2);
		expect(rows.map((r) => rolledBack(r, index))).toEqual([false, false, true]);
		expect(rows.map((r) => rolledBack(r, null))).toEqual([false, false, false]);
		expect(rolledBack(rows[0], rollbackIndexAt(n, 0))).toBe(true);
	});
	it('an empty tree has one position, the end', () => {
		expect(rollbackIndexAt([], 0)).toBeNull();
		expect(rollbackPosition([], null)).toBe(0);
		expect(rollbackPosition([], 0)).toBe(0);
	});
});

describe('hover links: which row made the geometry under the pointer', () => {
	const rows = [{ id: 's1', index: 0 }, { id: 'x1', index: 1 }, { id: 'f1', index: 2 }, { id: 'pl1', index: 3 }];
	it('a face belongs to the feature that created it, ordinals and all', () => {
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, rows)).toBe('x1');
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end~1' }, rows)).toBe('x1');
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'face', id: 'f1.blend.x1.end|x1.side.0' }, rows)).toBe('f1');
	});
	it('an edge or a vertex belongs to the LATEST feature among its faces', () => {
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'edge', id: 'edge:x1.end|x1.side.0' }, rows)).toBe('x1');
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'edge', id: 'edge:f1.blend.x1.end|x1.side.0|x1.start#2' }, rows)).toBe('f1');
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'vertex', id: 'vertex:x1.end|x1.side.0|x1.side.1' }, rows)).toBe('x1');
	});
	it('a face on a copy belongs to the feature that made the copy, not the one it was copied from', () => {
		const withPattern = [...rows, { id: 'pat', index: 4 }];
		expect(rowForSelection({ bodyId: 'pat#2', kind: 'face', id: 'x1.end' }, withPattern)).toBe('pat');
		expect(rowForSelection({ bodyId: 'pat#2', kind: 'edge', id: 'edge:x1.end|x1.side.0' }, withPattern)).toBe('pat');
		/* Control: the same face on the original body is still the extrude's. */
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, withPattern)).toBe('x1');
	});
	it('a body, a sketch, a sketch entity, a reference and a datum', () => {
		expect(rowForSelection({ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, rows)).toBe('x1');
		expect(rowForSelection({ bodyId: '', kind: 'sketch', id: 's1' }, rows)).toBe('s1');
		expect(rowForSelection({ bodyId: 's1', kind: 'sketch-entity', id: 'l0' }, rows)).toBe('s1');
		expect(rowForSelection({ bodyId: '', kind: 'reference', id: 'pl1' }, rows)).toBe('pl1');
		expect(rowForSelection({ bodyId: '', kind: 'reference', id: 'datum:XZ' }, rows)).toBe('datum:XZ');
	});
	it('names nothing it cannot find', () => {
		expect(rowForSelection(null, rows)).toBeNull();
		expect(rowForSelection({ bodyId: 'zz#0', kind: 'face', id: 'zz.end' }, rows)).toBeNull();
		expect(rowForSelection({ bodyId: '', kind: 'feature', id: 'gone' }, rows)).toBeNull();
		expect(rowForSelection({ bodyId: '', kind: 'edge', id: 'edge:zz.a|yy.b' }, rows)).toBeNull();
	});
});
