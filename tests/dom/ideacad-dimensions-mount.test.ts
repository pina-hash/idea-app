// tests/dom/ideacad-dimensions-mount.test.ts
//
// THE DIMENSION PANEL, MOUNTED against a stand-in `WorkspaceApi` that records
// what the panel asks the workspace to do. The pure layer is proven in
// `tests/ideacad-solid-dimensions-*.test.ts`; what is here is the half that
// only exists once the component is wired:
//
//   * an input per driving dimension, seeded with the stored value, and Enter
//     applying `{type:'set-feature', id, patch}` with the label "Set <label>";
//   * a refusal rendered where the student was working: text that is not a
//     number goes to `api.error` as a sentence and NOTHING is applied;
//   * a read-only document has NO input and still shows every number;
//   * the open sketch's constraints replace the feature's parameters, and a
//     conflicting one is marked with a word;
//   * measured values carry the word "measured" and no input;
//   * NO INPUT CARRIES min, max OR step -- the kernel's answer is the only
//     refusal of a value, and a browser attribute would pre-empt it.
//
// BOTH DIRECTIONS ON EVERY GATING CLAIM: each absence is counted beside the
// same fixture with the gate open. NO GEOMETRY, CONTRAST OR TAP TARGET HERE;
// happy-dom has no layout engine (`tests/dom/README.md`). The 44px inputs are
// measured against a real Chromium in the surface's browser drive.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import DimensionPanel from '$lib/ideacad/solid/DimensionPanel.svelte';
import DimensionOverlay from '$lib/ideacad/solid/DimensionOverlay.svelte';
import { defaultPreferences, type SolidPreferences } from '$lib/ideacad/solid/preferences';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { emptyManifest, type ModelProjection, type Selection, type SolidCommand, type SolidManifest } from '$lib/ideacad/solid/types';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = DimensionPanel as unknown as Component<Record<string, unknown>>;
const Overlay = DimensionOverlay as unknown as Component<Record<string, unknown>>;

const SKETCH = { id: 's1', name: 'Sketch 1', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [
		{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: 4, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 3 }, { id: 'p3', type: 'point', x: 0, y: 3 },
		{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
	], constraints: [{ id: 'kh', type: 'horizontal', line: 'l0' }, { id: 'kw', type: 'distance', a: 'p0', b: 'p1', value: 4 }, { id: 'kv', type: 'distance', a: 'p1', b: 'p2', value: 3 }] } as const satisfies SolidManifest['features'][number];
const EMPTY: ModelProjection = { bodies: [], sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 };
const manifest = (): SolidManifest => ({ ...emptyManifest(), features: [
	{ ...SKETCH, entities: [...SKETCH.entities], constraints: [...SKETCH.constraints] },
	{ id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' },
	{ id: 'b1', name: 'Combine 1', type: 'boolean', operation: 'union', bodies: ['x1#0', 'x2#0'] }
] });
const model = (over: Partial<ModelProjection> = {}): ModelProjection => ({ ...EMPTY,
	bodies: [{ id: 'x1#0', name: 'Body', materialId: null, role: 'part', createdBy: 'x1', volume: 12, bounds: [0, 0, 0, 4, 3, 1], centerOfMass: [2, 1.5, 0.5], inertia: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() },
		faces: [{ id: 'x1.end', kind: 'plane', center: [2, 1.5, 1], normal: [0, 0, 1], area: 12, surface: {}, edges: [], positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }],
		edges: [{ id: 'edge:x1.end|x1.side.0', curve: 'line', points: new Float32Array(), faces: ['x1.end', 'x1.side.0'], length: 4, mid: [2, 0, 1] }], vertices: [] }],
	sketches: [{ feature: 's1', name: 'Sketch 1', plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] }, planeRef: { kind: 'datum', datum: 'XY' }, entities: [...SKETCH.entities], constraints: [...SKETCH.constraints],
		solve: { converged: true, classification: 'solved', dof: 0, maxResidual: 0, trouble: [] }, regions: [{ id: 'r0', outline: [], holes: [], area: 12 }], consumed: true }],
	features: [
		{ id: 's1', index: 0, type: 'sketch', name: 'Sketch 1', status: 'ok', summary: '4 entities', bodies: [], dependsOn: [], suppressed: false },
		{ id: 'x1', index: 1, type: 'extrude', name: 'Extrude 1', status: 'ok', summary: '1 in', bodies: ['x1#0'], dependsOn: ['s1'], suppressed: false },
		{ id: 'b1', index: 2, type: 'boolean', name: 'Combine 1', status: 'ok', summary: 'union', bodies: [], dependsOn: ['x1'], suppressed: false }
	], ...over });

