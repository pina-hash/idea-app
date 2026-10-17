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
 * SHAPED FOR A SECOND CONSUMER, AND IT HAS ONE NOW. RichTextEditor's link and
 * picture popovers (src/lib/classroom/RichTextEditor.svelte) were the
 * hand-rolled copy of this same problem -- an absolutely positioned panel
 * measured off its own offset parent -- and this comment said they were
 * deliberately not converted. They are: the panel was being clipped off the
 * right of `.rt-editor`'s `overflow: hidden` at every width between about 481px
 * and 740px, with its Cancel sliced in half, and no media query could fix that
 * because how far it runs over depends on where the toolbar put the button.
 * They pass the trigger BUTTON as the anchor.
 *
 * `anchorPosition` still takes a plain box rather than an element, and that is
 * still for the case this file was shaped around: an anchor that is a RANGE,
 * whose own `getBoundingClientRect()` is already the right shape to hand it.
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
	/**
	 * A box in viewport coordinates the panel must not be drawn under: the
	 * corner the floating feedback button claims on every page (ledger 0396).
	 * Where the panel's columns cross it, its top edge is the window's bottom
	 * edge for the panel (and `margin` the gap above it), above the anchor as
	 * well as below it; a panel that room cannot take without covering its own
	 * anchor moves sideways instead (beside the anchor, or off the box), where
	 * that fits. Null or absent: the whole window is the panel's.
	 */
	avoid?: AnchorBox | null;
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
 *
 * WITH A RESERVED CORNER (`avoid`, ledger 0396) a panel whose columns cross it
 * treats the corner's top as the window's bottom edge, on BOTH sides of its
 * anchor: below, its room ends there, and above, its foot may not run past
 * there either (integration review 2: a key flush with the bottom of a phone
 * window opened the student page's Sections menu upward with its Done key 9px
 * under the feedback button). And when that room cannot take the panel, the
 * panel is never clamped over its own anchor or left under the corner: it
 * moves SIDEWAYS, to the nearest place that does neither (see `besideCorner`).
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
	const avoid = options.avoid ?? null;

	// THE COLUMNS FIRST: nothing about them depends on the side, and whether the
	// panel crosses the reserved corner depends on them.
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

	const at = placeRows(anchor, panel, viewport, left, avoid, gap, margin, preferSide);
	const placed: AnchorPlacement = { left, top: at.top, side: at.side, align, flipped: at.side !== preferSide || align !== preferAlign };

	// CROSSING THE CORNER: clear of it and of the anchor, or moved sideways.
	if (avoid && at.floor < viewport.height && !placementClear(anchor, panel, viewport, placed, avoid, margin)) {
		const beside = besideCorner(anchor, panel, viewport, placed, avoid, gap, margin, preferSide);
		if (beside) return beside;
	}
	return placed;
}

/**
 * THE ROOM ON EACH SIDE OF AN ANCHOR for a panel at these columns: the panel
 * height each side can take, and the floor its columns meet (`clearBottom`).
 * Below, from the anchor plus the gap down to the floor less the margin; above,
 * from the top margin down to the anchor less the gap OR the floor less the
 * margin, whichever is higher, because no placement lets a panel's foot run
 * past the floor on either side. One rule, so a caller that sizes its panel to
 * the room beside its key (the student page's Sections menu) measures the same
 * room this places it in.
 */
export function anchorRooms(
	anchor: AnchorBox,
	span: { left: number; right: number },
	viewport: AnchorSize,
	options: { gap?: number; margin?: number; avoid?: AnchorBox | null } = {}
): { above: number; below: number; floor: number } {
	const gap = options.gap ?? DEFAULT_GAP;
	const margin = options.margin ?? DEFAULT_MARGIN;
	const floor = clearBottom(span, viewport.height, options.avoid);
	return {
		above: Math.min(anchor.top - gap, floor - margin) - margin,
		below: floor - margin - (anchor.bottom + gap),
		floor
	};
}

/** The rows for a panel at these columns: which side of the anchor, and how far down. */
function placeRows(
	anchor: AnchorBox,
	panel: AnchorSize,
	viewport: AnchorSize,
	left: number,
	avoid: AnchorBox | null,
	gap: number,
	margin: number,
	preferSide: 'above' | 'below'
): { top: number; side: 'above' | 'below'; floor: number } {
	const room = anchorRooms(anchor, { left, right: left + panel.width }, viewport, { gap, margin, avoid });

	let side = preferSide;
	if (preferSide === 'above' && room.above < panel.height && room.below > room.above) side = 'below';
	else if (preferSide === 'below' && room.below < panel.height && room.above > room.below) side = 'above';

	const rawTop = side === 'above' ? anchor.top - gap - panel.height : anchor.bottom + gap;
	return { top: clamp(rawTop, margin, room.floor - margin - panel.height), side, floor: room.floor };
}

