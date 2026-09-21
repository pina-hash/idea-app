// tests/dom/ideacad-feature-panel-mount.test.ts
//
// THE FEATURE PANEL, MOUNTED against a stand-in `WorkspaceApi` that records
// what the panel asks the workspace to do. The executors are proven against
// the real kernel in `tests/ideacad-solid-blends-engine.test.ts`; what is
// here is the half that only exists once the component is wired:
//
//   * the panel renders NOTHING for a tool that is not a feature tool, and a
//     section named for the tool when it is (both directions on one mount);
//   * every option box mirrors into `featureOptions` as typed, empty meaning
//     "not set", and a typed Apply sends the feature WITH those options;
//   * a refusal goes to `api.error` as a sentence and NOTHING is applied;
//   * "Use the face's edges" turns a face pick into its edge picks through
//     `api.select`, from `FaceProjection.edges`;
//   * Drill at the face center applies a hole whose centre is the face's
//     own plane coordinates and whose size, fit and depth are the panel's;
//   * a read-only document has NO Apply, NO Add-wall and NO Remove control
//     and still shows every option (both directions counted on one fixture);
//   * NO INPUT CARRIES min, max OR step, and every numeric box is a text
//     field: a value the kernel refuses is the kernel's own sentence.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE (`tests/dom/README.md`); the 44px
// controls are measured in a real Chromium in the surface's browser drive.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import FeaturePanel from '$lib/ideacad/solid/FeaturePanel.svelte';
import MeasurePanel from '$lib/ideacad/solid/MeasurePanel.svelte';
import SectionPanel from '$lib/ideacad/solid/SectionPanel.svelte';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { featureOptions, resetFeatureOptions } from '$lib/ideacad/solid/features/options';
import { emptyManifest, type BodyProjection, type ModelProjection, type ResolvedPlane, type Selection, type SolidCommand, type SolidManifest, type Vec3 } from '$lib/ideacad/solid/types';
import type { Tool } from '$lib/ideacad/solid/viewport';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = FeaturePanel as unknown as Component<Record<string, unknown>>;
const Measure = MeasurePanel as unknown as Component<Record<string, unknown>>;
const Section = SectionPanel as unknown as Component<Record<string, unknown>>;
const EMPTY: ModelProjection = { bodies: [], sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 };
const mesh = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const edge = (id: string, faces: string[], mid: Vec3) => ({ id, curve: 'LINE', points: new Float32Array(), faces, length: 4, mid });
/** A 4x3x1 box body with its top face and the four edges around it, the shape `engine.ts` projects. */
const boxBody = (): BodyProjection => ({ id: 'x1#0', name: 'Base', materialId: null, role: 'part', createdBy: 'x1', volume: 12, bounds: [0, 0, 0, 4, 3, 1], centerOfMass: [2, 1.5, 0.5], inertia: [], mesh: mesh(), vertices: [],
	faces: [
		{ id: 'x1.end', kind: 'plane', center: [2, 1.5, 1], normal: [0, 0, 1], area: 12, surface: { type: 'plane', normal: [0, 0, 1], d: 1 }, edges: ['edge:x1.end|x1.side.0', 'edge:x1.end|x1.side.1', 'edge:x1.end|x1.side.2', 'edge:x1.end|x1.side.3'], ...mesh() },
		{ id: 'x1.start', kind: 'plane', center: [2, 1.5, 0], normal: [0, 0, -1], area: 12, surface: { type: 'plane', normal: [0, 0, -1], d: 0 }, edges: [], ...mesh() },
		{ id: 'h1.wall', kind: 'cylinder', center: [2, 1.5, 0.5], normal: [0, 0, 0], area: 1, surface: { type: 'cylinder', radius: 0.1 }, edges: [], ...mesh() }
	],
	edges: [edge('edge:x1.end|x1.side.0', ['x1.end', 'x1.side.0'], [2, 0, 1]), edge('edge:x1.end|x1.side.1', ['x1.end', 'x1.side.1'], [4, 1.5, 1]), edge('edge:x1.end|x1.side.2', ['x1.end', 'x1.side.2'], [2, 3, 1]), edge('edge:x1.end|x1.side.3', ['x1.end', 'x1.side.3'], [0, 1.5, 1])] });
