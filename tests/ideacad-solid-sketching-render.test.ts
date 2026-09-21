// tests/ideacad-solid-sketching-render.test.ts
//
// THE SKETCH EDITOR PANEL, SERVER-RENDERED against a stand-in WorkspaceApi:
// what a student's browser receives. The solve classification in words, the
// tool buttons each carrying a word, the constraint rows, the region list with
// areas, and the two gates (a read-only document renders no write control; a
// writable one renders all of them) counted in both directions. NO INPUT
// CARRIES min, max OR step: nothing is clamped ahead of the kernel.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SketchEditor from '$lib/ideacad/solid/SketchEditor.svelte';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { emptyManifest, type ModelProjection, type SketchProjection, type SolidManifest } from '$lib/ideacad/solid/types';

const entities: SketchProjection['entities'] = [
	{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: 4, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 3 }, { id: 'p3', type: 'point', x: 0, y: 3 },
	{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
];
const constraints: SketchProjection['constraints'] = [{ id: 'kh', type: 'horizontal', line: 'l0' }, { id: 'kd', type: 'distance', a: 'p0', b: 'p1', value: 4 }];
const plane = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] } as const;
function api(over: Partial<{ canWrite: boolean; editingSketch: string | null; classification: SketchProjection['solve']['classification']; dof: number; trouble: string[]; consumers: boolean }> = {}): WorkspaceApi {
	const o = { canWrite: true, editingSketch: 's1', classification: 'underConstrained' as const, dof: 4, trouble: [] as string[], consumers: false, ...over };
	const sketch: SketchProjection = { feature: 's1', name: 'Sketch 1', plane: { origin: [...plane.origin], u: [...plane.u], v: [...plane.v], normal: [...plane.normal] }, planeRef: { kind: 'datum', datum: 'XY' }, entities, constraints, solve: { converged: true, classification: o.classification, dof: o.dof, maxResidual: 0, trouble: o.trouble }, regions: [{ id: 'r0', outline: [], holes: [], area: 12 }, { id: 'r1', outline: [], holes: [], area: 2.5 }], consumed: false };
	const model: ModelProjection = { bodies: [], sketches: [sketch], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 };
	const manifest: SolidManifest = { ...emptyManifest(), features: [{ id: 's1', name: 'Sketch 1', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities, constraints }, ...(o.consumers ? [{ id: 'x1', name: 'Extrude 1', type: 'extrude' as const, sketch: 's1', distance: 1, operation: 'new' as const, regions: ['r0'] }] : [])] };
	return {
		get model() { return model; }, get manifest() { return manifest; }, get selections() { return []; }, get canWrite() { return o.canWrite; }, get busy() { return false; }, get tool() { return 'select' as const; }, get editingSketch() { return o.editingSketch; },
		apply: async () => {}, select: () => {}, setTool: () => {}, editSketch: () => {}, setSketchPointer: () => {}, request: async () => { throw Error('not here'); }, project: (p) => ({ x: p[0] * 50, y: -p[1] * 50 }), error: () => {}, guide: () => {}, clearGuides: () => {}, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	};
}
const html = (a: WorkspaceApi) => render(SketchEditor, { props: { api: a } }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('the sketch editor panel, rendered', () => {
	it('says the solve classification in words with the free count, and names the sketch', () => {
		const out = html(api());
		expect(out).toContain('Sketch 1'); expect(out).toContain('Under defined · 4 free');
		expect(html(api({ classification: 'solved', dof: 0 }))).toContain('Fully defined');
		expect(html(api({ classification: 'unsatisfied', dof: 0 }))).toContain('Cannot be solved');
		expect(html(api({ classification: 'redundant', dof: 0 }))).toContain('Over defined');
		expect(out).toContain('4 entities · 2 constraints · 2 closed regions');
	});
	it('every tool is a button carrying a word, nine for a writer and one for a reader', () => {
		const writer = html(api()), reader = html(api({ canWrite: false }));
		for (const word of ['Select', 'Line', 'Rectangle', 'Circle', 'Arc', 'Polygon', 'Trim', 'Extend', 'Fillet']) expect(writer).toMatch(new RegExp(`<button[^>]*class="tool[^"]*"[^>]*>${word}</button>`));
		expect(count(writer, /aria-pressed=/g)).toBe(9); expect(count(reader, /aria-pressed=/g)).toBe(1);
		expect(reader).toMatch(/<button[^>]*class="tool[^"]*"[^>]*>Select<\/button>/);
	});
	it('lists every constraint by word and names, marks a troubled one, and offers Set and Remove only to a writer', () => {
		const writer = html(api({ trouble: ['kd'] })), reader = html(api({ canWrite: false }));
		expect(writer).toContain('Horizontal'); expect(writer).toContain('Line 1'); expect(writer).toContain('Distance'); expect(writer).toContain('Point 1, Point 2');
		expect(count(writer, /<em[^>]*>conflicts<\/em>/g)).toBe(1); expect(count(html(api()), /<em[^>]*>conflicts<\/em>/g)).toBe(0);
		expect(count(writer, />Remove<\/button>/g)).toBe(2); expect(count(reader, />Remove<\/button>/g)).toBe(0);
		expect(count(writer, /aria-label="Distance value"/g)).toBe(1); expect(count(reader, /aria-label="Distance value"/g)).toBe(0); expect(reader).toMatch(/<output[^>]*>4 in<\/output>/);
	});
	it('lists the closed regions with their areas and the extrude form, and an existing extrude with its region ticks', () => {
		const out = html(api({ consumers: true }));
		expect(out).toContain('Region 1'); expect(out).toContain('12.000 in²'); expect(out).toContain('Region 2'); expect(out).toContain('2.500 in²');
		expect(out).toContain('Extrude ticked'); expect(out).toContain('Extrude distance (in)');
		expect(out).toContain('Extrude 1 uses');
		const consumer = out.slice(out.indexOf('Extrude 1 uses'));
		expect(count(consumer, /type="checkbox" checked/g)).toBe(1); expect(count(consumer, /type="checkbox"/g)).toBe(2);
		const reader = html(api({ canWrite: false }));
		expect(reader).not.toContain('Extrude ticked'); expect(reader).toContain('12.000 in²'); expect(count(reader, /type="checkbox"[^>]*disabled/g)).toBe(2);
	});
	it('no input carries min, max or step, and the settings inputs exist only for a writer', () => {
		const writer = html(api()), reader = html(api({ canWrite: false }));
		expect(writer).not.toMatch(/\smin=/); expect(writer).not.toMatch(/\smax=/); expect(writer).not.toMatch(/\sstep=/);
		expect(writer).toContain('Polygon sides'); expect(writer).toContain('Fillet radius (in)');
		expect(reader).not.toContain('Polygon sides'); expect(reader).not.toContain('Fillet radius');
		expect(count(writer, /<form/g)).toBe(2); expect(count(reader, /<form/g)).toBe(0);
	});
	it('always offers Done, and says so when the open sketch is not in the model', () => {
		expect(html(api())).toMatch(/<button[^>]*class="done[^"]*"[^>]*>Done<\/button>/);
		const out = html(api({ editingSketch: 'missing' }));
		expect(out).toContain('not in the model right now'); expect(out).toMatch(/>Done<\/button>/); expect(count(out, /aria-pressed=/g)).toBe(0);
	});
});
