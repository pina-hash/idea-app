// tests/dom/ideacad-ui-model.test.ts
//
// THE FEATUREMANAGER'S AND THE PROPERTYMANAGER'S ARITHMETIC, WITH NOTHING
// MOUNTED. `src/lib/ideacad/ui/feature-model.ts` and `undo.ts` are pure, so
// every rule they carry is assertable here and none of it needs a browser.
//
// WHY THESE ASSERTIONS EXIST AT ALL, given this repo adds a test only for a
// guarantee whose regression would be SILENT: three of them are exactly that
// shape.
//
//   1. THE REORDER CONSTRAINT. `evaluate` finds each feature by TYPE, so a
//      reorder that put Blade Mount above Blade Sketch changes no number and
//      breaks no render. It is wrong only in the build order a student reads,
//      which nothing on screen and no type check can see.
//   2. THE PERCENT/FRACTION CONVERSION. `materials.bodySolidFraction` is a
//      fraction in the document and a PERCENT in the panel. Store the percent
//      and every body is 100 times too heavy, with a mass readout that still
//      renders a number and a FAIL chip that looks like a design problem.
//   3. THE UNDO DEPTH AND THE REDO CLEAR. A stack that grew forever, or one
//      that kept a future across a new edit, is a redo onto a branch the
//      student abandoned. Neither shows up until somebody presses it.
//
// The station rules are here too, because `addStation`'s midpoint is what keeps
// `validateBladeTree`'s strictly-increasing z true by construction -- a new
// station at an equal height is a zero-height frustum, and `frustumProperties`
// divides by `r2**3 - r1**3`.

import { describe, expect, it } from 'vitest';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
import { validateBladeTree } from '$lib/ideacad/blade/validate';
import { evaluate } from '$lib/ideacad/blade/evaluate';
import type { BladeTree } from '$lib/ideacad/blade/tree';
import {
	addStation,
	applyField,
	applyStation,
	featureLabel,
	featureParents,
	MAX_STATIONS,
	MIN_STATIONS,
	moveFeature,
	panelFor,
	profilePolyline,
	removeStation,
	setFeatures,
	setStations,
	stationsCanAdd,
	stationsCanRemove
} from '$lib/ideacad/ui/feature-model';
import { UNDO_DEPTH, UndoStack, undoKeyFor } from '$lib/ideacad/ui/undo';

const tree = () => structuredClone(DEFAULT_BLADE_TREE) as BladeTree;
const ids = (t: BladeTree) => t.features.map((f) => f.id);

describe('the FeatureManager reorder, against the tree’s own declared references', () => {
	it('moves a feature that nothing above it is built on', () => {
		const out = moveFeature(tree().features, 'hex-extension', -1);
		expect(out.refusal).toBeNull();
		expect(out.features.map((f) => f.id)).toEqual([
			'hex-extension',
			'body-revolve',
			'blade-sketch',
			'blade-extrude',
			'blade-pattern',
			'blade-mount'
		]);
	});

	it('refuses to lift a feature above the one it is built on, and says which', () => {
		// Blade Extrude declares `sketch: 'blade-sketch'`, which sits directly above it.
		const out = moveFeature(tree().features, 'blade-extrude', -1);
		expect(out.refusal).toBe('Blade Extrude is built on Blade Sketch, so it cannot move above it.');
		expect(out.features.map((f) => f.id)).toEqual(ids(tree())); // nothing moved
	});

	it('refuses the same move asked from the other side', () => {
		// Pushing the sketch DOWN past its own extrude is the identical illegal pair.
		const out = moveFeature(tree().features, 'blade-sketch', 1);
		expect(out.refusal).toBe('Blade Extrude is built on Blade Sketch, so it cannot move above it.');
		expect(out.features.map((f) => f.id)).toEqual(ids(tree()));
	});

	it('refuses to move past either end and names the end', () => {
		expect(moveFeature(tree().features, 'body-revolve', -1).refusal).toBe('Body Revolve is already first.');
		expect(moveFeature(tree().features, 'blade-mount', 1).refusal).toBe('Blade Mount is already last.');
	});

	it('reads the dependency off the feature rather than a table beside it', () => {
		const t = tree();
		const parents = Object.fromEntries(t.features.map((f) => [f.id, featureParents(f)]));
		expect(parents).toEqual({
			'body-revolve': [],
			'hex-extension': [],
			'blade-sketch': [],
			'blade-extrude': ['blade-sketch'],
			'blade-pattern': ['blade-extrude'],
			'blade-mount': ['blade-pattern']
		});
	});

	it('changes no number, which is why offering it at all is safe', () => {
		const before = evaluate(tree(), DEFAULT_BLADE_CONFIG);
		const moved = setFeatures(tree(), moveFeature(tree().features, 'hex-extension', -1).features);
		const after = evaluate(moved, DEFAULT_BLADE_CONFIG);
		expect(after.massG).toBeCloseTo(before.massG, 10);
		expect(after.inertiaGcm2).toBeCloseTo(before.inertiaGcm2, 10);
		// The positive control: the order really did change, so the equality above
		// is not two readings of the same document.
		expect(ids(moved)).not.toEqual(ids(tree()));
	});
});

