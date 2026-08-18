/**
 * BRINGING A SPLIT'S DETAIL PANE INTO VIEW, for the `page-flow` surfaces.
 *
 * WHY THIS EXISTS AT ALL. Under `scroll="page"` (see split.css) neither pane
 * bounds itself, so the surface has exactly one scroll region -- which is the
 * point -- and the two columns start at the same place in the document. Open
 * something from a row forty down a long list and it renders at the TOP of the
 * detail column, well above where the click happened: the click looks like it
 * did nothing at all.
 *
 * The geometric alternative was a sticky, internally-scrolling detail pane. It
 * costs a second scrollbar for every panel taller than the screen, and the
 * notebook's compose form is ~1200px against a 900px viewport, so that is its
 * ordinary state. Answering a report about two scrollbars with two scrollbars
 * is not an answer. One explicit scroll, on an explicit click, is.
 *
 * Pure decision, DOM wrapper: `shouldReveal` is the whole rule and is asserted
 * directly, because the failure it prevents -- yanking a page that was already
 * showing the right thing -- is invisible in a screenshot of the end state.
 */

/**
 * How far down the viewport the pane may already sit and still count as
 * "showing". Above this it is genuinely in view and moving the page would be a
 * jerk the student did not ask for; below it, they would be looking at the
 * list with the thing they just opened off the bottom of the screen.
 */
export const REVEAL_VIEWPORT_FRACTION = 0.5;

/**
 * Does the pane need bringing into view? Takes its viewport-relative top, so
 * it is the same question at both widths -- below the breakpoint the notebook
 * stacks with the detail ABOVE the list, where a negative top is exactly the
 * case that needs handling.
 */
export function shouldReveal(top: number, viewportHeight: number): boolean {
	if (!Number.isFinite(top) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
		return false;
	}
	return top < 0 || top > viewportHeight * REVEAL_VIEWPORT_FRACTION;
}

/**
 * Scroll the pane to the top of the viewport, but only when `shouldReveal`
 * says so. Returns whether it moved, which is what a harness can assert.
 *
 * `behavior: 'instant'` deliberately: app.css sets a global
 * `scroll-behavior: smooth`, which would otherwise animate this -- and an
 * animation is exactly the thing a throttled or backgrounded window does not
 * finish (the DrawingViewer lesson). A response to a click should have landed
 * by the time the next line of code runs.
 */
export function revealDetailPane(el: HTMLElement | null | undefined): boolean {
	if (!el || typeof window === 'undefined') return false;
	const { top } = el.getBoundingClientRect();
	if (!shouldReveal(top, window.innerHeight)) return false;
	el.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
	return true;
}
