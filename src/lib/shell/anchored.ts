/**
 * A PANEL THAT ESCAPES ITS SCROLL CONTAINER.
 *
 * A tooltip, a popover or a menu anchored to something inside a scrolling
 * region is clipped by that region the moment it opens past its edge. The
 * grading console has TWO clipping ancestors stacked in the same chain -- the
 * response table's `.table-scroll` (`overflow-x: auto`, which forces
 * `overflow-y` to `auto` as well) and the work column's own `overflow-y: auto`
 * -- so a panel opening upward from a `<th>` sitting on the top edge of the
 * inner one was clipped by the inner one and would have been clipped by the
 * outer one had it survived.
 *
 * `position: fixed` is the escape: a fixed box is positioned against the
 * VIEWPORT and is not clipped by an ancestor's overflow. (It IS clipped by an
 * ancestor with a `transform`, `filter` or `contain`, which is why this is an
 * action rather than a rule -- the caller can see whether it has one; nothing
 * here can.) The cost of fixed positioning is that the panel no longer moves
 * with its anchor, so this recomputes on scroll and on resize, and hides
 * nothing: the caller decides when it is open.
 *
 * WHY AN ACTION AND NOT A COMPONENT. The panel element stays in the caller's
 * own markup, which is what keeps the caller's scoped styles -- and its PRINT
 * rules -- working on it. InfoTip's printed form is static, in-flow text; a
 * portalled node in `document.body` could not be either.
 *
 * The arithmetic is a PURE FUNCTION (`anchorPosition`) taking boxes and
 * returning a placement, so every edge case is testable with no DOM at all.
 * The action is the thin part: measure, call it, write two numbers.
 *
 * SHAPED FOR A SECOND CONSUMER. RichTextEditor's link popover
 * (src/lib/classroom/RichTextEditor.svelte) is a hand-rolled copy of this same
 * problem -- an absolutely positioned panel measured off its own offset parent
 * -- and is deliberately NOT converted in this pass. It needs an anchor that is
 * a RANGE rather than an element, which is why `anchorPosition` takes a plain
 * box rather than an element: a `Range`'s own `getBoundingClientRect()` is
 * already the right shape to hand it.
 */

/** A rectangle in VIEWPORT coordinates -- exactly what `getBoundingClientRect` returns. */
export interface AnchorBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export interface AnchorSize {
	width: number;
	height: number;
}

export interface AnchorOptions {
	/** Which side of the anchor to try FIRST. Flipped when it does not fit. */
	prefer?: 'above' | 'below';
	/** Which edge to line the panel up with FIRST. Flipped when it does not fit. */
	align?: 'start' | 'end';
	/** Clear space between the anchor and the panel. */
	gap?: number;
	/** How close to a viewport edge the panel may come. */
	margin?: number;
}

export interface AnchorPlacement {
	left: number;
	top: number;
	/** Where it actually went, after any flip. */
	side: 'above' | 'below';
	align: 'start' | 'end';
	/** True when the preferred side or alignment could not be used. */
	flipped: boolean;
}

const DEFAULT_GAP = 6;
const DEFAULT_MARGIN = 8;

function clamp(value: number, low: number, high: number): number {
	// `high` can legitimately be below `low` when the panel is taller or wider
	// than the viewport allows; the low edge wins, so the panel's START stays on
	// screen and it is the far edge that runs off.
	return Math.max(low, Math.min(value, Math.max(low, high)));
}

/**
 * WHERE THE PANEL GOES, in viewport coordinates.
 *
 * Flips in BOTH axes, independently: a panel near the top of the window opens
 * downward, one near the right edge lines up with the anchor's right edge
 * instead of its left, and one near a corner does both.
 */