type HarnessState = { selections: Selection[]; canWrite: boolean; busy: boolean; editingSketch: string | null; model: ModelProjection; manifest: SolidManifest; prefs: SolidPreferences | undefined };
interface Harness { api: WorkspaceApi; applied: { command: SolidCommand; label: string }[]; errors: string[]; set(over: Partial<HarnessState>): void }
/** A WorkspaceApi that records: what the panel applied, with what label, and what it refused. */
function harness(initial: Partial<HarnessState> = {}): Harness {
	const state = reactiveProps({ selections: [] as Selection[], canWrite: true, busy: false, editingSketch: null as string | null, model: model(), manifest: manifest(), prefs: undefined as SolidPreferences | undefined, ...initial });
	const applied: Harness['applied'] = [], errors: string[] = [];
	const api: WorkspaceApi = {
		get model() { return state.model; }, get manifest() { return state.manifest; }, get selections() { return state.selections; }, get canWrite() { return state.canWrite; }, get busy() { return state.busy; }, get tool() { return 'select' as const; }, get editingSketch() { return state.editingSketch; }, get prefs() { return state.prefs; },
		apply: async (command, label) => { applied.push({ command, label }); }, select: () => {}, setTool: () => {}, editSketch: () => {}, setSketchPointer: () => {},
		request: async () => { throw Error('not in this test'); }, project: () => ({ x: 0, y: 0 }), error: (m) => { errors.push(m); }, guide: () => {}, clearGuides: () => {}, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	};
	return { api, applied, errors, set: (over) => Object.assign(state, over) };
}
const mounted: Mounted[] = [];
function mountPanel(h: Harness) { const m = mountInto(Panel, { api: h.api }); mounted.push(m); return m; }
afterEach(async () => { for (const m of mounted) await m.stop(); mounted.length = 0; });
const submit = (m: Mounted, key: string, text: string) => {
	const li = m.one<HTMLElement>(`li[data-dimension="${key}"]`), input = li.querySelector('input')!, form = li.querySelector('form')!;
	input.value = text; input.dispatchEvent(new Event('input', { bubbles: true }));
	form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	m.flush();
};

