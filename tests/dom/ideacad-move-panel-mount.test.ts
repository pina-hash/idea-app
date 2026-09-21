// tests/dom/ideacad-move-panel-mount.test.ts
//
// THE MOVE PANEL, MOUNTED against a stand-in `WorkspaceApi` that records what
// the panel asks the workspace to do. What is asserted is the half that only
// exists once the component is wired:
//
//   * the panel renders NOTHING for a tool that is not move, rotate or
//     scale, and its section for each of the three (both directions on one
//     mount);
//   * a typed X, Y, Z lands as ONE `transform` feature whose row-major matrix
//     is that translation, on the selection's body, labelled Move;
//   * a typed turn lands as a rotation about the body's centre of mass, so
//     the centre stays put and a point beside it turns;
//   * every refusal is a sentence through `api.error` and NOTHING is applied;
//   * each snapping box writes the module-level settings the drag reads, in
//     both directions, and starts from them;
//   * a read-only document keeps every box and loses both apply controls
//     (both counted on one fixture);
//   * NO INPUT CARRIES min, max OR step;
//   * the modifier line is the one spelling in `MODIFIER_WORDS`.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE (`tests/dom/README.md`).
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import MovePanel from '$lib/ideacad/solid/MovePanel.svelte';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { MODIFIER_WORDS, resetSnapSettings, snapSettings } from '$lib/ideacad/solid/viewport/drag-math';
import { emptyManifest, type BodyProjection, type Feature, type ModelProjection, type Selection, type SolidCommand, type Vec3 } from '$lib/ideacad/solid/types';
import type { Tool } from '$lib/ideacad/solid/viewport';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = MovePanel as unknown as Component<Record<string, unknown>>;
const mesh = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const CENTRE: Vec3 = [2, 1.5, 0.5];
const boxBody = (): BodyProjection => ({ id: 'x1#0', name: 'Base', materialId: null, role: 'part', createdBy: 'x1', volume: 12, bounds: [0, 0, 0, 4, 3, 1], centerOfMass: CENTRE, inertia: [], mesh: mesh(), vertices: [], faces: [], edges: [] });
const model = (): ModelProjection => ({ bodies: [boxBody()], sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 });
const pick: Selection = { bodyId: 'x1#0', kind: 'body', id: 'x1#0' };
type Over = Partial<{ selections: Selection[]; canWrite: boolean; busy: boolean; tool: Tool }>;
interface Harness { api: WorkspaceApi; applied: { command: SolidCommand; label: string }[]; errors: string[]; set(over: Over): void }
function harness(initial: Over = {}): Harness {
	const state = reactiveProps({ selections: [pick] as Selection[], canWrite: true, busy: false, tool: 'move' as Tool, ...initial });
	const h: Harness = { api: null as unknown as WorkspaceApi, applied: [], errors: [], set: (over) => Object.assign(state, over) };
	h.api = {
		get model() { return model(); }, get manifest() { return emptyManifest(); }, get selections() { return state.selections; }, get canWrite() { return state.canWrite; }, get busy() { return state.busy; }, get tool() { return state.tool; }, get editingSketch() { return null; },
		apply: async (command, label) => { h.applied.push({ command, label }); }, select: () => {}, setTool: () => {}, editSketch: () => {}, setSketchPointer: () => {},
		request: async () => { throw Error('not here'); }, project: () => ({ x: 0, y: 0 }), error: (m) => { h.errors.push(m); }, guide: () => {}, clearGuides: () => {}, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	};
	return h;
}
const mounted: Mounted[] = [];
function mountPanel(h: Harness) { const m = mountInto(Panel, { api: h.api }); mounted.push(m); return m; }
afterEach(async () => { for (const m of mounted) await m.stop(); mounted.length = 0; resetSnapSettings(); });
const type = (m: Mounted, testId: string, value: string) => { const el = m.one<HTMLInputElement>(`[data-testid="${testId}"]`); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); m.flush(); };
const choose = (m: Mounted, testId: string, value: string) => { const el = m.one<HTMLSelectElement>(`[data-testid="${testId}"]`); for (const opt of Array.from(el.options)) opt.selected = opt.value === value; el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); m.flush(); };
const press = async (m: Mounted, testId: string) => { m.one<HTMLButtonElement>(`[data-testid="${testId}"]`).click(); await m.settle(); };
const tick = (m: Mounted, testId: string) => { m.one<HTMLInputElement>(`[data-testid="${testId}"]`).click(); m.flush(); };
const transformOf = (h: Harness, i = 0) => { const c = h.applied[i].command; if (c.type !== 'add-feature' || c.feature.type !== 'transform') throw Error('not a transform'); return c.feature as Extract<Feature, { type: 'transform' }>; };
/** A point through a row-major 4x4, the way `features/core.ts` reads one. */
const through = (m: number[], p: Vec3): Vec3 => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
const near = (a: Vec3, b: Vec3) => { for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 9); };