/** Whether two boxes share any area (touching edges do not). */
function boxesMeet(a: { left: number; top: number; width: number; height: number }, b: AnchorBox): boolean {
	return a.left < b.right && a.left + a.width > b.left && a.top < b.bottom && a.top + a.height > b.top;
}

/**
 * A PLACEMENT A PERSON CAN USE: inside the window, off its own anchor (a menu
 * drawn over the key that opened it reads as the row above's menu), and clear
 * of the reserved corner by the margin wherever its columns cross it.
 */
function placementClear(
	anchor: AnchorBox,
	panel: AnchorSize,
	viewport: AnchorSize,
	at: { left: number; top: number },
	avoid: AnchorBox | null,
	margin: number
): boolean {
	const box = { left: at.left, top: at.top, width: panel.width, height: panel.height };
	if (at.left < margin || at.left + panel.width > viewport.width - margin) return false;
	if (at.top < margin || at.top + panel.height > viewport.height - margin) return false;
	if (boxesMeet(box, anchor)) return false;
	const floor = clearBottom({ left: at.left, right: at.left + panel.width }, viewport.height, avoid);
	return at.top + panel.height <= floor - margin;
}

/**
 * NO ROOM ABOVE THE CORNER FOR A PANEL THAT CROSSES IT: the clamp would draw it
 * over its own anchor, or leave it under the corner. Moved sideways instead, to
 * the nearest of three places that does neither (integration review 2: a class
 * page row menu in a 667x375 window was clamped up over its own key and read
 * as the row above's menu):
 *   - beside the anchor on the side the panel already extends to (an end-aligned
 *     menu goes to the anchor's left, a start-aligned one to its right),
 *   - beside the anchor on the other side,
 *   - left of the corner, with the whole window's height.
 * Each is placed in rows against its own columns' floor, as any panel is. When
 * none fits, the clamped placement stands: clear of the corner, its start on
 * screen, the same answer as a panel taller than the window.
 */
function besideCorner(
	anchor: AnchorBox,
	panel: AnchorSize,
	viewport: AnchorSize,
	placed: AnchorPlacement,
	avoid: AnchorBox,
	gap: number,
	margin: number,
	preferSide: 'above' | 'below'
): AnchorPlacement | null {
	const toLeft = anchor.left - gap - panel.width;
	const toRight = anchor.right + gap;
	const columns = placed.align === 'end' ? [toLeft, toRight] : [toRight, toLeft];
	columns.push(avoid.left - margin - panel.width);
	for (const left of columns) {
		if (left < margin || left + panel.width > viewport.width - margin) continue;
		const at = placeRows(anchor, panel, viewport, left, avoid, gap, margin, preferSide);
		if (placementClear(anchor, panel, viewport, { left, top: at.top }, avoid, margin)) {
			return { left, top: at.top, side: at.side, align: placed.align, flipped: true };
		}
	}
	return null;
}

/**
 * WHERE THE WINDOW ENDS FOR A PANEL SPANNING THESE COLUMNS: the window's bottom
 * edge, or the top of the reserved box where the columns cross it. The one
 * statement of the floor; `anchorRooms` measures both rooms against it.
 */
export function clearBottom(
	span: { left: number; right: number },
	viewportHeight: number,
	avoid: AnchorBox | null | undefined
): number {
	if (!avoid || avoid.width <= 0 || avoid.height <= 0) return viewportHeight;
	const crosses = span.right > avoid.left && span.left < avoid.right;
	return crosses ? Math.min(viewportHeight, avoid.top) : viewportHeight;
}

/**
 * THE BOX A FLOATING CONTROL CLAIMS IN A CORNER OF THE WINDOW, read live: the
 * element carrying `data-corner-reserve` (the feedback button's wrapper, on
 * every page that has one). Null where there is none, or it has no box.
 */
export function cornerReserve(): AnchorBox | null {
	if (typeof document === 'undefined') return null;
	const el = document.querySelector<HTMLElement>('[data-corner-reserve]');
	if (!el) return null;
	const r = el.getBoundingClientRect();
	if (r.width <= 0 || r.height <= 0) return null;
	return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

export interface AnchoredParams extends AnchorOptions {
	/** The element the panel points at. Null while it has not been bound yet. */
	anchor?: HTMLElement | null;
	/** The caller decides visibility; this only decides WHERE. */
	open?: boolean;
	/**
	 * Keep clear of the corner the feedback button claims (`cornerReserve`).
	 * On by default, because that button floats over every page's content and
	 * a panel inside `main` (a stacking context at 1) is always painted under
	 * it: a row menu opened near the bottom-right had its Unit select covered
	 * (ledger 0396). False only for a panel that is painted above it anyway.
	 */
	keepClear?: boolean;
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
			{ ...current, avoid: current.keepClear === false ? null : (current.avoid ?? cornerReserve()) }
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
