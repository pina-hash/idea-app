// tests/ideacad-solid-preferences.test.ts
//
// THE MODELER'S PREFERENCE STORE. What is pinned here all fails SILENTLY in
// use: a stored value no branch can render (an unknown plane mode, a
// shortcut on a digit, a tool that no longer exists), a write that erases a
// sibling namespace or the chooser's `ideacad.panes` (every other surface
// loses its settings with nothing on screen to say so), a reset that resets
// the wrong group, and storage that throws (a private window) taking the
// modeler down with it. Each absence is paired with a positive control.
import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_PREFERENCES_PREFIX, LocalPreferenceStore, MemoryPreferenceStore, ProfilePreferenceStore, applyToModules, captureFromModules, changedGroups, compactPreferences, defaultPreferences, mergeSolidPreferences, readPreferences, solidPreferencesFrom, type PreferenceStorage } from '../src/lib/ideacad/solid/preferences';
import { resetSnapSettings, snapSettings } from '../src/lib/ideacad/solid/viewport/drag-math';
import { drawingSettings } from '../src/lib/ideacad/solid/viewport/drawing';
import { datumPlaneMode, setDatumPlaneMode } from '../src/lib/ideacad/solid/viewport/reference-layer';
import { readoutSettings } from '../src/lib/ideacad/solid/viewport/readout';
import { featureOptions, resetFeatureOptions } from '../src/lib/ideacad/solid/features/options';

afterEach(() => { resetSnapSettings(); resetFeatureOptions(); drawingSettings.polygonSides = 6; setDatumPlaneMode('auto'); readoutSettings.unit = 'in'; });

describe('reading a stored blob', () => {
	it('an empty, missing or garbage blob is the defaults', () => {
		for (const raw of [undefined, null, 7, 'x', [], {}]) expect(readPreferences(raw), String(raw)).toEqual(defaultPreferences());
	});
	it('unknown groups, unknown fields, unknown commands and unknown tools are dropped', () => {
		const p = readPreferences({ bogus: { a: 1 }, view: { planes: 'always', wat: true }, toolbar: { quick: ['line', 'teleport', 'line', 'extrude', 7] }, shortcuts: { line: 'k', 'make-coffee': 'm' }, commands: { recent: ['fit', 'nope', 'fit', 'undo'] } });
		expect(p).not.toHaveProperty('bogus');
		expect(p.view).toEqual({ planes: 'always', triad: true, mode: 'shaded-edges' });
		expect(p.toolbar.quick).toEqual(['line', 'extrude']);
		expect(p.shortcuts).toEqual({ line: 'k' });
		expect(p.commands.recent).toEqual(['fit', 'undo']);
	});
	it('an invalid value takes its default, field by field, and the valid field beside it survives', () => {
		const p = readPreferences({
			view: { planes: 'sometimes', triad: false, mode: 'cartoon' },
			snaps: { references: 'yes', bodies: true },
			drawing: { polygonSides: 2.5 },
			features: { fillet: { propagate: true, variableEnd: 'big', law: 'wobbly' }, hole: { standard: 'M999', fit: 'close', diameter: 0.3, depth: -1 } },
			hints: { tooltipDelayMs: -5, retired: ['draw-plane', 'Bad Id', 'draw-plane'], tutorial: { step: 7, finished: 'no' } },
			units: { display: 'furlong' },
			shortcuts: { line: '5', circle: 'Escape', rectangle: 'Ctrl+Shift+R', polygon: null }
		});
		expect(p.view).toEqual({ planes: 'auto', triad: false, mode: 'shaded-edges' });
		expect(p.snaps).toEqual({ references: false, bodies: true, angles: false });
		expect(p.drawing.polygonSides).toBe(6);
		expect(p.features.fillet).toEqual({ propagate: true, variableEnd: null, law: 'linear' });
		/* No clamp: a negative hole depth is a finite number, so it is kept; the kernel says what it makes of it. */
		expect(p.features.hole).toEqual({ standard: '1/4-20', fit: 'close', diameter: 0.3, depth: -1 });
		expect(p.hints).toEqual({ tooltipDelayMs: 400, retired: ['draw-plane'], tutorial: { step: null, finished: false } });
		expect(p.units.display).toBe('in');
		expect(p.shortcuts).toEqual({ rectangle: 'Ctrl+Shift+r', polygon: null });
	});
	it('two stored choices of one key keep the first by command id, so no key runs two commands', () => {
		expect(readPreferences({ shortcuts: { polygon: 'q', arc: 'q' } }).shortcuts).toEqual({ arc: 'q' });
	});
	it('a large polygon side count and a large delay are kept: nothing is clamped above', () => {
		const p = readPreferences({ drawing: { polygonSides: 360 }, hints: { tooltipDelayMs: 5000 } });
		expect(p.drawing.polygonSides).toBe(360);
		expect(p.hints.tooltipDelayMs).toBe(5000);
	});
});

