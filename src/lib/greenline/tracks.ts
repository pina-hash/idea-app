/**
 * GREENLINE track catalog: the ONE list of tracks the game can race, and the
 * only place a track id is resolved to its data.
 *
 * Plain data + a lazy parse (the curriculum.ts / portal-apps.ts convention):
 * the JSON files are plain imports, `loadTrack` runs them through `parseTrack`
 * once and caches the result, so selecting a track repeatedly (garage picker,
 * race mount, leaderboard read) never re-validates. No three.js, no cannon-es,
 * no Svelte — safe anywhere, client or server.
 *
 * Adding a track is one import + one entry here; nothing else in the game
 * hardcodes a track. The display fields (`tagline`, `lengthM`, `kind`) are
 * presentation copy for the picker and are deliberately NOT read by the
 * runtime, which only ever sees the parsed TrackData.
 */
import { browser } from '$app/environment';
import { parseTrack, type TrackData } from './track-schema';
import provingGroundJson from './tracks/proving-ground-07.json';
import reliefProofJson from './tracks/relief-proof-01.json';
import terminalNineJson from './tracks/terminal-nine.json';

/**
 * What a track is FOR. `circuit` is a real racing venue; `test` is a
 * purpose-built proof segment kept selectable because driving it is the
 * fastest way to check a physics feature by hand. `custom` is a track authored
 * in the builder and parked in this browser for a test drive — never a
 * permanent one. `community` is a PUBLISHED player-authored track fetched from
 * the greenline_tracks table (Bundle 4a). The picker labels all of them rather
 * than hiding the difference: a player who picks the test segment (or a
 * half-finished authored loop) should know that is what they chose.
 */
export type TrackKind = 'circuit' | 'test' | 'custom' | 'community';

export interface TrackEntry {
	/** TrackData.id — the stable slug used by results, the board, and telemetry. */
	id: string;
	name: string;
	/** One-line picker copy: what makes this track its own thing. */
	tagline: string;
	/** Approximate lap distance in meters (display only). */
	lengthM: number;
	kind: TrackKind;
	/** Unparsed track JSON; go through `loadTrack` rather than reading this. */
	raw: unknown;
}

export const TRACKS: TrackEntry[] = [
	{
		id: 'proving-ground-07',
		name: 'Proving Ground 07',
		tagline: 'Decommissioned automotive proving ground. Flat, fast, forgiving.',
		lengthM: 794,
		kind: 'circuit',
		raw: provingGroundJson
	},
	{
		id: 'terminal-nine',
		name: 'Terminal Nine',
		tagline: 'Industrial circuit with a container-deck jump and a real shortcut.',
		lengthM: 2498,
		kind: 'circuit',
		raw: terminalNineJson
	},
	{
		id: 'relief-proof-01',
		name: 'Relief Proof 01',
		tagline: 'Short elevation and banking test loop. Built to check physics, not to race.',
		lengthM: 306,
		kind: 'test',
		raw: reliefProofJson
	}
];

/**
 * The track a fresh player starts on (and the fallback for any unknown id).
 * Terminal Nine is the flagship full-scale circuit (Phase 9a); Proving Ground
 * 07 stays a selectable option, it is just no longer the cold-start default.
 */
export const DEFAULT_TRACK_ID = 'terminal-nine';

/* ------------------------------------------------------------------ */
/* the builder's test-drive track                                      */
/* ------------------------------------------------------------------ */

/**
 * The catalog id a builder-authored track occupies. There is exactly ONE such
 * slot: the builder parks its current track here for a test drive, and the
 * next Test Drive overwrites it. It is deliberately not a permanent track.
 */
export const CUSTOM_TRACK_ID = 'custom-builder';

/**
 * Its own localStorage entry, separate from the loadout and from the track
 * SELECTION (the Phase 8e convention: "which track" is independent of "which
 * build", and the authored track data is in turn independent of which track is
 * selected). Per browser, like the selection itself.
 */
export const CUSTOM_TRACK_KEY = 'greenline_custom_track';

/** Lap distance of a parsed track, for the picker's readout. Exported for the
 * publish endpoint, which stamps it onto the row at publish time. */
export function lapLengthM(data: TrackData): number {
	const c = data.surface.centerline;
	let total = 0;
	for (let i = 1; i < c.length; i++) total += Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z);
	if (data.surface.closed && c.length > 1)
		total += Math.hypot(c[0].x - c[c.length - 1].x, c[0].z - c[c.length - 1].z);
	return total;
}

function makeCustomEntry(data: TrackData): TrackEntry {
	return {
		id: CUSTOM_TRACK_ID,
		name: data.name || 'Custom Circuit',
		tagline: 'Authored in the track builder and parked in this browser. Not a permanent track.',
		lengthM: lapLengthM(data),
		kind: 'custom',
		raw: data
	};
}

// `undefined` = the stored track has not been read yet. Reading lazily (rather
// than at module init) means this module has no evaluation-order dependency on
// the reactive store that writes it, so a stored track resolves correctly
// however the two modules happen to load.
let customEntry: TrackEntry | null | undefined = undefined;

function ensureCustom(): TrackEntry | null {
	if (customEntry !== undefined) return customEntry;
	customEntry = null;
	if (browser) {
		try {
			const raw = localStorage.getItem(CUSTOM_TRACK_KEY);
			// Validated on read through the game's own loader: a corrupt or
			// hand-edited entry must degrade to "no custom track", never break
			// the garage picker.
			if (raw) customEntry = makeCustomEntry(parseTrack(JSON.parse(raw)));
		} catch {
			customEntry = null;
		}
	}
	return customEntry;
}

