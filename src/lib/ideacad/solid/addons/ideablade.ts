/**
 * THE IDEABLADE ADD-ON: the launcher's standard parts as tools, a starter that
 * lays them all down, the reference geometry a blade is built against, and the
 * advisory read the panel has shown since 2026-09-15.
 *
 * EVERY NUMBER HERE IS READ FROM THE BLADE EDITOR'S OWN DATA, NOT TYPED IN.
 *  - The hex core's across-flats is the launcher hex boss in
 *    `src/lib/ideacad/blade/materials.ts`: `DEFAULT_BLADE_CONFIG.launcher.acrossFlatsIn`
 *    when a deployment sets it, else the `hexBoss` feature of `DEFAULT_BLADE_TREE`
 *    (`acrossFlats: .5`). The tool's description names that source.
 *  - The body stations are `DEFAULT_BLADE_TREE`'s `body-revolve` feature, whose
 *    shape is `Station {r, z}` in `src/lib/ideacad/blade/tree.ts`.
 *  - The collar and the spin bolt follow the rules inside `evaluate()` in
 *    `src/lib/ideacad/blade/evaluate.ts` (collar outer radius: the hex corner
 *    radius plus 0.5 in; collar height: the larger of 0.125 in and the smaller
 *    of 0.5 in and a tenth of the body top; spin bolt radius: the smaller of
 *    0.125 in and the first station's radius; spin bolt height: the smaller of
 *    0.25 in and 0.08 of the body top). Those rules are locals of that function
 *    and cannot be imported, so they are restated here, applied ONCE to the
 *    default body to produce each field's opening value, and never to anything
 *    a student types. A typed number goes to the feature as typed.
 *
 * EVERY TOOL BUILDS ORDINARY FEATURES: a sketch made of the sketch editor's
 * own entity helpers, then an extrude or a revolve, then the body's role. What
 * the kernel will not build is the feature row's own sentence.
 */
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '../../blade/materials';
import { featureOf, type Station } from '../../blade/tree';
import { advisory } from '../advisory';
import { newFeatureId } from '../features';
import { polygonEntities, polylineEntities } from '../sketch/editor';
import type { Feature, FeatureOf, PlaneRef, SketchEntity, Vec2 } from '../types';
import { runSteps, type Addon, type AddonInputValues, type AddonStep, type AddonTool } from './registry';

/* ----------------------------------------------------------- the sources */
const hexBoss = featureOf(DEFAULT_BLADE_TREE, 'hexBoss');
const bodyRevolve = featureOf(DEFAULT_BLADE_TREE, 'revolve');
const bladeMount = featureOf(DEFAULT_BLADE_TREE, 'mount');
/** The launcher's across-flats, in inches: the config's launcher value when set, else the default tree's hex boss. */
export const HEX_ACROSS_FLATS_IN: number = DEFAULT_BLADE_CONFIG.launcher.acrossFlatsIn ?? hexBoss.acrossFlats;
/** A regular hexagon's corner radius from its across-flats. */
export const hexCircumradius = (acrossFlats: number) => acrossFlats / Math.sqrt(3);
export const HEX_HEIGHT_IN: number = hexBoss.height;
export const DEFAULT_STATIONS: readonly Station[] = bodyRevolve.stations;
export const BODY_TOP_IN: number = DEFAULT_STATIONS[DEFAULT_STATIONS.length - 1].z;
export const BODY_BOTTOM_IN: number = DEFAULT_STATIONS[0].z;
export const BLADE_MOUNT_Z_IN: number = bladeMount.z;
/** The collar's rule from `evaluate.ts`, applied to the default body. */
export const COLLAR_OUTER_RADIUS_IN: number = hexCircumradius(HEX_ACROSS_FLATS_IN) + 0.5;
const tenthOfTop = BODY_TOP_IN * 0.1;
export const COLLAR_HEIGHT_IN: number = tenthOfTop < 0.125 ? 0.125 : tenthOfTop > 0.5 ? 0.5 : tenthOfTop;
/** The spin bolt's rule from `evaluate.ts`, applied to the default body. */
export const SPIN_BOLT_RADIUS_IN: number = DEFAULT_STATIONS[0].r < 0.125 ? DEFAULT_STATIONS[0].r : 0.125;
const eightPercentOfTop = BODY_TOP_IN * 0.08;
export const SPIN_BOLT_HEIGHT_IN: number = eightPercentOfTop < 0.25 ? eightPercentOfTop : 0.25;
export const SOURCE_NOTE = 'blade/materials.ts DEFAULT_BLADE_TREE';

const fmt = (n: number) => String(Number(n.toFixed(4)));
const num = (v: number | string | undefined) => (typeof v === 'number' ? v : Number(v));
const xyAt = (z: number): PlaneRef => ({ kind: 'datum', datum: 'XY', offset: z });
const sketchFeature = (id: string, name: string, plane: PlaneRef, entities: SketchEntity[]): FeatureOf<'sketch'> => ({ id, name, type: 'sketch', plane, entities, constraints: [] });
/** A ring: one shared centre point, an outer circle and a concentric bore. Two circles on one point is what makes the bore a hole of the outer region. */
function ringEntities(outer: number, bore: number): SketchEntity[] {
	const c = `${newFeatureId()}c`;
	return [{ id: c, type: 'point', x: 0, y: 0 }, { id: `${newFeatureId()}o`, type: 'circle', center: c, radius: outer }, { id: `${newFeatureId()}b`, type: 'circle', center: c, radius: bore }];
}

