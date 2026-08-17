/**
 * THE SECTION TAB STRIP'S SCROLLING RULES, as pure functions over a
 * measurement -- no DOM, no Svelte, so they can be tested exhaustively rather
 * than sampled in a browser.
 *
 * WHY THIS FILE EXISTS. The strip shipped once with a scrollbar hidden on the
 * grounds that an edge fade replaced it, no scroll buttons, no wheel handling
 * and no drag: the only thing that moved it was clicking a half-visible tab,
 * which also changed the section, and tabs past that were unreachable. Adding
 * the controls is ReferenceDoc's job; deciding HOW FAR each one moves is this
 * file's, because one of those decisions is the difference between "every tab
 * can be reached" and "some cannot", and that is a property worth proving over
 * every layout rather than the handful a browser pass can drive.
 *
 * COORDINATES ARE CONTENT-SPACE, not viewport rects: a tab's `start`/`end` are
 * measured from the beginning of the scrollable content, so these functions are
 * independent of where the strip happens to sit on screen and a test can state
 * a layout as plain numbers. ReferenceDoc converts its rects on the way in.
 */

export type StripMetrics = {
	/** Current horizontal scroll offset. */
	scrollLeft: number;
	/** The visible width of the strip. */
	clientWidth: number;
	/** The full width of the tabs inside it. */
	scrollWidth: number;
};

/** One tab, in content-space. */
export type TabSpan = { start: number; end: number };

/** Sub-pixel layout slack. A fractional scrollLeft is what a trackpad, a drag
 *  and the active-tab scroll all produce, so every comparison here needs it. */
const SLACK = 0.5;

/** The breathing room a nudge lands a tab with -- the same 8px the active-tab
 *  scroll already leaves, so a tab brought in by a button and one brought in by
 *  a selection sit the same distance from the edge. */
export const NUDGE_EDGE_PX = 8;

/** The floor for the one case the tab-aligned rule cannot serve: a tab WIDER
 *  than the whole strip whose leading edge is already at the leading edge,
 *  where the computed move is zero and a press would do nothing forever. */
export const NUDGE_MIN_PX = 96;

/** How much of the strip a fallback press gives up so the tab you were looking
 *  at stays on screen as a landmark. */
const NUDGE_LEAD_PX = 56;

/** The distance a press must travel before it is a drag rather than a tap. */
export const DRAG_SLOP_PX = 6;

export function maxScroll(m: StripMetrics): number {
	return Math.max(0, m.scrollWidth - m.clientWidth);
}

export function stripOverflows(m: StripMetrics): boolean {
	return m.scrollWidth - m.clientWidth > 2;
}

/** Is there anything past the leading edge? Drives the prev button. */
export function canScrollStart(m: StripMetrics): boolean {
	return stripOverflows(m) && m.scrollLeft > 1;
}

/** Is there anything past the trailing edge? Drives the next button. */
export function canScrollEnd(m: StripMetrics): boolean {
	return stripOverflows(m) && m.scrollLeft < maxScroll(m) - 1;
}

function clamp(value: number, m: StripMetrics): number {
	return Math.max(0, Math.min(maxScroll(m), value));
}

/**
 * ONE PRESS OF PREV/NEXT LANDS A TAB, it does not move a fixed number of
 * pixels, and that is the whole reason this is a function rather than a
 * constant.
 *
 * A blind step of about a strip-width was the first cut, and it left SEVEN of a
 * fourteen-tab strip's tabs unreachable at phone width -- measured by driving
 * it, not reasoned about. A fixed step lands on a fixed grid of scroll
 * positions, and a tab wider than the overshoot falls between two of them:
 * clipped on the right at one, clipped on the left at the next, so Next and
 * Prev swap it between the two edges forever and it is never whole.
 *
 * So a press is defined by the tabs. Next takes the first tab clipped by the
 * trailing edge and puts it AT the leading edge; Prev takes the last tab
 * clipped by the leading edge and puts it at the trailing edge. That is still
 * roughly a strip-width per press -- the first clipped tab starts at most one
 * tab-width inside the far edge -- and it can never overshoot the tab it is
 * bringing in, so every press makes at least one more tab whole.
 */
