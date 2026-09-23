// tests/ideacad-solid-addons-registry.test.ts
//
// AN ADD-ON MAY ADVISE BUT NEVER RESTRICT, asserted three ways without a
// kernel: the registered add-on's shape has no member outside the contract's
// lists and no function outside `run`/`advise`/`steps`/`step`; the two
// add-on sources carry none of the words a clamp, a bound or a veto is written
// with, checked over comment-stripped code with a PLANTED CONTROL; and the
// panel's fields carry no `min`, `max` or `type="number"`. Beside it, the
// registry's own reads: the IdeaBlade switch still keys on the reducer's
// `addons.ideaBlade` boolean, and `runSteps` stops at a step that did not
// land rather than adding an extrude that points at nothing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADDON_FUNCTIONS, ADDON_MEMBERS, CONTRACT_CHECKED, REFERENCE_MEMBERS, STARTER_MEMBERS, TOOL_MEMBERS, addonById, addonEnabled, installedAddons, runSteps, type AddonStep } from '../src/lib/ideacad/solid/addons/registry';
import { HEX_ACROSS_FLATS_IN, formatStations, hexCoreSteps, ideaBlade, parseStations, profileCorners } from '../src/lib/ideacad/solid/addons/ideablade';
import { reduce } from '../src/lib/ideacad/solid/commands';
import { CREATING_TYPES } from '../src/lib/ideacad/solid/features';
import { emptyManifest, type BodyProjection, type FeatureRow, type ModelProjection, type SolidCommand } from '../src/lib/ideacad/solid/types';
import type { WorkspaceApi } from '../src/lib/ideacad/solid/workspace-api';