/**
 * Point the custom slot at a track (or clear it with null). Called by the
 * custom-track store after it writes localStorage, so in-memory resolution
 * stays correct across a client-side navigation without a reload.
 */
export function registerCustomTrack(data: TrackData | null): void {
	customEntry = data ? makeCustomEntry(data) : null;
	parsed.delete(CUSTOM_TRACK_ID);
}

/** The parked builder track, or null. Performs the lazy read on first call. */
export function customTrackData(): TrackData | null {
	const e = ensureCustom();
	return e ? (e.raw as TrackData) : null;
}

/* ------------------------------------------------------------------ */
/* published community tracks (Bundle 4a)                              */
/* ------------------------------------------------------------------ */

/**
 * Catalog-id namespace for published community tracks: `community:<uuid>`,
 * where the uuid is the greenline_tracks row's primary key. The uuid is the
 * STABLE identity — results, attempts, and (once featured, Bundle 4b) ranked
 * leaderboard rows all key on this id, which survives the track's own data
 * being re-read or its display name changing.
 */
export const COMMUNITY_TRACK_PREFIX = 'community:';

export const communityTrackId = (uuid: string): string => COMMUNITY_TRACK_PREFIX + uuid;

export const isCommunityTrackId = (id: string | null | undefined): boolean =>
	typeof id === 'string' && id.startsWith(COMMUNITY_TRACK_PREFIX);

/** The row uuid inside a `community:<uuid>` catalog id (or null). */
export const communityTrackUuid = (id: string | null | undefined): string | null =>
	isCommunityTrackId(id) ? (id as string).slice(COMMUNITY_TRACK_PREFIX.length) : null;

/**
 * Registered community entries, keyed by catalog id. An entry is registered
 * from the browse list with `raw: null` (a placeholder: the full TrackData is
 * fetched lazily, only when the track is actually selected), then completed by
 * `attachCommunityTrackData`. `loadTrack` on a placeholder falls back to the
 * default track — which is why the race flow awaits the attach before
 * mounting a community race.
 */
const communityRegistry = new Map<string, TrackEntry>();

/** Replace the registered community list (called after each browse fetch).
 * Entries whose data was already attached keep it. */
export function registerCommunityTracks(
	list: { id: string; name: string; authorName: string; lengthM: number | null }[]
): void {
	const keep = new Map<string, TrackEntry>();
	for (const item of list) {
		const prev = communityRegistry.get(item.id);
		keep.set(item.id, {
			id: item.id,
			name: item.name,
			tagline: `Community track by ${item.authorName}.`,
			lengthM: item.lengthM ?? prev?.lengthM ?? 0,
			kind: 'community',
			raw: prev?.raw ?? null
		});
	}
	// Drop entries no longer listed (removed tracks), including their parse cache.
	for (const id of communityRegistry.keys()) {
		if (!keep.has(id)) parsed.delete(id);
	}
	communityRegistry.clear();
	for (const [id, e] of keep) communityRegistry.set(id, e);
}

/** Attach a fetched + parseTrack-validated TrackData to a registered entry. */
export function attachCommunityTrackData(id: string, data: TrackData): void {
	const entry = communityRegistry.get(id);
	if (entry) {
		entry.raw = data;
		entry.lengthM = lapLengthM(data);
	} else {
		communityRegistry.set(id, {
			id,
			name: data.name || 'Community track',
			tagline: 'Community track.',
			lengthM: lapLengthM(data),
			kind: 'community',
			raw: data
		});
	}
	parsed.delete(id);
}

/** Whether a community track's full data is ready to race. */
export function communityTrackReady(id: string): boolean {
	return communityRegistry.get(id)?.raw != null;
}

/**
 * Every selectable track: the permanent catalog, the builder's parked track
 * when one exists, then any registered community tracks. The extras are
 * appended after the officials so they read as the extras they are.
 */
export function allTracks(): TrackEntry[] {
	const custom = ensureCustom();
	return [...TRACKS, ...(custom ? [custom] : []), ...communityRegistry.values()];
}

export function trackEntry(id: string | null | undefined): TrackEntry {
	const list = allTracks();
	return (
		list.find((t) => t.id === id) ?? list.find((t) => t.id === DEFAULT_TRACK_ID) ?? list[0]
	);
}

const parsed = new Map<string, TrackData>();

/**
 * Resolve a track id to validated TrackData. Unknown ids fall back to the
 * default track rather than throwing: a stale stored selection (a track
 * removed between sessions, or a builder track cleared out of this browser)
 * must never strand a player on a dead screen. A registered community entry
 * whose data has not been attached yet resolves to the default track too —
 * the race flow awaits `attachCommunityTrackData` before mounting, so this
 * path only catches a stale selection racing ahead of the fetch.
 */
export function loadTrack(id: string | null | undefined): TrackData {
	const entry = trackEntry(id);
	if (entry.raw == null) return loadTrack(DEFAULT_TRACK_ID);
	const hit = parsed.get(entry.id);
	if (hit) return hit;
	const data = parseTrack(entry.raw);
	parsed.set(entry.id, data);
	return data;
}
