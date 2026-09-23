// tests/dom/ideacad-analysis-mount.test.ts
//
// THE ANALYSIS PANEL, MOUNTED against a stand-in `WorkspaceApi` holding the
// harness's representative robot (`analysis/sample.ts`). The arithmetic is
// proven in `tests/ideacad-solid-analysis-mass.test.ts` and against the kernel
// in `tests/ideacad-solid-analysis-kernel.test.ts`; what is here is the half
// that only exists once the component is wired, each counted in BOTH
// directions on one fixture:
//
//   * a fully cited model shows a total, a CG, a tip angle and an inertia, and
//     no blocker list; the everyday robot (printed wheels with a measured
//     mass, a motor with no material) shows Unknown for the total, the CG and
//     the inertia, names every blocking body with its reason, and offers a
//     Material control per body -- which applies the same `metadata` command
//     the body panel sends -- and a read-only document offers none;
//   * selecting the weapon's bore picks that axis and that body by default;
//   * the spinner section exists only while its add-on is on;
//   * the interference section is ABSENT when the worker answers
//     "Unknown geometry operation." and PRESENT, grouped, when it answers a
//     report -- and the request is made from an effect without looping;
//   * no field carries min, max or type="number";
//   * guides are drawn for the balance and cleared on unmount.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE (`tests/dom/README.md`); those are
// measured in Chromium by `tools/browser-verify/routes/ideacad-analysis*.mjs`.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import AnalysisPanel from '$lib/ideacad/solid/AnalysisPanel.svelte';
import { SAMPLE_INTERFERENCE, sampleModel, type SampleState } from '$lib/ideacad/solid/analysis/sample';
import { SPINNER_ADDON_ID } from '$lib/ideacad/solid/addons/spinner';
import { emptyManifest, type ModelProjection, type Selection, type SolidCommand } from '$lib/ideacad/solid/types';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = AnalysisPanel as unknown as Component<Record<string, unknown>>;
type Over = Partial<{ model: ModelProjection; selections: Selection[]; canWrite: boolean; busy: boolean }>;
interface Harness { api: WorkspaceApi; applied: { command: SolidCommand; label: string }[]; requests: string[]; guides: number; cleared: number; set(over: Over): void }
function harness(state: SampleState = 'cited', opts: { interference?: 'report' | 'unsupported'; addons?: Record<string, boolean> } & Over = {}): Harness {
	const s = reactiveProps({ model: opts.model ?? sampleModel(state, opts.addons), selections: opts.selections ?? ([] as Selection[]), canWrite: opts.canWrite ?? true, busy: opts.busy ?? false });
	const h: Harness = {
		api: null as unknown as WorkspaceApi, applied: [], requests: [], guides: 0, cleared: 0,
		set: (over) => Object.assign(s, over)
	};
	h.api = {
		get model() { return s.model; }, get manifest() { return emptyManifest(); }, get selections() { return s.selections; }, get canWrite() { return s.canWrite; }, get busy() { return s.busy; }, get tool() { return 'select' as const; }, get editingSketch() { return null; },
		apply: async (command, label) => { h.applied.push({ command, label }); }, select: () => {}, setTool: () => {}, editSketch: () => {}, setSketchPointer: () => {},
		request: (async (method: string) => {
			h.requests.push(method);
			if (opts.interference === 'report' && method === 'interference') return structuredClone(SAMPLE_INTERFERENCE);
			throw Error('Unknown geometry operation.');
		}) as WorkspaceApi['request'],
		project: () => ({ x: 0, y: 0 }), error: () => {}, guide: () => { h.guides++; }, clearGuides: () => { h.cleared++; }, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	};
	return h;
}
const mounted: Mounted[] = [];
function mountPanel(h: Harness) { const m = mountInto(Panel, { api: h.api }); mounted.push(m); return m; }
afterEach(async () => { for (const m of mounted) await m.stop(); mounted.length = 0; });
const text = (m: Mounted, sel: string) => m.one(sel).textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('mass and balance', () => {
	it('a fully cited model: a total, a CG, a tip angle and an inertia, and no blocker list anywhere', async () => {
		const h = harness('cited'); const m = mountPanel(h); await m.settle();
		expect(text(m, '[data-testid="ideacad-analysis-total"]')).toMatch(/^[\d,.]+ g · [\d.]+ lb$/);
		expect(m.all('[data-testid="ideacad-analysis-mass"] tbody tr')).toHaveLength(6);
		expect(m.one('[data-testid="ideacad-analysis-mass"] tbody tr').getAttribute('data-body')).toBe('disk#0');
		expect(text(m, '[data-testid="ideacad-analysis-cg"]')).toMatch(/ in$/);
		expect(text(m, '[data-testid="ideacad-analysis-tip"]')).toMatch(/°.*toward \+X/);
		expect(text(m, '[data-testid="ideacad-analysis-inertia-lb"]')).toMatch(/lb·in²$/);
		expect(text(m, '[data-testid="ideacad-analysis-inertia-si"]')).toMatch(/kg·m²$/);
		expect(m.all('[data-testid$="-blockers"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-analysis-material"]')).toHaveLength(0);
		/* Every section carries its formulas, closed on arrival. */
		for (const id of ['mass', 'balance', 'inertia']) expect(m.expanded(`ideacad-analysis-${id}-formulas`)).toBe('false');
	});
	it('the everyday robot: Unknown for the total, the CG and the inertia, every blocker named with its reason, and a Material control each', async () => {
		const h = harness('printed'); const m = mountPanel(h); await m.settle();
		expect(text(m, '[data-testid="ideacad-analysis-total"]')).toBe('Unknown');
		expect(text(m, '[data-testid="ideacad-analysis-cg"]')).toBe('Unknown');
		const cg = m.all('[data-testid="ideacad-analysis-cg-blockers"] li');
		expect(cg.map((li) => li.getAttribute('data-body'))).toEqual(['wheel-l#0', 'wheel-r#0', 'motor#0']);
		expect(cg.map((li) => li.querySelector('.an-why')!.textContent)).toEqual(['Measured mass only', 'Measured mass only', 'No material']);
		expect(text(m, '[data-testid="ideacad-analysis-inertia-lb"]')).toBe('Unknown');
		expect(m.all('[data-testid="ideacad-analysis-inertia-blockers"] li')).toHaveLength(3);
		/* No tip angle is offered without a CG. */
		expect(m.all('[data-testid="ideacad-analysis-tip"]')).toHaveLength(0);
		/* One Material control per blocking body, in the balance list; the inertia list names the same bodies without repeating the controls. */
		const selects = m.all<HTMLSelectElement>('[data-testid="ideacad-analysis-material"]');
		expect(selects).toHaveLength(3);
		expect(m.all('[data-testid="ideacad-analysis-inertia-blockers"] select')).toHaveLength(0);
		selects[2].value = 'steel-1018'; selects[2].dispatchEvent(new Event('change', { bubbles: true })); await m.settle();
		expect(h.applied).toEqual([{ command: { type: 'metadata', bodyId: 'motor#0', materialId: 'steel-1018', massG: null, massSource: 'measured' }, label: 'Set material' }]);
	});
	it('read-only: the same Unknowns and blocker names, and no Material control at all', async () => {
		const h = harness('printed', { canWrite: false }); const m = mountPanel(h); await m.settle();
		expect(m.all('[data-testid="ideacad-analysis-cg-blockers"] li')).toHaveLength(3);
		expect(m.all('[data-testid="ideacad-analysis-material"]')).toHaveLength(0);
	});
	it('draws the balance guides and clears them on unmount', async () => {
		const h = harness('cited'); const m = mountPanel(h); await m.settle();
		expect(h.guides).toBeGreaterThan(3);
		const before = h.cleared; await m.stop(); expect(h.cleared).toBe(before + 1);
	});
});