describe('when the panel shows', () => {
	it('renders nothing for select and its section for move, rotate and scale', () => {
		const h = harness({ tool: 'select' }), m = mountPanel(h);
		expect(m.all('[data-testid="ideacad-move-panel"]')).toHaveLength(0);
		for (const tool of ['move', 'rotate', 'scale'] as Tool[]) { h.set({ tool }); m.flush(); expect(m.all('[data-testid="ideacad-move-panel"]')).toHaveLength(1); }
		h.set({ tool: 'extrude' }); m.flush();
		expect(m.all('[data-testid="ideacad-move-panel"]')).toHaveLength(0);
	});
	it('names the body it will move, or says to select one', () => {
		const h = harness(), m = mountPanel(h);
		expect(m.one('[data-testid="ideacad-move-target"]').textContent).toBe('Moving Base');
		h.set({ selections: [] }); m.flush();
		expect(m.one('[data-testid="ideacad-move-target"]').textContent).toContain('Select a body');
	});
});

describe('a typed move', () => {
	it('lands as one transform feature whose row-major matrix is the translation, on the selected body, labelled Move', async () => {
		const h = harness(), m = mountPanel(h);
		type(m, 'ideacad-move-x', '1.5'); type(m, 'ideacad-move-y', '-2'); type(m, 'ideacad-move-z', '0.25');
		await press(m, 'ideacad-move-apply');
		expect(h.applied).toHaveLength(1); expect(h.applied[0].label).toBe('Move');
		const f = transformOf(h);
		expect(f.bodies).toEqual(['x1#0']);
		expect(f.matrix).toEqual([1, 0, 0, 1.5, 0, 1, 0, -2, 0, 0, 1, 0.25, 0, 0, 0, 1]);
		expect(h.errors).toEqual([]);
	});
	it('takes any finite number, negative and large included, with nothing clamped', async () => {
		const h = harness(), m = mountPanel(h);
		type(m, 'ideacad-move-x', '-1234.5678'); type(m, 'ideacad-move-y', ''); type(m, 'ideacad-move-z', '0');
		await press(m, 'ideacad-move-apply');
		expect(transformOf(h).matrix[3]).toBe(-1234.5678);
		for (const el of m.all<HTMLInputElement>('input')) { expect(el.hasAttribute('min')).toBe(false); expect(el.hasAttribute('max')).toBe(false); expect(el.hasAttribute('step')).toBe(false); }
	});
	it('refuses in the student\'s terms and applies nothing: no body, not a number, nothing to move', async () => {
		const h = harness({ selections: [] }), m = mountPanel(h);
		type(m, 'ideacad-move-x', '1');
		await press(m, 'ideacad-move-apply');
		expect(h.errors).toEqual(['Select a body to move.']);
		h.set({ selections: [pick] }); m.flush();
		type(m, 'ideacad-move-x', 'abc');
		await press(m, 'ideacad-move-apply');
		expect(h.errors[1]).toBe('Enter a distance in inches, like 0.5, in each box.');
		type(m, 'ideacad-move-x', '0');
		await press(m, 'ideacad-move-apply');
		expect(h.errors[2]).toBe('Enter how far to move in at least one direction.');
		expect(h.applied).toHaveLength(0);
	});
});