describe('the dimension panel', () => {
	it('renders nothing with nothing selected, and the extrude\'s distance once the extrude is selected', () => {
		const h = harness(); const m = mountPanel(h);
		expect(m.all('section')).toHaveLength(0);
		h.set({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }] }); m.flush();
		expect(m.all('[data-testid="ideacad-dimension-panel"]')).toHaveLength(1);
		const inputs = m.all<HTMLInputElement>('input');
		expect(inputs).toHaveLength(1);
		expect(inputs[0].value).toBe('1');
		expect(m.one('h2').textContent).toContain('Extrude 1');
		expect(m.one('label').textContent).toContain('Distance');
		expect(m.one('.unit').textContent).toBe('in');
	});
	it('Enter applies set-feature with the parsed value and the label "Set Distance", and 25.4mm is stored as 1 inch', () => {
		const h = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }] }); const m = mountPanel(h);
		submit(m, 'distance', '2.5');
		expect(h.applied).toEqual([{ command: { type: 'set-feature', id: 'x1', patch: { distance: 2.5 } }, label: 'Set Distance' }]);
		submit(m, 'distance', '25.4mm');
		expect(h.applied[1].command).toEqual({ type: 'set-feature', id: 'x1', patch: { distance: 1 } });
		submit(m, 'distance', '1 1/2');
		expect(h.applied[2].command).toEqual({ type: 'set-feature', id: 'x1', patch: { distance: 1.5 } });
		expect(h.errors).toEqual([]);
	});
	it('text that is not a number is refused through api.error, in a sentence, and nothing is applied', () => {
		const h = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }] }); const m = mountPanel(h);
		submit(m, 'distance', 'abc');
		submit(m, 'distance', 'Infinity');
		submit(m, 'distance', '45deg');
		expect(h.applied).toHaveLength(0);
		expect(h.errors).toHaveLength(3);
		expect(h.errors[0]).toBe('Enter a number, like 1.5, 3/8, 1 1/2 or 25.4mm.');
		expect(h.errors[1]).toBe('Enter a finite number.');
		expect(h.errors[2]).toBe('This is a length. Enter inches, like 1.5, 3/8 or 25.4mm.');
		/* Positive control on the same mount: a number does apply. */
		submit(m, 'distance', '0.5');
		expect(h.applied).toHaveLength(1);
	});
	it('no input carries min, max or step, and a zero or a negative number goes through as typed', () => {
		const h = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }] }); const m = mountPanel(h);
		for (const input of m.all<HTMLInputElement>('input')) { expect(input.hasAttribute('min')).toBe(false); expect(input.hasAttribute('max')).toBe(false); expect(input.hasAttribute('step')).toBe(false); expect(input.type).toBe('text'); }
		submit(m, 'distance', '0'); submit(m, 'distance', '-3');
		expect(h.applied.map((a) => (a.command as { patch: { distance: number } }).patch.distance)).toEqual([0, -3]);
	});
	it('the kernel\'s refusal shows on the panel as the feature row\'s own sentence, and the input keeps what was typed', () => {
		const h = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }] }); const m = mountPanel(h);
		expect(m.all('[data-testid="ideacad-dimension-message"]')).toHaveLength(0);
		const rows = model().features.map((r) => (r.id === 'x1' ? { ...r, status: 'error' as const, message: 'Give the extrude a distance.' } : r));
		h.set({ model: model({ features: rows }) }); m.flush();
		const message = m.one('[data-testid="ideacad-dimension-message"]');
		expect(message.textContent).toBe('Give the extrude a distance.'); expect(message.getAttribute('role')).toBe('alert');
		expect(m.all('input')).toHaveLength(1);
	});
	it('a read-only document has no input and no Set button, and still shows every number', () => {
		const open = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }] }); const a = mountPanel(open);
		expect(a.all('input')).toHaveLength(1); expect(a.all('button')).toHaveLength(1);
		const shut = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }], canWrite: false }); const b = mountPanel(shut);
		expect(b.all('input')).toHaveLength(0); expect(b.all('button')).toHaveLength(0); expect(b.all('form')).toHaveLength(0);
		expect(b.one('output').textContent).toBe('1.000 in');
		expect(b.one('.readonly').textContent).toContain('Distance');
	});
	it('a sketch SELECTED but not open lists its own constraints, and none of the extrude\'s', () => {
		/* Before, a selected sketch fell through to its feature parameters, of which a sketch has none, and the panel said it had no number to type beside a sketch that carried two. */
		const h = harness({ selections: [{ bodyId: '', kind: 'sketch', id: 's1' }] }); const m = mountPanel(h);
		expect(m.all('li[data-dimension]').map((li) => li.getAttribute('data-dimension'))).toEqual(['kw', 'kv']);
		expect(m.all('.note')).toHaveLength(0);
		submit(m, 'kw', '6');
		expect(h.applied).toHaveLength(1);
		expect(h.applied[0].label).toBe('Set Distance 1');
		expect((h.applied[0].command as { id: string }).id).toBe('s1');
	});
	it('a sketch with no numbered constraint says it has no dimensions, not that its shape comes from what it was made on', () => {
		const bare = model({ sketches: model().sketches.map((k) => ({ ...k, constraints: [{ id: 'kh', type: 'horizontal' as const, line: 'l0' }] })) });
		const h = harness({ selections: [{ bodyId: '', kind: 'sketch', id: 's1' }], model: bare }); const m = mountPanel(h);
		expect(m.all('li[data-dimension]')).toHaveLength(0);
		expect(m.one('.note').textContent).toBe('Sketch 1 has no dimensions yet.');
	});
	it('a feature with no number says so in words rather than showing an empty list', () => {
		const h = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'b1' }] }); const m = mountPanel(h);
		expect(m.all('input')).toHaveLength(0);
		expect(m.one('.note').textContent).toBe('Combine 1 has no number to type. Its shape comes from what it was made on.');
	});
	it('the Set button is disabled while the workspace is busy, and enabled otherwise', () => {
		const h = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }] }); const m = mountPanel(h);
		expect(m.one<HTMLButtonElement>('button').disabled).toBe(false);
		h.set({ busy: true }); m.flush();
		expect(m.one<HTMLButtonElement>('button').disabled).toBe(true);
		expect(m.one('button').textContent).toBe('Set');
	});
	it('selecting a body offers the dimensions of the feature that created it, plus its measured size and volume', () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] }); const m = mountPanel(h);
		expect(m.all('input')).toHaveLength(1);
		expect(m.one('h2').textContent).toContain('Extrude 1');
		const measured = m.all('dt');
		expect(measured.map((d) => d.textContent?.trim())).toEqual(['Size X measured', 'Size Y measured', 'Size Z measured', 'Volume measured']);
		expect(m.all('dd').map((d) => d.textContent)).toEqual(['4.000 in', '3.000 in', '1.000 in', '12.000 in³']);
		expect(m.all('dl input')).toHaveLength(0);
		expect(m.all('.tag').every((t) => t.textContent === 'measured')).toBe(true);
	});
	it('an edge measures its length and a face its area, both with the word measured and no input in the list', () => {
		const edge = harness({ selections: [{ bodyId: 'x1#0', kind: 'edge', id: 'edge:x1.end|x1.side.0' }] }); const a = mountPanel(edge);
		expect(a.all('dt').map((d) => d.textContent?.trim())).toEqual(['Length measured']); expect(a.one('dd').textContent).toBe('4.000 in');
		const face = harness({ selections: [{ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }] }); const b = mountPanel(face);
		expect(b.all('dt').map((d) => d.textContent?.trim())).toEqual(['Area measured']); expect(b.one('dd').textContent).toBe('12.000 in²');
		expect(a.all('dl input').length + b.all('dl input').length).toBe(0);
	});
	it('with a sketch open, its driving constraints replace the feature list and Enter rewrites the constraints array', () => {
		const h = harness({ selections: [{ bodyId: '', kind: 'feature', id: 'x1' }], editingSketch: 's1' }); const m = mountPanel(h);
		const inputs = m.all<HTMLInputElement>('input');
		expect(inputs).toHaveLength(2);
		expect(inputs.map((i) => i.value)).toEqual(['4', '3']);
		expect(m.all('.words').map((l) => l.textContent)).toEqual(['Distance 1p0 to p1', 'Distance 2p1 to p2']);
		expect(m.all('.unit').map((u) => u.textContent)).toEqual(['in', 'in']);
		expect(m.all('dl')).toHaveLength(0);
		submit(m, 'kv', '5');
		expect(h.applied).toHaveLength(1);
		expect(h.applied[0].label).toBe('Set Distance 2');
		const command = h.applied[0].command as { type: string; id: string; patch: { constraints: { id: string; value?: number }[] } };
		expect(command.type).toBe('set-feature'); expect(command.id).toBe('s1');
		expect(command.patch.constraints.map((c) => [c.id, c.value])).toEqual([['kh', undefined], ['kw', 4], ['kv', 5]]);
	});
	it('an unsatisfied solve marks the conflicting constraint with the word conflicts and says so above the list', () => {
		const solved = harness({ editingSketch: 's1' }); const a = mountPanel(solved);
		expect(a.all('em')).toHaveLength(0); expect(a.all('.refused')).toHaveLength(0); expect(a.all('li.trouble')).toHaveLength(0);
		const m0 = model();
		const conflicted = harness({ editingSketch: 's1', model: model({ sketches: [{ ...m0.sketches[0], solve: { converged: false, classification: 'unsatisfied', dof: 0, maxResidual: 1, trouble: ['kv'] } }] }) }); const b = mountPanel(conflicted);
		expect(b.all('li.trouble')).toHaveLength(1);
		expect(b.one('li.trouble').getAttribute('data-dimension')).toBe('kv');
		expect(b.one('em').textContent).toBe('conflicts');
		expect(b.one('.refused').textContent).toBe('Cannot be solved: a dimension marked "conflicts" asks for what the others rule out. Change one of them.');
		expect(b.one('.refused').getAttribute('role')).toBe('alert');
		/* The solver does not always name a culprit: with `trouble` empty no row is marked and the sentence promises no mark. */
		const unnamed = harness({ editingSketch: 's1', model: model({ sketches: [{ ...m0.sketches[0], solve: { converged: false, classification: 'unsatisfied', dof: 0, maxResidual: 1, trouble: [] } }] }) }); const c = mountPanel(unnamed);
		expect(c.all('li.trouble')).toHaveLength(0); expect(c.all('em')).toHaveLength(0);
		expect(c.one('.refused').textContent).toBe('Cannot be solved: these dimensions ask for what the sketch cannot do at once. Change one of them.');
	});
});

