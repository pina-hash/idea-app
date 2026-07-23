/**
 * GREENLINE music settings: a small reactive, localStorage-backed store shared
 * between the settings overlay (writes) and GreenlineMusic (reads). Module-level
 * $state gives cross-component reactivity; localStorage makes the chosen level
 * and track pins survive a real reload (the old module-level `sessionMuted` only
 * survived SPA navigation within a session).
 *
 * There is no SFX bus yet (that infrastructure + content arrive in a later
 * phase), so this is music-only. The shape is deliberately grouped under a
 * `music` concern so an `sfx` sibling can be added later without a redesign.
 */
import { browser } from '$app/environment';

export type TrackCategory = 'menu' | 'workshop' | 'race';

/** Sentinel pin value: rotate/random the category's pool (today's behavior). */
export const SHUFFLE = 'shuffle';

/**
 * The track pools, one per screen category. GreenlineMusic reads these for both
 * shuffle rotation and the settings dropdowns, so the pool counts live in ONE
 * place. Filenames are relative to /greenline/audio/.
 */
export const MUSIC_TRACKS: Record<TrackCategory, string[]> = {
	menu: ['menu-1.mp3', 'menu-2.mp3'],
	workshop: ['workshop-1.mp3', 'workshop-2.mp3'],
	// race-2 was cut. The pool size is read from this array (never hardcoded), so
	// dropping an entry is the whole change; a stored pin naming a removed track
	// fails the includes() check on load and falls back to SHUFFLE.
	race: ['race-1.mp3', 'race-3.mp3', 'race-4.mp3', 'race-5.mp3']
};

/** Friendly label for a category's track dropdown option. */
export function trackLabel(cat: TrackCategory, file: string): string {
	const i = MUSIC_TRACKS[cat].indexOf(file);
	const noun = cat === 'race' ? 'Race' : cat === 'workshop' ? 'Workshop' : 'Menu';
	return `${noun} ${i + 1}`;
}

const VOL_KEY = 'greenline_music_volume';
const MUTE_KEY = 'greenline_music_muted';
const PIN_KEY = 'greenline_music_pins';
const SFX_VOL_KEY = 'greenline_sfx_volume';

function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

function loadVolume(): number {
	if (!browser) return 1;
	const v = parseFloat(localStorage.getItem(VOL_KEY) ?? '');
	return Number.isFinite(v) ? clamp01(v) : 1;
}

function loadMuted(): boolean {
	if (!browser) return false;
	return localStorage.getItem(MUTE_KEY) === '1';
}

function loadSfxVolume(): number {
	if (!browser) return 1;
	const v = parseFloat(localStorage.getItem(SFX_VOL_KEY) ?? '');
	return Number.isFinite(v) ? clamp01(v) : 1;
}

function loadPins(): Record<TrackCategory, string> {
	const def: Record<TrackCategory, string> = { menu: SHUFFLE, workshop: SHUFFLE, race: SHUFFLE };
	if (!browser) return def;
	try {
		const raw = JSON.parse(localStorage.getItem(PIN_KEY) ?? '{}') as Record<string, unknown>;
		for (const cat of Object.keys(def) as TrackCategory[]) {
			const v = raw[cat];
			// Only accept a value that is SHUFFLE or a real track in the pool.
			if (typeof v === 'string' && (v === SHUFFLE || MUSIC_TRACKS[cat].includes(v))) def[cat] = v;
		}
	} catch {
		/* keep defaults */
	}
	return def;
}

/**
 * The live settings. `volume` (0..1) is a gain the player controls; the music
 * director multiplies it against its own MASTER ceiling. `muted` is a quick
 * toggle that preserves `volume` for un-mute. `pins` pins one track per
 * category, or SHUFFLE for the rotating/random default.
 */
export const musicSettings = $state({
	volume: loadVolume(),
	muted: loadMuted(),
	pins: loadPins()
});

/** Effective 0..1 gain the director applies (mute forces silence). */
export function musicGain(): number {
	return musicSettings.muted ? 0 : musicSettings.volume;
}

export function setMusicVolume(v: number): void {
	musicSettings.volume = clamp01(v);
	if (browser) localStorage.setItem(VOL_KEY, String(musicSettings.volume));
	// Dragging the slider up off zero is an explicit intent to hear music, so it
	// clears a stale mute. Route through setMusicMuted so the change PERSISTS
	// (otherwise a reload would wrongly re-mute while the slider reads > 0).
	if (musicSettings.volume > 0 && musicSettings.muted) setMusicMuted(false);
}

export function setMusicMuted(m: boolean): void {
	musicSettings.muted = m;
	if (browser) localStorage.setItem(MUTE_KEY, m ? '1' : '0');
}

export function toggleMusicMuted(): void {
	setMusicMuted(!musicSettings.muted);
}

export function setTrackPin(cat: TrackCategory, value: string): void {
	musicSettings.pins[cat] = value;
	if (browser) localStorage.setItem(PIN_KEY, JSON.stringify(musicSettings.pins));
}

/**
 * SFX bus level, a sibling of the music volume (0..1 gain, persisted, reactive).
 * SFX and music are independently adjustable. GreenlineMusic pushes `sfxGain()`
 * into the audio engine reactively, and the settings overlay edits it. There is
 * no separate SFX mute for now (music keeps its quick mute); a `muted`/`pins`
 * sibling can slot in here later without a redesign.
 */
export const sfxSettings = $state({
	volume: loadSfxVolume()
});

/** Effective 0..1 SFX gain the engine applies. */
export function sfxGain(): number {
	return sfxSettings.volume;
}

export function setSfxVolume(v: number): void {
	sfxSettings.volume = clamp01(v);
	if (browser) localStorage.setItem(SFX_VOL_KEY, String(sfxSettings.volume));
}
