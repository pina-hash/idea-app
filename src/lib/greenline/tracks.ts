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
import { parseTrack, type TrackData } from './track-schema';
import provingGroundJson from './tracks/proving-ground-07.json';
import reliefProofJson from './tracks/relief-proof-01.json';
import terminalNineJson from './tracks/terminal-nine.json';

/**
 * What a track is FOR. `circuit` is a real racing venue; `test` is a
 * purpose-built proof segment kept selectable because driving it is the
 * fastest way to check a physics feature by hand. The picker labels the
 * difference rather than hiding it — a player who picks the test segment
 * should know that is what they chose.
 */
export type TrackKind = 'circuit' | 'test';

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

/** The track a fresh player starts on (and the fallback for any unknown id). */
export const DEFAULT_TRACK_ID = 'proving-ground-07';

export function trackEntry(id: string | null | undefined): TrackEntry {
	return TRACKS.find((t) => t.id === id) ?? TRACKS.find((t) => t.id === DEFAULT_TRACK_ID) ?? TRACKS[0];
}

const parsed = new Map<string, TrackData>();

/**
 * Resolve a track id to validated TrackData. Unknown ids fall back to the
 * default track rather than throwing: a stale stored selection (a track
 * removed between sessions) must never strand a player on a dead screen.
 */
export function loadTrack(id: string | null | undefined): TrackData {
	const entry = trackEntry(id);
	const hit = parsed.get(entry.id);
	if (hit) return hit;
	const data = parseTrack(entry.raw);
	parsed.set(entry.id, data);
	return data;
}
