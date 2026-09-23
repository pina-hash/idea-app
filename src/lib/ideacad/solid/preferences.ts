/**
 * EVERYTHING A STUDENT CUSTOMIZES IN THE MODELER, IN ONE TYPED STORE. The
 * planes, the corner triad, the quick toolbar and its order, every shortcut,
 * the snaps, the polygon side count, the feature defaults, hint timing and
 * retired hints, the commands used recently, and the display unit.
 *
 * WHERE IT LIVES. Behind `PreferenceStore`, with three implementations: in
 * memory (tests), in `localStorage` per viewer (the dev harness), and in the
 * student's own profile row (the real route), so the choices follow the
 * student to any computer. The profile write is the repo's whole-blob
 * SPREAD-MERGE under `preferences.ideacad.solid`: every sibling namespace, and
 * `preferences.ideacad.panes` beside it, survives a write. There is no
 * migration: `profiles.preferences` already exists with an update-own-profile
 * policy.
 *
 * WHAT IS STORED. Only the values a student changed from the defaults, so a
 * better default later reaches everybody who never chose. A value is a
 * DEFAULT, never an entry: nothing here remembers a face, a body or a document.
 *
 * VALIDATED ON READ. Every field is checked against what the interface can
 * render, and an unknown key or an invalid value is DROPPED back to its
 * default, so a stored value can never put the modeler in a state no branch
 * renders. Workspace state (hover, rollback position, layout of the moment)
 * never comes here, and nothing here ever enters a document's manifest.
 *
 * THE MODULE SETTINGS STAY. `snapSettings`, `drawingSettings`,
 * `featureOptions` and the datum-plane mode keep their exports (panels and
 * tests read and write them); `applyToModules` fills them from the store and
 * `captureFromModules` reads them back, so a panel that writes a module
 * setting has written a preference.
 */
import type { Tool } from './viewport';
import { DEFAULT_SNAP_SETTINGS, snapSettings, type SnapSettings } from './viewport/drag-math';
import { drawingSettings, polygonSidesOk } from './viewport/drawing';
import { DATUM_PLANE_MODES, datumPlaneMode, setDatumPlaneMode, type DatumPlaneMode } from './viewport/reference-layer';
import { DISPLAY_UNITS, readoutSettings, type DisplayUnit } from './viewport/readout';
import { DEFAULT_FEATURE_OPTIONS, featureOptions, type FeatureOptions } from './features/options';
import { HOLE_STANDARDS, type HoleFit } from './features/holes';
import { COMMAND_IDS, DEFAULT_QUICK_TOOLS, isToolId, keyRefusal, normalizeKey } from './command-registry';