describe('a typed turn', () => {
	it('lands as a rotation about the body\'s centre of mass: the centre stays and a point beside it turns 90° about Z', async () => {
		const h = harness(), m = mountPanel(h);
		type(m, 'ideacad-move-angle', '90'); choose(m, 'ideacad-move-about', 'Z');
		await press(m, 'ideacad-rotate-apply');
		expect(h.applied).toHaveLength(1); expect(h.applied[0].label).toBe('Rotate');
		const f = transformOf(h);
		near(through(f.matrix, CENTRE), CENTRE);
		near(through(f.matrix, [CENTRE[0] + 1, CENTRE[1], CENTRE[2]]), [CENTRE[0], CENTRE[1] + 1, CENTRE[2]]);
	});
	it('turns about the chosen axis, negative angles included', async () => {
		const h = harness(), m = mountPanel(h);
		type(m, 'ideacad-move-angle', '-90'); choose(m, 'ideacad-move-about', 'X');
		await press(m, 'ideacad-rotate-apply');
		const f = transformOf(h);
		near(through(f.matrix, CENTRE), CENTRE);
		/* -90° about X takes +Y to -Z. */
		near(through(f.matrix, [CENTRE[0], CENTRE[1] + 1, CENTRE[2]]), [CENTRE[0], CENTRE[1], CENTRE[2] - 1]);
	});
	it('refuses a non-number and a zero turn, applying nothing', async () => {
		const h = harness(), m = mountPanel(h);
		type(m, 'ideacad-move-angle', 'ninety');
		await press(m, 'ideacad-rotate-apply');
		type(m, 'ideacad-move-angle', '0');
		await press(m, 'ideacad-rotate-apply');
		expect(h.errors).toEqual(['Enter an angle in degrees, like 90.', 'Enter an angle other than 0.']);
		expect(h.applied).toHaveLength(0);
	});
});

describe('snapping settings', () => {
	it('each box writes the module-level settings the drag reads, both ways, and starts from them', () => {
		const h = harness(), m = mountPanel(h);
		expect(snapSettings).toEqual({ references: false, bodies: false, angles: false });
		for (const id of ['ideacad-snap-references', 'ideacad-snap-bodies', 'ideacad-snap-angles']) expect(m.one<HTMLInputElement>(`[data-testid="${id}"]`).checked).toBe(false);
		tick(m, 'ideacad-snap-references'); expect(snapSettings.references).toBe(true); expect(snapSettings.bodies).toBe(false);
		tick(m, 'ideacad-snap-bodies'); expect(snapSettings.bodies).toBe(true);
		tick(m, 'ideacad-snap-angles'); expect(snapSettings.angles).toBe(true);
		tick(m, 'ideacad-snap-references'); expect(snapSettings.references).toBe(false); expect(snapSettings.bodies).toBe(true);
	});
	it('a fresh mount reads what the settings already hold', () => {
		snapSettings.bodies = true;
		const m = mountPanel(harness());
		expect(m.one<HTMLInputElement>('[data-testid="ideacad-snap-bodies"]').checked).toBe(true);
		expect(m.one<HTMLInputElement>('[data-testid="ideacad-snap-references"]').checked).toBe(false);
	});
	it('says the words, once, from the module', () => {
		const m = mountPanel(harness());
		expect(m.one('[data-testid="ideacad-move-modifiers"]').textContent).toBe(`${MODIFIER_WORDS.fine} ${MODIFIER_WORDS.noSnap}`);
		expect(MODIFIER_WORDS.fine).toBe('Hold Alt for fine control (one tenth).');
		const labels = m.all('label.toggle').map((l) => l.textContent?.trim());
		expect(labels).toEqual(['Snap to reference planes and axes', "Snap to other bodies' faces and corners", 'Snap turns to 15° steps']);
	});
});

describe('a read-only document', () => {
	it('keeps every box and loses both apply controls', () => {
		const h = harness({ canWrite: false }), m = mountPanel(h);
		expect(m.all('[data-testid="ideacad-move-apply"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-rotate-apply"]')).toHaveLength(0);
		expect(m.all('input')).toHaveLength(7); expect(m.all('select')).toHaveLength(1);
		h.set({ canWrite: true }); m.flush();
		expect(m.all('[data-testid="ideacad-move-apply"]')).toHaveLength(1);
		expect(m.all('[data-testid="ideacad-rotate-apply"]')).toHaveLength(1);
		expect(m.all('button')).toHaveLength(2);
	});
});
