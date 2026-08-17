/**
 * THE ONE PLACE JS IS ALLOWED TO KNOW THE SHELL'S BREAKPOINT.
 *
 * The split's geometry is CSS and stays CSS -- which pane is on screen below
 * 1024px is a media query in split.css, so no state and no measured viewport
 * decides it, and resizing is not an event anything handles. This module is the
 * one deliberate exception, and it exists because ONE thing genuinely cannot be
 * a media query: which VARIANT the notebook's entry cards render.
 *
 * A card is `row` in the navigation pane (compact, selects into the detail) and
 * `full` below the breakpoint (expands in place, the behaviour a phone has
 * always had). That is a prop, not a display rule -- rendering both and hiding
 * one would double the feed's DOM, mount a text editor per entry twice over,
 * and duplicate every id and landmark in it. So the component asks.
 *
 * THE NUMBER IS NOT REPEATED. `SPLIT_MIN_PX` is the same 1024 split.css keys
 * on, and tests/notebook-shell.test.ts holds the two against each other, so the
 * pair cannot drift into a state where JS thinks it is wide and the CSS
 * disagrees.
 *
 * THE INITIAL VALUE IS A CONSTANT, ON PURPOSE. Reading matchMedia at module
 * load would make the first CLIENT render differ from the server's HTML, which
 * is a hydration mismatch -- so the watcher starts from `true` (the value the
 * server rendered) and corrects itself in an effect, after hydration. A desktop
 * therefore never changes at all; a phone re-renders its cards once, which
 * costs a chevron appearing, because the LAYOUT at both widths is the
 * stylesheet's answer rather than this one's.
 */

/** The shell's breakpoint, in pixels. Mirrors split.css. */
export const SPLIT_MIN_PX = 1024;

/** The same breakpoint as a media query string, for matchMedia. */
export const SPLIT_QUERY = `(min-width: ${SPLIT_MIN_PX}px)`;

/**
 * True while the viewport is wide enough for two panes. Starts at the value the
 * server renders (see above) and is corrected once `watchSplitWidth` runs.
 */
let wide = $state(true);

let watching = false;

/**
 * Subscribe once, for the life of the page. Call it from an `$effect` so it
 * runs after hydration; calling it again is a no-op, so several notebook
 * screens mounted at once share the one listener rather than counting
 * references to it.
 */
export function watchSplitWidth(): void {
	if (watching) return;
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
	watching = true;
	const mq = window.matchMedia(SPLIT_QUERY);
	wide = mq.matches;
	mq.addEventListener('change', (event) => {
		wide = event.matches;
	});
}

export function splitIsWide(): boolean {
	return wide;
}
