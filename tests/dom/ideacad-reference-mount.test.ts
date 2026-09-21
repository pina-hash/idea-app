// tests/dom/ideacad-reference-mount.test.ts
//
// THE REFERENCE PANEL, MOUNTED, so real presses reach real handlers: what a
// construction button SENDS through the api, what a press on one that is not
// ready SAYS, that a typed number goes out as typed, what a row press selects,
// and that the datum-plane checkbox writes the layer's own setting.
//
// WHY THIS IS AUTOMATED. Every claim here regresses invisibly: a button whose
// sentence no longer matches the feature it sends renders identically; a
// field that rounded -3.5 or refused 1e9 still looks like a field; a checkbox
// that no longer reaches `setDatumPlanesShown` still ticks. The expected
// feature shapes come from `referenceOffers` and `refFromSelection`, which are
// the things the panel surfaces and not the thing under test; the expected
// refusal sentence is the one the offer carries.
//
// THE API IS A RECORDER. `fake` answers `apply` by recording, so nothing
// re-renders afterwards and each case mounts with the selection it needs
// already made. NO GEOMETRY, NO CONTRAST, NO TAP TARGET HERE: happy-dom has no
// layout engine and every box reads zero. The 44px rows are measured in a real
// Chromium.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ReferencePanel from '$lib/ideacad/solid/ReferencePanel.svelte';
import { referenceOffers } from '$lib/ideacad/solid/features/reference';
import { refFromSelection, lostReference } from '$lib/ideacad/solid/naming';
import { datumPlanesShown, setDatumPlanesShown } from '$lib/ideacad/solid/viewport/reference-layer';
import { emptyManifest, type BodyProjection, type ModelProjection, type ResolvedPlane, type Selection, type SolidCommand, type Vec3 } from '$lib/ideacad/solid/types';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { mountInto, type Mounted } from './mount';

