/**
 * ONE SPELLING OF "SOMETHING IS HAPPENING", and the arithmetic behind the
 * route-transition indicator's delay.
 *
 * This is `Pending.svelte`'s and `NavigationProgress.svelte`'s
 * `save-state.svelte.ts`: plain data and pure functions, so the wording and the
 * threshold are assertable without a browser, and so the two components own
 * only how they look.
 *
 * WHY A MODULE FOR A CHARACTER. Swept before this existed, `src/` carried the
 * same pending sentence in three different spellings -- `Loading…` (the single
 * character), `Loading...` (three periods) and `Loading&hellip;` (the numeric
 * entity) -- across roughly twenty paragraph-level pending states with no
 * shared component between any of them. Three spellings is not a cosmetic
 * problem: it is the tell that nothing owned the decision, which is also why
 * none of them was a live region and none of them said what was pending. A
 * constant alone would only make the right thing AVAILABLE; `pendingLabel` is
 * what makes it the only reachable one, by normalising whatever a caller typed.
 */

/** The one ellipsis. Never `...`, never `&hellip;`. */
export const PENDING_ELLIPSIS = '…';

/** What a pending state says when the caller names nothing in particular. */
export const PENDING_DEFAULT = 'Loading';

/**
 * Every trailing ellipsis spelling a caller might already have typed, longest
 * first so `...` is stripped before a single `.` could be.
 */
const TRAILING = ['&hellip;', '…', '...', '..', '.'];

/**
 * The sentence a pending surface shows: the caller's own words, then exactly
 * one ellipsis.
 *
 * IT STRIPS WHAT THE CALLER ALREADY TYPED rather than trusting them not to.
 * Every existing call site in this repo was a hand-written string WITH its own
 * ellipsis on the end, so the first thing a migration does is pass one in --
 * and a component that just appended would render `Loading……`. Normalising
 * here means the three old spellings all collapse onto the one, which is the
 * whole point of the module.
 *
 * Trailing whitespace is trimmed on both sides of the strip, so
 * `'Loading the roster ...'` and `'Loading the roster'` produce the identical
 * sentence.
 */
export function pendingLabel(what?: string | null): string {
	let text = (what ?? '').trim();
	for (;;) {
		const before = text;
		for (const suffix of TRAILING) {
			if (text.toLowerCase().endsWith(suffix)) {
				text = text.slice(0, -suffix.length).trimEnd();
				break;
			}
		}
		if (text === before) break;
	}
	if (text === '') text = PENDING_DEFAULT;
	return `${text}${PENDING_ELLIPSIS}`;
}

/**
 * HOW LONG A NAVIGATION MAY TAKE BEFORE THE INDICATOR APPEARS.
 *
 * 250ms, and the number is a decision rather than a round figure:
 *
 *  - BELOW it, nothing is drawn at all. A bar that flashes on every click is
 *    worse than no bar, because it turns an instantaneous navigation into a
 *    visible event and teaches a reader to ignore the one signal that matters.
 *    Measured on this repo's own dev server, a client-side navigation between
 *    two `/dev` routes with a warm module graph completes well inside this
 *    window, so the ordinary case draws nothing.
 *  - ABOVE it, the reader is already past the ~100ms band in which a UI still
 *    feels like a direct response to the press, so an indicator is no longer
 *    an interruption -- it is the answer to "did my click land". And it is far
 *    enough below the ~1s point at which somebody clicks a second time that
 *    the slow case, which is the case this exists for, is covered long before
 *    they do.
 *
 * The classroom item page is the surface that forced it: a manager opening an
 * assignment pays five sequential server round trips and, before this, the
 * screen did not change for the whole of it.
 *
 * IT IS A PROP WITH THIS AS ITS DEFAULT, not a hardcoded literal, because the
 * only way to verify both halves of the rule is to drive a navigation on each
 * side of the threshold.
 */
export const NAV_INDICATOR_DELAY_MS = 250;

/** What the navigation indicator's live region says. */
export const NAV_PENDING_LABEL = pendingLabel('Loading the next page');
