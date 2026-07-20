/**
 * GREENLINE selected track: a reactive, localStorage-backed choice (the
 * creative.svelte.ts / weather.svelte.ts store pattern).
 *
 * Deliberately NOT part of the loadout: a track is where you race, not what
 * you race, so it must not ride the build slots (loading a saved build should
 * never silently move you to another circuit) and it needs no migration. The
 * selection is per browser, like weather and the audio pins.
 *
 * An unknown stored id (a track removed between sessions) resolves through
 * `trackEntry`, which falls back to the default rather than throwing.
 */
import { browser } from '$app/environment';
import { DEFAULT_TRACK_ID, trackEntry } from './tracks';

const KEY = 'greenline_track';

export const trackSelection = $state({
	id: browser ? trackEntry(localStorage.getItem(KEY)).id : DEFAULT_TRACK_ID
});

export function setSelectedTrack(id: string): void {
	const resolved = trackEntry(id).id;
	trackSelection.id = resolved;
	if (browser) localStorage.setItem(KEY, resolved);
}
