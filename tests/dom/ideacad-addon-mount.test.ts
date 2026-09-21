// tests/dom/ideacad-addon-mount.test.ts
//
// THE ADD-ON PANEL, MOUNTED, so real presses reach real handlers: what the
// On/Off switch SENDS, what an enabled add-on lists (its tools with a word
// and a sentence each, its starter, its references, its advisory report) and
// what a disabled one does not, what Run sends with the typed values as typed,
// what a non-number SAYS, and that read-only disables every control.
//
// THE API IS A RECORDER whose projection grows a row for each feature that
// was applied, because `runSteps` looks for the feature it just added before
// adding the next. NO GEOMETRY, NO CONTRAST, NO TAP TARGET HERE: happy-dom has
// no layout engine. The 44px controls are measured in a real Chromium.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import AddonPanel from '$lib/ideacad/solid/AddonPanel.svelte';
import { DEFAULT_LIMITS, type AdvisoryRules } from '$lib/ideacad/solid/advisory';
import { CREATING_TYPES } from '$lib/ideacad/solid/features';
import { BODY_TOP_IN, HEX_HEIGHT_IN, ideaBlade } from '$lib/ideacad/solid/addons/ideablade';
import { emptyManifest, type AddonState, type BodyProjection, type FeatureRow, type ModelProjection, type SolidCommand } from '$lib/ideacad/solid/types';
import type { WorkspaceApi } from '$lib/ideacad/solid/workspace-api';
import { mountInto, type Mounted } from './mount';

