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

/** Per-device-class preference bucket (pref keys + an `_ts` marker). */
type PrefBucket = Record<string, string>;

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
	'vanguard_tutdone',
	'vanguard_lastInitials',
	'vanguard_ach',
	'vanguard_ach_best',
	'vanguard_ach_title'
];

/**
 * Progression keys that USED TO BE CLASSIFIED AS PREFERENCES, so every save
 * written before this commit still carries them inside a per-device-class pref
 * bucket. `mergeIntoStored` folds any such copy back into progression before
 * the bucket is replaced, and the seed skips them when it applies a bucket, so
 * a stale per-device value can neither shadow nor silently drop the synced one.
 */
export const MIGRATED_PREF_KEYS = ['vanguard_ach', 'vanguard_ach_best', 'vanguard_ach_title'];

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

/**
 * Merge two `vanguard_build` JSON strings by picking the LATEST build as a
 * coherent whole (NOT a max-union, which ratcheted over-budget builds up and
 * re-inflated them across devices). Pick the greater `_bts` recency marker; a
 * missing marker counts as oldest so any freshly saved build beats a legacy one;
 * ties break by greater `spent`, then keep `a`. The winner's own fields are
 * returned together so an over-budget map can never be assembled from two saves.
 * The mirror in `src/routes/vanguard/+server.ts` must stay byte-identical.
 */