/* ------------------------------------------------------------------ the overlay */
// THE DIMENSION OVERLAY, MOUNTED over the same stand-in workspace (ledger 0296,
// F025). What is here is structure and wiring: which numbers become buttons,
// what a press opens, what Enter applies and with what label, what Escape and a
// refusal leave behind, and that read-only is ABSENCE of the control. Where the
// labels land on screen is geometry, which happy-dom cannot measure; the
// anchors are proven in `tests/ideacad-solid-dimensions-anchors.test.ts` and
// the placement in a real Chromium on `/dev/ideacad-dimensions`.
describe('the dimension overlay', () => {
	function mountOverlay(h: Harness) { const m = mountInto(Overlay, { api: h.api }); mounted.push(m); return m; }
	/* The overlay places its labels on a frame-or-timeout loop; two timeouts' worth lets one pass run. */
	const pass = async (m: Mounted) => { m.flush(); await new Promise((r) => setTimeout(r, 180)); m.flush(); };
	const labels = (m: Mounted) => m.all<HTMLElement>('[data-dimension-label]');
	const open = async (m: Mounted, id: string) => { m.one<HTMLButtonElement>(`button[data-dimension-label="${id}"]`).click(); m.flush(); await pass(m); return m.one<HTMLInputElement>(`[data-dimension-input="${id}"]`); };
	const type = (m: Mounted, input: HTMLInputElement, text: string) => { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); m.flush(); };

	it('draws nothing with nothing selected, and the box\'s width, height and depth once its body is', async () => {
		const h = harness(); const m = mountOverlay(h); await pass(m);
		expect(labels(m)).toHaveLength(0);
		h.set({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] }); await pass(m);
		expect(labels(m).map((l) => l.getAttribute('data-dimension-label'))).toEqual(['s1:kw', 's1:kv', 'x1:distance']);
		expect(labels(m).map((l) => l.textContent)).toEqual(['4.000 in', '3.000 in', '1.000 in']);
		expect(labels(m).every((l) => l.tagName === 'BUTTON')).toBe(true);
	});
	it('a press opens a box holding the number; Enter sets it exactly as the panel does, on the sketch, labelled "Set Distance 1"', async () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] }); const m = mountOverlay(h); await pass(m);
		const input = await open(m, 's1:kw');
		expect(input.value).toBe('4');
		for (const a of ['min', 'max', 'step']) expect(input.hasAttribute(a)).toBe(false);
		type(m, input, '6'); await pass(m);
		expect(h.applied).toHaveLength(1);
		expect(h.applied[0].label).toBe('Set Distance 1');
		const command = h.applied[0].command as { type: string; id: string; patch: { constraints: { id: string; value?: number }[] } };
		expect(command.type).toBe('set-feature'); expect(command.id).toBe('s1');
		expect(command.patch.constraints.find((c) => c.id === 'kw')?.value).toBe(6);
		expect(command.patch.constraints.find((c) => c.id === 'kv')?.value).toBe(3);
	});
	it('the feature\'s own number patches the feature: the depth is set-feature on the extrude', async () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] }); const m = mountOverlay(h); await pass(m);
		type(m, await open(m, 'x1:distance'), '2.5'); await pass(m);
		expect(h.applied).toEqual([{ command: { type: 'set-feature', id: 'x1', patch: { distance: 2.5 } }, label: 'Set Distance' }]);
	});
	it('Escape closes the box and applies nothing', async () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] }); const m = mountOverlay(h); await pass(m);
		const input = await open(m, 's1:kv');
		input.value = '9'; input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); m.flush();
		expect(m.all('[data-dimension-input]')).toHaveLength(0);
		expect(h.applied).toHaveLength(0);
	});
	it('text that is not a number is the parser\'s sentence through api.error; nothing is applied and the box keeps what was typed', async () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] }); const m = mountOverlay(h); await pass(m);
		const input = await open(m, 'x1:distance');
		type(m, input, 'deep'); await pass(m);
		expect(h.applied).toHaveLength(0);
		expect(h.errors).toEqual(['Enter a number, like 1.5, 3/8, 1 1/2 or 25.4mm.']);
		expect(m.one<HTMLInputElement>('[data-dimension-input="x1:distance"]').value).toBe('deep');
	});
	it('millimeters: labels read in mm and a bare typed number is millimeters, stored as inches', async () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }], prefs: { ...defaultPreferences(), units: { display: 'mm' } } }); const m = mountOverlay(h); await pass(m);
		expect(labels(m).map((l) => l.textContent)).toEqual(['101.60 mm', '76.20 mm', '25.40 mm']);
		const input = await open(m, 'x1:distance');
		expect(input.value).toBe('25.4');
		type(m, input, '50.8'); await pass(m);
		expect((h.applied[0].command as { patch: { distance: number } }).patch.distance).toBeCloseTo(2, 12);
	});
	it('a read-only document shows every number and has no control: absence, counted against the same fixture writable', async () => {
		const open_ = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] }); const a = mountOverlay(open_); await pass(a);
		expect(a.all('button[data-dimension-label]')).toHaveLength(3);
		const shut = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }], canWrite: false }); const b = mountOverlay(shut); await pass(b);
		expect(b.all('button')).toHaveLength(0); expect(b.all('input')).toHaveLength(0);
		expect(b.all('span[data-dimension-label]').map((l) => l.textContent)).toEqual(['4.000 in', '3.000 in', '1.000 in']);
	});
	it('a selected edge shows its length as measured, in gray words, and never as a control', async () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'edge', id: 'edge:x1.end|x1.side.0' }] }); const m = mountOverlay(h); await pass(m);
		const measured = m.one<HTMLElement>('[data-dimension-label="measured:length"]');
		expect(measured.tagName).toBe('SPAN');
		expect(measured.textContent).toBe('4.000 inmeasured');
		expect(measured.querySelector('small')?.textContent).toBe('measured');
		/* Positive control on the same mount: the extrude that made the edge still offers its numbers as buttons. */
		expect(m.all('button[data-dimension-label]').length).toBeGreaterThan(0);
	});
	it('the open sketch shows only its own numbers, and no lines of its own: the editor\'s glyphs are the lines', async () => {
		const h = harness({ editingSketch: 's1', selections: [{ bodyId: '', kind: 'sketch', id: 's1' }] }); const m = mountOverlay(h); await pass(m);
		expect(labels(m).map((l) => l.getAttribute('data-dimension-label'))).toEqual(['s1:kw', 's1:kv']);
		expect(m.all('.dim-lines polyline')).toHaveLength(0);
		/* Positive control: the same sketch selected but not open draws a dimension line and two witness lines for each number. */
		const closed = harness({ selections: [{ bodyId: '', kind: 'sketch', id: 's1' }] }); const c = mountOverlay(closed); await pass(c);
		expect(labels(c)).toHaveLength(2);
		expect(c.all('.dim-lines polyline')).toHaveLength(6);
	});
	it('a number the solver cannot satisfy carries the word "conflicts"; the others do not', async () => {
		const troubled = model({ sketches: model().sketches.map((k) => ({ ...k, solve: { ...k.solve, classification: 'unsatisfied' as const, trouble: ['kv'] } })) });
		const h = harness({ editingSketch: 's1', selections: [{ bodyId: '', kind: 'sketch', id: 's1' }], model: troubled }); const m = mountOverlay(h); await pass(m);
		const kv = m.one<HTMLElement>('[data-dimension-label="s1:kv"]'), kw = m.one<HTMLElement>('[data-dimension-label="s1:kw"]');
		expect(kv.querySelector('small')?.textContent).toBe('conflicts');
		expect(kv.getAttribute('aria-label')).toBe('Distance 2 3.000 in, conflicts');
		expect(kw.querySelector('small')).toBeNull();
	});
	it('the hidden prop takes the labels away, and nothing is left to press', async () => {
		const h = harness({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }] });
		const m = mountInto(Overlay, { api: h.api, hidden: true }); mounted.push(m); await pass(m);
		expect(labels(m)).toHaveLength(0);
		expect(m.one('[data-testid="ideacad-dimension-overlay"]').getAttribute('aria-hidden')).toBe('true');
	});
});
