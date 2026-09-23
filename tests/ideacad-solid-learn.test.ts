// tests/ideacad-solid-learn.test.ts
//
// THE MODELER TEACHING ITSELF: the tutorial's step predicates, the hints that
// retire, and where a tool's card goes. Each fails SILENTLY in use: a step that
// ticks by itself on a document that already had a fillet (the student is told
// they rounded an edge they never touched), a step that never ticks (the
// tutorial stalls with nothing on screen to say why), a hint that never retires
// (the same line forever) or retires on a failed press, a stored step id that
// no longer exists putting the panel in a state no branch renders, and a card
// placed over the very tool it describes. Every "does not" is paired with the
// case that does, built from the same fake model.
import { describe, expect, it } from 'vitest';
import type { Feature, FeatureRow, MateProjection, ModelProjection, SketchProjection } from '../src/lib/ideacad/solid/types';
import { TUTORIAL, TUTORIAL_STEPS, advance, firstStepOf, tasksDone, tutorialFacts, tutorialPosition, tutorialProgress } from '../src/lib/ideacad/solid/learn/tutorial';
import { FIRST_USE_HINTS, firstUseHint, retireAfterUse, retireInStore, toolHintId } from '../src/lib/ideacad/solid/learn/hints';
import { MemoryPreferenceStore } from '../src/lib/ideacad/solid/preferences';
import { cssTimeMs, placeTip, splitShortcut } from '../src/lib/ideacad/solid/learn/tip-place';
import { DEMO_TOOLS } from '../src/lib/ideacad/solid/learn/demos';
import { COMMANDS, TOOL_IDS, commandById } from '../src/lib/ideacad/solid/command-registry';

