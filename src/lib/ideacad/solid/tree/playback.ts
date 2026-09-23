/**
 * THE HISTORY SLIDER'S CLOCK, PURE. A time-lapse of a model being built is a
 * list of steps (step k is the model with its first k features built) played
 * at a rate. Every rule about that lives here, with no timer and no DOM, so the
 * component only schedules and draws:
 *
 *   - ONE STEP PER TICK, NEVER A SKIP. A late tick (a throttled tab, a slow
 *     rebuild) advances one step and waits a whole interval again: a
 *     time-lapse that jumped three features to catch up would show nothing of
 *     the three.
 *   - PLAY AT THE END STARTS OVER. Pressing Play on a finished model plays it
 *     from nothing, which is what a time-lapse is for.
 *   - IT STOPS BY ITSELF AT THE END, and Stop goes to the end: the whole model,
 *     which is what the student was looking at before they pressed Play.
 *     Pause holds where it is. (WCAG 2.2.2: anything that moves for more than
 *     five seconds can be paused and stopped.)
 *   - A SCRUB OR A STEP PAUSES. A hand on the slider means "show me this one".
 *   - REDUCED MOTION CHANGES HOW A STEP ARRIVES, NEVER WHEN. The steps still
 *     come at the chosen rate, because the student asked for them; what goes is
 *     the easing (`motion`), so a step is a cut, not a glide.
 */

/** The default rate: one step every 600 ms at 1x. */
export const STEP_MS = 600;
export const RATES = [0.5, 1, 2] as const;
export type PlaybackRate = (typeof RATES)[number];
export const RATE_WORDS: Readonly<Record<PlaybackRate, string>> = { 0.5: '0.5×', 1: '1×', 2: '2×' };
/** Milliseconds between steps at a rate. */
export const stepInterval = (rate: PlaybackRate) => STEP_MS / rate;
export const isRate = (value: unknown): value is PlaybackRate => RATES.includes(value as PlaybackRate);

export interface Playback {
	/** How many features there are; the steps run 0 to `steps`. */
	steps: number;
	step: number;
	playing: boolean;
	rate: PlaybackRate;
	/** When the next step is due, on the caller's clock; null when not playing. */
	due: number | null;
}
const within = (step: number, steps: number) => Math.max(0, Math.min(steps, Math.round(step)));
export function createPlayback(steps: number, step = steps, rate: PlaybackRate = 1): Playback {
	const n = Math.max(0, Math.floor(steps));
	return { steps: n, step: within(step, n), playing: false, rate, due: null };
}
/** Start playing. At the end (or with nothing to play) it starts over from step 0. */
export function play(p: Playback, now: number): Playback {
	if (p.steps === 0) return { ...p, playing: false, due: null };
	return { ...p, step: p.step >= p.steps ? 0 : p.step, playing: true, due: now + stepInterval(p.rate) };
}
export function pause(p: Playback): Playback { return { ...p, playing: false, due: null }; }
/** Stop and show the whole model. */
export function stop(p: Playback): Playback { return { ...p, playing: false, due: null, step: p.steps }; }
/** Advance at most one step if one is due. Reaching the last step ends playback. */
export function tick(p: Playback, now: number): Playback {
	if (!p.playing || p.due === null || now < p.due) return p;
	const step = Math.min(p.step + 1, p.steps);
	return step >= p.steps ? { ...p, step, playing: false, due: null } : { ...p, step, due: now + stepInterval(p.rate) };
}
/** Change the rate; a step in flight is re-timed from now. */
export function setRate(p: Playback, rate: PlaybackRate, now: number): Playback {
	return { ...p, rate, due: p.playing ? now + stepInterval(rate) : null };
}
/** Go to a step by hand. It pauses. */
export function seek(p: Playback, step: number): Playback { return { ...p, step: within(step, p.steps), playing: false, due: null }; }
export const stepBy = (p: Playback, delta: number) => seek(p, p.step + delta);
/** Take the owner's step count and position, as they change: a feature added or removed, a rollback made elsewhere. A position the owner moved pauses playback; the count alone does not. */
export function sync(p: Playback, steps: number, step: number): Playback {
	const n = Math.max(0, Math.floor(steps)), at = within(step, n);
	if (n === p.steps && at === p.step) return p;
	const moved = at !== p.step;
	return { ...p, steps: n, step: at, playing: p.playing && !moved && at < n, due: p.playing && !moved && at < n ? p.due : null };
}
/** Milliseconds until the next step is due, or null when nothing is. */
export const waitFor = (p: Playback, now: number): number | null => (p.playing && p.due !== null ? Math.max(0, p.due - now) : null);
/** How a step arrives: eased, or a cut under reduced motion. The timing is the same either way. */
export function motion(reduced: boolean, rate: PlaybackRate): { animate: boolean; easeMs: number } {
	return reduced ? { animate: false, easeMs: 0 } : { animate: true, easeMs: Math.min(240, Math.round(stepInterval(rate) / 3)) };
}