describe('the station table, against validateBladeTree’s own bounds', () => {
	const stations = () => {
		const body = tree().features.find((f) => f.type === 'revolve');
		return body && body.type === 'revolve' ? body.stations : [];
	};

	it('adds a station at the midpoint, so heights still strictly increase', () => {
		const next = addStation(stations(), 1);
		expect(next.length).toBe(stations().length + 1);
		const t = setStations(tree(), next);
		expect(validateBladeTree(t, DEFAULT_BLADE_CONFIG)).toEqual([]);
		// Strictly increasing, asked of the document rather than of the helper.
		for (let i = 1; i < next.length; i++) expect(next[i].z).toBeGreaterThan(next[i - 1].z);
	});

	it('appends above the last station without producing a zero-height frustum', () => {
		const next = addStation(stations(), stations().length - 1);
		expect(next.at(-1)!.z).toBeGreaterThan(next.at(-2)!.z);
		expect(validateBladeTree(setStations(tree(), next), DEFAULT_BLADE_CONFIG)).toEqual([]);
	});

	it('fills from four up to the ceiling and refuses past it', () => {
		let list = stations();
		while (stationsCanAdd(list.length)) list = addStation(list, list.length - 1);
		expect(list.length).toBe(MAX_STATIONS);
		expect(stationsCanAdd(list.length)).toBe(false);
		expect(addStation.length).toBeGreaterThan(0); // the helper takes an index
		expect(validateBladeTree(setStations(tree(), list), DEFAULT_BLADE_CONFIG)).toEqual([]);
	});

	it('removes down to the floor and then refuses, which is the rule the panel quotes', () => {
		let list = stations();
		while (stationsCanRemove(list.length)) list = removeStation(list, list.length - 1);
		expect(list.length).toBe(MIN_STATIONS);
		expect(stationsCanRemove(list.length)).toBe(false);
		// The refusal is a no-op rather than a throw, so a doubled click cannot
		// take a body below three.
		expect(removeStation(list, 0)).toEqual(list);
	});

	it('edits one cell and leaves every other one alone', () => {
		const t = applyStation(tree(), 2, 'r', 1.9);
		const body = t.features.find((f) => f.type === 'revolve')!;
		expect(body.type === 'revolve' && body.stations[2]).toEqual({ r: 1.9, z: 2.4 });
		expect(body.type === 'revolve' && body.stations[1]).toEqual({ r: 1.55, z: 0.35 });
	});

	it('ignores a cell edit that is not a number, rather than writing NaN into a document', () => {
		const t = applyStation(tree(), 0, 'r', Number.NaN);
		const body = t.features.find((f) => f.type === 'revolve')!;
		expect(body.type === 'revolve' && body.stations[0].r).toBe(0.12);
	});
});