describe('what is stored', () => {
	it('only the fields a student changed, and nothing at all for the defaults', () => {
		expect(compactPreferences(defaultPreferences())).toEqual({});
		const p = defaultPreferences();
		p.view.planes = 'never'; p.snaps.angles = true; p.shortcuts = { line: null };
		expect(compactPreferences(p)).toEqual({ view: { planes: 'never' }, snaps: { angles: true }, shortcuts: { line: null } });
		expect(readPreferences(compactPreferences(p))).toEqual(p);
	});
	it('the merge replaces ideacad.solid and keeps every sibling namespace and ideacad.panes byte for byte', () => {
		const blob = { homepage: { compact: false, pinned: ['x'] }, coinDesk: { amount: 5 }, ideacad: { panes: { left: 320, right: 280 }, solid: { view: { planes: 'never' } } } };
		const merged = mergeSolidPreferences(blob, { units: { display: 'mm' } });
		expect(merged).toEqual({ homepage: { compact: false, pinned: ['x'] }, coinDesk: { amount: 5 }, ideacad: { panes: { left: 320, right: 280 }, solid: { units: { display: 'mm' } } } });
		/* Positive control: the input was not changed in place. */
		expect(blob.ideacad.solid).toEqual({ view: { planes: 'never' } });
		expect(mergeSolidPreferences(null, {})).toEqual({ ideacad: { solid: {} } });
		expect(mergeSolidPreferences({ ideacad: 'broken' }, {})).toEqual({ ideacad: { solid: {} } });
		expect(solidPreferencesFrom(blob)).toEqual({ view: { planes: 'never' } });
		expect(solidPreferencesFrom({})).toBeUndefined();
	});
});

