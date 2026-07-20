/**
 * GREENLINE creative mode: a reactive, localStorage-backed toggle (the
 * audio-settings store pattern). While ON, unlock checks are bypassed
 * entirely — building AND racing with anything — and races earn no Ignition
 * Credits and never rank (the server zeroes the award and stores the run as
 * mode 'creative' off the flag the client submits).
 *
 * ON BY DEFAULT (Phase 8f). During active playtesting the point is getting
 * every weapon, ability, and part in front of testers immediately; making them
 * grind an economy first would only measure the grind. This is a DEFAULT
 * change and nothing more — the wallet, the price list, the unlock ledger, the
 * purchase RPC, and all of the garage's lock UI are fully intact, and a player
 * who turns creative mode off in settings gets the complete Phase 7 economy
 * back (their build is re-gated to what they actually own on the way out).
 * Flip DEFAULT_CREATIVE back to false to make earning the norm again.
 *
 * Because the stored value is read as an explicit '1' / '0' rather than a
 * presence check, a tester who has already turned creative mode OFF keeps it
 * off across this change; only players with no stored preference pick up the
 * new default.
 *
 * The flag is client-reported, same as the rest of a race result (no server
 * sim exists to verify against): the point is closing the obvious loophole of
 * racing unlocked-everything and claiming the proceeds, not defeating a
 * determined cheater.
 */
import { browser } from '$app/environment';

const KEY = 'greenline_creative_mode';

/** The default for a player with no stored preference. See the note above. */
export const DEFAULT_CREATIVE = true;

function initial(): boolean {
	if (!browser) return DEFAULT_CREATIVE;
	const stored = localStorage.getItem(KEY);
	if (stored === '1') return true;
	if (stored === '0') return false;
	return DEFAULT_CREATIVE;
}

export const creativeSettings = $state({
	enabled: initial()
});

export function setCreativeMode(on: boolean): void {
	creativeSettings.enabled = on;
	if (browser) localStorage.setItem(KEY, on ? '1' : '0');
}
