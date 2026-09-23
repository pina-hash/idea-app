// tests/dom/ideacad-mates-mount.test.ts
//
// THE MATE PANEL, MOUNTED against a stand-in `WorkspaceApi` that records what
// the panel asks the workspace to do. The solver, the joint planner and the
// readable names are proven in `tests/ideacad-solid-mates-*.test.ts`; what is
// here is the half that only exists once the component is wired:
//
//   * a JOINT (hinge) fills its slots from the picks in readable words and
//     applies ONE `{type:'batch'}` of two mate features labelled "Add hinge",
//     every mate carrying `joint` and one `group`; Delete removes the group
//     as one batch; picks that cannot make the joint say why beside the slots
//     and apply nothing;
//   * ONE MATE applies `{type:'add-feature', feature:{type:'mate', kind, a, b}}`
//     with the label "Add <kind> mate", `a` built from the FIRST pick with its
//     hint and `b` from the second, and a value only for distance and angle;
//   * a refusal goes to `api.error` as a sentence and NOTHING is applied:
//     fewer than two picks, two picks on one body, a value that is not a number,
//     a kind the two picks cannot take (F047); Add is `aria-disabled`, never
//     `disabled`, so it can still say why;
//   * the list shows every mate with a status word and glyph, its residual and
//     its message, and Delete applies `{type:'remove-feature'}`;
//   * a read-only document has NO form, NO Delete and NO Fix control, and
//     still lists every mate (both directions counted on one fixture);
//   * the freedom sentence and status word per mated body, and Fix in place as
//     a metadata command;
//   * NO INPUT CARRIES min, max OR step: a value the solver refuses is the
//     solver's own sentence on the row, never a browser attribute's.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE (`tests/dom/README.md`); the 44px
// controls are measured in a real Chromium in the surface's browser drive.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import MatePanel from '$lib/ideacad/solid/MatePanel.svelte';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { emptyManifest, type BodyProjection, type ModelProjection, type Selection, type SolidCommand, type SolidManifest } from '$lib/ideacad/solid/types';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = MatePanel as unknown as Component<Record<string, unknown>>;
const EMPTY: ModelProjection = { bodies: [], sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 };
const mesh = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const boxBody = (id: string, name: string, x0: number, w: number, h: number, extra: Partial<BodyProjection> = {}): BodyProjection => ({ id, name, materialId: null, role: 'part', createdBy: id.split('#')[0], volume: w * h, bounds: [x0, 0, 0, x0 + w, h, 1], centerOfMass: [x0 + w / 2, h / 2, 0.5], inertia: [], mesh: mesh(), edges: [], vertices: [],
	faces: [
		{ id: `${id.split('#')[0]}.end`, kind: 'plane', center: [x0 + w / 2, h / 2, 1], normal: [0, 0, 1], area: w * h, surface: { type: 'plane', normal: [0, 0, 1], d: 1 }, edges: [], ...mesh() },
		{ id: `${id.split('#')[0]}.start`, kind: 'plane', center: [x0 + w / 2, h / 2, 0], normal: [0, 0, -1], area: w * h, surface: { type: 'plane', normal: [0, 0, -1], d: 0 }, edges: [], ...mesh() }
	], ...extra });
