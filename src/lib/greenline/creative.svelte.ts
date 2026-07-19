/**
 * GREENLINE creative mode: a reactive, localStorage-backed toggle (the
 * audio-settings store pattern). While ON, unlock checks are bypassed
 * entirely — building AND racing with anything — and races earn no Ignition
 * Credits and never rank (the server zeroes the award and stores the run as
 * mode 'creative' off the flag the client submits). Off by default.
 *
 * The flag is client-reported, same as the rest of a race result (no server
 * sim exists to verify against): the point is closing the obvious loophole of
 * racing unlocked-everything and claiming the proceeds, not defeating a
 * determined cheater.
 */
import { browser } from '$app/environment';

const KEY = 'greenline_creative_mode';

export const creativeSettings = $state({
	enabled: browser ? localStorage.getItem(KEY) === '1' : false
});

export function setCreativeMode(on: boolean): void {
	creativeSettings.enabled = on;
	if (browser) localStorage.setItem(KEY, on ? '1' : '0');
}
