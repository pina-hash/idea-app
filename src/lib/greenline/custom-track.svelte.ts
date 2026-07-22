/**
 * GREENLINE builder test-drive track: the authored track parked for immediate
 * driving, in its own localStorage entry (the track-selection.svelte.ts /
 * creative.svelte.ts / weather.svelte.ts store pattern).
 *
 * This extends the Phase 8e split rather than inventing a second scheme. That
 * split is: "which track" is independent of "which build", so the selection
 * never rides the loadout slots. The same reasoning applies one level down —
 * the authored track DATA is independent of which track is currently selected,
 * so it gets its own key (`greenline_custom_track`) instead of being stuffed
 * into the selection. Selecting it is still just `setSelectedTrack(CUSTOM_TRACK_ID)`.
 *
 * Per browser, like the selection: a builder track is a scratch artifact for
 * test driving, not something to sync to an account.
 */
import { browser } from '$app/environment';
import { parseTrack, type TrackData } from './track-schema';
import { CUSTOM_TRACK_KEY, customTrackData, registerCustomTrack } from './tracks';

/**
 * Reactive mirror, so the garage picker shows the entry the moment it exists.
 * Seeded through the catalog's own accessor, so the store and `loadTrack` can
 * never disagree about what is parked.
 */
export const customTrack = $state<{ data: TrackData | null }>({ data: customTrackData() });

/**
 * Park a compiled track for test driving. Takes the live `TrackData` the
 * builder already verified through `parseTrack`/`buildRuntime` — deliberately
 * NOT the pretty-printed export string, which rounds every coordinate to 2 dp
 * for committed files. Re-validates before storing so a broken track can never
 * land in the slot. Returns an error message, or null on success.
 */
export function setCustomTrack(data: TrackData): string | null {
	try {
		const validated = parseTrack(data);
		if (browser) localStorage.setItem(CUSTOM_TRACK_KEY, JSON.stringify(validated));
		registerCustomTrack(validated);
		customTrack.data = validated;
		return null;
	} catch (e) {
		return e instanceof Error ? e.message : 'Could not store the track.';
	}
}

export function clearCustomTrack(): void {
	if (browser) localStorage.removeItem(CUSTOM_TRACK_KEY);
	registerCustomTrack(null);
	customTrack.data = null;
}