const model = (over: Partial<ModelProjection> = {}): ModelProjection => ({ ...EMPTY, bodies: [boxBody('x1#0', 'Base', 0, 4, 3), boxBody('x2#0', 'Bracket', 6, 2, 2)], ...over });
const manifest = (): SolidManifest => ({ ...emptyManifest(), features: [
	{ id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' },
	{ id: 'm1', name: 'Mate 1', type: 'mate', kind: 'coincident', a: { kind: 'face', body: 'x1#0', name: 'x1.end' }, b: { kind: 'face', body: 'x2#0', name: 'x2.start' } },
	{ id: 'm2', name: 'Mate 2', type: 'mate', kind: 'distance', value: 0.25, flip: true, a: { kind: 'face', body: 'x1#0', name: 'x1.end' }, b: { kind: 'face', body: 'x2#0', name: 'x2.start' } }
] });
const MATED: ModelProjection = model({
	bodies: [boxBody('x1#0', 'Base', 0, 4, 3, { dof: 6 }), boxBody('x2#0', 'Bracket', 6, 2, 2, { dof: 3, bounds: [6, 0, 1, 8, 2, 2] })],
	mates: [
		{ feature: 'm1', kind: 'coincident', a: { kind: 'face', body: 'x1#0', name: 'x1.end' }, b: { kind: 'face', body: 'x2#0', name: 'x2.start' }, status: 'ok', residual: 0 },
		{ feature: 'm2', kind: 'distance', value: 0.25, a: { kind: 'face', body: 'x1#0', name: 'x1.end' }, b: { kind: 'face', body: 'x2#0', name: 'x2.start' }, status: 'error', message: 'Mate 2 conflicts with Mate 1: Bracket cannot satisfy both. Delete one of them, or change its value.', residual: 0.25 }
	]
});
/* The bracket's bottom in MATED sits on the base's top (z = 1), so the projection-side freedom reading finds the coincident mate holding. */
MATED.bodies[1].faces[1].center = [7, 1, 1];

type Over = Partial<{ selections: Selection[]; canWrite: boolean; busy: boolean; model: ModelProjection; manifest: SolidManifest }>;
interface Harness { api: WorkspaceApi; applied: { command: SolidCommand; label: string }[]; errors: string[]; set(over: Over): void }
function harness(initial: Over = {}): Harness {
	const state = reactiveProps({ selections: [] as Selection[], canWrite: true, busy: false, model: model(), manifest: manifest(), ...initial });
	const applied: Harness['applied'] = [], errors: string[] = [];
	const api: WorkspaceApi = {
		get model() { return state.model; }, get manifest() { return state.manifest; }, get selections() { return state.selections; }, get canWrite() { return state.canWrite; }, get busy() { return state.busy; }, get tool() { return 'mate' as const; }, get editingSketch() { return null; },
		apply: async (command, label) => { applied.push({ command, label }); }, select: () => {}, setTool: () => {}, editSketch: () => {}, setSketchPointer: () => {},
		request: async () => { throw Error('not in this test'); }, project: () => ({ x: 0, y: 0 }), error: (m) => { errors.push(m); }, guide: () => {}, clearGuides: () => {}, clip: () => {}, lookAt: () => {}, fit: () => {}, unproject: () => null
	};
	return { api, applied, errors, set: (over) => Object.assign(state, over) };
}
const mounted: Mounted[] = [];
function mountPanel(h: Harness) { const m = mountInto(Panel, { api: h.api }); mounted.push(m); return m; }
afterEach(async () => { for (const m of mounted) await m.stop(); mounted.length = 0; });
const submit = (m: Mounted, form: HTMLFormElement) => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); m.flush(); };
const add = async (m: Mounted) => { submit(m, m.one<HTMLFormElement>('form.create')); await m.settle(); };
const pick = (bodyId: string, id: string): Selection => ({ bodyId, kind: 'face', id });

const oneMate = (m: Mounted) => { m.one<HTMLInputElement>('[data-joint="mate"] input').click(); m.flush(); };
const who = (m: Mounted) => m.all<HTMLElement>('[data-testid="ideacad-mate-picks"] .who').map((w) => w.textContent);