describe('the PropertyManager panels, and the one conversion in them', () => {
	it('quotes the CONFIG’s own rule as the bound, never a number typed beside it', () => {
		const panel = panelFor(tree(), 'hex-extension', DEFAULT_BLADE_CONFIG)!;
		const height = panel.fields.find((f) => f.key === 'height')!;
		expect(height.kind).toBe('number');
		if (height.kind !== 'number') throw new Error('unreachable');
		expect(height.min).toBe(DEFAULT_BLADE_CONFIG.rules.minHexExtensionIn);
		expect(height.max).toBe(DEFAULT_BLADE_CONFIG.rules.maxHexExtensionIn);
		expect(height.slider).toBe(true);
	});

	it('shows the body fill as a percent and stores it as a fraction', () => {
		const panel = panelFor(tree(), 'materials', DEFAULT_BLADE_CONFIG)!;
		const fill = panel.fields.find((f) => f.key === 'materials.bodySolidFraction')!;
		if (fill.kind !== 'number') throw new Error('unreachable');
		expect(fill.value).toBe(42); // the document holds 0.42
		const written = applyField(tree(), 'materials', 'materials.bodySolidFraction', 60);
		expect(written.materials.bodySolidFraction).toBe(0.6);
		// And the round trip, which is where a one-way conversion hides.
		expect(panelFor(written, 'materials', DEFAULT_BLADE_CONFIG)!.fields.find((f) => f.key === 'materials.bodySolidFraction')).toMatchObject({ value: 60 });
	});

	it('keeps the blade count a whole number, because validateBladeTree refuses a fraction', () => {
		const written = applyField(tree(), 'blade-pattern', 'count', 5.6);
		const pattern = written.features.find((f) => f.type === 'circularPattern')!;
		expect(pattern.type === 'circularPattern' && pattern.count).toBe(6);
		expect(validateBladeTree(written, DEFAULT_BLADE_CONFIG)).toEqual([]);
	});

	it('writes a new document rather than mutating the one it was handed', () => {
		const original = tree();
		const written = applyField(original, 'blade-pattern', 'count', 7);
		expect(original.features.find((f) => f.type === 'circularPattern')).toMatchObject({ count: 4 });
		expect(written.features.find((f) => f.type === 'circularPattern')).toMatchObject({ count: 7 });
	});

	it('gives the body stations and no fields, and every other feature fields and no stations', () => {
		expect(panelFor(tree(), 'body-revolve', DEFAULT_BLADE_CONFIG)!.stations).toHaveLength(4);
		for (const id of ['hex-extension', 'blade-sketch', 'blade-pattern', 'blade-mount']) {
			const panel = panelFor(tree(), id, DEFAULT_BLADE_CONFIG)!;
			expect(panel.stations).toBeNull();
			expect(panel.fields.length).toBeGreaterThan(0);
		}
	});

	it('answers null for a node that is not in this tree, so a stale selection renders nothing', () => {
		expect(panelFor(tree(), 'not-a-feature', DEFAULT_BLADE_CONFIG)).toBeNull();
	});

	it('names every panel it can open', () => {
		const openable = [...ids(tree()), 'materials', 'standard-parts'];
		for (const id of openable) {
			expect(panelFor(tree(), id, DEFAULT_BLADE_CONFIG)).not.toBeNull();
			expect(featureLabel(id)).not.toBe(id);
		}
	});
});

