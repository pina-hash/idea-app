/**
 * VANGUARD cloud-save merge logic (server-canonical).
 *
 * The game keeps all of its persistent state in `vanguard_*` localStorage keys.
 * For cross-device cloud saves we classify those keys and merge intelligently
 * instead of last-write-wins on the whole blob:
 *
 *   - PROGRESSION  -> merged across ALL devices (max upgrades, union unlocks,
 *                     merge score lists, max counters).
 *   - PREFERENCES  -> stored per device class (mobile|desktop), last-write-wins
 *                     within a class.
 *   - DEVICE-LOCAL -> never synced (e.g. the telemetry device id).
 *
 * NOTE: a compact copy of this classification + `mergeProgression` is mirrored
 * inside the injected bootstrap in `src/routes/vanguard/+server.ts` (it must run
 * synchronously in the browser before the game reads localStorage, so it cannot
 * import this module). Keep the two in sync.
 */

export type DeviceClass = 'mobile' | 'desktop';

/** A flat map of `vanguard_*` localStorage key -> string value. */
export type Snapshot = Record<string, string>;

/** Per-device-class preference bucket (pref keys + an `_ts` marker). */
export type PrefBucket = Record<string, string>;

export interface StoredSave {
	v: 2;
	progression: Record<string, string>;
	prefs: { mobile?: PrefBucket; desktop?: PrefBucket };
}

/** Cumulative progression: merged across every device. */
export const PROGRESSION_KEYS = [
	'vanguard_build',
	'vanguard_scores',
	'vanguard_games',
	'vanguard_tutdone'
];

/** Telemetry / device identity: stays local, never synced. */
export const DEVICE_LOCAL_KEYS = ['vanguard_did'];

// Everything else that begins with `vanguard_` is treated as a per-device-class
// PREFERENCE (settings, keybinds, gfx, mute, mode, sfx levels, last initials...).

function parseObj(str: string | undefined): Record<string, unknown> | null {
	if (typeof str !== 'string') return null;
	try {
		const v = JSON.parse(str);
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function num(v: unknown): number {
	const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
	return Number.isFinite(n) ? n : 0;
}

/** Union two flat maps, taking the max numeric value for each key. */
function mergeMaxMap(a: unknown, b: unknown): Record<string, number> {
	const out: Record<string, number> = {};
	const ao = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
	const bo = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
	for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
		out[k] = Math.max(num(ao[k]), num(bo[k]));
	}
	return out;
}

/** Merge two `vanguard_build` JSON strings: keep the strongest of everything. */
function mergeBuild(aStr?: string, bStr?: string): string | undefined {
	const a = parseObj(aStr);
	const b = parseObj(bStr);
	if (!a) return bStr ?? undefined;
	if (!b) return aStr ?? undefined;

	const aSpent = num(a.spent);
	const bSpent = num(b.spent);
	const dom = bSpent > aSpent ? b : a;

	const out: Record<string, unknown> = {
		up: mergeMaxMap(a.up, b.up),
		unlocked: mergeMaxMap(a.unlocked, b.unlocked),
		heavyUnlocked: mergeMaxMap(a.heavyUnlocked, b.heavyUnlocked),
		bombs: Math.max(num(a.bombs), num(b.bombs)),
		shieldHits: Math.max(num(a.shieldHits), num(b.shieldHits)),
		spent: Math.max(aSpent, bSpent),
		drone: Boolean(a.drone) || Boolean(b.drone),
		heavy: dom.heavy ?? a.heavy ?? b.heavy,
		wtype: dom.wtype ?? a.wtype ?? b.wtype
	};
	return JSON.stringify(out);
}

interface ScoreEntry {
	name: string;
	score: number;
}

function parseScores(str: string | undefined): ScoreEntry[] {
	if (typeof str !== 'string') return [];
	try {
		const v = JSON.parse(str);
		if (!Array.isArray(v)) return [];
		return v
			.filter((e) => e && typeof e === 'object' && typeof e.score === 'number')
			.map((e) => ({ name: String(e.name ?? ''), score: Number(e.score) }));
	} catch {
		return [];
	}
}

/** Merge two leaderboards: concat, dedupe, sort desc, keep top 10. */
function mergeScores(aStr?: string, bStr?: string): string | undefined {
	if (aStr == null && bStr == null) return undefined;
	const all = [...parseScores(aStr), ...parseScores(bStr)].sort((x, y) => y.score - x.score);
	const seen = new Set<string>();
	const out: ScoreEntry[] = [];
	for (const e of all) {
		const key = e.name + '|' + e.score;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(e);
		if (out.length >= 10) break;
	}
	return JSON.stringify(out);
}

/** Merge the two progression maps per the rules above. */
export function mergeProgression(
	a: Record<string, string> = {},
	b: Record<string, string> = {}
): Record<string, string> {
	const out: Record<string, string> = {};

	const build = mergeBuild(a.vanguard_build, b.vanguard_build);
	if (build != null) out.vanguard_build = build;

	const scores = mergeScores(a.vanguard_scores, b.vanguard_scores);
	if (scores != null) out.vanguard_scores = scores;

	if (a.vanguard_games != null || b.vanguard_games != null) {
		out.vanguard_games = String(Math.max(num(a.vanguard_games), num(b.vanguard_games)));
	}

	if (a.vanguard_tutdone === '1' || b.vanguard_tutdone === '1') {
		out.vanguard_tutdone = '1';
	} else if (a.vanguard_tutdone != null || b.vanguard_tutdone != null) {
		out.vanguard_tutdone = a.vanguard_tutdone ?? b.vanguard_tutdone!;
	}

	return out;
}

/** Split a flat `vanguard_*` snapshot into progression + preference maps. */
export function splitSnapshot(snapshot: Record<string, string>): {
	progression: Record<string, string>;
	prefs: Record<string, string>;
} {
	const progression: Record<string, string> = {};
	const prefs: Record<string, string> = {};
	for (const [k, v] of Object.entries(snapshot || {})) {
		if (typeof v !== 'string') continue;
		if (DEVICE_LOCAL_KEYS.includes(k)) continue;
		if (PROGRESSION_KEYS.includes(k)) progression[k] = v;
		else if (k.indexOf('vanguard_') === 0) prefs[k] = v;
	}
	return { progression, prefs };
}

function pickStrings(obj: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (obj && typeof obj === 'object') {
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			if (typeof v === 'string') out[k] = v;
		}
	}
	return out;
}