const plane = (feature: string, name: string, origin: Vec3): ModelProjection['references'][number] => ({ feature, name, kind: 'plane', origin, normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], size: 1 });
const model = (over: Partial<ModelProjection> = {}): ModelProjection => ({ ...EMPTY, bodies: [boxBody()], sketches: [
	{ feature: 'sA', name: 'Sketch A', plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] }, planeRef: { kind: 'datum', datum: 'XY' }, entities: [], constraints: [], solve: { converged: true, classification: 'solved', dof: 0, maxResidual: 0, trouble: [] }, regions: [], consumed: false },
	{ feature: 'sB', name: 'Sketch B', plane: { origin: [0, 0, 2], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] }, planeRef: { kind: 'datum', datum: 'XY', offset: 2 }, entities: [], constraints: [], solve: { converged: true, classification: 'solved', dof: 0, maxResidual: 0, trouble: [] }, regions: [], consumed: false }
], ...over });
const manifest = (): SolidManifest => ({ ...emptyManifest(), features: [{ id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' }] });

type Over = Partial<{ selections: Selection[]; canWrite: boolean; busy: boolean; tool: Tool; model: ModelProjection; manifest: SolidManifest }>;
interface Harness { api: WorkspaceApi; applied: { command: SolidCommand; label: string }[]; errors: string[]; selected: (Selection | null)[]; guides: Vec3[][]; clips: (ResolvedPlane | null)[]; lookedAt: ResolvedPlane[]; requests: unknown[]; answer: (value: unknown) => unknown; set(over: Over): void }
function harness(initial: Over = {}): Harness {
	const state = reactiveProps({ selections: [] as Selection[], canWrite: true, busy: false, tool: 'fillet' as Tool, model: model(), manifest: manifest(), ...initial });
	const h: Harness = { api: null as unknown as WorkspaceApi, applied: [], errors: [], selected: [], guides: [], clips: [], lookedAt: [], requests: [], answer: () => { throw Error('Measure two corners, a corner and a face or edge, two flat faces, or two bodies.'); }, set: (over) => Object.assign(state, over) };
	h.api = {
		get model() { return state.model; }, get manifest() { return state.manifest; }, get selections() { return state.selections; }, get canWrite() { return state.canWrite; }, get busy() { return state.busy; }, get tool() { return state.tool; }, get editingSketch() { return null; },
		apply: async (command, label) => { h.applied.push({ command, label }); }, select: (s, append) => { h.selected.push(s); if (!s) state.selections = []; else if (append) state.selections = [...state.selections, s]; else state.selections = [s]; }, setTool: () => {}, editSketch: () => {}, setSketchPointer: () => {},
		request: async (method, value) => { h.requests.push({ method, value }); return h.answer(value) as never; }, project: () => ({ x: 0, y: 0 }), error: (m) => { h.errors.push(m); }, guide: (points) => { h.guides.push(points); }, clearGuides: () => { h.guides.push([]); }, clip: (p) => { h.clips.push(p); }, lookAt: (p) => { h.lookedAt.push(p); }, fit: () => {}, unproject: () => null
	};
	return h;
}
const mounted: Mounted[] = [];
function mountPanel(h: Harness, component: Component<Record<string, unknown>> = Panel) { const m = mountInto(component, { api: h.api }); mounted.push(m); return m; }
afterEach(async () => { for (const m of mounted) await m.stop(); mounted.length = 0; resetFeatureOptions(); });
const type = (m: Mounted, testId: string, value: string) => { const el = m.one<HTMLInputElement>(`[data-testid="${testId}"]`); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); m.flush(); };
const tick = (m: Mounted, testId: string) => { m.one<HTMLInputElement>(`[data-testid="${testId}"]`).click(); m.flush(); };
/* happy-dom's select quirk, handled the way maps-node-create-once does: Svelte's binding reads the SELECTED option, so the target option is selected outright before the change event. */
const choose = (m: Mounted, testId: string, value: string) => { const el = m.one<HTMLSelectElement>(`[data-testid="${testId}"]`); for (const opt of Array.from(el.options)) opt.selected = opt.value === value; el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); m.flush(); };
const press = async (m: Mounted, testId: string) => { m.one<HTMLButtonElement>(`[data-testid="${testId}"]`).click(); await m.settle(); };
const pickEdge = (id: string): Selection => ({ bodyId: 'x1#0', kind: 'edge', id });
const pickFace = (id: string): Selection => ({ bodyId: 'x1#0', kind: 'face', id });
const pickSketch = (id: string): Selection => ({ bodyId: '', kind: 'sketch', id });
/* `inputmode` is set as a property Svelte does not reflect to an attribute in happy-dom, so a numeric box is found by its type: every non-toggle input in this panel is one. */
const numericBoxes = (m: Mounted) => m.all<HTMLInputElement>('input').filter((i) => i.type !== 'checkbox' && i.type !== 'radio');

describe('the feature panel', () => {
	it('renders nothing for Select and a section named for each feature tool, and no numeric box carries min, max, step or a number type', () => {
		const h = harness({ tool: 'select' }); const m = mountPanel(h);
		expect(m.all('[data-testid="ideacad-feature-panel"]')).toHaveLength(0);
		for (const [tool, word] of [['fillet', 'Fillet'], ['chamfer', 'Chamfer'], ['shell', 'Shell'], ['hole', 'Hole']] as [Tool, string][]) {
			h.set({ tool }); m.flush();
			expect(m.one('[data-testid="ideacad-feature-panel"] h2').textContent).toBe(word);
			expect(m.one('[data-testid="ideacad-feature-panel"]').getAttribute('data-mode')).toBe(tool);
			/* The hole section has no text box while Through all is on; the other three always have one. */
			const boxes = numericBoxes(m); if (tool !== 'hole') expect(boxes.length).toBeGreaterThan(0);
			for (const box of boxes) { expect(box.type).toBe('text'); expect(box.hasAttribute('min')).toBe(false); expect(box.hasAttribute('max')).toBe(false); expect(box.hasAttribute('step')).toBe(false); }
		}
		h.set({ tool: 'measure' }); m.flush();
		expect(m.all('[data-testid="ideacad-feature-panel"]')).toHaveLength(0);
	});
	it('fillet: the count reads the edge picks, options mirror into the store as typed with empty meaning unset, and Apply sends the feature with them; no edge is refused in a sentence', async () => {
		const h = harness({ tool: 'fillet' }); const m = mountPanel(h);
		expect(m.one('[data-testid="ideacad-feature-picks"]').textContent).toContain('0 edges selected.');
		await press(m, 'ideacad-fillet-apply');
		expect(h.applied).toHaveLength(0); expect(h.errors).toEqual(['Select an edge to round. Shift-click adds more; a selected face gives all its edges.']);
		h.set({ selections: [pickEdge('edge:x1.end|x1.side.0'), pickEdge('edge:x1.end|x1.side.2')] }); m.flush();
		expect(m.one('[data-testid="ideacad-feature-picks"]').textContent).toContain('2 edges selected.');
		expect(featureOptions.fillet).toEqual({ propagate: false, variableEnd: null, law: 'linear' });
		tick(m, 'ideacad-fillet-propagate'); type(m, 'ideacad-fillet-variable-end', '0.4');
		expect(featureOptions.fillet).toEqual({ propagate: true, variableEnd: 0.4, law: 'linear' });
		choose(m, 'ideacad-fillet-law', 'scurve');
		expect(featureOptions.fillet.law).toBe('scurve');
		type(m, 'ideacad-fillet-radius', 'abc');
		await press(m, 'ideacad-fillet-apply');
		expect(h.applied).toHaveLength(0); expect(h.errors[1]).toBe('Enter a radius in inches, like 0.25.');
		type(m, 'ideacad-fillet-radius', '-0.125');
		expect(m.one('[data-testid="ideacad-fillet-apply"]').textContent).toBe('Round 2 edges at -0.125 in');
		await press(m, 'ideacad-fillet-apply');
		expect(h.applied).toHaveLength(1);
		expect(h.applied[0].label).toBe('Fillet');
		expect(h.applied[0].command).toEqual({ type: 'add-feature', feature: { id: '', name: '', type: 'fillet', radius: -0.125, propagate: true, variable: { end: 0.4, law: 'scurve' }, edges: [
			{ body: 'x1#0', faces: ['x1.end', 'x1.side.0'], ordinal: undefined, hint: { curve: 'LINE', mid: [2, 0, 1], length: 4 } },
			{ body: 'x1#0', faces: ['x1.end', 'x1.side.2'], ordinal: undefined, hint: { curve: 'LINE', mid: [2, 3, 1], length: 4 } }
		] } });
		type(m, 'ideacad-fillet-variable-end', '   ');
		expect(featureOptions.fillet.variableEnd).toBeNull();
		expect(m.all('[data-testid="ideacad-fillet-law"]')).toHaveLength(0);
	});
	it('a selected face becomes its four edges through api.select, cleared first then appended, from FaceProjection.edges', async () => {
		const h = harness({ tool: 'chamfer', selections: [pickFace('x1.end')] }); const m = mountPanel(h);
		expect(m.one('[data-testid="ideacad-feature-face-edges"]').textContent).toBe("Use the 1 face' edges instead");
		await press(m, 'ideacad-feature-face-edges');
		expect(h.selected[0]).toBeNull();
		expect(h.selected.slice(1)).toEqual(['edge:x1.end|x1.side.0', 'edge:x1.end|x1.side.1', 'edge:x1.end|x1.side.2', 'edge:x1.end|x1.side.3'].map(pickEdge));
		expect(m.one('[data-testid="ideacad-feature-picks"]').textContent).toContain('4 edges selected.');
		expect(m.all('[data-testid="ideacad-feature-face-edges"]')).toHaveLength(0);
		type(m, 'ideacad-chamfer-distance2', '0.3'); type(m, 'ideacad-chamfer-angle', '30'); tick(m, 'ideacad-chamfer-propagate');
		expect(featureOptions.chamfer).toEqual({ propagate: true, distance2: 0.3, angle: 30 });
		await press(m, 'ideacad-chamfer-apply');
		expect(h.applied[0].label).toBe('Chamfer');
		/* An angle outranks the second distance, exactly as the executor reads the feature. */
		expect(h.applied[0].command).toMatchObject({ feature: { type: 'chamfer', distance: 0.1, angle: 30, propagate: true } });
		expect((h.applied[0].command as unknown as { feature: Record<string, unknown> }).feature.distance2).toBeUndefined();
		expect((h.applied[0].command as unknown as { feature: { edges: unknown[] } }).feature.edges).toHaveLength(4);
	});
	it('shell: a wall thickness for one selected flat face is listed, mirrored, kept out of the open faces, and removable', async () => {
		const h = harness({ tool: 'shell', selections: [pickFace('x1.start')] }); const m = mountPanel(h);
		type(m, 'ideacad-shell-wall-thickness', '0.25');
		await press(m, 'ideacad-shell-add-wall');
		expect(h.errors).toEqual([]);
		expect(featureOptions.shell.faceThickness).toEqual([{ face: { body: 'x1#0', name: 'x1.start', hint: { kind: 'plane', center: [2, 1.5, 0], normal: [0, 0, -1], area: 12 } }, thickness: 0.25 }]);
		expect(m.one('[data-testid="ideacad-shell-walls"]').textContent).toContain('Base, x1.start: 0.25 in');
		h.set({ selections: [pickFace('x1.end'), pickFace('x1.start')] }); m.flush();
		type(m, 'ideacad-shell-thickness', '0.1');
		await press(m, 'ideacad-shell-apply');
		expect(h.applied[0].label).toBe('Shell');
		const sent = (h.applied[0].command as unknown as { feature: { openFaces: { name: string }[]; faceThickness: { thickness: number }[]; body: string; thickness: number } }).feature;
		expect(sent.body).toBe('x1#0'); expect(sent.thickness).toBe(0.1);
		expect(sent.openFaces.map((f) => f.name)).toEqual(['x1.end']);
		expect(sent.faceThickness).toEqual([{ face: { body: 'x1#0', name: 'x1.start', hint: { kind: 'plane', center: [2, 1.5, 0], normal: [0, 0, -1], area: 12 } }, thickness: 0.25 }]);
		m.one<HTMLButtonElement>('[data-testid="ideacad-shell-walls"] button').click(); m.flush();
		expect(featureOptions.shell.faceThickness).toEqual([]);
		expect(m.all('[data-testid="ideacad-shell-walls"]')).toHaveLength(0);
		await press(m, 'ideacad-shell-add-wall');
		expect(h.errors).toEqual(['Select one face to give its wall a thickness.']);
	});
	it('hole: size, fit, custom diameter and depth mirror into the store with the drill named beside them, and Drill at the face center sends a hole in the face plane', async () => {
		const h = harness({ tool: 'hole' }); const m = mountPanel(h);
		expect(featureOptions.hole).toEqual({ standard: '1/4-20', fit: 'close', diameter: null, depth: 'through' });
		expect(m.one('[data-testid="ideacad-hole-words"]').textContent).toBe('Drills 17/64 drill, 0.2656 in');
		const fits = m.all<HTMLLabelElement>('[data-testid="ideacad-hole-fit"] label');
		expect(fits.map((l) => l.querySelector('span')!.firstChild!.textContent!.trim())).toEqual(['Tapped', 'Close', 'Normal', 'Custom']);
		fits[0].querySelector('input')!.click(); m.flush();
		expect(m.one('[data-testid="ideacad-hole-words"]').textContent).toBe('Drills #7 drill, 0.201 in');
		choose(m, 'ideacad-hole-standard', 'M6');
		expect(m.one('[data-testid="ideacad-hole-words"]').textContent).toBe('Drills 5.0 mm drill, 0.1969 in');
		expect(m.all('[data-testid="ideacad-hole-depth"]')).toHaveLength(0);
		tick(m, 'ideacad-hole-through'); type(m, 'ideacad-hole-depth', '0.75');
		expect(featureOptions.hole).toEqual({ standard: 'M6', fit: 'tapped', diameter: null, depth: 0.75 });
		await press(m, 'ideacad-hole-apply');
		expect(h.applied).toHaveLength(0); expect(h.errors).toEqual(['Select one face to drill.']);
		h.set({ selections: [pickFace('x1.end')] }); m.flush();
		await press(m, 'ideacad-hole-apply');
		expect(h.applied[0].label).toBe('Drill hole');
		/* The face plane is `planeFromNormal([0,0,1], center)`: origin at the world origin projected onto z = 1, u = (1,0,0) from the seed (0,1,0) x n, v = (0,1,0). The centre (2, 1.5, 1) is then (2, 1.5). */
		expect(h.applied[0].command).toEqual({ type: 'add-feature', feature: { id: '', name: '', type: 'hole', face: { body: 'x1#0', name: 'x1.end', hint: { kind: 'plane', center: [2, 1.5, 1], normal: [0, 0, 1], area: 12 } }, center: [2, 1.5], standard: 'M6', fit: 'tapped', depth: 0.75 } });
		fits[3].querySelector('input')!.click(); m.flush();
		type(m, 'ideacad-hole-diameter', '0.5');
		expect(featureOptions.hole).toMatchObject({ fit: 'custom', diameter: 0.5 });
		await press(m, 'ideacad-hole-apply');
		expect(h.applied[1].command).toMatchObject({ feature: { fit: 'custom', diameter: 0.5 } });
		h.set({ selections: [pickFace('h1.wall')] }); m.flush();
		await press(m, 'ideacad-hole-apply');
		expect(h.applied).toHaveLength(2); expect(h.errors[1]).toBe('Drill into a flat face. For a curved face, add a reference point on it and drill there.');
	});
	it('More features opens draft, sweep and loft under a real disclosure; each builds from the selection and refuses in a sentence when it is short', async () => {
		const h = harness({ tool: 'fillet', selections: [pickFace('x1.end')] }); const m = mountPanel(h);
		expect(m.expanded('ideacad-feature-more')).toBe('false');
		expect(m.one<HTMLElement>('#ideacad-feature-more').hidden).toBe(true);
		await press(m, 'ideacad-feature-more');
		expect(m.expanded('ideacad-feature-more')).toBe('true');
		expect(m.one<HTMLElement>('#ideacad-feature-more').hidden).toBe(false);
		/* The tool still decides while a feature tool is active; switching to Select hands the panel to the chosen extra. */
		expect(m.one('[data-testid="ideacad-feature-panel"]').getAttribute('data-mode')).toBe('fillet');
		h.set({ tool: 'select' }); m.flush();
		expect(m.one('[data-testid="ideacad-feature-panel"]').getAttribute('data-mode')).toBe('draft');
		type(m, 'ideacad-draft-angle', '3'); choose(m, 'ideacad-draft-pull', 'Z'); choose(m, 'ideacad-draft-neutral', 'XY');
		await press(m, 'ideacad-draft-apply');
		expect(h.applied[0]).toEqual({ label: 'Draft', command: { type: 'add-feature', feature: { id: '', name: '', type: 'draft', faces: [{ body: 'x1#0', name: 'x1.end', hint: { kind: 'plane', center: [2, 1.5, 1], normal: [0, 0, 1], area: 12 } }], angle: 3, pull: { kind: 'datum', axis: 'Z' }, neutral: { kind: 'datum', datum: 'XY' } } } });
		choose(m, 'ideacad-draft-pull', 'reference');
		await press(m, 'ideacad-draft-apply');
		expect(h.applied).toHaveLength(1); expect(h.errors).toEqual(['Select a reference axis for the pull direction, or pick X, Y or Z.']);
		m.all<HTMLInputElement>('#ideacad-feature-more input')[2].click(); m.flush();
		expect(m.one('[data-testid="ideacad-feature-panel"] h2').textContent).toBe('Loft');
		await press(m, 'ideacad-loft-apply');
		expect(h.errors[1]).toBe('Select the first profile sketch, then shift-click each next one in order.');
		h.set({ selections: [pickSketch('sA'), pickSketch('sB')] }); m.flush();
		expect(m.one('[data-testid="ideacad-feature-picks"]').textContent).toContain('2 profiles selected: Sketch A, Sketch B.');
		tick(m, 'ideacad-loft-smooth');
		await press(m, 'ideacad-loft-apply');
		expect(h.applied[1]).toEqual({ label: 'Loft', command: { type: 'add-feature', feature: { id: '', name: '', type: 'loft', profiles: ['sA', 'sB'], smooth: true, operation: 'new', target: undefined } } });
		m.all<HTMLInputElement>('#ideacad-feature-more input')[1].click(); m.flush();
		choose(m, 'ideacad-feature-operation', 'cut');
		await press(m, 'ideacad-sweep-apply');
		expect(h.applied).toHaveLength(2); expect(h.errors[2]).toBe('Shift-click a face or a body to cut, or choose New body.');
		h.set({ selections: [pickSketch('sA'), pickSketch('sB'), pickFace('x1.end')] }); m.flush();
		await press(m, 'ideacad-sweep-apply');
		expect(h.applied[2]).toEqual({ label: 'Sweep', command: { type: 'add-feature', feature: { id: '', name: '', type: 'sweep', profile: 'sA', path: 'sB', operation: 'cut', target: 'x1#0' } } });
		m.all<HTMLInputElement>('#ideacad-feature-more input')[3].click(); m.flush();
		expect(m.one('[data-testid="ideacad-feature-picks"]').textContent).toContain('Rib is not built in this build');
		expect(m.all('[data-testid="ideacad-feature-panel"] button.primary')).toHaveLength(0);
	});
	it('read-only: every option box still shows and NO apply, add-wall or remove control is rendered, against the same fixture writable', () => {
		const h = harness({ tool: 'shell', selections: [pickFace('x1.start')], canWrite: true }); const m = mountPanel(h);
		featureOptions.shell.faceThickness = [{ face: { body: 'x1#0', name: 'x1.start' }, thickness: 0.2 }];
		m.stop(); const m2 = mountPanel(h);
		const count = (mm: Mounted) => ({ boxes: numericBoxes(mm).length, apply: mm.all('[data-testid$="-apply"]').length, add: mm.all('[data-testid="ideacad-shell-add-wall"]').length, remove: mm.all('[data-testid="ideacad-shell-walls"] button').length });
		expect(count(m2)).toEqual({ boxes: 2, apply: 1, add: 1, remove: 1 });
		h.set({ canWrite: false }); m2.flush();
		expect(count(m2)).toEqual({ boxes: 2, apply: 0, add: 0, remove: 0 });
		h.set({ canWrite: true, busy: true }); m2.flush();
		expect(m2.one<HTMLButtonElement>('[data-testid="ideacad-shell-apply"]').disabled).toBe(true);
	});
});

describe('the measure panel', () => {
	it('asks the engine for the first two measurable picks, shows the word, the number and the unit, draws the witness line, and hands an engine refusal to api.error', async () => {
		const h = harness({ tool: 'measure' });
		h.answer = (value) => { const v = value as { a: Selection; b?: Selection }; if (!v.b) return { kind: 'length', value: 4 }; if (v.b.kind === 'face') return { kind: 'distance', value: 1.25, points: [[0, 0, 0], [0, 0, 1.25]] }; throw Error('Measure two corners, a corner and a face or edge, two flat faces, or two bodies.'); };
		const m = mountPanel(h, Measure);
		expect(m.one('[data-testid="ideacad-measure-picks"]').textContent).toContain('Nothing selected yet.');
		expect(h.requests).toHaveLength(0);
		h.set({ selections: [pickEdge('edge:x1.end|x1.side.0')] }); await m.settle();
		expect(h.requests).toEqual([{ method: 'measure', value: { a: pickEdge('edge:x1.end|x1.side.0'), b: undefined } }]);
		expect(m.one('[data-testid="ideacad-measure-result"]').textContent).toContain('Edge length');
		expect(m.one('[data-testid="ideacad-measure-result"] .value').textContent).toBe('4 in');
		h.set({ selections: [pickEdge('edge:x1.end|x1.side.0'), pickFace('x1.end')] }); await m.settle();
		expect(m.one('[data-testid="ideacad-measure-result"] .value').textContent).toBe('1.25 in');
		expect(h.guides.at(-1)).toEqual([[0, 0, 0], [0, 0, 1.25]]);
		expect(m.one('[data-testid="ideacad-measure-picks"]').textContent).toContain('Second');
		h.set({ selections: [pickEdge('edge:x1.end|x1.side.0'), pickEdge('edge:x1.end|x1.side.2'), pickFace('x1.end')] }); await m.settle();
		expect(h.errors).toEqual(['Measure two corners, a corner and a face or edge, two flat faces, or two bodies.']);
		expect(m.one('[data-testid="ideacad-measure-result"]').textContent).toContain('No reading for this pair.');
		expect(h.requests).toHaveLength(3);
		await press(m, 'ideacad-measure-clear');
		expect(h.selected.at(-1)).toBeNull();
		expect(h.guides.at(-1)).toEqual([]);
		await m.stop();
		expect(h.guides.at(-1)).toEqual([]);
	});
});

describe('the section panel', () => {
	it('clips on Section and restores on Off and on unmount; a datum, a reference plane and the selected flat face each resolve, with offset and flip applied; a missing face refuses in a sentence', async () => {
		const h = harness({ tool: 'select', model: model({ references: [plane('pl1', 'Plane 1', [0, 0, 2])] }) });
		const m = mountPanel(h, Section);
		expect(h.clips).toEqual([null]);
		expect(m.one('[data-testid="ideacad-section-state"]').textContent).toBe('Off.');
		await press(m, 'ideacad-section-on');
		expect(h.clips.at(-1)).toEqual({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] });
		expect(m.one('[data-testid="ideacad-section-state"]').textContent).toBe('Sectioned.');
		type(m, 'ideacad-section-offset', '0.5'); tick(m, 'ideacad-section-flip');
		expect(h.clips.at(-1)).toEqual({ origin: [0, 0, 0.5], u: [1, 0, 0], v: [-0, -1, -0], normal: [-0, -0, -1] });
		choose(m, 'ideacad-section-source', 'ref:pl1');
		expect(h.clips.at(-1)).toEqual({ origin: [0, 0, 2.5], u: [1, 0, 0], v: [-0, -1, -0], normal: [-0, -0, -1] });
		choose(m, 'ideacad-section-source', 'face');
		expect(m.one('[data-testid="ideacad-section-state"]').textContent).toBe('Section paused: Select a flat face to section through.');
		expect(h.clips.at(-1)).toBeNull();
		h.set({ selections: [pickFace('x1.end')] }); m.flush();
		expect(h.clips.at(-1)).toEqual({ origin: [0, 0, 1.5], u: [1, 0, 0], v: [-0, -1, -0], normal: [-0, -0, -1] });
		await press(m, 'ideacad-section-look');
		expect(h.lookedAt).toHaveLength(1);
		await press(m, 'ideacad-section-off');
		expect(h.clips.at(-1)).toBeNull();
		expect(m.one('[data-testid="ideacad-section-state"]').textContent).toBe('Off.');
		h.set({ selections: [pickFace('h1.wall')] }); m.flush();
		await press(m, 'ideacad-section-on');
		expect(h.errors).toEqual(['Select a flat face to section through.']);
		const before = h.clips.length;
		h.set({ selections: [pickFace('x1.end')] }); m.flush();
		await press(m, 'ideacad-section-on');
		expect(h.clips.length).toBe(before + 1);
		await m.stop();
		expect(h.clips.at(-1)).toBeNull();
		for (const box of numericBoxes(m)) { expect(box.hasAttribute('min')).toBe(false); expect(box.hasAttribute('step')).toBe(false); }
	});
});
