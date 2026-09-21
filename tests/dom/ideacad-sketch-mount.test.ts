// tests/dom/ideacad-sketch-mount.test.ts
//
// THE SKETCH EDITOR PANEL, MOUNTED against a recording WorkspaceApi, for the
// half that only exists once the component is wired: the pointer handler
// installed on mount and removed on unmount, a line chain driven through it
// landing as ONE `set-feature` with entities and constraints, the editing
// look drawn through `api.guide` and cleared on every change, Delete
// swallowed at the window, the polygon side count written to the drawing
// setting or refused by sentence, the selection published as sketch-entity
// selections, an extrude of ticked regions, and Done closing the sketch.
// NO GEOMETRY HERE (tests/dom/README.md): pixels per inch is a number the
// stand-in `project` returns, not something laid out.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SketchEditor from '$lib/ideacad/solid/SketchEditor.svelte';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { emptyManifest, type ModelProjection, type Selection, type SketchProjection, type SolidCommand, type SolidManifest, type Vec3 } from '$lib/ideacad/solid/types';
import { drawingSettings } from '$lib/ideacad/solid/viewport/drawing';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = SketchEditor as unknown as Component<Record<string, unknown>>;
type Handler = (event: 'down' | 'move' | 'up', at: [number, number], e: PointerEvent) => boolean;
const entities: SketchProjection['entities'] = [
	{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: 4, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 3 }, { id: 'p3', type: 'point', x: 0, y: 3 },
	{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
];
const sketch = (): SketchProjection => ({ feature: 's1', name: 'Sketch 1', plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] }, planeRef: { kind: 'datum', datum: 'XY' }, entities: [...entities], constraints: [{ id: 'kh', type: 'horizontal', line: 'l0' }], solve: { converged: true, classification: 'underConstrained', dof: 7, maxResidual: 0, trouble: [] }, regions: [{ id: 'r0', outline: [], holes: [], area: 12 }], consumed: false });
const model = (): ModelProjection => ({ bodies: [], sketches: [sketch()], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 });
const manifest = (): SolidManifest => ({ ...emptyManifest(), features: [{ id: 's1', name: 'Sketch 1', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [...entities], constraints: [] }] });

interface Harness { api: WorkspaceApi; applied: { command: SolidCommand; label: string }[]; errors: string[]; guides: { points: Vec3[]; color?: string }[]; clears: number; handlers: (Handler | null)[]; selected: Selection[][]; edits: (string | null)[]; set(over: Partial<{ canWrite: boolean; busy: boolean; editingSketch: string | null; model: ModelProjection }>): void }
function harness(initial: Partial<{ canWrite: boolean; busy: boolean; editingSketch: string | null; model: ModelProjection }> = {}): Harness {
	const state = reactiveProps({ canWrite: true, busy: false, editingSketch: 's1' as string | null, model: model(), manifest: manifest(), tool: 'select' as const, ...initial });
	const h = { applied: [] as Harness['applied'], errors: [] as string[], guides: [] as Harness['guides'], clears: 0, handlers: [] as Harness['handlers'], selected: [] as Selection[][], edits: [] as (string | null)[] };
	let current: Selection[] = [];
	const api: WorkspaceApi = {
		get model() { return state.model; }, get manifest() { return state.manifest; }, get selections() { return current; }, get canWrite() { return state.canWrite; }, get busy() { return state.busy; }, get tool() { return state.tool; }, get editingSketch() { return state.editingSketch; },
		apply: async (command, label) => { h.applied.push({ command, label }); }, select: (s, append) => { current = s ? (append ? [...current, s] : [s]) : []; h.selected.push(current); }, setTool: () => {}, editSketch: (id) => { h.edits.push(id); }, setSketchPointer: (fn) => { h.handlers.push(fn); },
		request: async () => { throw Error('not in this test'); }, project: (p) => ({ x: p[0] * 50, y: -p[1] * 50 }), error: (m) => { h.errors.push(m); }, guide: (points, color) => { h.guides.push({ points, color }); }, clearGuides: () => { h.clears++; }, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	};
	/* Returned by identity, not spread: `clears` is a number and a spread would copy it at zero. */
	return Object.assign(h, { api, set: (over: Partial<{ canWrite: boolean; busy: boolean; editingSketch: string | null; model: ModelProjection }>) => { Object.assign(state, over); } });
}
const mounted: Mounted[] = [];
function mountPanel(h: Harness) { const m = mountInto(Panel, { api: h.api }); mounted.push(m); return m; }
afterEach(async () => { for (const m of mounted) await m.stop(); mounted.length = 0; drawingSettings.polygonSides = 6; });
const handler = (h: Harness) => { const fn = h.handlers[h.handlers.length - 1]; if (!fn) throw Error('no pointer handler installed'); return fn; };
const ev = (shift = false) => ({ shiftKey: shift } as PointerEvent);
const tool = (m: Mounted, word: string) => { const b = m.all<HTMLButtonElement>('button.tool').find((x) => x.textContent === word); if (!b) throw Error(`no ${word} tool`); b.click(); m.flush(); };
const settled = async (m: Mounted) => { await m.settle(); await new Promise((r) => setTimeout(r, 40)); m.flush(); };