function mergeBuild(aStr?: string, bStr?: string): string | undefined {
	const a = parseObj(aStr);
	const b = parseObj(bStr);
	if (!a) return bStr ?? undefined;
	if (!b) return aStr ?? undefined;

	const aTs = num(a._bts);
	const bTs = num(b._bts);
	let pick: Record<string, unknown>;
	if (aTs !== bTs) pick = aTs > bTs ? a : b;
	else if (num(a.spent) !== num(b.spent)) pick = num(a.spent) > num(b.spent) ? a : b;
	else pick = a;

	const out: Record<string, unknown> = {
		up: pick.up,
		unlocked: pick.unlocked,
		heavyUnlocked: pick.heavyUnlocked,
		bombs: pick.bombs,
		shieldHits: pick.shieldHits,
		spent: pick.spent,
		drone: Boolean(pick.drone),
		heavy: pick.heavy,
		wtype: pick.wtype,
		_bts: pick._bts
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

/**
 * Which of two unlock stamps to keep for an achievement earned on BOTH devices.
 *
 * The earlier stamp wins: it is when the player actually first earned the badge,
 * and the panel prints it as the earn date. A value that is not a positive
 * number is not a stamp at all (a hand-edited save, a legacy `true`), so it
 * loses to any side that has a real one and is only kept when neither does.
 * Which stamp survives never changes WHETHER the id is unlocked -- that is the
 * union, and the union is the part that cannot lose a real unlock.
 */
function earlierStamp(av: unknown, bv: unknown): unknown {
	const an = num(av);
	const bn = num(bv);
	if (an > 0 && bn > 0) return an <= bn ? av : bv;
	if (an > 0) return av;
	if (bn > 0) return bv;
	return av;
}

/**
 * Merge two `vanguard_ach` JSON strings as a UNION OF UNLOCKED IDS, never an
 * overwrite. The game writes `{ [achId]: Date.now() }` and only ever ADDS keys
 * (`achEvalRun` skips an id it already holds), so an id present on either side
 * is an achievement somebody really earned and must survive the merge; the two
 * sides are otherwise independent, because two devices playing offline each
 * unlock their own set.
 * The mirror in `src/routes/vanguard/+server.ts` must stay behaviourally identical.
 */
function mergeAch(aStr?: string, bStr?: string): string | undefined {
	if (aStr == null && bStr == null) return undefined;
	const a = parseObj(aStr) ?? {};
	const b = parseObj(bStr) ?? {};
	const out: Record<string, unknown> = {};
	for (const k of Object.keys(a)) out[k] = a[k];
	for (const k of Object.keys(b)) {
		out[k] = Object.prototype.hasOwnProperty.call(out, k) ? earlierStamp(out[k], b[k]) : b[k];
	}
	return JSON.stringify(out);
}

/**
 * Merge two `vanguard_ach_best` JSON strings by PER-FIELD MAXIMUM.
 *
 * A ONE-LEVEL NUMERIC WALK, because that is the shape the game writes. `achBest`
 * is declared flat -- `{bestScore, bestSector, bestParries, bestPerfect,
 * bestMeltUses, bestBosses, totalGames, qualGames}` -- and every field is
 * assigned through `Math.max(...)` of two numbers in `achEvalRun`. There is no
 * nesting to recurse into, and a recursive walk would only invent behaviour for
 * a shape that never occurs. The union of both key sets is taken so a field
 * added to the game later still merges (as a max) without this list being
 * touched; a non-numeric value reads as 0 through `num`, exactly as elsewhere.
 * These are the progress bars on locked achievements, so a low side must never
 * pull a high one down.
 * The mirror in `src/routes/vanguard/+server.ts` must stay behaviourally identical.
 */
function mergeAchBest(aStr?: string, bStr?: string): string | undefined {
	if (aStr == null && bStr == null) return undefined;
	const a = parseObj(aStr) ?? {};
	const b = parseObj(bStr) ?? {};
	const out: Record<string, number> = {};
	for (const k of Object.keys(a).concat(Object.keys(b))) {
		if (Object.prototype.hasOwnProperty.call(out, k)) continue;
		out[k] = Math.max(num(a[k]), num(b[k]));
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

	// Last-used initials: cross-device, last writer to cloud wins (b = incoming).
	if (b.vanguard_lastInitials != null || a.vanguard_lastInitials != null) {
		out.vanguard_lastInitials = b.vanguard_lastInitials ?? a.vanguard_lastInitials;
	}

	const ach = mergeAch(a.vanguard_ach, b.vanguard_ach);
	if (ach != null) out.vanguard_ach = ach;

	const achBest = mergeAchBest(a.vanguard_ach_best, b.vanguard_ach_best);
	if (achBest != null) out.vanguard_ach_best = achBest;

	// The WORN title is a choice, not an earning: there is nothing to union and
	// no maximum to take, so it follows the `vanguard_lastInitials` rule above --
	// cross-device, last writer to cloud wins (b = incoming) -- rather than a
	// third rule invented for one key. The game already refuses to display a
	// title whose achievement is not unlocked on this device (`achGetTitle`), so
	// the union above is what makes an incoming title mean anything.
	if (b.vanguard_ach_title != null || a.vanguard_ach_title != null) {
		out.vanguard_ach_title = b.vanguard_ach_title ?? a.vanguard_ach_title;
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
	// The three achievement keys were preferences until they became progression,
	// so every save written before that carries a copy in a pref bucket. Fold
	// those in FIRST and as the OLDER side (a), so the badges a second device
	// earned before the reclassification are unioned in rather than dropped when
	// its bucket is replaced below -- and so a stale bucket can never win the
	// last-writer rule against the progression already stored.
	for (const bucket of [stored.prefs.mobile, stored.prefs.desktop]) {
		if (!bucket) continue;
		const carried: Record<string, string> = {};
		for (const k of MIGRATED_PREF_KEYS) {
			if (typeof bucket[k] === 'string') {
				carried[k] = bucket[k];
				delete bucket[k];
			}
		}
		if (Object.keys(carried).length) {
			stored.progression = mergeProgression(carried, stored.progression);
		}
	}
	stored.progression = mergeProgression(stored.progression, progression);
	stored.prefs[deviceClass] = { ...prefs, _ts: nowIso };
	// lastInitials is progression now; evict any stale copy older builds left in
	// a pref bucket so the per-device pref can never shadow the synced value.
	if (stored.prefs.mobile) delete stored.prefs.mobile.vanguard_lastInitials;
	if (stored.prefs.desktop) delete stored.prefs.desktop.vanguard_lastInitials;
	return stored;
}