export function nudgeScrollTarget(m: StripMetrics, tabs: TabSpan[], dir: -1 | 1): number {
	const viewStart = m.scrollLeft;
	const viewEnd = m.scrollLeft + m.clientWidth;
	/**
	 * THE LANDING GAP GIVES WAY TO THE TAB. A tab only a little narrower than the
	 * strip does not fit once 8px of breathing room is taken off the front:
	 * aligned that way its trailing edge is still clipped, so the press "lands"
	 * a tab that is not whole and the next press moves past it -- which the
	 * reachability sweep caught as a 194px tab in a 200px strip oscillating
	 * forever. The room shrinks to whatever is spare, down to none.
	 */
	const room = (t: TabSpan) =>
		Math.min(NUDGE_EDGE_PX, Math.max(0, m.clientWidth - (t.end - t.start)));
	let next: number;
	if (dir === 1) {
		const target = tabs.find((t) => t.end > viewEnd + SLACK);
		// Nothing clipped at all: whatever is left is sub-pixel, so go to the end
		// rather than leaving a hair of scroll behind.
		next = target ? target.start - room(target) : maxScroll(m);
		// A PRESS NEVER GOES BACKWARDS. A tab WIDER than the strip is clipped by
		// the trailing edge while its own start is already behind the leading one,
		// so aligning its start would send Next the wrong way. Found by the
		// reachability sweep, which generates layouts a hand-written case would
		// not: with a wide tab in the middle of a strip this both refused to
		// advance and made every tab past it unreachable.
		next = Math.max(next, m.scrollLeft);
	} else {
		const clipped = tabs.filter((t) => t.start < viewStart - SLACK);
		const target = clipped[clipped.length - 1];
		next = target ? target.end + room(target) - m.clientWidth : 0;
		next = Math.min(next, m.scrollLeft);
	}
	next = clamp(next, m);
	// NO PROGRESS: the tab-aligned rule has nothing to offer here -- the tab it
	// would align is one it cannot fit -- so fall back to a plain page. Tested
	// against the current position AFTER clamping, because the interesting case
	// is a target that resolves to exactly where we already are.
	if (Math.abs(next - m.scrollLeft) < 1) {
		next = clamp(
			m.scrollLeft + dir * Math.max(NUDGE_MIN_PX, m.clientWidth - NUDGE_LEAD_PX),
			m
		);
	}
	return next;
}

export type WheelOutcome = {
	/**
	 * Whether the strip takes this wheel. FALSE means the event is left alone so
	 * the PAGE scrolls -- which is what must happen once the strip has nothing
	 * left to give in the wheel's direction, or a reader wheeling down the page
	 * over the strip would be stuck on it.
	 */
	consume: boolean;
	/** Where the strip ends up when it does take it. */
	scrollLeft: number;
};

/**
 * A trackpad's sideways gesture arrives as deltaX and is used as-is; a plain
 * wheel only ever produces deltaY, and over a horizontal strip that is what the
 * reader means by it. Whichever axis is larger wins, so a diagonal trackpad
 * gesture does not fight itself.
 */
export function wheelStripScroll(m: StripMetrics, deltaX: number, deltaY: number): WheelOutcome {
	const held = { consume: false, scrollLeft: m.scrollLeft };
	if (!stripOverflows(m)) return held;
	const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
	if (!delta) return held;
	const atEdge = delta < 0 ? m.scrollLeft <= SLACK : m.scrollLeft >= maxScroll(m) - SLACK;
	if (atEdge) return held;
	return { consume: true, scrollLeft: clamp(m.scrollLeft + delta, m) };
}

/**
 * TOUCH IS LEFT TO THE BROWSER, deliberately: native touch scrolling is what
 * gives the strip its momentum, and taking the pointer over would replace a
 * flick that coasts with a drag that stops dead on release. Anything but the
 * primary button is somebody opening a context menu or using a side button.
 */
export function dragCanStart(pointerType: string, button: number, overflows: boolean): boolean {
	return overflows && pointerType !== 'touch' && button === 0;
}

/** Past the slop the press is a drag; under it, it is still a tap and the tab's
 *  own click must run. */
export function dragPastSlop(dx: number): boolean {
	return Math.abs(dx) >= DRAG_SLOP_PX;
}

/** The strip follows the pointer 1:1: content moves with the hand. */
export function dragScrollLeft(m: StripMetrics, startScrollLeft: number, dx: number): number {
	return clamp(startScrollLeft - dx, m);
}
