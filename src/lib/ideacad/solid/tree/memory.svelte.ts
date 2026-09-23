/**
 * AN IN-MEMORY WORKSPACE FOR THE DESIGN TREE'S HARNESS (`/dev/ideacad-tree`).
 * It answers every `apply` with the REAL reducer (`commands.ts`) and derives
 * the rows the way the engine's projection does (`featureSummary`,
 * `dependsOnFeatures`), with no kernel: the tree reads the feature list and
 * nothing else, so a motor bracket's worth of rows can be driven at every
 * width with no worker and no WebGL. It also carries every OPTIONAL member the
 * tree lights a control for (`tree/api.ts`) -- hover both ways and the
 * rollback bar -- so each can be seen working before the workspace grows it.
 *
 * Dev only: the one route that imports it is 404 in production.
 */
import { reduce } from '../commands';
import { dependsOnFeatures, featureSummary } from '../features';
import { datumPlane } from '../sketch/model';
import { emptyManifest, type Feature, type FeatureRow, type FeatureStatus, type ModelProjection, type Selection, type SketchProjection, type SolidCommand, type SolidManifest } from '../types';
import type { TreeApi, TreeExtras } from './api';

const pts = (id: string, x0: number, y0: number, x1: number, y1: number) => [
	{ id: `${id}p0`, type: 'point' as const, x: x0, y: y0 }, { id: `${id}p1`, type: 'point' as const, x: x1, y: y0 }, { id: `${id}p2`, type: 'point' as const, x: x1, y: y1 }, { id: `${id}p3`, type: 'point' as const, x: x0, y: y1 },
	{ id: `${id}l0`, type: 'line' as const, a: `${id}p0`, b: `${id}p1` }, { id: `${id}l1`, type: 'line' as const, a: `${id}p1`, b: `${id}p2` }, { id: `${id}l2`, type: 'line' as const, a: `${id}p2`, b: `${id}p3` }, { id: `${id}l3`, type: 'line' as const, a: `${id}p3`, b: `${id}p0` }
];
const edge = (faces: [string, string]) => ({ body: 'base#0', faces, hint: { curve: 'LINE', mid: [0, 0, 0] as [number, number, number], length: 1 } });
/** A motor bracket, built the way a student builds one: a plate, an upright, a fillet in the corner, a bolt pattern, a sweep for a cable guide, and one broken and one held-back feature so every row state is on screen. */
export const BRACKET: Feature[] = [
	{ id: 'sk1', name: 'Sketch 1', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: pts('a', 0, 0, 4, 3), constraints: [] },
	{ id: 'base', name: 'Base plate', type: 'extrude', sketch: 'sk1', distance: 0.25, operation: 'new' },
	{ id: 'sk2', name: 'Sketch 2', type: 'sketch', plane: { kind: 'datum', datum: 'XZ' }, entities: pts('b', 0, 0, 4, 2), constraints: [] },
	{ id: 'up', name: 'Upright', type: 'extrude', sketch: 'sk2', distance: 0.25, operation: 'add', target: 'base#0' },
	{ id: 'fil', name: 'Fillet 1', type: 'fillet', edges: [edge(['base.end', 'up.side.0'])], radius: 0.125 },
	{ id: 'sk3', name: 'Sketch 3', type: 'sketch', plane: { kind: 'datum', datum: 'XY', offset: 0.25 }, entities: [{ id: 'c', type: 'point', x: 1, y: 1 }, { id: 'k', type: 'circle', center: 'c', radius: 0.1 }], constraints: [] },
	{ id: 'holes', name: 'Bolt holes', type: 'extrude', sketch: 'sk3', distance: -0.25, operation: 'cut', target: 'base#0' },
	{ id: 'pat', name: 'Bolt pattern', type: 'pattern', body: 'base#0', mode: 'linear', axis: { kind: 'datum', axis: 'X' }, spacing: 1.5, count: 2 },
	{ id: 'pl1', name: 'Plane 1', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'YZ' }, offset: 2 } },
	{ id: 'path', name: 'Guide path', type: 'sketch', plane: { kind: 'reference', feature: 'pl1' }, entities: [{ id: 'q0', type: 'point', x: 0, y: 0 }, { id: 'q1', type: 'point', x: 2, y: 1 }, { id: 'ql', type: 'line', a: 'q0', b: 'q1' }], constraints: [] },
	{ id: 'prof', name: 'Guide profile', type: 'sketch', plane: { kind: 'datum', datum: 'XZ' }, entities: [{ id: 'r', type: 'point', x: 0, y: 0 }, { id: 'rk', type: 'circle', center: 'r', radius: 0.08 }], constraints: [] },
	{ id: 'sw', name: 'Cable guide', type: 'sweep', profile: 'prof', path: 'path', operation: 'new' },
	{ id: 'ch', name: 'Chamfer 1', type: 'chamfer', edges: [edge(['base.start', 'base.side.1'])], distance: 0.05, suppressed: true },
	{ id: 'fil2', name: 'Fillet 2', type: 'fillet', edges: [edge(['up.end', 'gone.face'])], radius: 0.5 }
];
const STATES: Record<string, { status: FeatureStatus; message?: string }> = {
	fil2: { status: 'error', message: 'Fillet 2 lost an edge it was built on. Pick the edge again or delete this fillet.' },
	ch: { status: 'suppressed' }
};
function rowsFor(features: readonly Feature[]): FeatureRow[] {
	return features.map((f, index) => {
		const state = f.suppressed ? { status: 'suppressed' as const } : (STATES[f.id] ?? { status: 'ok' as const });
		const bodies = 'operation' in f && f.operation === 'new' ? [`${f.id}#0`] : [];
		return { id: f.id, index, type: f.type, name: f.name, status: state.status, message: state.message, summary: featureSummary(f), bodies, dependsOn: dependsOnFeatures(f, features), suppressed: !!f.suppressed };
	});
}
function sketchesFor(features: readonly Feature[]): SketchProjection[] {
	return features.flatMap((f) => (f.type === 'sketch' ? [{ feature: f.id, name: f.name, plane: datumPlane(f.plane.kind === 'datum' ? f.plane.datum : 'XY'), planeRef: f.plane, entities: f.entities, constraints: f.constraints, solve: { converged: true, classification: 'underConstrained', dof: 0, maxResidual: 0, trouble: [] }, regions: [], consumed: features.some((x) => dependsOnFeatures(x, features).includes(f.id)) } as SketchProjection] : []));
}
export interface MemoryTree {
	api: TreeApi;
	readonly log: string[];
	readonly error: string;
	readonly hovered: Selection[] | null;
	/** Pretend the viewport pointer is over this geometry, as the workspace's hover would say. */
	pointAt(selection: Selection | null): void;
}
export function createMemoryTreeApi(features: readonly Feature[] = BRACKET, options: { canWrite?: boolean; extras?: boolean } = {}): MemoryTree {
	let manifest = $state.raw<SolidManifest>({ ...emptyManifest(), title: 'Motor bracket', features: structuredClone([...features]) });
	let selections = $state.raw<Selection[]>([]);
	let editingSketch = $state<string | null>(null);
	let rollbackIndex = $state<number | null>(null);
	let error = $state('');
	let hovered = $state.raw<Selection[] | null>(null);
	let log = $state.raw<string[]>([]);
	const note = (line: string) => { log = [...log.slice(-7), line]; };
	const listeners = new Set<(s: Selection | null) => void>();
	const model = $derived<ModelProjection>({ bodies: [], sketches: sketchesFor(manifest.features), references: [], features: rowsFor(manifest.features), mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false });
	const extras: TreeExtras = options.extras === false ? {} : {
		hover(s) { hovered = s; },
		onHover(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		rollback(index) { rollbackIndex = index; note(`rollback ${index === null ? 'end' : index}`); },
		get rollbackIndex() { return rollbackIndex; }
	};
	const api: TreeApi = {
		get model() { return model; }, get manifest() { return manifest; }, get selections() { return selections; },
		get canWrite() { return options.canWrite ?? true; }, get busy() { return false; }, get tool() { return 'select' as const; }, get editingSketch() { return editingSketch; },
		async apply(command: SolidCommand, label: string) {
			try { manifest = reduce(manifest, command); error = ''; note(`${label}: ${command.type}${'id' in command ? ` ${command.id}` : ''}${'to' in command ? ` to ${command.to}` : ''}`); }
			catch (e) { error = e instanceof Error ? e.message : String(e); }
		},
		select(selection: Selection | null, append = false) {
			if (!selection) selections = [];
			else if (append) selections = [...selections, selection];
			else selections = [selection];
		},
		setTool() {}, editSketch(id: string | null) { editingSketch = id; note(`edit sketch ${id ?? 'closed'}`); if (id) selections = [{ bodyId: '', kind: 'sketch', id }]; }, setSketchPointer() {},
		request: async () => { throw Error('Not in the tree harness.'); }, project: () => ({ x: 0, y: 0 }), error(message: string) { error = message; },
		guide() {}, clearGuides() {}, clip() {}, lookAt() {}, fit() {}, unproject: () => null
	};
	Object.defineProperties(api, Object.getOwnPropertyDescriptors(extras));
	return {
		api,
		get log() { return log; }, get error() { return error; }, get hovered() { return hovered; },
		pointAt(selection) { for (const l of [...listeners]) l(selection); }
	};
}