type Model = Pick<ModelProjection, 'bodies' | 'sketches' | 'features' | 'mates'>;
const row = (id: string, type: Feature['type'], status: FeatureRow['status'] = 'ok'): FeatureRow => ({ id, index: 0, type, name: id, status, summary: '', bodies: [], dependsOn: [], suppressed: false });
const body = (id: string) => ({ id } as ModelProjection['bodies'][number]);
const rectangle = (feature: string, planeRef: SketchProjection['planeRef'] = { kind: 'datum', datum: 'XY' }): SketchProjection => ({ feature, name: feature, plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] }, planeRef, constraints: [], solve: { converged: true, classification: 'solved', dof: 0, maxResidual: 0, trouble: [] }, regions: [], consumed: false,
	entities: [{ id: 'p1', type: 'point', x: 0, y: 0 }, { id: 'p2', type: 'point', x: 1, y: 0 }, { id: 'p3', type: 'point', x: 1, y: 1 }, { id: 'p4', type: 'point', x: 0, y: 1 }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p4' }, { id: 'l4', type: 'line', a: 'p4', b: 'p1' }] });
const circleOn = (feature: string, planeRef: SketchProjection['planeRef']): SketchProjection => ({ ...rectangle(feature, planeRef), entities: [{ id: 'c', type: 'point', x: 0, y: 0 }, { id: 'k', type: 'circle', center: 'c', radius: 0.25 }] });
const FACE = { kind: 'face', face: { feature: 'e1', role: 'end' } } as unknown as SketchProjection['planeRef'];
const sketchF = (id: string): Feature => ({ id, name: id, type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [], constraints: [] });
const extrudeF = (id: string, operation: 'new' | 'add' | 'cut', sketch = 's1'): Feature => ({ id, name: id, type: 'extrude', sketch, distance: 1, operation });
const filletF = (id: string): Feature => ({ id, name: id, type: 'fillet', edges: [], radius: 0.1 });
const mate = (feature: string, status: MateProjection['status'] = 'ok'): MateProjection => ({ feature, kind: 'coincident', a: {} as never, b: {} as never, status });
const EMPTY: Model = { bodies: [], sketches: [], features: [], mates: [] };

describe('what the tutorial counts', () => {
	it('an empty document counts nothing and carries the armed tool', () => {
		expect(tutorialFacts(EMPTY, [], 'select')).toEqual({ tool: 'select', bodies: 0, rectangles: 0, solids: 0, fillets: 0, faceCircles: 0, cuts: 0, mates: 0 });
	});
	it('counts a built pull as a solid and a built cut as a cut; a failed or suppressed one counts as neither', () => {
		const model: Model = { ...EMPTY, bodies: [body('e1#0')], sketches: [rectangle('s1')], features: [row('s1', 'sketch'), row('e1', 'extrude'), row('e2', 'extrude'), row('e3', 'extrude', 'error'), row('e4', 'extrude')] };
		const features = [sketchF('s1'), extrudeF('e1', 'new'), extrudeF('e2', 'cut'), extrudeF('e3', 'new'), { ...extrudeF('e4', 'add'), suppressed: true }];
		const f = tutorialFacts(model, features, 'extrude');
		expect(f.solids).toBe(1); expect(f.cuts).toBe(1); expect(f.rectangles).toBe(1); expect(f.bodies).toBe(1);
	});
	it('a circle counts toward "cut a hole" only when it is drawn on a model face, and a hole feature counts as a cut', () => {
		const onDatum = tutorialFacts({ ...EMPTY, sketches: [circleOn('s2', { kind: 'datum', datum: 'XY' })] }, [], 'circle');
		const onFace = tutorialFacts({ ...EMPTY, sketches: [circleOn('s2', FACE)], features: [row('h1', 'hole')] }, [{ id: 'h1', name: 'h1', type: 'hole', face: {} as never, center: [0, 0], standard: 'x', fit: 'close', depth: 'through' }], 'hole');
		expect(onDatum.faceCircles).toBe(0);
		expect(onFace.faceCircles).toBe(1); expect(onFace.cuts).toBe(1);
	});
	it('a mate in error does not count; one that solved does', () => {
		expect(tutorialFacts({ ...EMPTY, mates: [mate('m1', 'error')] }, [], 'mate').mates).toBe(0);
		expect(tutorialFacts({ ...EMPTY, mates: [mate('m1', 'error'), mate('m2')] }, [], 'mate').mates).toBe(1);
	});
});

describe('a step is done when the student did it, counted from where the step began', () => {
	const step = (id: string) => TUTORIAL_STEPS.find((s) => s.id === id)!;
	const base = tutorialFacts(EMPTY, [], 'select');
	it('a document that already has a fillet does not tick "round an edge" by itself; one more fillet does', () => {
		const had = { ...base, fillets: 3 };
		expect(step('round-drag').done(had, had)).toBe(false);
		expect(step('round-drag').done(had, { ...had, fillets: 4 })).toBe(true);
	});
	it('a "pick the tool" step ticks when the tool is armed, and not on a different tool', () => {
		expect(step('draw-tool').done(base, { ...base, tool: 'circle' })).toBe(false);
		expect(step('draw-tool').done(base, { ...base, tool: 'rectangle' })).toBe(true);
	});
	it('advance passes every step already done in order and stops at the first that is not', () => {
		const i = TUTORIAL_STEPS.findIndex((s) => s.id === 'draw-tool');
		expect(advance(i, base, base)).toBe(i);
		expect(TUTORIAL_STEPS[advance(i, base, { ...base, tool: 'rectangle' })].id).toBe('draw-drag');
		/* Drew a rectangle with a shortcut before picking: both steps of the task pass, and the pull waits. */
		expect(TUTORIAL_STEPS[advance(i, base, { ...base, tool: 'extrude', rectangles: 1 })].id).toBe('pull-drag');
	});
	it('the cut task needs a circle on a face and then a cut; a pull does not stand in for the cut', () => {
		const s = { ...base, faceCircles: 1 };
		expect(step('cut-circle').done(base, s)).toBe(true);
		expect(step('cut-push').done(s, { ...s, solids: 2 })).toBe(false);
		expect(step('cut-push').done(s, { ...s, cuts: 1 })).toBe(true);
	});
	it('the mate task waits for two bodies, then a solved mate', () => {
		expect(step('mate-part').done({ ...base, bodies: 1 }, { ...base, bodies: 1 })).toBe(false);
		expect(step('mate-part').done({ ...base, bodies: 1 }, { ...base, bodies: 2 })).toBe(true);
		expect(step('mate-pick').done({ ...base, mates: 0 }, { ...base, mates: 0, tool: 'mate' })).toBe(false);
		expect(step('mate-pick').done({ ...base, mates: 0 }, { ...base, mates: 1 })).toBe(true);
	});
});

describe('the task list and the stored progress', () => {
	it('is the five tasks asked for, each step naming a real registry command in one line', () => {
		expect(TUTORIAL.map((t) => t.id)).toEqual(['draw', 'pull', 'round', 'cut', 'mate']);
		for (const s of TUTORIAL_STEPS) {
			expect(commandById(s.command), s.id).toBeDefined();
			expect(s.line, s.id).not.toMatch(/\n|\u2014/);
			expect(s.line.split(/[.!?]\s/).length, s.id).toBe(1);
			/* The preferences' own hint id rule, so a stored step survives the read. */
			expect(s.id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
		}
		expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
	});
	it('reads a stored step back to the same place, past the end as finished, and an unknown id as the start', () => {
		expect(tutorialPosition({ step: null, finished: false })).toEqual({ index: null, finished: false });
		for (let i = 0; i < TUTORIAL_STEPS.length; i++) expect(tutorialPosition(tutorialProgress(i)).index).toBe(i);
		expect(tutorialProgress(TUTORIAL_STEPS.length)).toEqual({ step: null, finished: true });
		expect(tutorialPosition({ step: 'a-step-since-removed', finished: false })).toEqual({ index: 0, finished: false });
		expect(tutorialPosition({ step: 'draw-drag', finished: true })).toEqual({ index: null, finished: true });
	});
	it('counts a task done only once every step of it has passed', () => {
		expect(tasksDone({ index: firstStepOf(0), finished: false })).toBe(0);
		expect(tasksDone({ index: firstStepOf(0) + 1, finished: false })).toBe(0);
		expect(tasksDone({ index: firstStepOf(3), finished: false })).toBe(3);
		expect(tasksDone({ index: null, finished: true })).toBe(5);
	});
});

describe('hints that retire', () => {
	it('shows a tool its line until that tool has been used, and never a line for a tool with none', () => {
		expect(firstUseHint('rectangle', [])).toBe(FIRST_USE_HINTS.rectangle);
		expect(firstUseHint('rectangle', [toolHintId('rectangle')])).toBeNull();
		expect(firstUseHint('select', [])).toBeNull();
	});
	it('retires the hint when a change with the tool armed added a feature, and not when it added nothing', () => {
		const before = [{ id: 's1' }];
		expect(retireAfterUse([], 'fillet', before, before)).toEqual([]);
		expect(retireAfterUse([], 'fillet', before, [{ id: 's1' }, { id: 'f1' }])).toEqual(['tool-fillet']);
		/* Already retired, or a tool with no hint: the same list back, so a caller can skip the write. */
		const retired = ['tool-fillet'];
		expect(retireAfterUse(retired, 'fillet', before, [{ id: 's1' }, { id: 'f2' }])).toBe(retired);
		expect(retireAfterUse(retired, 'select', before, [{ id: 's1' }, { id: 'f2' }])).toBe(retired);
	});
	it('through the store: a used tool retires once and stores only the retired id; a change that added nothing writes nothing', () => {
		const store = new MemoryPreferenceStore({ hints: { tooltipDelayMs: 250 } });
		expect(retireInStore(store, 'rectangle', [], [])).toBe(false);
		expect(store.stored()).toEqual({ hints: { tooltipDelayMs: 250 } });
		expect(retireInStore(store, 'rectangle', [], [{ id: 's1' }])).toBe(true);
		expect(store.stored()).toEqual({ hints: { tooltipDelayMs: 250, retired: ['tool-rectangle'] } });
		expect(retireInStore(store, 'rectangle', [{ id: 's1' }], [{ id: 's1' }, { id: 's2' }])).toBe(false);
		expect(firstUseHint('rectangle', store.current.hints.retired)).toBeNull();
		expect(firstUseHint('circle', store.current.hints.retired)).toBe(FIRST_USE_HINTS.circle);
	});
	it('every hint is one short line for a real tool, and its id passes the preferences\' rule', () => {
		for (const [tool, line] of Object.entries(FIRST_USE_HINTS)) {
			expect(TOOL_IDS as readonly string[], tool).toContain(tool);
			expect(line.length, tool).toBeLessThanOrEqual(48);
			expect(line, tool).not.toMatch(/\.\s|\u2014/);
			expect(toolHintId(tool)).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
		}
	});
});

describe('where a tool\'s card goes', () => {
	const vp = { width: 1440, height: 900 };
	const tool = (left: number, top: number) => ({ left, top, right: left + 44, bottom: top + 44, width: 44, height: 44 });
	const overlaps = (a: { left: number; top: number; right: number; bottom: number }, p: { left: number; top: number }, s: { width: number; height: number }) => p.left < a.right && p.left + s.width > a.left && p.top < a.bottom && p.top + s.height > a.top;
	it('beside a palette tool on the left, to its right, level with it', () => {
		const a = tool(12, 100), p = placeTip(a, { width: 240, height: 160 }, vp);
		expect(p.side).toBe('right'); expect(p.left).toBe(64); expect(p.top).toBe(100);
	});
	it('flips to the left at the right edge, and is pulled up off the bottom edge', () => {
		const a = tool(1380, 860), s = { width: 240, height: 160 }, p = placeTip(a, s, vp);
		expect(p.side).toBe('left'); expect(p.left + s.width).toBeLessThanOrEqual(1380);
		expect(p.top + s.height).toBeLessThanOrEqual(892);
	});
	it('on a phone strip with no room beside, goes above the tool; never over it, at any place along the strip', () => {
		const phone = { width: 375, height: 812 }, s = { width: 300, height: 170 };
		let cases = 0;
		for (let x = 4; x <= 375 - 48; x += 12) { const a = tool(x, 740), p = placeTip(a, s, phone); expect(overlaps(a, p, s), `x=${x}`).toBe(false); expect(p.left).toBeGreaterThanOrEqual(8); expect(p.left + s.width).toBeLessThanOrEqual(367); cases++; }
		expect(cases).toBeGreaterThan(20);
	});
	it('reads the delay the workspace sets, in ms or s, and keeps the default for anything else', () => {
		expect(cssTimeMs('400ms', 1)).toBe(400); expect(cssTimeMs(' 0.3s', 1)).toBe(300); expect(cssTimeMs('0ms', 1)).toBe(0);
		expect(cssTimeMs('', 400)).toBe(400); expect(cssTimeMs('fast', 400)).toBe(400); expect(cssTimeMs('-5ms', 400)).toBe(400);
	});
	it('splits the palette\'s "Name (Key)" into the name and the key, and leaves a name with none alone', () => {
		expect(splitShortcut('Rectangle (R)')).toEqual({ name: 'Rectangle', shortcut: 'R' });
		expect(splitShortcut('Linear pattern')).toEqual({ name: 'Linear pattern', shortcut: null });
	});
	it('every tool with a moving picture is a registry tool', () => {
		for (const t of DEMO_TOOLS) expect(COMMANDS.find((c) => c.id === t)?.tool, t).toBe(t);
		expect(DEMO_TOOLS.length).toBeGreaterThanOrEqual(10);
	});
});