/** Coerce stored `data` (v2, or legacy v1 flat) into a normalized v2 blob. */
export function normalizeStored(data: unknown): StoredSave {
	const stored: StoredSave = { v: 2, progression: {}, prefs: {} };
	if (!data || typeof data !== 'object') return stored;
	const d = data as Record<string, unknown>;

	if (d.v === 2 && d.progression && d.prefs) {
		stored.progression = pickStrings(d.progression);
		const p = d.prefs as Record<string, unknown>;
		const mobile = pickStrings(p.mobile);
		const desktop = pickStrings(p.desktop);
		if (Object.keys(mobile).length) stored.prefs.mobile = mobile;
		if (Object.keys(desktop).length) stored.prefs.desktop = desktop;
		return stored;
	}

	// Legacy v1: a flat { vanguard_*: string } snapshot. Treat prefs as desktop.
	const { progression, prefs } = splitSnapshot(d as Record<string, string>);
	stored.progression = progression;
	if (Object.keys(prefs).length) stored.prefs.desktop = prefs;
	return stored;
}

/**
 * Merge an incoming device snapshot into the stored blob: progression is merged
 * across all devices; the device's own class preference bucket is replaced with
 * the incoming prefs (last-write-wins within the class), stamped with `nowIso`.
 */
export function mergeIntoStored(
	storedData: unknown,
	snapshot: Record<string, string>,
	deviceClass: DeviceClass,
	nowIso: string
): StoredSave {
	const stored = normalizeStored(storedData);
	const { progression, prefs } = splitSnapshot(snapshot);
	stored.progression = mergeProgression(stored.progression, progression);
	stored.prefs[deviceClass] = { ...prefs, _ts: nowIso };
	return stored;
}

/** The localStorage keys a given device class should see (progression + its prefs). */
export function flattenForDevice(stored: StoredSave, deviceClass: DeviceClass): Record<string, string> {
	const out: Record<string, string> = { ...stored.progression };
	const bucket = stored.prefs[deviceClass];
	if (bucket) {
		for (const [k, v] of Object.entries(bucket)) {
			if (k !== '_ts' && typeof v === 'string') out[k] = v;
		}
	}
	return out;
}