describe('the mate panel', () => {
	it('with fewer than two picks, Add refuses through api.error and applies nothing; with two picks on two bodies it applies the mate, first pick first', async () => {
		const h = harness(); const m = mountPanel(h); oneMate(m);
		expect(who(m)).toEqual(['Pick', 'Pick']);
		const button = m.one<HTMLButtonElement>('[data-testid="ideacad-mate-add"]');
		expect(button.getAttribute('aria-disabled')).toBe('true'); expect(button.hasAttribute('disabled')).toBe(false);
		await add(m);
		expect(h.applied).toHaveLength(0);
		expect(h.errors).toEqual(['Pick one on each part.']);
		h.set({ selections: [pick('x1#0', 'x1.end'), pick('x2#0', 'x2.start')] }); m.flush();
		expect(who(m)).toEqual(['Base, end face', 'Bracket, start face']);
		expect(m.one('[data-testid="ideacad-mate-picks"]').textContent).not.toMatch(/x1\.|x2\./);
		expect(button.hasAttribute('aria-disabled')).toBe(false);
		await add(m);
		expect(h.applied).toHaveLength(1);
		expect(h.applied[0].label).toBe('Add coincident mate');
		expect(h.applied[0].command).toEqual({ type: 'add-feature', feature: { id: '', name: '', type: 'mate', kind: 'coincident',
			a: { kind: 'face', body: 'x1#0', name: 'x1.end', hint: { kind: 'plane', center: [2, 1.5, 1], normal: [0, 0, 1], area: 12 } },
			b: { kind: 'face', body: 'x2#0', name: 'x2.start', hint: { kind: 'plane', center: [7, 1, 0], normal: [0, 0, -1], area: 4 } } } });
		expect(h.errors).toHaveLength(1);
	});
	it('two picks on one body are refused naming the body; flip and a reference pick go through', async () => {
		const h = harness({ selections: [pick('x1#0', 'x1.end'), pick('x1#0', 'x1.start')] }); const m = mountPanel(h); oneMate(m);
		expect(m.one('[data-testid="ideacad-mate-reason"]').textContent).toBe('Both picks are on Base. Pick one on each part.');
		await add(m);
		expect(h.applied).toHaveLength(0); expect(h.errors).toEqual(['Both picks are on Base. Pick one on each part.']);
		h.set({ selections: [{ bodyId: '', kind: 'reference', id: 'pl1' }, pick('x2#0', 'x2.start')], model: model({ references: [{ feature: 'pl1', name: 'Plane 1', kind: 'plane', origin: [0, 0, 2], normal: [0, 0, 1], size: 1 }] }) }); m.flush();
		const flip = m.one<HTMLInputElement>('form.create > label.check input[type="checkbox"]'); expect(flip.closest('label')!.textContent).toContain('Flip'); flip.click(); m.flush();
		await add(m);
		expect(h.applied).toHaveLength(1);
		expect(h.applied[0].command).toMatchObject({ type: 'add-feature', feature: { kind: 'coincident', flip: true, a: { kind: 'reference', feature: 'pl1' }, b: { kind: 'face', body: 'x2#0' } } });
		expect(who(m)[0]).toBe('Plane 1 (plane)');
	});
	it('a kind the two picks cannot take is struck through and refused in the solver pairing sentence before anything is added (F047)', async () => {
		const h = harness({ selections: [pick('x1#0', 'x1.end'), pick('x2#0', 'x2.start')] }); const m = mountPanel(h); oneMate(m);
		const unfit = m.all<HTMLLabelElement>('[data-testid="ideacad-mate-kind"] label.unfit').map((l) => l.textContent!.trim());
		expect(unfit).toEqual(['Concentric']);
		m.one<HTMLInputElement>('[data-testid="ideacad-mate-kind"] input[value="concentric"]').click(); m.flush();
		expect(m.one('[data-testid="ideacad-mate-reason"]').textContent).toBe('A concentric mate needs two round faces or circular edges.');
		await add(m);
		expect(h.applied).toHaveLength(0); expect(h.errors).toEqual(['A concentric mate needs two round faces or circular edges.']);
	});
	it('distance and angle take a value: a non-number is refused in a sentence, a number goes through as typed, and the input carries no min, max or step', async () => {
		const h = harness({ selections: [pick('x1#0', 'x1.end'), pick('x2#0', 'x2.start')] }); const m = mountPanel(h); oneMate(m);
		expect(m.all('[data-testid="ideacad-mate-value"]')).toHaveLength(0);
		const kinds = m.all<HTMLLabelElement>('[data-testid="ideacad-mate-kind"] label');
		expect(kinds.map((l) => l.textContent!.trim())).toEqual(['Coincident', 'Concentric', 'Parallel', 'Perpendicular', 'Distance', 'Angle']);
		const choose = (word: string) => { kinds.find((l) => l.textContent!.trim() === word)!.querySelector('input')!.click(); m.flush(); };
		expect(m.one<HTMLInputElement>('[data-testid="ideacad-mate-kind"] input[value="coincident"]').checked).toBe(true);
		choose('Distance');
		const value = m.one<HTMLInputElement>('[data-testid="ideacad-mate-value"]');
		expect(value.hasAttribute('min')).toBe(false); expect(value.hasAttribute('max')).toBe(false); expect(value.hasAttribute('step')).toBe(false); expect(value.type).toBe('text');
		expect(m.one('[data-testid="ideacad-mate-add"]').textContent).toBe('Add distance mate');
		value.value = 'abc'; value.dispatchEvent(new Event('input', { bubbles: true })); m.flush();
		await add(m);
		expect(h.applied).toHaveLength(0); expect(h.errors).toEqual(['Enter a distance in inches, like 0.25.']);
		value.value = '-0.25'; value.dispatchEvent(new Event('input', { bubbles: true })); m.flush();
		await add(m);
		expect(h.applied[0].label).toBe('Add distance mate');
		expect(h.applied[0].command).toMatchObject({ feature: { kind: 'distance', value: -0.25 } });
		choose('Angle');
		expect(m.one('[data-testid="ideacad-mate-value"]').closest('label')!.textContent).toContain('Angle (degrees)');
		m.one<HTMLInputElement>('[data-testid="ideacad-mate-value"]').value = ''; m.one<HTMLInputElement>('[data-testid="ideacad-mate-value"]').dispatchEvent(new Event('input', { bubbles: true })); m.flush();
		await add(m);
		expect(h.errors.at(-1)).toBe('Enter an angle in degrees, like 45.'); expect(h.applied).toHaveLength(1);
	});
	it('lists every mate with a status word, its residual and its sentence; Delete removes the feature and Set patches the value', async () => {
		const h = harness({ model: MATED }); const m = mountPanel(h);
		const rows = m.all<HTMLElement>('.list li');
		expect(rows).toHaveLength(2);
		expect(rows[0].querySelector('.status')!.textContent).toBe('Solved'); expect(rows[0].querySelector('.status svg')).not.toBeNull(); expect(rows[0].classList.contains('ok')).toBe(true);
		expect(rows[0].querySelector('strong')!.textContent).toBe('Mate 1'); expect(rows[0].querySelector('.kind')!.textContent).toBe('Coincident');
		expect(rows[0].querySelector('.sides')!.textContent).toBe('Base, end face to Bracket, start face');
		expect(rows[0].querySelector('.residual')!.textContent).toBe('Off by 0 in');
		expect(rows[0].querySelector('.message')).toBeNull();
		expect(rows[1].querySelector('.status')!.textContent).toBe('Conflict'); expect(rows[1].classList.contains('fail')).toBe(true);
		expect(rows[1].querySelector('.residual')!.textContent).toBe('Off by 0.25 in');
		expect(rows[1].querySelector('.message')!.textContent).toBe('Mate 2 conflicts with Mate 1: Bracket cannot satisfy both. Delete one of them, or change its value.');
		expect(m.one('h2').textContent).toBe('Mates 2');
		/* Only the distance mate has a Set form; its input is seeded with the stored value; the flip box mirrors the manifest. */
		expect(rows[0].querySelector('form.set')).toBeNull();
		const set = rows[1].querySelector<HTMLFormElement>('form.set')!, input = set.querySelector('input')!;
		expect(input.value).toBe('0.25'); expect(input.hasAttribute('min')).toBe(false); expect(input.hasAttribute('step')).toBe(false);
		expect(rows[1].querySelector<HTMLInputElement>('.actions input[type="checkbox"]')!.checked).toBe(true); expect(rows[0].querySelector<HTMLInputElement>('.actions input[type="checkbox"]')!.checked).toBe(false);
		input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); m.flush(); submit(m, set); await m.settle();
		expect(h.applied).toEqual([{ command: { type: 'set-feature', id: 'm2', patch: { value: 0.5 } }, label: 'Set distance' }]);
		input.value = 'x'; input.dispatchEvent(new Event('input', { bubbles: true })); m.flush(); submit(m, set); await m.settle();
		expect(h.errors).toEqual(['Enter a distance in inches, like 0.25.']); expect(h.applied).toHaveLength(1);
		(rows[0].querySelector('button.delete') as HTMLButtonElement).click(); await m.settle();
		expect(h.applied[1]).toEqual({ command: { type: 'remove-feature', id: 'm1' }, label: 'Delete mate' });
		(rows[0].querySelector<HTMLInputElement>('.actions input[type="checkbox"]'))!.click(); await m.settle();
		expect(h.applied[2]).toEqual({ command: { type: 'set-feature', id: 'm1', patch: { flip: true } }, label: 'Flip mate' });
	});
	it('a read-only document renders no form, no Delete and no Fix control, and still lists every mate (against 1 / 2 / 2 on the same fixture writable)', () => {
		const h = harness({ model: MATED, canWrite: false }); const m = mountPanel(h);
		expect(m.all('form')).toHaveLength(0); expect(m.all('button')).toHaveLength(0); expect(m.all('input')).toHaveLength(0); expect(m.all('fieldset')).toHaveLength(0);
		expect(m.all('.list li')).toHaveLength(2); expect(m.all('.bodies li')).toHaveLength(2);
		h.set({ canWrite: true }); m.flush();
		expect(m.all('form.create')).toHaveLength(1); expect(m.all('button.delete')).toHaveLength(2); expect(m.all('.bodies input[type="checkbox"]')).toHaveLength(2);
	});
	it('says what freedom each mated body has left, and Fix in place is a metadata command', async () => {
		const h = harness({ model: MATED }); const m = mountPanel(h);
		const bodies = m.all<HTMLElement>('.bodies li');
		expect(bodies.map((b) => b.querySelector('[data-testid="ideacad-body-state"]')!.textContent)).toEqual(['Floating', '3 free']);
		expect(bodies.map((b) => b.querySelector('.freedom')!.textContent)).toEqual([
			'Base: nothing holds it; the other bodies are placed against it.',
			'Bracket: 3 degrees of freedom left, slides along X and Y, turns about Z.'
		]);
		(bodies[0].querySelector('input[type="checkbox"]') as HTMLInputElement).click(); await m.settle();
		expect(h.applied).toEqual([{ command: { type: 'metadata', bodyId: 'x1#0', fixed: true }, label: 'Fix body in place' }]);
		/* An engine-projected `freedom` wins over the projection reading, and a fixed body says so. */
		const fixed = model({ bodies: [boxBody('x1#0', 'Base', 0, 4, 3, { fixed: true, dof: 0 }), { ...boxBody('x2#0', 'Bracket', 6, 2, 2, { dof: 1 }), freedom: { dof: 1, translations: 1, slides: ['Y'], turns: [] } } as BodyProjection], mates: MATED.mates });
		h.set({ model: fixed }); m.flush();
		expect(m.all<HTMLElement>('.bodies .freedom').map((p) => p.textContent)).toEqual(['Base: fixed in place, it never moves.', 'Bracket: 1 degree of freedom left, slides along Y.']);
		expect(m.all<HTMLInputElement>('.bodies input[type="checkbox"]')[0].checked).toBe(true);
		expect(m.all<HTMLElement>('[data-testid="ideacad-body-state"]').map((p) => p.textContent)).toEqual(['Fixed', '1 free']);
		/* No mates and no fixed body: no freedom list at all, and the note says what a mate is. */
		h.set({ model: model() }); m.flush();
		expect(m.all('.bodies li')).toHaveLength(0); expect(m.one('.note').textContent).toBe('No mates yet');
	});
	it('a hinge fills its slots in readable words and lands as ONE batch of two mates carrying the joint and one group; Delete removes the group as one step', async () => {
		const face = (id: string, kind: string, center: [number, number, number], normal: [number, number, number], surface: Record<string, unknown>) => ({ id, kind, center, normal, area: 1, surface, edges: [], ...mesh() });
		const plate = boxBody('x1#0', 'Plate', 0, 2, 2); plate.faces.push(face('h1.wall', 'cylinder', [1.25, 1, 0.5], [1, 0, 0], { type: 'cylinder', axis: [0, 0, 1], origin: [1, 1, 0], radius: 0.25 }));
		const pin = boxBody('x2#0', 'Pin', 0.75, 0.5, 0.5); pin.faces.push(face('x2.side.0', 'cylinder', [1.25, 1, 0.5], [1, 0, 0], { type: 'cylinder', axis: [0, 0, 1], origin: [1, 1, 0], radius: 0.25 }));
		const hingeModel = model({ bodies: [plate, pin] });
		const withHole = () => { const mf = manifest(); mf.features.splice(1, 2, { id: 'h1', name: 'Hole 1', type: 'hole', face: { body: 'x1#0', name: 'x1.end' }, center: [1, 1], standard: 'custom', fit: 'custom', diameter: 0.5, depth: 'through' }); return mf; };
		const h = harness({ model: hingeModel, manifest: withHole() }); const m = mountPanel(h);
		expect(m.one<HTMLInputElement>('[data-joint="hinge"] input').checked).toBe(true);
		expect(m.all('[data-testid="ideacad-mate-joint"] label.tile').map((l) => l.textContent)).toEqual(['Hinge1 free', 'Slider1 free', 'Cylindrical2 free', 'Planar3 free', 'Fixed0 free', 'One mateany']);
		expect(m.all('[data-testid="ideacad-mate-picks"] .shape').map((x) => x.textContent)).toEqual(['Round', 'Round', 'Flat', 'Flat']);
		/* Half a hinge: the slots say what is still wanted, the Add control says why it cannot add yet, and nothing is applied. */
		h.set({ selections: [pick('x1#0', 'h1.wall'), pick('x2#0', 'x2.side.0')] }); m.flush();
		expect(who(m)).toEqual(['Plate, hole wall', 'Pin, round face 1', 'Pick', 'Pick']);
		expect(m.one('.roles').textContent).toBe('Plate stays, Pin moves');
		await add(m);
		expect(h.applied).toHaveLength(0); expect(h.errors).toEqual(['Pick a flat face on each part.']);
		/* A flat face with a round one is refused beside the slots, in words, before anything is added. */
		h.set({ selections: [pick('x1#0', 'h1.wall'), pick('x2#0', 'x2.start')] }); m.flush();
		expect(m.one('[data-testid="ideacad-mate-reason"]').textContent).toBe('A round pick pairs with a round one. Pick a matching face on Pin.');
		h.set({ selections: [pick('x1#0', 'h1.wall'), pick('x2#0', 'x2.side.0'), pick('x1#0', 'x1.end'), pick('x2#0', 'x2.start')] }); m.flush();
		expect(m.all('[data-testid="ideacad-mate-reason"]')).toHaveLength(0);
		expect(m.one('[data-testid="ideacad-mate-result"]').textContent).toBe('Pin: 1 degree of freedom left, turns about Z.');
		expect(m.one('[data-testid="ideacad-mate-add"]').textContent).toBe('Add hinge');
		await add(m);
		expect(h.applied).toHaveLength(1); expect(h.applied[0].label).toBe('Add hinge');
		const batch = h.applied[0].command as Extract<SolidCommand, { type: 'batch' }>;
		expect(batch.type).toBe('batch'); expect(batch.commands).toHaveLength(2);
		const features = batch.commands.map((c) => (c as Extract<SolidCommand, { type: 'add-feature' }>).feature as Extract<SolidManifest['features'][number], { type: 'mate' }>);
		expect(features.map((f) => [f.name, f.kind, f.joint])).toEqual([['Hinge 1 axis', 'concentric', 'hinge'], ['Hinge 1 face', 'coincident', 'hinge']]);
		expect(features[0].id).toBeTruthy(); expect(features.every((f) => f.group === features[0].id)).toBe(true);
		expect(features.every((f) => f.a.kind === 'face' && f.a.body === 'x1#0' && f.b.kind === 'face' && f.b.body === 'x2#0')).toBe(true);
		/* Listed: one row for the joint, both mates under it, and Delete removes the group in one step. */
		const mf = withHole(); mf.features.push(...features);
		h.set({ selections: [], manifest: mf, model: { ...hingeModel, mates: features.map((f) => ({ feature: f.id, kind: f.kind, a: f.a, b: f.b, status: 'ok' as const, residual: 0 })) } }); m.flush();
		const rows = m.all<HTMLElement>('.list li');
		expect(rows).toHaveLength(1); expect(rows[0].dataset.joint).toBe('hinge');
		expect(rows[0].querySelector('strong')!.textContent).toBe('Hinge 1'); expect(rows[0].querySelector('.kind')!.textContent).toBe('Hinge, 1 free');
		expect(m.all('.list li .sides').map((x) => x.textContent)).toEqual(['Concentric: Plate, hole wall to Pin, round face 1', 'Coincident: Plate, end face to Pin, start face']);
		(rows[0].querySelector('button.delete') as HTMLButtonElement).click(); await m.settle();
		expect(h.applied[1]).toEqual({ command: { type: 'batch', commands: features.map((f) => ({ type: 'remove-feature', id: f.id })) }, label: 'Delete hinge' });
	});
});