/* ---------------------------------------------------------------- plans */
export function hexCoreSteps(inputs: AddonInputValues): AddonStep[] {
	const z = num(inputs.z), height = num(inputs.height);
	const sketch = newFeatureId(), extrude = newFeatureId();
	const r = hexCircumradius(HEX_ACROSS_FLATS_IN);
	return [
		{ feature: sketchFeature(sketch, 'Hex core sketch', xyAt(z), polygonEntities([0, 0], [r, 0], 6).entities), label: 'IdeaBlade: hex core sketch' },
		{ feature: { id: extrude, name: 'Hex core', type: 'extrude', sketch, distance: height, operation: 'new' }, label: 'IdeaBlade: hex core', role: 'hex-core' }
	];
}
export function collarSteps(inputs: AddonInputValues): AddonStep[] {
	const z = num(inputs.z), outer = num(inputs.outer), bore = num(inputs.bore), height = num(inputs.height);
	const sketch = newFeatureId(), extrude = newFeatureId();
	return [
		{ feature: sketchFeature(sketch, 'Collar sketch', xyAt(z), ringEntities(outer, bore)), label: 'IdeaBlade: collar sketch' },
		{ feature: { id: extrude, name: 'Collar', type: 'extrude', sketch, distance: height, operation: 'new' }, label: 'IdeaBlade: collar', role: 'collar' }
	];
}
export function spinBoltSteps(inputs: AddonInputValues): AddonStep[] {
	const z = num(inputs.z), diameter = num(inputs.diameter), height = num(inputs.height);
	const sketch = newFeatureId(), extrude = newFeatureId();
	const c = `${newFeatureId()}c`;
	return [
		{ feature: sketchFeature(sketch, 'Spin bolt sketch', xyAt(z), [{ id: c, type: 'point', x: 0, y: 0 }, { id: `${newFeatureId()}k`, type: 'circle', center: c, radius: diameter / 2 }]), label: 'IdeaBlade: spin bolt sketch' },
		/* Hangs DOWN from the body's bottom station: the sketch sits at the top of the bolt and the extrude goes the other way. */
		{ feature: { id: extrude, name: 'Spin bolt', type: 'extrude', sketch, distance: height, direction: 'reverse', operation: 'new' }, label: 'IdeaBlade: spin bolt', role: 'spin-bolt' }
	];
}
/**
 * Stations as a student types them: `radius, height` in inches, one per line
 * (a semicolon also ends a line). What comes back is the list, or a sentence
 * saying which line is not two numbers.
 */
export function parseStations(text: string): Station[] {
	const lines = text.split(/[\n;]+/).map((l) => l.trim()).filter((l) => l.length > 0);
	if (lines.length < 2) throw Error('Enter at least two stations, one per line, as radius, height in inches.');
	return lines.map((line, i) => {
		const parts = line.split(/[,\s]+/).filter((p) => p.length > 0).map(Number);
		if (parts.length !== 2 || !parts.every(Number.isFinite)) throw Error(`Enter station ${i + 1} as two finite numbers, radius, height in inches.`);
		return { r: parts[0], z: parts[1] };
	});
}
export const formatStations = (stations: readonly Station[]) => stations.map((s) => `${fmt(s.r)}, ${fmt(s.z)}`).join('\n');
/** The revolve profile a station list closes into: down the axis from the top station, out along each station, back to the axis at the bottom. In the XZ datum's own (u, v) = (x, z). */
export function profileCorners(stations: readonly Station[]): Vec2[] {
	const corners: Vec2[] = [[0, stations[0].z]];
	for (const s of stations) corners.push([s.r, s.z]);
	corners.push([0, stations[stations.length - 1].z]);
	return corners;
}
export function bladeProfileSteps(inputs: AddonInputValues): AddonStep[] {
	const stations = parseStations(String(inputs.stations ?? ''));
	const sketch = newFeatureId(), revolve = newFeatureId();
	return [
		{ feature: sketchFeature(sketch, 'Body profile sketch', { kind: 'datum', datum: 'XZ' }, polylineEntities(profileCorners(stations)).entities), label: 'IdeaBlade: body profile sketch' },
		{ feature: { id: revolve, name: 'Body', type: 'revolve', sketch, angle: 360, axis: { kind: 'datum', axis: 'Z' }, operation: 'new' }, label: 'IdeaBlade: body profile' }
	];
}

