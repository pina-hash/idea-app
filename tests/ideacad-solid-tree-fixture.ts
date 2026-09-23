// tests/ideacad-solid-tree-fixture.ts
//
// THE DESIGN TREE'S TEST FIXTURE, shared by the pure, the render and the mount
// tests so the three read one document. Not a `.test.ts`, so vitest does not
// collect it.
//
// A HAND-BUILT PROJECTION AND MANIFEST, deliberately: the tree reads exactly
// these two shapes and nothing else, so a kernel is not needed to say what it
// renders. The row SENTENCES come from `naming.ts`, which is what produces
// them in the engine, so an assertion that the tree shows a lost reference is
// an assertion about the real words. The row SUMMARIES come from
// `featureSummary`, the same function the engine's projection calls.
//
// Six rows: an ok sketch, an ok extrude that made a body, a fillet in ERROR
// (lost edge), a push with a WARNING (reattached face), a SUPPRESSED chamfer,
// and an ok reference plane that nothing depends on -- so every status has a
// row, and both a refused and an allowed move and delete exist.
import { featureSummary, dependsOnFeatures } from '../src/lib/ideacad/solid/features';
import { lostReference, reattachedReference } from '../src/lib/ideacad/solid/naming';
import { reduce } from '../src/lib/ideacad/solid/commands';
import { emptyManifest, type BodyProjection, type Feature, type FeatureRow, type ModelProjection, type Selection, type SketchProjection, type SolidCommand, type SolidManifest } from '../src/lib/ideacad/solid/types';
import type { WorkspaceApi } from '../src/lib/ideacad/solid/workspace-api';
import type { TreeExtras } from '../src/lib/ideacad/solid/tree/api';

const END = { body: 'x1#0', name: 'x1.end', hint: { kind: 'plane', center: [2, 1.5, 1] as [number, number, number], normal: [0, 0, 1] as [number, number, number], area: 12 } };
const SIDE = { body: 'x1#0', name: 'x1.side.0', hint: { kind: 'plane', center: [2, 0, 0.5] as [number, number, number], normal: [0, -1, 0] as [number, number, number], area: 4 } };
export const FEATURES: Feature[] = [
	{ id: 's1', name: 'Sketch 1', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [
		{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: 4, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 3 }, { id: 'p3', type: 'point', x: 0, y: 3 },
		{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
	], constraints: [] },
	{ id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' },
	{ id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [{ body: 'x1#0', faces: ['x1.end', 'nowhere'], hint: { curve: 'LINE', mid: [9, 9, 9], length: 1 } }], radius: 0.25 },
	{ id: 'p1', name: 'Push face 1', type: 'push', face: SIDE, value: 0.5 },
	{ id: 'c1', name: 'Chamfer 1', type: 'chamfer', edges: [{ body: 'x1#0', faces: ['x1.end', 'x1.side.0'], hint: { curve: 'LINE', mid: [2, 0, 1], length: 4 } }], distance: 0.1, suppressed: true },
	{ id: 'pl1', name: 'Plane 1', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 2 } }
];
export const ERROR_MESSAGE = lostReference('edge', 'nowhere|x1.end');
export const WARNING_MESSAGE = reattachedReference('face', 'x1.side.0');

export function fixtureManifest(): SolidManifest {
	return { ...emptyManifest(), title: 'Tree fixture', features: structuredClone(FEATURES), bodies: [{ id: 'x1#0', name: 'Body 1', artifact: 'a'.repeat(64), materialId: null, role: 'part' }] };
}
const STATUS: Record<string, { status: FeatureRow['status']; message?: string; bodies: string[] }> = {
	s1: { status: 'ok', bodies: [] }, x1: { status: 'ok', bodies: ['x1#0'] }, f1: { status: 'error', message: ERROR_MESSAGE, bodies: [] },
	p1: { status: 'warning', message: WARNING_MESSAGE, bodies: ['x1#0'] }, c1: { status: 'suppressed', bodies: [] }, pl1: { status: 'ok', bodies: [] }
};
export function fixtureRows(features: readonly Feature[] = FEATURES): FeatureRow[] {
	return features.map((f, index) => ({ id: f.id, index, type: f.type, name: f.name, status: STATUS[f.id].status, message: STATUS[f.id].message, summary: featureSummary(f), bodies: STATUS[f.id].bodies, dependsOn: dependsOnFeatures(f, features), suppressed: !!f.suppressed }));
}
/** The one body, with only the topology the tree reads: face and edge ids. Meshes are not the tree's business. */
function body(): BodyProjection {
	const face = (id: string, normal: [number, number, number]) => ({ id, kind: 'plane', center: [0, 0, 0] as [number, number, number], normal, area: 1, surface: {}, edges: [], positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
	return {
		id: 'x1#0', name: 'Body 1', materialId: null, role: 'part', createdBy: 'x1',
		faces: [face('x1.start', [0, 0, -1]), face('x1.end', [0, 0, 1]), face('x1.side.0', [0, -1, 0]), face('x1.side.1', [1, 0, 0]), face('x1.side.2', [0, 1, 0]), face('x1.side.3', [-1, 0, 0])],
		edges: [{ id: 'edge:x1.end|x1.side.0', curve: 'LINE', points: new Float32Array(), faces: ['x1.end', 'x1.side.0'], length: 4, mid: [2, 0, 1] }],
		vertices: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, bounds: [0, 0, 0, 4, 3, 1], volume: 12, centerOfMass: [2, 1.5, 0.5], inertia: []
	};
}
export function fixtureModel(features: readonly Feature[] = FEATURES): ModelProjection {
	const sketch = features.find((f) => f.id === 's1') as Extract<Feature, { type: 'sketch' }>;
	const sketches: SketchProjection[] = [{ feature: 's1', name: sketch.name, plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] }, planeRef: sketch.plane, entities: sketch.entities, constraints: [], solve: { converged: true, classification: 'underConstrained', dof: 8, maxResidual: 0, trouble: [] }, regions: [], consumed: true }];
	return { bodies: [body()], sketches, references: [{ feature: 'pl1', name: 'Plane 1', kind: 'plane', origin: [0, 0, 2], normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], size: 3 }], features: fixtureRows(features), mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false };
}