describe('the axis and the bodies the selection implies', () => {
	it('selecting the bore picks its axis and narrows the bodies to the disk; a second choice keeps All', async () => {
		const h = harness('printed', { selections: [{ bodyId: 'disk#0', kind: 'face', id: 'disk.bore' }] }); const m = mountPanel(h); await m.settle();
		const axis = m.one<HTMLSelectElement>('[data-testid="ideacad-analysis-axis"]');
		expect(axis.value).toBe('sel:disk#0/face/disk.bore');
		expect(axis.options[0].textContent).toBe('Weapon disk round face');
		expect(m.one<HTMLSelectElement>('[data-testid="ideacad-analysis-subject"]').value).toBe('selection');
		/* The disk alone is cited, so its inertia reads even though the whole robot's does not. */
		expect(text(m, '[data-testid="ideacad-analysis-inertia-lb"]')).toMatch(/lb·in²$/);
		h.set({ selections: [] }); await m.settle();
		expect(m.all('[data-testid="ideacad-analysis-subject"]')).toHaveLength(0);
		expect(m.one<HTMLSelectElement>('[data-testid="ideacad-analysis-axis"]').value).toBe('cg-z');
	});
});

describe('the spinner add-on', () => {
	it('is absent while the add-on is off and present, with its four fields and readout, while it is on', async () => {
		const off = mountPanel(harness('cited')); await off.settle();
		expect(off.all('[data-testid="ideacad-analysis-spinner"]')).toHaveLength(0);
		const on = mountPanel(harness('cited', { addons: { [SPINNER_ADDON_ID]: true }, selections: [{ bodyId: 'disk#0', kind: 'face', id: 'disk.bore' }] })); await on.settle();
		expect(on.all('[data-testid="ideacad-analysis-spinner"] input')).toHaveLength(4);
		expect(text(on, '[data-testid="ideacad-analysis-bite"]')).toBe('0.498 in');
		expect(text(on, '[data-testid="ideacad-analysis-spinner-subject"]')).toBe('Weapon disk');
		expect(text(on, '[data-testid="ideacad-analysis-energy"]')).toMatch(/ J/);
		expect(text(on, '[data-testid="ideacad-analysis-kv"]')).toBe('477 kV');
	});
	it('no field in the panel carries min, max or a number type', async () => {
		const m = mountPanel(harness('cited', { addons: { [SPINNER_ADDON_ID]: true } })); await m.settle();
		const inputs = m.all<HTMLInputElement>('input');
		expect(inputs.length).toBe(4);
		for (const i of inputs) { expect(i.getAttribute('type')).toBe('text'); expect(i.hasAttribute('min')).toBe(false); expect(i.hasAttribute('max')).toBe(false); expect(i.getAttribute('inputmode')).toBe('decimal'); }
	});
});

