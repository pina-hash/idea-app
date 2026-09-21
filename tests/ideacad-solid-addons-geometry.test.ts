// tests/ideacad-solid-addons-geometry.test.ts
//
// THE IDEABLADE TOOLS BUILD REAL GEOMETRY. Each tool is run through a
// `WorkspaceApi` whose `apply` is the real engine's, with the real kernel, and
// what comes back is measured: the hex core's across-flats off its bounds, the
// collar's and the bolt's volumes against pi r^2 h, the body's volume against
// the frusta its stations describe. EVERY EXPECTED NUMBER IS ANALYTIC from the
// inputs the tool was handed, never read off the kernel and typed back.
//
// WHY THIS IS AUTOMATED. A tool that drew its hexagon at the across-corners
// radius, or a collar whose bore did not become a hole, renders as a
// plausible body and nothing on screen says which number it was built to.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { DEFAULT_LIMITS, advisory, type AdvisoryRules } from '../src/lib/ideacad/solid/advisory';
import { emptyManifest, type ModelProjection, type SolidCommand } from '../src/lib/ideacad/solid/types';
import type { WorkspaceApi } from '../src/lib/ideacad/solid/workspace-api';
import { runSteps } from '../src/lib/ideacad/solid/addons/registry';
import { BODY_BOTTOM_IN, BODY_TOP_IN, COLLAR_HEIGHT_IN, COLLAR_OUTER_RADIUS_IN, DEFAULT_STATIONS, HEX_ACROSS_FLATS_IN, HEX_HEIGHT_IN, SPIN_BOLT_HEIGHT_IN, SPIN_BOLT_RADIUS_IN, bladeProfileTool, collarTool, defaultInputs, hexCircumradius, hexCoreTool, ideaBlade, spinBoltTool } from '../src/lib/ideacad/solid/addons/ideablade';
import { DEFAULT_BLADE_TREE } from '../src/lib/ideacad/blade/materials';
import { featureOf } from '../src/lib/ideacad/blade/tree';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });
interface Driven { api: WorkspaceApi; model(): ModelProjection; commands: { command: SolidCommand; label: string }[]; errors: string[] }
/** The api a tool sees, over a real engine: `apply` is the engine's own, so a refusal throws the engine's sentence. */
async function driven(): Promise<Driven> {
	const e = await SolidEngine.create(WASM); engines.push(e);
	let model = e.project();
	const d: Driven = { api: null as unknown as WorkspaceApi, model: () => model, commands: [], errors: [] };
	d.api = {
		get model() { return model; }, get manifest() { return emptyManifest(); }, get selections() { return []; }, get canWrite() { return true; }, get busy() { return false; }, get tool() { return 'select' as const; }, get editingSketch() { return null; },
		async apply(command, label) { d.commands.push({ command, label }); model = await e.apply(command); },
		select() {}, setTool() {}, editSketch() {}, setSketchPointer() {}, request: async () => { throw Error('not in the fixture'); }, project: () => ({ x: 0, y: 0 }),
		error(message) { d.errors.push(message); }, guide() {}, clearGuides() {}, clip() {}, lookAt() {}, fit() {}, unproject: () => null
	};
	return d;
}
const extent = (bounds: number[], axis: 0 | 1 | 2) => bounds[axis + 3] - bounds[axis];
const RULES: AdvisoryRules = { revision: 1, schemaVersion: 1, limits: { ...DEFAULT_LIMITS }, changedAt: '', canEdit: false };