const SOURCES = ['src/lib/ideacad/solid/addons/registry.ts', 'src/lib/ideacad/solid/addons/ideablade.ts', 'src/lib/ideacad/solid/addons/spinner.ts', 'src/lib/ideacad/solid/addons/frc.ts'];
const PANEL = 'src/lib/ideacad/solid/AddonPanel.svelte';
/** Code with its comments removed, so a docblock may NAME the property without the sweep reading the name as a hit. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const RESTRICTING = /\bclamp|\bmin\(|\bmax\(|\brefus/i;
const HOOKISH = /before|veto|filter|disable|restrict|intercept|guard|refuse|reject|forbid|block/i;

describe('the never-restrict property', () => {
	it('the compile-time member lists hold, and the registered add-on has no member and no function outside them', () => {
		expect(CONTRACT_CHECKED).toBe(true);
		for (const list of [ADDON_MEMBERS, TOOL_MEMBERS, STARTER_MEMBERS, REFERENCE_MEMBERS, ADDON_FUNCTIONS]) for (const name of list) expect(name).not.toMatch(HOOKISH);
		const addons = installedAddons();
		expect(addons.length).toBeGreaterThan(0);
		const functions: Record<string, number> = {};
		const check = (id: string, o: object, allowed: readonly string[]) => {
			for (const [k, v] of Object.entries(o)) {
				expect(allowed).toContain(k);
				if (typeof v === 'function') { functions[id] = (functions[id] ?? 0) + 1; expect(ADDON_FUNCTIONS).toContain(k); }
			}
		};
		for (const a of addons) {
			check(a.id, a, ADDON_MEMBERS);
			for (const t of a.tools) check(a.id, t, TOOL_MEMBERS);
			for (const s of a.starters) check(a.id, s, STARTER_MEMBERS);
			for (const r of a.references) check(a.id, r, REFERENCE_MEMBERS);
		}
		/* Positive control: the sweep counted the functions it walked past, per add-on. IdeaBlade has four tools, one starter, three references and an advise; the spinner weapon and FRC checks add-ons carry none at all (their readouts live in the Analysis panel), which is what makes them unable to touch a document. */
		expect(addons.map((a) => a.id)).toEqual(['ideaBlade', 'spinnerWeapon', 'frcChecks']);
		expect(functions).toEqual({ ideaBlade: 4 + 1 + 3 + 1 });
	});
	it('no add-on source carries clamp, min(, max( or refuse in its code; the panel has no bounded or number-typed field; and the sweep finds a planted one', () => {
		const hits = (text: string) => stripComments(text).split('\n').map((line, i) => ({ line: i + 1, text: line })).filter((l) => RESTRICTING.test(l.text));
		for (const path of SOURCES) {
			const source = readFileSync(path, 'utf8');
			expect(source.length).toBeGreaterThan(1000);
			expect(hits(source), path).toEqual([]);
		}
		const panel = readFileSync(PANEL, 'utf8');
		expect(hits(panel), PANEL).toEqual([]);
		const code = stripComments(panel);
		expect(code).not.toMatch(/type="number"/); expect(code).not.toMatch(/\smin=/); expect(code).not.toMatch(/\smax=/);
		expect(code).toMatch(/inputmode="decimal"/);
		/* Planted controls: the same predicate on a clamp, a bound and a veto each finds one line; a comment saying the words finds none, so the stripper is stripping. */
		expect(hits('const h = Math.min(a, 1);\nconst w = clamp(x, 0, 1);\nif (bad) refuse();')).toHaveLength(3);
		expect(hits('/* clamp min( max( refuse */\nconst x = 1; // clamp')).toEqual([]);
		expect(RESTRICTING.test('/* clamp */')).toBe(true);
	});
});
describe('the registry reads', () => {
	it('IdeaBlade is registered under the reducer\'s own key, and the switch reads the boolean the 2026-09-15 command writes as well as the settings shape', () => {
		expect(addonById('ideaBlade')).toBe(ideaBlade);
		expect(addonById('nope')).toBeUndefined();
		const on = reduce(emptyManifest(), { type: 'addon', addon: 'ideaBlade', enabled: true });
		expect(on.addons.ideaBlade).toBe(true); expect(addonEnabled(on.addons, 'ideaBlade')).toBe(true);
		const off = reduce(on, { type: 'addon', enabled: false });
		expect(addonEnabled(off.addons, 'ideaBlade')).toBe(false);
		const settings = reduce(emptyManifest(), { type: 'addon', addon: 'other', enabled: true, settings: { count: 4 } });
		expect(addonEnabled(settings.addons, 'other')).toBe(true);
		expect(addonEnabled(reduce(settings, { type: 'addon', addon: 'other', enabled: false, settings: {} }).addons, 'other')).toBe(false);
		expect(addonEnabled(emptyManifest().addons, 'other')).toBe(false); expect(addonEnabled(undefined, 'ideaBlade')).toBe(false);
	});
	it('every step of every starter and reference reduces into a manifest without a kernel, with a label naming the add-on', () => {
		let m = emptyManifest(); let steps: AddonStep[] = [];
		for (const a of installedAddons()) { for (const s of a.starters) steps.push(...s.steps()); for (const r of a.references) steps.push(r.step()); }
		expect(steps.length).toBe(8 + 3);
		for (const s of steps) { expect(s.label).toMatch(/^IdeaBlade: /); m = reduce(m, { type: 'add-feature', feature: s.feature }); }
		expect(m.features).toHaveLength(11);
		expect(new Set(m.features.map((f) => f.id)).size).toBe(11);
		expect(m.features.map((f) => f.type)).toEqual(['sketch', 'revolve', 'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'axis', 'plane', 'plane']);
		/* Two runs mint two id sets, so a starter can be pressed twice. */
		const again = ideaBlade.starters[0].steps();
		expect(again.map((s) => s.feature.id).some((id) => steps.some((s) => s.feature.id === id))).toBe(false);
	});
	it('the hex sketch is six shared points and six lines at the corner radius of the across-flats', () => {
		const [sketch, extrude] = hexCoreSteps({ z: 2, height: 0.5 });
		expect(sketch.feature.type).toBe('sketch'); expect(extrude.feature.type).toBe('extrude'); expect(extrude.role).toBe('hex-core');
		const entities = (sketch.feature as { entities: { type: string; x?: number; y?: number }[] }).entities;
		expect(entities.filter((e) => e.type === 'point')).toHaveLength(6); expect(entities.filter((e) => e.type === 'line')).toHaveLength(6);
		for (const p of entities.filter((e) => e.type === 'point')) expect(Math.hypot(p.x!, p.y!)).toBeCloseTo(HEX_ACROSS_FLATS_IN / Math.sqrt(3), 12);
		expect((sketch.feature as { plane: unknown }).plane).toEqual({ kind: 'datum', datum: 'XY', offset: 2 });
		expect((extrude.feature as { sketch: string }).sketch).toBe(sketch.feature.id);
	});
	it('stations parse as typed, round-trip through the field text, and close into a profile that touches the axis at both ends', () => {
		expect(parseStations('1, 0\n2, 3')).toEqual([{ r: 1, z: 0 }, { r: 2, z: 3 }]);
		expect(parseStations('1 0; 2 3; -0.5 1e3')).toEqual([{ r: 1, z: 0 }, { r: 2, z: 3 }, { r: -0.5, z: 1000 }]);
		expect(parseStations(formatStations([{ r: 0.12, z: 0.125 }, { r: 1.55, z: 0.35 }]))).toEqual([{ r: 0.12, z: 0.125 }, { r: 1.55, z: 0.35 }]);
		expect(() => parseStations('')).toThrow(/at least two stations/);
		expect(() => parseStations('1, 0')).toThrow(/at least two stations/);
		expect(() => parseStations('1, 0\n2')).toThrow(/station 2/);
		expect(() => parseStations('1, 0\n2, x')).toThrow(/station 2/);
		expect(profileCorners([{ r: 1, z: 0 }, { r: 2, z: 3 }])).toEqual([[0, 0], [1, 0], [2, 3], [0, 3]]);
	});
});
describe('runSteps', () => {
	/** An api whose `apply` lands a feature only when told to, the way the workspace's returns without applying while busy. */
	function fake(lands: boolean) {
		let features: FeatureRow[] = [], bodies: BodyProjection[] = [];
		const commands: { command: SolidCommand; label: string }[] = [];
		const model = (): ModelProjection => ({ bodies, features, sketches: [], references: [], mates: [], addons: { ideaBlade: true }, operationMs: 0, canUndo: false, canRedo: false });
		const api: WorkspaceApi = {
			get model() { return model(); }, get manifest() { return emptyManifest(); }, get selections() { return []; }, get canWrite() { return true; }, get busy() { return false; }, get tool() { return 'select' as const; }, get editingSketch() { return null; },
			async apply(command, label) {
				commands.push({ command, label });
				if (!lands || command.type !== 'add-feature') return;
				const f = command.feature;
				features = [...features, { id: f.id, index: features.length, type: f.type, name: f.name, status: 'ok', summary: '', bodies: [], dependsOn: [], suppressed: false }];
				if (CREATING_TYPES.includes(f.type)) bodies = [...bodies, { id: `${f.id}#0`, name: f.name, materialId: null, role: 'part', createdBy: f.id, faces: [], edges: [], vertices: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, bounds: [0, 0, 0, 1, 1, 1], volume: 1, centerOfMass: [0, 0, 0], inertia: [] }];
			},
			select() {}, setTool() {}, editSketch() {}, setSketchPointer() {}, request: async () => { throw Error('not in the fixture'); }, project: () => ({ x: 0, y: 0 }), error() {}, guide() {}, clearGuides() {}, clip() {}, lookAt() {}, fit() {}, unproject: () => null
		};
		return { api, commands };
	}
	it('applies sketch, extrude and role when each lands, and stops after the first step that did not', async () => {
		const ok = fake(true);
		await runSteps(ok.api, hexCoreSteps({ z: 0, height: 1 }));
		expect(ok.commands.map((c) => c.command.type)).toEqual(['add-feature', 'add-feature', 'metadata']);
		expect(ok.commands[2].command).toMatchObject({ type: 'metadata', role: 'hex-core' });
		expect((ok.commands[2].command as { bodyId: string }).bodyId).toBe(`${(ok.commands[1].command as { feature: { id: string } }).feature.id}#0`);
		const stuck = fake(false);
		await runSteps(stuck.api, hexCoreSteps({ z: 0, height: 1 }));
		expect(stuck.commands.map((c) => c.command.type)).toEqual(['add-feature']);
	});
});