describe('the profile preview, derived from the same stations the lathe revolves', () => {
	it('puts one dot per station inside the box it was given', () => {
		const body = tree().features.find((f) => f.type === 'revolve')!;
		const stations = body.type === 'revolve' ? body.stations : [];
		const drawn = profilePolyline(stations, 120, 150);
		expect(drawn.dots).toHaveLength(stations.length);
		for (const dot of drawn.dots) {
			expect(dot.x).toBeGreaterThanOrEqual(0);
			expect(dot.x).toBeLessThanOrEqual(120);
			expect(dot.y).toBeGreaterThanOrEqual(0);
			expect(dot.y).toBeLessThanOrEqual(150);
		}
	});

	it('runs z UP the part and DOWN the screen, which is the one thing a flip gets wrong', () => {
		const drawn = profilePolyline([{ r: 0.1, z: 0 }, { r: 1, z: 1 }, { r: 0.5, z: 2 }], 100, 100);
		// The tallest station is the topmost pixel, so y descends as z rises.
		expect(drawn.dots[0].y).toBeGreaterThan(drawn.dots[2].y);
	});

	it('survives a body whose stations share one radius, rather than dividing by zero', () => {
		const drawn = profilePolyline([{ r: 1, z: 0 }, { r: 1, z: 1 }, { r: 1, z: 2 }], 100, 100);
		expect(drawn.dots.every((d) => Number.isFinite(d.x) && Number.isFinite(d.y))).toBe(true);
	});
});

describe('the undo stack', () => {
	const stack = () => new UndoStack<{ n: number }>(UNDO_DEPTH);

	it('is empty until something is accepted', () => {
		const s = stack();
		expect(s.canUndo).toBe(false);
		expect(s.canRedo).toBe(false);
		expect(s.undo({ n: 1 })).toBeNull();
		expect(s.redo({ n: 1 })).toBeNull();
	});

	it('hands back the state that was left, and takes the current one onto the redo side', () => {
		const s = stack();
		s.push({ n: 1 });
		expect(s.undo({ n: 2 })).toEqual({ n: 1 });
		expect(s.canRedo).toBe(true);
		expect(s.redo({ n: 1 })).toEqual({ n: 2 });
	});

	it('clones what it stores, so a later mutation of the live object cannot rewrite history', () => {
		const s = stack();
		const live = { n: 1 };
		s.push(live);
		live.n = 99;
		expect(s.undo({ n: 2 })).toEqual({ n: 1 });
	});

	it('discards the redo future on a new edit', () => {
		const s = stack();
		s.push({ n: 1 });
		s.undo({ n: 2 });
		expect(s.canRedo).toBe(true);
		s.push({ n: 1 }); // a fresh edit from the restored state
		expect(s.canRedo).toBe(false);
	});

	it('caps at the stated depth and drops the OLDEST, not the newest', () => {
		const s = stack();
		for (let i = 0; i < UNDO_DEPTH + 10; i++) s.push({ n: i });
		expect(s.undoDepth).toBe(UNDO_DEPTH);
		// The most recent push is still the first thing an undo returns.
		expect(s.undo({ n: 999 })).toEqual({ n: UNDO_DEPTH + 9 });
	});

	it('clears both sides when a different concept is loaded', () => {
		const s = stack();
		s.push({ n: 1 });
		s.undo({ n: 2 });
		s.clear();
		expect(s.canUndo).toBe(false);
		expect(s.canRedo).toBe(false);
	});
});

describe('the undo keystroke map', () => {
	const ev = (key: string, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) => ({
		key,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		...mods
	});

	it('reads Ctrl+Z as undo and both redo spellings as redo', () => {
		expect(undoKeyFor(ev('z', { ctrlKey: true }))).toBe('undo');
		expect(undoKeyFor(ev('Z', { ctrlKey: true }))).toBe('undo');
		expect(undoKeyFor(ev('y', { ctrlKey: true }))).toBe('redo');
		expect(undoKeyFor(ev('z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
	});

	it('takes Cmd as well, because half the lab is on a Mac', () => {
		expect(undoKeyFor(ev('z', { metaKey: true }))).toBe('undo');
	});

	it('claims nothing without a modifier, which is what leaves Z to the viewport zoom', () => {
		expect(undoKeyFor(ev('z'))).toBeNull();
		expect(undoKeyFor(ev('y'))).toBeNull();
		expect(undoKeyFor(ev('f', { ctrlKey: true }))).toBeNull();
	});
});