/**
 * A WorkspaceApi that records what the tree sends and answers like the
 * engine's reducer would: a refused command throws the reducer's sentence, an
 * accepted one becomes the next manifest. No kernel, no replay -- the rows
 * are the fixture's and do not move, which is all a recording needs.
 */
export interface FakeApi {
	api: WorkspaceApi;
	commands: { command: SolidCommand; label: string }[];
	selects: { selection: Selection | null; append: boolean }[];
	errors: string[];
	edits: (string | null)[];
	tools: string[];
}
export function fakeApi(overrides: Partial<{ canWrite: boolean; busy: boolean; editingSketch: string | null; selections: Selection[]; refuse: boolean; extras: Partial<TreeExtras> }> = {}): FakeApi {
	let manifest = fixtureManifest();
	const model = fixtureModel();
	const record: FakeApi = { api: null as unknown as WorkspaceApi, commands: [], selects: [], errors: [], edits: [], tools: [] };
	let selections: Selection[] = overrides.selections ?? [];
	record.api = {
		get model() { return model; }, get manifest() { return manifest; }, get selections() { return selections; },
		get canWrite() { return overrides.canWrite ?? true; }, get busy() { return overrides.busy ?? false; }, get tool() { return 'select' as const; }, get editingSketch() { return overrides.editingSketch ?? null; },
		async apply(command, label) { record.commands.push({ command, label }); if (overrides.refuse !== false) manifest = reduce(manifest, command); },
		select(selection, append = false) { record.selects.push({ selection, append }); if (!selection) selections = []; else if (append) selections = [...selections, selection]; else selections = [selection]; },
		setTool(tool) { record.tools.push(tool); }, editSketch(id) { record.edits.push(id); }, setSketchPointer() {},
		request: async () => { throw Error('not in the fixture'); }, project: () => ({ x: 0, y: 0 }), error(message) { record.errors.push(message); },
		guide() {}, clearGuides() {}, clip() {}, lookAt() {}, fit() {}, unproject: () => null
	};
	/* The optional members the tree lights controls for (`tree/api.ts`): absent unless a case hands them in. */
	if (overrides.extras) Object.defineProperties(record.api, Object.getOwnPropertyDescriptors(overrides.extras));
	return record;
}