export type { DatumPlaneMode, DisplayUnit };
export const VIEW_MODES = ['shaded-edges', 'shaded', 'hidden-lines', 'wireframe'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
const HOLE_FITS: readonly HoleFit[] = ['tapped', 'close', 'normal', 'custom'];
const HINT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const RECENT_COMMANDS_MAX = 20;
export const RETIRED_HINTS_MAX = 200;

export interface SolidPreferences {
	view: { planes: DatumPlaneMode; triad: boolean; mode: ViewMode };
	toolbar: { quick: Tool[] };
	/** A command id to the key the student chose, or null for turned off. A command that is absent keeps its default keys. */
	shortcuts: Record<string, string | null>;
	snaps: SnapSettings;
	drawing: { polygonSides: number };
	features: { fillet: FeatureOptions['fillet']; chamfer: FeatureOptions['chamfer']; hole: FeatureOptions['hole'] };
	hints: { tooltipDelayMs: number; retired: string[]; tutorial: { step: string | null; finished: boolean } };
	commands: { recent: string[] };
	units: { display: DisplayUnit };
}
export type PreferenceGroup = keyof SolidPreferences;
export const PREFERENCE_GROUPS: readonly PreferenceGroup[] = ['view', 'toolbar', 'shortcuts', 'snaps', 'drawing', 'features', 'hints', 'commands', 'units'];

export function defaultPreferences(): SolidPreferences {
	const f = DEFAULT_FEATURE_OPTIONS();
	return {
		view: { planes: 'auto', triad: true, mode: 'shaded-edges' },
		toolbar: { quick: [...DEFAULT_QUICK_TOOLS] },
		shortcuts: {},
		snaps: DEFAULT_SNAP_SETTINGS(),
		drawing: { polygonSides: 6 },
		features: { fillet: f.fillet, chamfer: f.chamfer, hole: f.hole },
		hints: { tooltipDelayMs: 400, retired: [], tutorial: { step: null, finished: false } },
		commands: { recent: [] },
		units: { display: 'in' }
	};
}

/* -------------------------------------------------------------------------
 * VALIDATION: every field on its own, an invalid one back to its default
 * ---------------------------------------------------------------------- */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nullableNumber = (v: unknown, d: number | null) => (v === null ? null : finite(v) ? v : d);
const stringList = (v: unknown, keep: (s: string) => boolean, max: number): string[] | null => {
	if (!Array.isArray(v)) return null;
	const out: string[] = [];
	for (const s of v) if (typeof s === 'string' && keep(s) && !out.includes(s) && out.length < max) out.push(s);
	return out;
};

/**
 * A stored blob to preferences the modeler can render. Anything unknown is
 * ignored and anything invalid takes its default, field by field, so one bad
 * value costs that value and nothing beside it.
 */
export function readPreferences(raw: unknown): SolidPreferences {
	const d = defaultPreferences();
	const r = isObject(raw) ? raw : {};
	const view = isObject(r.view) ? r.view : {}, toolbar = isObject(r.toolbar) ? r.toolbar : {}, snaps = isObject(r.snaps) ? r.snaps : {};
	const drawing = isObject(r.drawing) ? r.drawing : {}, features = isObject(r.features) ? r.features : {}, hints = isObject(r.hints) ? r.hints : {};
	const commands = isObject(r.commands) ? r.commands : {}, units = isObject(r.units) ? r.units : {};
	const fillet = isObject(features.fillet) ? features.fillet : {}, chamfer = isObject(features.chamfer) ? features.chamfer : {}, hole = isObject(features.hole) ? features.hole : {};
	const tutorial = isObject(hints.tutorial) ? hints.tutorial : {};
	const sides = drawing.polygonSides;
	const depth = hole.depth;
	return {
		view: { planes: oneOf(view.planes, DATUM_PLANE_MODES, d.view.planes), triad: bool(view.triad, d.view.triad), mode: oneOf(view.mode, VIEW_MODES, d.view.mode) },
		toolbar: { quick: (stringList(toolbar.quick, isToolId, 64) as Tool[] | null) ?? d.toolbar.quick },
		shortcuts: readShortcuts(r.shortcuts),
		snaps: { references: bool(snaps.references, d.snaps.references), bodies: bool(snaps.bodies, d.snaps.bodies), angles: bool(snaps.angles, d.snaps.angles) },
		drawing: { polygonSides: typeof sides === 'number' && polygonSidesOk(sides) ? sides : d.drawing.polygonSides },
		features: {
			fillet: { propagate: bool(fillet.propagate, d.features.fillet.propagate), variableEnd: nullableNumber(fillet.variableEnd, d.features.fillet.variableEnd), law: oneOf(fillet.law, ['linear', 'scurve'] as const, d.features.fillet.law) },
			chamfer: { propagate: bool(chamfer.propagate, d.features.chamfer.propagate), distance2: nullableNumber(chamfer.distance2, d.features.chamfer.distance2), angle: nullableNumber(chamfer.angle, d.features.chamfer.angle) },
			hole: { standard: oneOf(hole.standard, HOLE_STANDARDS.map((s) => s.id), d.features.hole.standard), fit: oneOf(hole.fit, HOLE_FITS, d.features.hole.fit), diameter: nullableNumber(hole.diameter, d.features.hole.diameter), depth: depth === 'through' || finite(depth) ? depth : d.features.hole.depth }
		},
		hints: {
			tooltipDelayMs: finite(hints.tooltipDelayMs) && hints.tooltipDelayMs >= 0 ? hints.tooltipDelayMs : d.hints.tooltipDelayMs,
			retired: stringList(hints.retired, (s) => HINT_ID.test(s), RETIRED_HINTS_MAX) ?? d.hints.retired,
			tutorial: { step: typeof tutorial.step === 'string' && HINT_ID.test(tutorial.step) ? tutorial.step : tutorial.step === null ? null : d.hints.tutorial.step, finished: bool(tutorial.finished, d.hints.tutorial.finished) }
		},
		commands: { recent: stringList(commands.recent, (s) => COMMAND_IDS.includes(s), RECENT_COMMANDS_MAX) ?? d.commands.recent },
		units: { display: oneOf(units.display, DISPLAY_UNITS, d.units.display) }
	};
}
/** Stored shortcut choices, kept only for a known command with a key a shortcut can use or null; two choices of one key keep the first by command id, so no key runs two commands. */
function readShortcuts(raw: unknown): Record<string, string | null> {
	if (!isObject(raw)) return {};
	const out: Record<string, string | null> = {}, taken = new Set<string>();
	for (const id of Object.keys(raw).sort()) {
		if (!COMMAND_IDS.includes(id)) continue;
		const v = raw[id];
		if (v === null) { out[id] = null; continue; }
		const key = normalizeKey(v);
		if (!key || keyRefusal(key) || taken.has(key)) continue;
		taken.add(key); out[id] = key;
	}
	return out;
}

/* -------------------------------------------------------------------------
 * WHAT IS STORED: the values that differ from the defaults, and the merge
 * ---------------------------------------------------------------------- */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The sparse form a store writes: per group, only the fields a student changed. A group with nothing changed is absent. */
export function compactPreferences(p: SolidPreferences): Record<string, unknown> {
	const d = defaultPreferences(), out: Record<string, unknown> = {};
	for (const group of PREFERENCE_GROUPS) {
		const value = p[group] as unknown as Record<string, unknown>, base = d[group] as unknown as Record<string, unknown>;
		if (group === 'shortcuts') { if (Object.keys(value).length) out.shortcuts = { ...value }; continue; }
		const changed: Record<string, unknown> = {};
		for (const key of Object.keys(value)) if (!same(value[key], base[key])) changed[key] = value[key];
		if (Object.keys(changed).length) out[group] = changed;
	}
	return out;
}
/**
 * THE WHOLE-BLOB SPREAD-MERGE. `blob` is the profile's whole `preferences`
 * column as it stands; the result replaces only `ideacad.solid`, and keeps
 * every other namespace and every other key under `ideacad` (the chooser's
 * `panes` among them) exactly as they were.
 */
export function mergeSolidPreferences(blob: unknown, solid: Record<string, unknown>): Record<string, unknown> {
	const base = isObject(blob) ? blob : {};
	const ideacad = isObject(base.ideacad) ? base.ideacad : {};
	return { ...base, ideacad: { ...ideacad, solid } };
}
/** The solid modeler's own part of a profile's `preferences`, for the first read. */
export function solidPreferencesFrom(blob: unknown): unknown {
	return isObject(blob) && isObject(blob.ideacad) ? blob.ideacad.solid : undefined;
}

/* -------------------------------------------------------------------------
 * THE STORES
 * ---------------------------------------------------------------------- */

export interface PreferenceStore {
	/** The validated preferences as they stand. A new object after every change. */
	readonly current: SolidPreferences;
	/** Replace one group. The value is validated like a stored one, so an invalid field takes its default. */
	set<G extends PreferenceGroup>(group: G, value: SolidPreferences[G]): void;
	/** Put one group back to its defaults. */
	reset(group: PreferenceGroup): void;
	/** Called with the new preferences after every change. Returns the unsubscribe. */
	subscribe(listener: (p: SolidPreferences) => void): () => void;
	/** Finish any pending write. */
	flush(): Promise<void>;
}
abstract class BaseStore implements PreferenceStore {
	private value: SolidPreferences;
	private listeners = new Set<(p: SolidPreferences) => void>();
	constructor(initial: unknown) { this.value = readPreferences(initial); }
	get current() { return this.value; }
	set<G extends PreferenceGroup>(group: G, value: SolidPreferences[G]) {
		const next = readPreferences({ ...compactPreferences(this.value), [group]: value });
		if (same(next, this.value)) return;
		this.value = next;
		this.persist(compactPreferences(next));
		for (const l of [...this.listeners]) l(next);
	}
	reset(group: PreferenceGroup) { this.set(group, defaultPreferences()[group]); }
	subscribe(listener: (p: SolidPreferences) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
	flush(): Promise<void> { return Promise.resolve(); }
	protected abstract persist(sparse: Record<string, unknown>): void;
}

/** In memory only, for tests: `stored()` is exactly what a backend would have been handed. */
export class MemoryPreferenceStore extends BaseStore {
	private last: Record<string, unknown>;
	constructor(initial?: unknown) { super(initial); this.last = compactPreferences(this.current); }
	stored() { return this.last; }
	protected persist(sparse: Record<string, unknown>) { this.last = sparse; }
}

/** The part of `Storage` this store touches, so a test can hand in one that throws. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const LOCAL_PREFERENCES_PREFIX = 'ideacad_solid_preferences:';
/**
 * Per viewer, in this browser's `localStorage`. EVERY ACCESS IS IN A TRY:
 * storage throws in a private window, with site data blocked, and when full,
 * and a preference is never worth an exception. A read that fails is the
 * defaults; a write that fails keeps the choice for this session.
 */
export class LocalPreferenceStore extends BaseStore {
	private readonly key: string;
	private readonly storage: () => PreferenceStorage | null;
	constructor(viewer: string, storage?: PreferenceStorage | null) {
		const get = () => { if (storage !== undefined) return storage; try { return globalThis.localStorage ?? null; } catch { return null; } };
		const key = `${LOCAL_PREFERENCES_PREFIX}${viewer}`;
		let initial: unknown;
		try { const text = get()?.getItem(key); initial = text ? JSON.parse(text) : undefined; } catch { initial = undefined; }
		super(initial);
		this.key = key; this.storage = get;
	}
	protected persist(sparse: Record<string, unknown>) {
		try { this.storage()?.setItem(this.key, JSON.stringify(sparse)); } catch { /* a full or blocked storage keeps the choice for this session */ }
	}
}

/** How the profile store reaches the row: read the whole `preferences` column, write it back whole. The route builds this from its Supabase client. */
export interface ProfilePreferenceIo {
	read(): Promise<unknown>;
	write(preferences: Record<string, unknown>): Promise<void>;
}
/**
 * In the student's own profile row, so it follows them to another computer.
 * Writes are DEBOUNCED and each one READS THE ROW FIRST, then spread-merges,
 * so a namespace another surface wrote a moment ago is kept. A read that fails
 * skips the write rather than writing over a row it could not see; the choice
 * stays for this session and the next change tries again. Nothing here throws
 * to the caller or interrupts the work: a preference is not the work.
 */
export class ProfilePreferenceStore extends BaseStore {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private pending: Record<string, unknown> | null = null;
	private writing: Promise<void> = Promise.resolve();
	/** True after a write that did not land, until one does. */
	failed = false;
	constructor(initial: unknown, private io: ProfilePreferenceIo, private debounceMs = 400) { super(initial); }
	protected persist(sparse: Record<string, unknown>) {
		this.pending = sparse;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => { this.timer = null; void this.write(); }, this.debounceMs);
	}
	private write(): Promise<void> {
		const sparse = this.pending;
		if (!sparse) return this.writing;
		this.pending = null;
		this.writing = this.writing.then(async () => {
			try {
				const row = await this.io.read();
				await this.io.write(mergeSolidPreferences(row, sparse));
				this.failed = false;
			} catch { this.failed = true; if (!this.pending) this.pending = sparse; }
		});
		return this.writing;
	}
	async flush() {
		if (this.timer) { clearTimeout(this.timer); this.timer = null; }
		await this.write();
	}
}

/* -------------------------------------------------------------------------
 * THE MODULE SETTINGS: filled from the store, read back into it
 * ---------------------------------------------------------------------- */

/** Fill the module-level settings panels and tests read from these preferences. The shell's per-face thicknesses are document entries and are left alone. */
export function applyToModules(p: SolidPreferences) {
	Object.assign(snapSettings, p.snaps);
	drawingSettings.polygonSides = p.drawing.polygonSides;
	featureOptions.fillet = { ...p.features.fillet };
	featureOptions.chamfer = { ...p.features.chamfer };
	featureOptions.hole = { ...p.features.hole };
	setDatumPlaneMode(p.view.planes);
	readoutSettings.unit = p.units.display;
}
/** Preferences with the module settings as they stand now, which is how a panel's own box becomes a stored choice. */
export function captureFromModules(p: SolidPreferences): SolidPreferences {
	return readPreferences({
		...p,
		view: { ...p.view, planes: datumPlaneMode() },
		snaps: { ...snapSettings },
		drawing: { polygonSides: drawingSettings.polygonSides },
		features: { fillet: { ...featureOptions.fillet }, chamfer: { ...featureOptions.chamfer }, hole: { ...featureOptions.hole } },
		units: { display: readoutSettings.unit }
	});
}
/** The groups whose values differ between two preference sets, so a caller writes only what moved. */
export function changedGroups(a: SolidPreferences, b: SolidPreferences): PreferenceGroup[] {
	return PREFERENCE_GROUPS.filter((g) => !same(a[g], b[g]));
}