describe('the stores', () => {
	it('a group is set, validated and announced; a reset puts back that group and no other', () => {
		const store = new MemoryPreferenceStore({ units: { display: 'mm' } });
		const seen: string[] = [];
		const off = store.subscribe((p) => seen.push(`${p.view.planes}/${p.units.display}`));
		store.set('view', { ...store.current.view, planes: 'always' });
		expect(store.current.view.planes).toBe('always');
		expect(store.stored()).toEqual({ view: { planes: 'always' }, units: { display: 'mm' } });
		/* An invalid value set through the store is validated like a stored one. */
		store.set('view', { ...store.current.view, triad: 'maybe' as never });
		expect(store.current.view.triad).toBe(true);
		store.reset('view');
		expect(store.current.view).toEqual(defaultPreferences().view);
		expect(store.current.units.display).toBe('mm');
		/* A set that changes nothing tells nobody. */
		store.set('units', { display: 'mm' });
		off();
		store.set('units', { display: 'in' });
		expect(seen).toEqual(['always/mm', 'auto/mm']);
	});
	it('the profile store reads the row, merges, and writes once after a burst, keeping every sibling', async () => {
		let row: Record<string, unknown> = { homepage: { compact: true }, ideacad: { panes: { left: 300 } } };
		const writes: Record<string, unknown>[] = [];
		const store = new ProfilePreferenceStore(undefined, { read: async () => structuredClone(row), write: async (p) => { writes.push(p); row = p; } }, 5);
		store.set('snaps', { references: true, bodies: false, angles: false });
		store.set('units', { display: 'mm' });
		await store.flush();
		expect(writes).toHaveLength(1);
		expect(row).toEqual({ homepage: { compact: true }, ideacad: { panes: { left: 300 }, solid: { snaps: { references: true }, units: { display: 'mm' } } } });
		/* Another surface writes a namespace between two of ours: the next write keeps it. */
		row = { ...row, coinDesk: { amount: 2 } };
		store.set('units', { display: 'in' });
		await store.flush();
		expect(row).toEqual({ homepage: { compact: true }, coinDesk: { amount: 2 }, ideacad: { panes: { left: 300 }, solid: { snaps: { references: true } } } });
	});
	it('a profile read that fails writes nothing over the row, keeps the choice, and the next change tries again', async () => {
		let failing = true;
		const writes: unknown[] = [];
		const store = new ProfilePreferenceStore({}, { read: async () => { if (failing) throw Error('offline'); return { homepage: { compact: true } }; }, write: async (p) => { writes.push(p); } }, 5);
		store.set('units', { display: 'mm' });
		await store.flush();
		expect(writes).toEqual([]);
		expect(store.failed).toBe(true);
		expect(store.current.units.display).toBe('mm');
		failing = false;
		await store.flush();
		expect(writes).toEqual([{ homepage: { compact: true }, ideacad: { solid: { units: { display: 'mm' } } } }]);
		expect(store.failed).toBe(false);
	});
	it('the local store keeps a viewer\'s choices under their own key and reads them back', () => {
		const data = new Map<string, string>();
		const storage: PreferenceStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
		new LocalPreferenceStore('ana', storage).set('view', { planes: 'never', triad: false, mode: 'shaded-edges' });
		expect(JSON.parse(data.get(`${LOCAL_PREFERENCES_PREFIX}ana`)!)).toEqual({ view: { planes: 'never', triad: false } });
		expect(new LocalPreferenceStore('ana', storage).current.view.planes).toBe('never');
		expect(new LocalPreferenceStore('ben', storage).current.view.planes).toBe('auto');
		/* A corrupt slot is the defaults, not an exception. */
		data.set(`${LOCAL_PREFERENCES_PREFIX}ana`, '{not json');
		expect(new LocalPreferenceStore('ana', storage).current).toEqual(defaultPreferences());
	});
	it('storage that throws on every access never throws out of the store, and the choice holds for the session', () => {
		const throwing: PreferenceStorage = { getItem: () => { throw Error('SecurityError'); }, setItem: () => { throw Error('QuotaExceededError'); } };
		let store!: LocalPreferenceStore;
		expect(() => { store = new LocalPreferenceStore('ana', throwing); }).not.toThrow();
		expect(() => store.set('units', { display: 'mm' })).not.toThrow();
		expect(store.current.units.display).toBe('mm');
		/* With no storage handed in, the global one is used; node has none, which is the same answer. */
		expect(() => new LocalPreferenceStore('ana').set('units', { display: 'mm' })).not.toThrow();
		expect(() => new LocalPreferenceStore('ana', null).set('units', { display: 'mm' })).not.toThrow();
	});
});

describe('the module settings', () => {
	it('are filled from the preferences, and a panel that writes one has written a preference', () => {
		const p = readPreferences({ snaps: { angles: true }, drawing: { polygonSides: 8 }, features: { fillet: { propagate: true } }, view: { planes: 'never' }, units: { display: 'mm' } });
		applyToModules(p);
		expect(snapSettings).toEqual({ references: false, bodies: false, angles: true });
		expect(drawingSettings.polygonSides).toBe(8);
		expect(featureOptions.fillet.propagate).toBe(true);
		expect(datumPlaneMode()).toBe('never');
		expect(readoutSettings.unit).toBe('mm');
		/* The panel writes the module object directly; capturing reads it back. */
		snapSettings.bodies = true; drawingSettings.polygonSides = 12; featureOptions.hole.standard = 'M6'; setDatumPlaneMode('always');
		const captured = captureFromModules(p);
		expect(captured.snaps).toEqual({ references: false, bodies: true, angles: true });
		expect(captured.drawing.polygonSides).toBe(12);
		expect(captured.features.hole.standard).toBe('M6');
		expect(captured.view.planes).toBe('always');
		expect(changedGroups(p, captured).sort()).toEqual(['drawing', 'features', 'snaps', 'view']);
		/* The shell's per-face walls name faces of one document: an entry, never a preference. */
		featureOptions.shell.faceThickness = [{ face: { body: 'b', name: 'f' }, thickness: 0.2 }];
		expect(JSON.stringify(captureFromModules(p))).not.toMatch(/faceThickness/);
	});
});