describe('the hex core', () => {
	it('is a six-sided prism at the launcher across-flats read from the blade editor, measured off its bounds within 1e-6', async () => {
		/* The source, read from the file the add-on cites rather than from the add-on. */
		expect(HEX_ACROSS_FLATS_IN).toBe(featureOf(DEFAULT_BLADE_TREE, 'hexBoss').acrossFlats);
		expect(HEX_ACROSS_FLATS_IN).toBe(0.5);
		expect(hexCoreTool.description).toMatch(/0\.5 in across flats/); expect(hexCoreTool.description).toMatch(/blade\/materials\.ts/);
		const d = await driven();
		await hexCoreTool.run(d.api, defaultInputs(hexCoreTool));
		const m = d.model();
		expect(m.features.map((f) => f.status)).toEqual(['ok', 'ok']);
		expect(m.bodies).toHaveLength(1);
		const b = m.bodies[0].bounds;
		/* The first corner sits on +u, so the flats face +/-v: across-flats is the smaller in-plane extent and across-corners the larger. */
		const acrossFlats = Math.min(extent(b, 0), extent(b, 1)), acrossCorners = Math.max(extent(b, 0), extent(b, 1));
		console.log(`hex core bounds ${b.map((n) => n.toFixed(7)).join(' ')} -> across-flats ${acrossFlats.toFixed(7)}, across-corners ${acrossCorners.toFixed(7)}, volume ${m.bodies[0].volume.toFixed(9)}`);
		expect(Math.abs(acrossFlats - 0.5)).toBeLessThan(1e-6);
		expect(Math.abs(acrossCorners - 2 * hexCircumradius(0.5))).toBeLessThan(1e-6);
		expect(b[2]).toBeCloseTo(BODY_TOP_IN, 6); expect(b[5]).toBeCloseTo(BODY_TOP_IN + HEX_HEIGHT_IN, 6);
		/* A regular hexagon of corner radius R has area 3*sqrt(3)/2 * R^2. */
		const R = hexCircumradius(0.5);
		expect(m.bodies[0].volume).toBeCloseTo(3 * Math.sqrt(3) / 2 * R * R * HEX_HEIGHT_IN, 9);
		expect(m.bodies[0].faces).toHaveLength(8);
		expect(m.bodies[0].role).toBe('hex-core');
		expect(d.commands.map((c) => c.label)).toEqual(['IdeaBlade: hex core sketch', 'IdeaBlade: hex core', 'IdeaBlade: hex core role']);
		expect(d.commands.every((c) => c.label.startsWith('IdeaBlade:'))).toBe(true);
	});
	it('takes a typed height as typed: 7 in is 7 in and -0.25 in goes down, with nothing clamped on the way', async () => {
		const tall = await driven();
		await hexCoreTool.run(tall.api, { z: 1, height: 7 });
		expect(extent(tall.model().bodies[0].bounds, 2)).toBeCloseTo(7, 6);
		expect(tall.model().bodies[0].bounds[2]).toBeCloseTo(1, 6);
		const down = await driven();
		await hexCoreTool.run(down.api, { z: 1, height: -0.25 });
		expect(down.model().bodies[0].bounds[5]).toBeCloseTo(1, 6); expect(down.model().bodies[0].bounds[2]).toBeCloseTo(0.75, 6);
		/* And a height the kernel will not build is the engine's own sentence, thrown from `apply` -- not a sentence of the add-on's. */
		const zero = await driven();
		await expect(hexCoreTool.run(zero.api, { z: 1, height: 0 })).rejects.toThrow(/Pull the sketch to give it depth/);
		expect(zero.model().features).toHaveLength(1);
	});
});
describe('the collar and the spin bolt', () => {
	it('the collar is a ring whose volume is pi (R^2 - r^2) h, with the defaults from the blade collar rule', async () => {
		const R = hexCircumradius(0.5) + 0.5;
		expect(COLLAR_OUTER_RADIUS_IN).toBeCloseTo(R, 12);
		/* The evaluate.ts rule at the default body top of 2.95: a tenth of the top is 0.295, inside its 0.125..0.5 band. */
		expect(COLLAR_HEIGHT_IN).toBeCloseTo(0.295, 12);
		expect(collarTool.description).toMatch(/blade\/evaluate\.ts/);
		const d = await driven();
		await collarTool.run(d.api, defaultInputs(collarTool));
		const m = d.model();
		expect(m.features.map((f) => f.status)).toEqual(['ok', 'ok']);
		expect(m.bodies).toHaveLength(1);
		const r = hexCircumradius(0.5), h = COLLAR_HEIGHT_IN;
		console.log(`collar volume ${m.bodies[0].volume.toFixed(9)} against pi(R^2-r^2)h = ${(Math.PI * (R * R - r * r) * h).toFixed(9)}, faces ${m.bodies[0].faces.length}`);
		expect(m.bodies[0].volume).toBeCloseTo(Math.PI * (R * R - r * r) * h, 8);
		/* A solid disc of the outer radius would be this much more: the bore really is a hole. */
		expect(m.bodies[0].volume).toBeLessThan(Math.PI * R * R * h - Math.PI * r * r * h * 0.99);
		expect(m.bodies[0].faces.map((f) => f.kind).filter((k) => k === 'cylinder')).toHaveLength(2);
		expect(extent(m.bodies[0].bounds, 0)).toBeCloseTo(2 * R, 6);
		expect(m.bodies[0].role).toBe('collar');
		/* A typed pair goes out as typed. */
		const typed = await driven();
		await collarTool.run(typed.api, { z: 0, outer: 2, bore: 1.5, height: 0.4 });
		expect(typed.model().bodies[0].volume).toBeCloseTo(Math.PI * (4 - 2.25) * 0.4, 8);
	});
	it('the spin bolt is a cylinder of volume pi r^2 h hanging down from the bottom station', async () => {
		expect(SPIN_BOLT_RADIUS_IN).toBe(0.12); expect(SPIN_BOLT_HEIGHT_IN).toBeCloseTo(0.236, 12);
		const d = await driven();
		await spinBoltTool.run(d.api, defaultInputs(spinBoltTool));
		const m = d.model();
		expect(m.features.map((f) => f.status)).toEqual(['ok', 'ok']);
		const r = SPIN_BOLT_RADIUS_IN, h = SPIN_BOLT_HEIGHT_IN;
		console.log(`spin bolt volume ${m.bodies[0].volume.toFixed(9)} against pi r^2 h = ${(Math.PI * r * r * h).toFixed(9)}, z ${m.bodies[0].bounds[2].toFixed(6)}..${m.bodies[0].bounds[5].toFixed(6)}`);
		expect(m.bodies[0].volume).toBeCloseTo(Math.PI * r * r * h, 8);
		expect(m.bodies[0].bounds[5]).toBeCloseTo(BODY_BOTTOM_IN, 6);
		expect(m.bodies[0].bounds[2]).toBeCloseTo(BODY_BOTTOM_IN - h, 6);
		expect(extent(m.bodies[0].bounds, 0)).toBeCloseTo(2 * r, 6);
		expect(m.bodies[0].role).toBe('spin-bolt');
		const typed = await driven();
		await spinBoltTool.run(typed.api, { z: 0, diameter: 1, height: 3 });
		expect(typed.model().bodies[0].volume).toBeCloseTo(Math.PI * 0.25 * 3, 8);
	});
});
describe('the body profile', () => {
	it('revolves the default stations into the sum of their frusta, about Z, with the body top where the tree says', async () => {
		expect(DEFAULT_STATIONS).toEqual(featureOf(DEFAULT_BLADE_TREE, 'revolve').stations);
		const d = await driven();
		await bladeProfileTool.run(d.api, defaultInputs(bladeProfileTool));
		const m = d.model();
		expect(m.features.map((f) => f.status)).toEqual(['ok', 'ok']);
		expect(m.bodies).toHaveLength(1);
		let frusta = 0;
		for (let i = 1; i < DEFAULT_STATIONS.length; i++) { const a = DEFAULT_STATIONS[i - 1], b = DEFAULT_STATIONS[i]; frusta += Math.PI * (b.z - a.z) / 3 * (a.r * a.r + a.r * b.r + b.r * b.r); }
		console.log(`body volume ${m.bodies[0].volume.toFixed(9)} against frusta ${frusta.toFixed(9)}; bounds ${m.bodies[0].bounds.map((n) => n.toFixed(6)).join(' ')}`);
		expect(m.bodies[0].volume).toBeCloseTo(frusta, 6);
		const maxR = Math.max(...DEFAULT_STATIONS.map((s) => s.r));
		expect(extent(m.bodies[0].bounds, 0)).toBeCloseTo(2 * maxR, 6); expect(extent(m.bodies[0].bounds, 1)).toBeCloseTo(2 * maxR, 6);
		expect(m.bodies[0].bounds[2]).toBeCloseTo(BODY_BOTTOM_IN, 6); expect(m.bodies[0].bounds[5]).toBeCloseTo(BODY_TOP_IN, 6);
		expect(Math.hypot(m.bodies[0].centerOfMass[0], m.bodies[0].centerOfMass[1])).toBeLessThan(1e-6);
		expect(m.bodies[0].role).toBe('part');
	});
	it('a typed station list is what is revolved: two stations make one frustum', async () => {
		const d = await driven();
		await bladeProfileTool.run(d.api, { stations: '1, 0\n2, 3' });
		const m = d.model();
		expect(m.features.map((f) => f.status)).toEqual(['ok', 'ok']);
		expect(m.bodies[0].volume).toBeCloseTo(Math.PI * 3 / 3 * (1 + 2 + 4), 6);
		/* A line that is not two numbers is the add-on's own sentence, before anything is applied. */
		await expect(bladeProfileTool.run(d.api, { stations: '1, 0\nabc' })).rejects.toThrow(/station 2/);
		expect(d.model().features).toHaveLength(2);
	});
});
describe('the starter, the references and the advisory read', () => {
	it('the starter lays down four bodies with their roles, and advise() is the advisory read, whose hex extension is the hex top above the COLLAR top', async () => {
		const d = await driven();
		await runSteps(d.api, ideaBlade.starters[0].steps());
		const m = d.model();
		expect(m.features).toHaveLength(8);
		expect(m.features.map((f) => f.status)).toEqual(Array(8).fill('ok'));
		expect(m.bodies.map((b) => b.role)).toEqual(['part', 'hex-core', 'collar', 'spin-bolt']);
		expect(d.commands).toHaveLength(11);
		expect(d.commands.every((c) => c.label.startsWith('IdeaBlade:'))).toBe(true);
		const checks = ideaBlade.advise!(m, RULES);
		expect(checks).toEqual(advisory(m, RULES.limits).checks);
		expect(checks.map((c) => c.key)).toEqual(['diameter', 'height', 'mass', 'hex']);
		const hex = checks.find((c) => c.key === 'hex')!;
		console.log(`advisory: ${checks.map((c) => `${c.key}=${c.value === null ? 'null' : c.value.toFixed(6)} ${c.status}`).join(', ')}`);
		/* `advisory.ts` measures the extension from the top of every body that is not the hex core, and the collar is one: the hex stands 0.5 above the body top and the collar 0.295 above it, so the read is 0.205, and against the default 0.5 floor that is a fail. The blade editor's own `evaluate.ts` measures its extension above the BODY top (0.5, inside its 0.45..0.55 rule). That difference is the advisory's definition and is reported, not hidden here. */
		expect(hex.value).toBeCloseTo(HEX_HEIGHT_IN - COLLAR_HEIGHT_IN, 6); expect(hex.status).toBe('fail');
		const height = checks.find((c) => c.key === 'height')!;
		expect(height.value).toBeCloseTo(BODY_TOP_IN + COLLAR_HEIGHT_IN - (BODY_BOTTOM_IN - SPIN_BOLT_HEIGHT_IN), 6);
		expect(checks.find((c) => c.key === 'diameter')!.value).toBeCloseTo(2 * 1.65, 3);
		/* Without the collar, the hex extension IS the hex height and passes: the same read on a starter minus its collar. */
		const bare = await driven();
		await runSteps(bare.api, ideaBlade.starters[0].steps().filter((s) => !s.label.includes('collar')));
		const bareHex = ideaBlade.advise!(bare.model(), RULES).find((c) => c.key === 'hex')!;
		expect(bareHex.value).toBeCloseTo(HEX_HEIGHT_IN, 6); expect(bareHex.status).toBe('pass');
	});
	it('each reference becomes a reference feature the engine projects', async () => {
		const d = await driven();
		for (const r of ideaBlade.references) await runSteps(d.api, [r.step()]);
		const m = d.model();
		expect(m.features.map((f) => f.status)).toEqual(['ok', 'ok', 'ok']);
		expect(m.references.map((r) => r.kind)).toEqual(['axis', 'plane', 'plane']);
		expect(m.references[0].direction).toEqual([0, 0, 1]);
		expect(m.references[1].origin[2]).toBeCloseTo(BODY_TOP_IN, 9);
		expect(m.references[2].origin[2]).toBeCloseTo(featureOf(DEFAULT_BLADE_TREE, 'mount').z, 9);
		expect(d.commands.map((c) => c.label)).toEqual(['IdeaBlade: spin axis', 'IdeaBlade: body top plane', 'IdeaBlade: blade mount plane']);
	});
});