/* ---------------------------------------------------------------- tools */
const inch = (key: string, label: string, value: number, hint?: string) => ({ kind: 'number' as const, key, label, unit: 'in' as const, default: value, hint });
const tool = (id: string, name: string, description: string, icon: string, inputs: AddonTool['inputs'], plan: (inputs: AddonInputValues) => AddonStep[]): AddonTool => ({
	id, name, description, icon, inputs, selection: 'No selection needed.',
	/* `async`, so a sentence thrown while the plan is built (a station line that is not two numbers) is a rejection and never a synchronous throw. */
	run: async (api, inputs) => runSteps(api, plan(inputs))
});
export const hexCoreTool = tool('hex-core', 'Hex core',
	`A six-sided core at the launcher's ${fmt(HEX_ACROSS_FLATS_IN)} in across flats, from the IdeaBlade launcher hex boss (${SOURCE_NOTE}), extruded up from the base height.`,
	'M12 2l8.66 5v10L12 22l-8.66-5V7z',
	[inch('z', 'Base height', BODY_TOP_IN, 'The default body top.'), inch('height', 'Height', HEX_HEIGHT_IN, 'The hex boss height in the default tree.')],
	hexCoreSteps);
export const collarTool = tool('collar', 'Collar',
	`A ring around the hex core. The outer radius follows the blade's collar rule (blade/evaluate.ts: the hex corner radius plus 0.5 in); the bore is the hex core's corner circle; the height is that file's collar rule for the default body.`,
	'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zm0 5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
	[inch('z', 'Base height', BODY_TOP_IN), inch('outer', 'Outer radius', COLLAR_OUTER_RADIUS_IN), inch('bore', 'Bore radius', hexCircumradius(HEX_ACROSS_FLATS_IN)), inch('height', 'Height', COLLAR_HEIGHT_IN)],
	collarSteps);
export const spinBoltTool = tool('spin-bolt', 'Spin bolt',
	`A cylinder hanging down from the body's bottom station. Diameter and height follow blade/evaluate.ts's spin bolt rule for the default body.`,
	'M5 5a7 2.5 0 1 0 14 0a7 2.5 0 1 0-14 0v14a7 2.5 0 0 0 14 0V5',
	[inch('z', 'Top height', BODY_BOTTOM_IN, 'The default body\'s bottom station.'), inch('diameter', 'Diameter', SPIN_BOLT_RADIUS_IN * 2), inch('height', 'Height', SPIN_BOLT_HEIGHT_IN)],
	spinBoltSteps);
export const bladeProfileTool = tool('blade-profile', 'Body profile',
	`The spinning body every blade mounts on: a revolve about the Z axis of stations typed as radius, height in inches, one per line. The default stations are the IdeaBlade body (${SOURCE_NOTE} body-revolve; blade/tree.ts Station).`,
	'M12 2v20M12 4l5 2v4l1 8-6 4M12 4l-5 2v4l-1 8 6 4',
	[{ kind: 'text', key: 'stations', label: 'Stations (radius, height)', default: formatStations(DEFAULT_STATIONS), hint: 'One station per line, bottom first.', rows: 5 }],
	bladeProfileSteps);

/** A tool's opening values, which is what the starter runs it with. */
export const defaultInputs = (t: AddonTool): AddonInputValues => Object.fromEntries(t.inputs.map((i) => [i.key, i.default]));

export const ideaBlade: Addon = {
	id: 'ideaBlade',
	name: 'IdeaBlade',
	description: 'The launcher blade project: its standard parts as tools, a starter part, the reference geometry a blade is built against, and the advisory checks against the class limits.',
	tools: [bladeProfileTool, hexCoreTool, collarTool, spinBoltTool],
	starters: [{
		id: 'default-part', name: 'IdeaBlade default part',
		description: `The default body profile, hex core, collar and spin bolt from ${SOURCE_NOTE}, as four bodies with their roles set.`,
		steps: () => [...bladeProfileSteps(defaultInputs(bladeProfileTool)), ...hexCoreSteps(defaultInputs(hexCoreTool)), ...collarSteps(defaultInputs(collarTool)), ...spinBoltSteps(defaultInputs(spinBoltTool))]
	}],
	references: [
		{ id: 'spin-axis', name: 'Spin axis', description: 'The Z axis the body revolves about and the blades pattern around.', step: () => ({ feature: { id: newFeatureId(), name: 'Spin axis', type: 'axis', definition: { kind: 'datum', axis: 'Z' } } satisfies Feature, label: 'IdeaBlade: spin axis' }) },
		{ id: 'body-top', name: 'Body top plane', description: `The XY plane ${fmt(BODY_TOP_IN)} in up, where the hex core and collar sit on the default body.`, step: () => ({ feature: { id: newFeatureId(), name: 'Body top', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: BODY_TOP_IN } } satisfies Feature, label: 'IdeaBlade: body top plane' }) },
		{ id: 'blade-mount', name: 'Blade mount plane', description: `The XY plane ${fmt(BLADE_MOUNT_Z_IN)} in up, where the default tree mounts its blades.`, step: () => ({ feature: { id: newFeatureId(), name: 'Blade mount', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: BLADE_MOUNT_Z_IN } } satisfies Feature, label: 'IdeaBlade: blade mount plane' }) }
	],
	advise: (model, rules) => advisory(model, rules.limits).checks
};