export function anchorPosition(
	anchor: AnchorBox,
	panel: AnchorSize,
	viewport: AnchorSize,
	options: AnchorOptions = {}
): AnchorPlacement {
	const gap = options.gap ?? DEFAULT_GAP;
	const margin = options.margin ?? DEFAULT_MARGIN;
	const preferSide = options.prefer ?? 'above';
	const preferAlign = options.align ?? 'start';

	const roomAbove = anchor.top - margin;
	const roomBelow = viewport.height - anchor.bottom - margin;
	const needed = panel.height + gap;

	let side = preferSide;
	if (preferSide === 'above' && roomAbove < needed && roomBelow > roomAbove) side = 'below';
	else if (preferSide === 'below' && roomBelow < needed && roomAbove > roomBelow) side = 'above';

	const rawTop = side === 'above' ? anchor.top - gap - panel.height : anchor.bottom + gap;
	const top = clamp(rawTop, margin, viewport.height - margin - panel.height);

	let align = preferAlign;
	let rawLeft = align === 'start' ? anchor.left : anchor.right - panel.width;
	if (align === 'start' && rawLeft + panel.width > viewport.width - margin) {
		align = 'end';
		rawLeft = anchor.right - panel.width;
	} else if (align === 'end' && rawLeft < margin) {
		align = 'start';
		rawLeft = anchor.left;
	}
	const left = clamp(rawLeft, margin, viewport.width - margin - panel.width);

	return { left, top, side, align, flipped: side !== preferSide || align !== preferAlign };
}

export interface AnchoredParams extends AnchorOptions {
	/** The element the panel points at. Null while it has not been bound yet. */
	anchor?: HTMLElement | null;
	/** The caller decides visibility; this only decides WHERE. */
	open?: boolean;
}

/**
 * rAF OR TIMEOUT, never rAF alone: a backgrounded or throttled window never
 * ticks requestAnimationFrame, and a panel that never gets positioned is a
 * panel stuck in the top-left corner.
 */
function schedule(run: () => void): () => void {
	let done = false;
	const once = () => {
		if (done) return;
		done = true;
		run();
	};
	const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(once) : 0;
	const timer = setTimeout(once, 16);
	return () => {
		done = true;
		if (frame) cancelAnimationFrame(frame);
		clearTimeout(timer);
	};
}

/**
 * `use:anchored={{ anchor, open }}` on the PANEL element.
 *
 * While open it writes `position: fixed` and two coordinates; while closed it
 * removes every property it set, so the element's stylesheet -- including
 * `@media print` -- is back in sole charge of it.
 */
export function anchored(node: HTMLElement, params: AnchoredParams = {}) {
	let current: AnchoredParams = params;
	let cancel: (() => void) | null = null;
	let listening = false;

	function place() {
		const anchor = current.anchor;
		if (!anchor || !current.open) return;
		const box = anchor.getBoundingClientRect();
		const panel = node.getBoundingClientRect();
		const at = anchorPosition(
			box,
			{ width: panel.width, height: panel.height },
			{ width: window.innerWidth, height: window.innerHeight },
			current
		);
		node.style.position = 'fixed';
		node.style.left = `${Math.round(at.left)}px`;
		node.style.top = `${Math.round(at.top)}px`;
		node.dataset.anchorSide = at.side;
		node.dataset.anchorAlign = at.align;
	}

	function clear() {
		node.style.position = '';
		node.style.left = '';
		node.style.top = '';
		delete node.dataset.anchorSide;
		delete node.dataset.anchorAlign;
	}

	const onMove = () => place();

	function listen(on: boolean) {
		if (on === listening) return;
		listening = on;
		// CAPTURE, so a scroll inside any ancestor container reaches this and not
		// just a scroll of the document: scroll does not bubble.
		const fn = on ? window.addEventListener : window.removeEventListener;
		fn('scroll', onMove, true);
		fn('resize', onMove);
	}

	function apply(next: AnchoredParams) {
		current = next;
		cancel?.();
		cancel = null;
		if (next.open && next.anchor) {
			place();
			// A second pass once layout has settled: the panel may have been
			// measured before its own text wrapped to its final height.
			cancel = schedule(place);
			listen(true);
		} else {
			listen(false);
			clear();
		}
	}

	apply(params);

	return {
		update(next: AnchoredParams) {
			apply(next ?? {});
		},
		destroy() {
			cancel?.();
			listen(false);
		}
	};
}