const Panel = AddonPanel as unknown as Component<Record<string, unknown>>;
const RULES: AdvisoryRules = { revision: 1, schemaVersion: 1, limits: { ...DEFAULT_LIMITS }, changedAt: '', canEdit: true };
interface Fake { api: WorkspaceApi; commands: { command: SolidCommand; label: string }[]; errors: string[] }
function fake(over: Partial<{ addons: AddonState; canWrite: boolean; busy: boolean }> = {}): Fake {
	let features: FeatureRow[] = [], bodies: BodyProjection[] = [];
	const r: Fake = { api: null as unknown as WorkspaceApi, commands: [], errors: [] };
	const model = (): ModelProjection => ({ bodies, features, sketches: [], references: [], mates: [], addons: over.addons ?? { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false });
	r.api = {
		get model() { return model(); }, get manifest() { return emptyManifest(); }, get selections() { return []; },
		get canWrite() { return over.canWrite ?? true; }, get busy() { return over.busy ?? false; }, get tool() { return 'select' as const; }, get editingSketch() { return null; },
		async apply(command, label) {
			r.commands.push({ command, label });
			if (command.type !== 'add-feature') return;
			const f = command.feature;
			features = [...features, { id: f.id, index: features.length, type: f.type, name: f.name, status: 'ok', summary: '', bodies: [], dependsOn: [], suppressed: false }];
			if (CREATING_TYPES.includes(f.type)) bodies = [...bodies, { id: `${f.id}#0`, name: f.name, materialId: null, role: 'part', createdBy: f.id, faces: [], edges: [], vertices: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, bounds: [0, 0, 0, 1, 1, 1], volume: 1, centerOfMass: [0, 0, 0], inertia: [] }];
		},
		select() {}, setTool() {}, editSketch() {}, setSketchPointer() {}, request: async () => { throw Error('not in the fixture'); }, project: () => ({ x: 0, y: 0 }),
		error(message) { r.errors.push(message); }, guide() {}, clearGuides() {}, clip() {}, lookAt() {}, fit() {}, unproject: () => null
	};
	return r;
}
const mounted: Mounted[] = [];
afterEach(async () => { for (const m of mounted.splice(0)) await m.stop(); });
function panel(over: Parameters<typeof fake>[0] = {}, rules: AdvisoryRules | null = RULES, onsettings = () => {}) { const f = fake(over); const m = mountInto(Panel, { api: f.api, rules, onsettings }); mounted.push(m); return { m, f }; }
const ON = { addons: { ideaBlade: true } };
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const toolButton = (m: Mounted, id: string) => m.one<HTMLButtonElement>(`[data-tool="${id}"] button.tool`);
const buttonsSaying = (m: Mounted, text: string) => m.all<HTMLButtonElement>('button').filter((b) => b.textContent!.trim() === text);
const featureOfCommand = (c: SolidCommand) => (c as unknown as { feature: Record<string, unknown> }).feature;

describe('the switch', () => {
	it('off: says Off, lists nothing but the description and the limits button; a press sends the addon command the 2026-09-15 switch sent', async () => {
		const { m, f } = panel();
		const sw = m.one<HTMLButtonElement>('[data-testid="ideacad-addon-switch"]');
		expect(sw.textContent!.replace(/\s+/g, ' ').trim()).toBe('IdeaBlade Off');
		expect(sw.getAttribute('aria-pressed')).toBe('false');
		expect(m.one('[data-addon="ideaBlade"]').getAttribute('data-enabled')).toBe('false');
		expect(m.all('button.tool')).toHaveLength(0); expect(m.all('button.plan')).toHaveLength(0); expect(m.all('.revision')).toHaveLength(0);
		expect(buttonsSaying(m, 'Edit advisory limits')).toHaveLength(1);
		sw.click(); await m.settle();
		expect(f.commands).toEqual([{ command: { type: 'addon', addon: 'ideaBlade', enabled: true }, label: 'Toggle IdeaBlade' }]);
		/* And with no rules that can be edited, the limits button is not offered either. */
		const noEdit = panel({}, { ...RULES, canEdit: false });
		expect(buttonsSaying(noEdit.m, 'Edit advisory limits')).toHaveLength(0);
	});
	it('on: says On, a press sends enabled:false, and the add-on\'s tools, starter, references and advisory report are all listed', async () => {
		const { m, f } = panel(ON);
		const sw = m.one<HTMLButtonElement>('[data-testid="ideacad-addon-switch"]');
		expect(sw.textContent!.replace(/\s+/g, ' ').trim()).toBe('IdeaBlade On'); expect(sw.getAttribute('aria-pressed')).toBe('true');
		expect(m.one('[data-addon="ideaBlade"]').getAttribute('data-enabled')).toBe('true');
		const tools = m.all<HTMLButtonElement>('button.tool');
		expect(tools).toHaveLength(ideaBlade.tools.length); expect(tools).toHaveLength(4);
		expect(tools.map((b) => b.querySelector('.title')!.textContent!.replace(/[▸▾]/g, '').trim())).toEqual(ideaBlade.tools.map((t) => t.name));
		for (const b of tools) { expect(b.querySelector('.sentence')!.textContent!.trim().length).toBeGreaterThan(20); expect(b.getAttribute('aria-expanded')).toBe('false'); }
		expect(m.all('button[data-starter]')).toHaveLength(1); expect(m.all('button[data-reference]')).toHaveLength(3);
		expect(m.one('.revision').textContent).toMatch(/Rules revision 1/);
		expect(m.all('.check')).toHaveLength(4);
		expect(buttonsSaying(m, 'Edit advisory limits')).toHaveLength(1);
		sw.click(); await m.settle();
		expect(f.commands).toEqual([{ command: { type: 'addon', addon: 'ideaBlade', enabled: false }, label: 'Toggle IdeaBlade' }]);
	});
});
describe('a tool', () => {
	it('opens a form with its inputs at their defaults and a selection sentence; Run sends the sketch, the extrude and the role, labelled for the add-on', async () => {
		const { m, f } = panel(ON);
		expect(m.all('form.tool-form')).toHaveLength(0);
		toolButton(m, 'hex-core').click(); m.flush();
		expect(toolButton(m, 'hex-core').getAttribute('aria-expanded')).toBe('true');
		expect(m.all('form.tool-form')).toHaveLength(1);
		expect(m.one('.needs').textContent).toBe('No selection needed.');
		const z = m.one<HTMLInputElement>('input[data-input="z"]'), height = m.one<HTMLInputElement>('input[data-input="height"]');
		expect(z.value).toBe(String(BODY_TOP_IN)); expect(height.value).toBe(String(HEX_HEIGHT_IN));
		expect(z.getAttribute('type')).toBe('text'); expect(z.getAttribute('inputmode')).toBe('decimal');
		expect(z.hasAttribute('min')).toBe(false); expect(z.hasAttribute('max')).toBe(false);
		const run = m.one<HTMLButtonElement>('button.run');
		expect(run.textContent).toBe('Run Hex core');
		run.click(); await m.settle();
		expect(f.commands.map((c) => c.label)).toEqual(['IdeaBlade: hex core sketch', 'IdeaBlade: hex core', 'IdeaBlade: hex core role']);
		const sketch = featureOfCommand(f.commands[0].command), extrude = featureOfCommand(f.commands[1].command);
		expect(sketch).toMatchObject({ type: 'sketch', plane: { kind: 'datum', datum: 'XY', offset: BODY_TOP_IN } });
		expect((sketch.entities as unknown[]).length).toBe(12);
		expect(extrude).toMatchObject({ type: 'extrude', sketch: sketch.id, distance: HEX_HEIGHT_IN, operation: 'new' });
		expect(f.commands[2].command).toEqual({ type: 'metadata', bodyId: `${extrude.id}#0`, role: 'hex-core' });
		expect(f.errors).toEqual([]);
		/* A second press on the word closes the form. */
		toolButton(m, 'hex-core').click(); m.flush();
		expect(m.all('form.tool-form')).toHaveLength(0);
	});
	it('a typed value goes out as typed, negative or huge; a non-number says so where every refusal shows and sends nothing', async () => {
		const { m, f } = panel(ON);
		toolButton(m, 'hex-core').click(); m.flush();
		const height = m.one<HTMLInputElement>('input[data-input="height"]');
		type(height, '-2'); m.flush();
		m.one<HTMLButtonElement>('button.run').click(); await m.settle();
		expect(featureOfCommand(f.commands[1].command).distance).toBe(-2);
		type(height, '1e9'); m.flush();
		m.one<HTMLButtonElement>('button.run').click(); await m.settle();
		expect(featureOfCommand(f.commands[4].command).distance).toBe(1e9);
		expect(f.commands).toHaveLength(6);
		type(height, 'abc'); m.flush();
		m.one<HTMLButtonElement>('button.run').click(); await m.settle();
		expect(f.errors).toEqual(['Enter a finite height.']);
		expect(f.commands).toHaveLength(6);
		type(height, ''); m.flush();
		m.one<HTMLButtonElement>('button.run').click(); await m.settle();
		expect(f.errors).toEqual(['Enter a finite height.', 'Enter a finite height.']);
		expect(f.commands).toHaveLength(6);
		/* The typed value survives closing and reopening the form. */
		type(height, '0.75'); m.flush();
		toolButton(m, 'hex-core').click(); m.flush(); toolButton(m, 'hex-core').click(); m.flush();
		expect(m.one<HTMLInputElement>('input[data-input="height"]').value).toBe('0.75');
	});
	it('a text input is a textarea the tool parses: the default stations run, and a bad line is the add-on\'s sentence with nothing sent', async () => {
		const { m, f } = panel(ON);
		toolButton(m, 'blade-profile').click(); m.flush();
		const stations = m.one<HTMLTextAreaElement>('textarea[data-input="stations"]');
		expect(stations.value.split('\n')).toHaveLength(4);
		m.one<HTMLButtonElement>('button.run').click(); await m.settle();
		expect(f.commands.map((c) => c.command.type)).toEqual(['add-feature', 'add-feature']);
		expect(featureOfCommand(f.commands[1].command)).toMatchObject({ type: 'revolve', angle: 360, axis: { kind: 'datum', axis: 'Z' } });
		type(stations, '1, 0\nnope'); m.flush();
		m.one<HTMLButtonElement>('button.run').click(); await m.settle();
		expect(f.errors).toEqual(['Enter station 2 as two finite numbers, radius, height in inches.']);
		expect(f.commands).toHaveLength(2);
	});
	it('the starter sends eight features and three roles; a reference sends its one feature', async () => {
		const { m, f } = panel(ON);
		m.one<HTMLButtonElement>('button[data-starter="default-part"]').click(); await m.settle();
		expect(f.commands.filter((c) => c.command.type === 'add-feature')).toHaveLength(8);
		expect(f.commands.filter((c) => c.command.type === 'metadata').map((c) => (c.command as { role: string }).role)).toEqual(['hex-core', 'collar', 'spin-bolt']);
		expect(f.commands.every((c) => c.label.startsWith('IdeaBlade:'))).toBe(true);
		const before = f.commands.length;
		m.one<HTMLButtonElement>('button[data-reference="spin-axis"]').click(); await m.settle();
		expect(f.commands).toHaveLength(before + 1);
		expect(featureOfCommand(f.commands[before].command)).toMatchObject({ type: 'axis', definition: { kind: 'datum', axis: 'Z' } });
	});
});
describe('read-only', () => {
	it('disables the switch, every Run, every starter and every reference, against none on a writable mount', () => {
		const ro = panel({ ...ON, canWrite: false });
		toolButton(ro.m, 'hex-core').click(); ro.m.flush();
		expect(ro.m.one<HTMLButtonElement>('[data-testid="ideacad-addon-switch"]').disabled).toBe(true);
		expect(ro.m.all('button.run:disabled')).toHaveLength(1); expect(ro.m.all('button.plan:disabled')).toHaveLength(4);
		/* The tool's word still opens its form: reading what a tool does is not a write. */
		expect(ro.m.all('button.tool:disabled')).toHaveLength(0);
		const rw = panel(ON);
		toolButton(rw.m, 'hex-core').click(); rw.m.flush();
		expect(rw.m.one<HTMLButtonElement>('[data-testid="ideacad-addon-switch"]').disabled).toBe(false);
		expect(rw.m.all('button.run:disabled')).toHaveLength(0); expect(rw.m.all('button.plan:disabled')).toHaveLength(0);
		expect(rw.m.all('button.run')).toHaveLength(1); expect(rw.m.all('button.plan')).toHaveLength(4);
		const busy = panel({ ...ON, busy: true });
		expect(busy.m.one<HTMLButtonElement>('[data-testid="ideacad-addon-switch"]').disabled).toBe(true);
	});
});