describe('interference, from the engine request', () => {
	it('absent when the worker has no such request, present and grouped when it answers', async () => {
		const none = harness('cited', { interference: 'unsupported' }); const a = mountPanel(none); await a.settle();
		expect(none.requests).toEqual(['interference']);
		expect(a.all('[data-testid="ideacad-analysis-interference"]')).toHaveLength(0);
		const some = harness('cited', { interference: 'report' }); const b = mountPanel(some); await b.settle();
		expect(b.all('[data-testid="ideacad-analysis-interference"]')).toHaveLength(1);
		const kinds = b.all('[data-testid="ideacad-analysis-pairs"] button').map((x) => x.getAttribute('data-kind'));
		expect(kinds).toEqual(['interference', 'touching', 'touching', 'touching', 'clear', 'clear', 'clear']);
		expect(text(b, '[data-testid="ideacad-analysis-overlaps"]')).toBe('1 overlap');
		expect(b.all('[data-testid="ideacad-analysis-more-clearances"]')).toHaveLength(1);
		/* One request for one geometry: the effect does not loop. */
		await b.settle(); await b.settle();
		expect(some.requests).toEqual(['interference']);
	});
	it('is not asked while the workspace is busy, and is asked once it is not', async () => {
		const h = harness('cited', { interference: 'report', busy: true }); const m = mountPanel(h); await m.settle();
		expect(h.requests).toEqual([]);
		h.set({ busy: false }); await m.settle();
		expect(h.requests).toEqual(['interference']);
	});
});