const Panel = ReferencePanel as unknown as Component<Record<string, unknown>>;
const face = (id: string, kind: string, normal: Vec3, center: Vec3, area: number) => ({ id, kind, center, normal, area, surface: {}, edges: [], positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const BOX: BodyProjection = {
	id: 'x1#0', name: 'Body 1', materialId: null, role: 'part', createdBy: 'x1',
	faces: [face('x1.end', 'plane', [0, 0, 1], [2, 1.5, 1], 12), face('h1.side', 'cylinder', [0, 0, 0], [2, 1.5, 0.5], 3.14)],
	edges: [{ id: 'edge:x1.end|x1.side.0', curve: 'LINE', points: new Float32Array(), faces: ['x1.end', 'x1.side.0'], length: 4, mid: [2, 0, 1] }],
	vertices: [{ id: 'vertex:a', point: [0, 0, 1], faces: ['x1.end', 'x1.side.0', 'x1.side.3'] }],
	mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, bounds: [0, 0, 0, 4, 3, 1], volume: 12, centerOfMass: [2, 1.5, 0.5], inertia: []
};
const LOST = lostReference('corner', 'x1.end|x1.side.0|x1.side.3');
const PLANE: ResolvedPlane = { origin: [0, 0, 2], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] };
/** Three reference features: a plane and an axis that resolved, and a point whose corner is gone, so it has a row and a sentence but nothing to draw. */
const MODEL: ModelProjection = {
	bodies: [BOX], sketches: [], mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false,
	references: [{ feature: 'pl1', name: 'Plane 1', kind: 'plane', ...PLANE, size: 3 }, { feature: 'ax1', name: 'Axis 1', kind: 'axis', origin: [0, 0, 0], direction: [0, 0, 1], size: 3 }],
	features: [
		{ id: 'x1', index: 0, type: 'extrude', name: 'Extrude 1', status: 'ok', summary: '1 in', bodies: ['x1#0'], dependsOn: [], suppressed: false },
		{ id: 'pl1', index: 1, type: 'plane', name: 'Plane 1', status: 'ok', summary: '2 in', bodies: [], dependsOn: [], suppressed: false },
		{ id: 'ax1', index: 2, type: 'axis', name: 'Axis 1', status: 'ok', summary: 'datum', bodies: [], dependsOn: [], suppressed: false },
		{ id: 'pt1', index: 3, type: 'point', name: 'Point 1', status: 'error', message: LOST, summary: 'vertex', bodies: [], dependsOn: ['x1'], suppressed: false }
	]
};
interface Fake { api: WorkspaceApi; commands: { command: SolidCommand; label: string }[]; selects: { selection: Selection | null; append: boolean }[]; errors: string[]; clips: (ResolvedPlane | null)[]; looks: ResolvedPlane[] }
function fake(over: Partial<{ selections: Selection[]; canWrite: boolean; busy: boolean }> = {}): Fake {
	const r: Fake = { api: null as unknown as WorkspaceApi, commands: [], selects: [], errors: [], clips: [], looks: [] };
	let selections = over.selections ?? [];
	r.api = {
		get model() { return MODEL; }, get manifest() { return emptyManifest(); }, get selections() { return selections; },
		get canWrite() { return over.canWrite ?? true; }, get busy() { return over.busy ?? false; }, get tool() { return 'reference' as const; }, get editingSketch() { return null; },
		async apply(command, label) { r.commands.push({ command, label }); },
		select(selection, append = false) { r.selects.push({ selection, append }); if (!selection) selections = []; else if (append) selections = [...selections, selection]; else selections = [selection]; },
		setTool() {}, editSketch() {}, setSketchPointer() {}, request: async () => { throw Error('not in the fixture'); }, project: () => ({ x: 0, y: 0 }),
		error(message) { r.errors.push(message); }, guide() {}, clearGuides() {}, clip(plane) { r.clips.push(plane); }, lookAt(plane) { r.looks.push(plane); }, fit() {}, unproject: () => null
	};
	return r;
}
const mounted: Mounted[] = [];
afterEach(async () => { for (const m of mounted.splice(0)) await m.stop(); setDatumPlanesShown(false); });
function panel(over: Parameters<typeof fake>[0] = {}) { const f = fake(over); const m = mountInto(Panel, { api: f.api }); mounted.push(m); return { m, f }; }
const offer = (m: Mounted, id: string) => m.one<HTMLButtonElement>(`button.offer[data-offer="${id}"]`);
const offersWhere = (m: Mounted, disabled: 'true' | 'false') => m.all<HTMLButtonElement>(`button.offer[aria-disabled="${disabled}"]`);
const type = (el: HTMLInputElement, value: string) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const shiftClick = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
const sel = (kind: Selection['kind'], id: string, bodyId = 'x1#0'): Selection => ({ bodyId, kind, id });
const CHOICES = { datum: 'XY' as const, axis: 'Z' as const, offset: 1, angle: 45, coordinates: [0, 0, 0] as Vec3 };

describe('the constructions', () => {
	it('every one is on screen with a word and a sentence; with nothing selected four are ready and twelve say why not; a press on one that is not ready says the reason and sends nothing', async () => {
		const { m, f } = panel();
		const all = m.all<HTMLButtonElement>('button.offer');
		expect(all).toHaveLength(16);
		for (const b of all) { expect(b.querySelector('.title')!.textContent!.trim().length).toBeGreaterThan(3); expect(b.querySelector('.sentence')!.textContent!.trim().length).toBeGreaterThan(8); expect(b.disabled).toBe(false); }
		expect(offersWhere(m, 'false')).toHaveLength(4);
		expect(offersWhere(m, 'true')).toHaveLength(12);
		expect(m.one('[data-testid="ideacad-reference-ready-selection"]').textContent).toBe('0 of 8 ready');
		expect(m.one('[data-testid="ideacad-reference-ready-construction"]').textContent).toBe('4 of 8 ready');
		offer(m, 'plane-face').click(); await m.settle();
		expect(f.errors).toEqual(['Select one flat face.']);
		expect(f.commands).toHaveLength(0);
		/* Positive control on the same mount: a ready one sends its feature, with the label the history row shows. */
		offer(m, 'plane-offset').click(); await m.settle();
		expect(f.commands).toEqual([{ command: { type: 'add-feature', feature: { id: '', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 1 } } }, label: 'Add offset plane' }]);
		expect(f.errors).toHaveLength(1);
	});
	it('with a flat face selected, "Plane on flat face" is ready, names the body, and sends the face reference with its hint', async () => {
		const s = sel('face', 'x1.end');
		const { m, f } = panel({ selections: [s] });
		expect(offersWhere(m, 'false')).toHaveLength(10);
		expect(offer(m, 'plane-face').querySelector('.sentence')!.textContent).toBe('Plane on the selected flat face of Body 1.');
		expect(offer(m, 'axis-face').getAttribute('aria-disabled')).toBe('true');
		offer(m, 'plane-face').click(); await m.settle();
		expect(f.commands).toEqual([{ command: { type: 'add-feature', feature: { id: '', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'face', face: refFromSelection(s, BOX) }, offset: 0 } } }, label: 'Add plane on flat face' }]);
		/* The whole list is what `referenceOffers` answers for this selection, sentence for sentence. */
		const expected = referenceOffers(MODEL, [s], CHOICES);
		expect(m.all<HTMLButtonElement>('button.offer').map((b) => b.querySelector('.sentence')!.textContent)).toEqual(expected.map((o) => o.sentence));
	});
	it('a typed number goes out as typed, negative or huge, and a non-number makes the button say so and send nothing', async () => {
		const { m, f } = panel();
		const input = m.one<HTMLInputElement>('[data-testid="ideacad-reference-offset"]');
		type(input, '-3.5'); m.flush();
		expect(offer(m, 'plane-offset').querySelector('.sentence')!.textContent).toBe('Plane -3.5 in from the XY plane.');
		offer(m, 'plane-offset').click(); await m.settle();
		expect((f.commands[0].command as { feature: { definition: { offset: number } } }).feature.definition.offset).toBe(-3.5);
		type(input, '1e9'); m.flush();
		offer(m, 'plane-offset').click(); await m.settle();
		expect((f.commands[1].command as { feature: { definition: { offset: number } } }).feature.definition.offset).toBe(1e9);
		type(input, 'abc'); m.flush();
		expect(offer(m, 'plane-offset').getAttribute('aria-disabled')).toBe('true');
		expect(offer(m, 'plane-offset').querySelector('.sentence')!.textContent).toBe('Enter a finite offset.');
		offer(m, 'plane-offset').click(); await m.settle();
		expect(f.errors).toEqual(['Enter a finite offset.']);
		expect(f.commands).toHaveLength(2);
		/* An angle and coordinates take the same path. */
		type(m.one<HTMLInputElement>('[data-testid="ideacad-reference-angle"]'), '-720'); m.flush();
		offer(m, 'plane-angle').click(); await m.settle();
		expect((f.commands[2].command as { feature: { definition: { angle: number } } }).feature.definition.angle).toBe(-720);
		type(m.one<HTMLInputElement>('[data-testid="ideacad-reference-coordinates"]'), '1, 2'); m.flush();
		expect(offer(m, 'point-coordinates').querySelector('.sentence')!.textContent).toBe('Enter x, y, z as three finite numbers.');
		type(m.one<HTMLInputElement>('[data-testid="ideacad-reference-coordinates"]'), '-1, 0.001, 1e6'); m.flush();
		offer(m, 'point-coordinates').click(); await m.settle();
		expect((f.commands[3].command as { feature: { definition: { point: Vec3 } } }).feature.definition.point).toEqual([-1, 0.001, 1e6]);
	});
	it('read-only: every construction button is disabled, against none on a writable mount', () => {
		const ro = panel({ canWrite: false });
		expect(ro.m.all('button.offer:disabled')).toHaveLength(16);
		const rw = panel();
		expect(rw.m.all('button.offer:disabled')).toHaveLength(0);
		expect(rw.m.all('button.offer')).toHaveLength(16);
	});
});
describe('the document\'s references', () => {
	it('are listed with a status word, a lost one carries its sentence as an alert, a press selects and a shift-press appends', async () => {
		const { m, f } = panel();
		expect(m.all('[data-reference]').map((li) => li.getAttribute('data-reference'))).toEqual(['pl1', 'ax1', 'pt1']);
		expect(m.all('li.error')).toHaveLength(1);
		expect(m.one('[data-reference="pt1"] .message').getAttribute('role')).toBe('alert');
		expect(m.one('[data-reference="pt1"] .message').textContent).toBe(LOST);
		expect(m.one('[data-reference="pt1"] .meta').textContent).toBe('lost');
		expect(m.one('[data-reference="pl1"] .meta').textContent).toBe('plane');
		expect(m.all('.message')).toHaveLength(1);
		m.one<HTMLButtonElement>('[data-reference="pl1"] button.row').click(); await m.settle();
		expect(f.selects).toEqual([{ selection: { bodyId: '', kind: 'reference', id: 'pl1' }, append: false }]);
		shiftClick(m.one('[data-reference="ax1"] button.row')); await m.settle();
		expect(f.selects[1]).toEqual({ selection: { bodyId: '', kind: 'reference', id: 'ax1' }, append: true });
		/* Mounted with the plane already selected, its row says so and the others do not. */
		const selected = panel({ selections: [sel('reference', 'pl1', '')] });
		expect(selected.m.one('[data-reference="pl1"] button.row').getAttribute('aria-pressed')).toBe('true');
		expect(selected.m.one('[data-reference="pl1"] .meta').textContent).toBe('selected');
		expect(selected.m.all('button.row[aria-pressed="true"]')).toHaveLength(1);
		expect(selected.m.all('button.row[aria-pressed="false"]')).toHaveLength(2);
	});
	it('a plane row offers Look at and Section, which hand the viewport that plane, and a second Section press ends it; an axis row offers neither', async () => {
		const { m, f } = panel();
		expect(m.all('[data-reference="pl1"] .row-actions button')).toHaveLength(2);
		expect(m.all('[data-reference="ax1"] .row-actions button')).toHaveLength(0);
		expect(m.all('[data-reference="pt1"] .row-actions button')).toHaveLength(0);
		const [look, section] = m.all<HTMLButtonElement>('[data-reference="pl1"] .row-actions button');
		expect(look.textContent).toBe('Look at'); expect(section.textContent).toBe('Section');
		look.click(); await m.settle();
		expect(f.looks).toEqual([PLANE]);
		section.click(); await m.settle();
		expect(f.clips).toEqual([PLANE]);
		expect(section.textContent).toBe('End section');
		expect(section.getAttribute('aria-pressed')).toBe('true');
		section.click(); await m.settle();
		expect(f.clips).toEqual([PLANE, null]);
		expect(section.textContent).toBe('Section');
	});
	it('the hint says how a reference becomes a revolve axis, a pattern axis or a mirror plane, and which to select first', () => {
		const { m } = panel();
		const hint = m.one('[data-testid="ideacad-reference-hint"]').textContent!;
		expect(hint).toMatch(/revolve axis/); expect(hint).toMatch(/pattern axis/); expect(hint).toMatch(/mirror plane/);
		expect(hint).toMatch(/select the sketch or the body first/);
		expect(hint).toMatch(/shift-click/);
	});
});
describe('the datum planes', () => {
	it('the checkbox writes the layer\'s own setting in both directions', async () => {
		const { m } = panel();
		const box = m.one<HTMLInputElement>('[data-testid="ideacad-reference-datum-planes"]');
		expect(box.checked).toBe(false); expect(datumPlanesShown()).toBe(false);
		box.click(); await m.settle();
		expect(box.checked).toBe(true); expect(datumPlanesShown()).toBe(true);
		box.click(); await m.settle();
		expect(box.checked).toBe(false); expect(datumPlanesShown()).toBe(false);
		/* And it opens reading the setting as it stands, so two mounts cannot disagree with the layer. */
		setDatumPlanesShown(true);
		const again = panel();
		expect(again.m.one<HTMLInputElement>('[data-testid="ideacad-reference-datum-planes"]').checked).toBe(true);
	});
});
