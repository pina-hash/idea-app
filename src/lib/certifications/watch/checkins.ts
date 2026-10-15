/**
 * CONTINUE CHECK-INS: when the next one is due, and when an unanswered one has
 * timed out (ledger 0391, docs/CERTIFICATIONS.md "Video watch tracking" and
 * DECISIONS D11).
 *
 * A check-in pauses the video at a random point and asks the student to press
 * Continue. The interval is random in PLAYED seconds (3 to 8 minutes of actual
 * playback, never wall-clock time, so pausing for lunch does not use one up),
 * and an unanswered check-in counts as missed after the settings' timeout
 * (`cert_settings.checkin_timeout_seconds`, 60 by default) and stops crediting
 * until it is pressed. Pure: the random source and both clocks are arguments,
 * so `tests/cert-watch-checkins.test.ts` pins every boundary.
 */

/** The shortest gap between check-ins, in played seconds (3 minutes). */
export const CHECKIN_MIN_GAP_SECONDS = 180;
/** The longest gap between check-ins, in played seconds (8 minutes). */
export const CHECKIN_MAX_GAP_SECONDS = 480;

/**
 * The played-seconds mark at which the next check-in fires: the current mark
 * plus a random gap in `[180, 480)`. `rng` answers in `[0, 1)`; an answer
 * outside that is clamped so a bad source cannot schedule a check-in in the
 * past or past the next one.
 */
export function scheduleNextCheckin(nowPlayedSeconds: number, rng: () => number = Math.random): number {
	const base = Number.isFinite(nowPlayedSeconds) && nowPlayedSeconds > 0 ? nowPlayedSeconds : 0;
	let r = rng();
	if (!Number.isFinite(r)) r = 0;
	r = Math.min(0.999999, Math.max(0, r));
	const gap = CHECKIN_MIN_GAP_SECONDS + r * (CHECKIN_MAX_GAP_SECONDS - CHECKIN_MIN_GAP_SECONDS);
	return base + gap;
}

/** Is a check-in due: has play reached the scheduled mark? */
export function checkinDue(playedSeconds: number, nextAt: number): boolean {
	return Number.isFinite(playedSeconds) && Number.isFinite(nextAt) && playedSeconds >= nextAt;
}

/**
 * Has an unanswered check-in sat past the timeout? `askedAt` and `now` are on
 * one millisecond clock (`Date.now()`); `timeoutSeconds` is the setting.
 * Exactly at the timeout counts as timed out, so a 60 s setting stops the
 * clock at 60.000 s and not a tick later.
 */
export function checkinTimedOut(askedAt: number, now: number, timeoutSeconds: number): boolean {
	if (!Number.isFinite(askedAt) || !Number.isFinite(now)) return false;
	const t = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : 60;
	return now - askedAt >= t * 1000;
}

/** The words on the band. One spelling each. */
export const CHECKIN_PROMPT = 'Still watching? Press Continue to keep counting this video.';
export const CHECKIN_KEY_WORD = 'Continue';
export const CHECKIN_MISSED_SENTENCE =
	'This check sat unanswered, so the video stopped counting. Press Continue to pick up where you left off.';