describe('the sketch editor, mounted', () => {
	it('installs the pointer handler on mount and removes it on unmount; draws the editing look and clears it on unmount', async () => {
		const h = harness(); const m = mountPanel(h);
		expect(h.handlers).toHaveLength(1); expect(typeof h.handlers[0]).toBe('function');
		/* Four point markers and the one horizontal glyph (three strokes) on mount. */
		expect(h.guides.length).toBe(7); expect(h.clears).toBeGreaterThanOrEqual(1);
		const clearsBefore = h.clears;
		await m.stop();
		expect(h.handlers[h.handlers.length - 1]).toBeNull(); expect(h.clears).toBeGreaterThan(clearsBefore);
	});
	it('a line chain through the handler lands as one set-feature carrying entities and constraints, labelled for the history row', async () => {
		const h = harness(); const m = mountPanel(h); tool(m, 'Line');
		const fn = handler(h);
		expect(fn('down', [4, 3], ev())).toBe(true); expect(fn('down', [6, 3], ev())).toBe(true); expect(fn('down', [6, 5], ev())).toBe(true);
		m.flush();
		expect(m.one('[data-testid="ideacad-sketch-hint"]').textContent).toContain('3 points placed');
		expect(h.applied).toHaveLength(0);
		fn('down', [4, 3], ev());
		await settled(m);
		expect(h.applied).toHaveLength(1);
		const { command, label } = h.applied[0];
		expect(label).toBe('Draw closed outline');
		expect(command.type).toBe('set-feature'); if (command.type !== 'set-feature') throw Error('unreachable');
		expect(command.id).toBe('s1');
		const patch = command.patch as { entities: SketchProjection['entities']; constraints: SketchProjection['constraints'] };
		expect(patch.entities.filter((e) => e.type === 'line')).toHaveLength(7); expect(patch.entities.filter((e) => e.type === 'point')).toHaveLength(6);
		/* The existing horizontal, plus one per snapped step: level to (6,3), plumb to (6,5); the closing step back to the corner was not snapped. */
		expect(patch.constraints.length).toBe(1 + 2);
	});
	it('a press on a line selects it, publishes a sketch-entity selection, offers its constraints, and Delete removes it and is swallowed', async () => {
		const h = harness(); const m = mountPanel(h);
		const fn = handler(h);
		fn('down', [2, 0.02], ev()); fn('up', [2, 0.02], ev()); m.flush();
		expect(m.one('[data-testid="ideacad-sketch-selection"]').textContent).toContain('Line 1 selected');
		expect(h.selected[h.selected.length - 1]).toEqual([{ bodyId: '', kind: 'sketch-entity', id: 's1/l0' }]);
		const words = m.all<HTMLButtonElement>('[data-testid="ideacad-sketch-selection"] button').map((b) => b.textContent);
		expect(words).toEqual(expect.arrayContaining(['Delete', 'Horizontal', 'Vertical'])); expect(m.all('[data-testid="ideacad-sketch-selection"] form')).toHaveLength(1);
		const guidesBefore = h.guides.length;
		const key = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
		window.dispatchEvent(key);
		expect(key.defaultPrevented).toBe(true);
		await settled(m);
		expect(h.applied[0].label).toBe('Delete entity');
		expect((h.applied[0].command as { patch: { entities: unknown[] } }).patch.entities.filter((e) => (e as { type: string }).type === 'line')).toHaveLength(3);
		expect(h.guides.length).toBeGreaterThan(guidesBefore);
		/* With nothing selected Delete is still swallowed: the workspace's own Delete would remove the open sketch. */
		const again = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
		window.dispatchEvent(again); expect(again.defaultPrevented).toBe(true);
		/* But not inside an input, where Backspace is typing. */
		const input = m.one<HTMLInputElement>('input[name="sides"]');
		const typing = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
		input.dispatchEvent(typing); expect(typing.defaultPrevented).toBe(false);
	});
	it('the polygon side count is written to the drawing setting, refused by sentence under three, and never clamped above', () => {
		const h = harness(); const m = mountPanel(h);
		const input = m.one<HTMLInputElement>('input[name="sides"]');
		const type = (v: string) => { input.value = v; input.dispatchEvent(new Event('change', { bubbles: true })); m.flush(); };
		type('8'); expect(drawingSettings.polygonSides).toBe(8); expect(h.errors).toEqual([]);
		type('2'); expect(drawingSettings.polygonSides).toBe(8); expect(h.errors).toEqual(['A polygon needs a whole number of sides, at least 3.']);
		type('360'); expect(drawingSettings.polygonSides).toBe(360);
		type('4.5'); expect(drawingSettings.polygonSides).toBe(360); expect(h.errors).toHaveLength(2);
		for (const el of m.all('input')) { expect(el.hasAttribute('min')).toBe(false); expect(el.hasAttribute('max')).toBe(false); expect(el.hasAttribute('step')).toBe(false); }
	});
	it('adding a dimension from the offer applies the constraint with the typed value, and a non-number is refused with nothing applied', async () => {
		const h = harness(); const m = mountPanel(h);
		const fn = handler(h); fn('down', [2, 0.02], ev()); fn('up', [2, 0.02], ev()); m.flush();
		const form = m.one<HTMLFormElement>('[data-testid="ideacad-sketch-selection"] form'), input = form.querySelector('input')!;
		expect(input.value).toBe('4');
		input.value = 'wide'; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settled(m);
		expect(h.errors).toEqual(['Enter a number for distance.']); expect(h.applied).toHaveLength(0);
		input.value = '6.5'; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settled(m);
		expect(h.applied).toHaveLength(1); expect(h.applied[0].label).toBe('Add distance');
		const patch = (h.applied[0].command as { patch: { constraints: { type: string; value?: number }[] } }).patch;
		expect(patch.constraints).toHaveLength(2); expect(patch.constraints[1]).toMatchObject({ type: 'distance', value: 6.5 });
		/* Remove on the existing horizontal row. */
		m.all<HTMLButtonElement>('li[data-constraint="kh"] button').find((b) => b.textContent === 'Remove')!.click(); await settled(m);
		expect(h.applied[1].label).toBe('Remove constraint'); expect((h.applied[1].command as { patch: { constraints: unknown[] } }).patch.constraints).toHaveLength(0);
	});
	it('extruding ticked regions closes the sketch and adds an extrude naming them; nothing ticked is refused', async () => {
		const h = harness(); const m = mountPanel(h);
		const form = m.one<HTMLFormElement>('form.extrude');
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settled(m);
		expect(h.errors).toEqual(['Tick at least one closed region to extrude.']); expect(h.applied).toHaveLength(0); expect(h.edits).toEqual([]);
		const box = m.one<HTMLInputElement>('label.region input'); box.click(); m.flush();
		const distance = form.querySelector('input')!; distance.value = '2.5'; distance.dispatchEvent(new Event('input', { bubbles: true })); m.flush();
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settled(m);
		expect(h.edits).toEqual([null]); expect(h.applied).toHaveLength(1);
		expect(h.applied[0].command).toMatchObject({ type: 'add-feature', feature: { type: 'extrude', sketch: 's1', distance: 2.5, operation: 'new' } });
		expect((h.applied[0].command as { feature: { regions?: string[] } }).feature.regions).toBeUndefined();
	});
	it('Done closes the sketch and re-selects it; a read-only document mounts no write control and refuses a drawing press by sentence', async () => {
		const h = harness(); const m = mountPanel(h);
		m.all<HTMLButtonElement>('button.done')[0].click(); m.flush();
		expect(h.edits).toEqual([null]); expect(h.selected[h.selected.length - 1]).toEqual([{ bodyId: '', kind: 'sketch', id: 's1' }]);
		const r = harness({ canWrite: false }); const mr = mountPanel(r);
		expect(mr.all('button.tool')).toHaveLength(1); expect(mr.all('form')).toHaveLength(0); expect(mr.all('input:not([type=checkbox])')).toHaveLength(0);
		const fn = handler(r); fn('down', [2, 0.02], ev()); fn('up', [2, 0.02], ev()); mr.flush();
		expect(mr.one('[data-testid="ideacad-sketch-selection"]').textContent).toContain('Line 1 selected');
		expect(mr.all('[data-testid="ideacad-sketch-selection"] button')).toHaveLength(0);
		expect(r.applied).toHaveLength(0);
	});
});
