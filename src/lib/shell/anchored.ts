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
	const { left, align } = anchorColumns(anchor, panel.width, viewport.width, preferAlign, margin);

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
 * THE COLUMNS A PANEL OF THIS WIDTH TAKES beside its anchor: lined up with the
 * anchor's start edge or its end edge (`align`, flipped when that side runs off
 * the window), then clamped into the window. They depend on the width alone,
 * never on the height, which is what lets `anchorFitHeight` name a height cap
 * that placing the panel cannot then move.
 */
function anchorColumns(
	anchor: AnchorBox,
	width: number,
	viewportWidth: number,
	preferAlign: 'start' | 'end',
	margin: number
): { left: number; align: 'start' | 'end' } {
	let align = preferAlign;
	let rawLeft = align === 'start' ? anchor.left : anchor.right - width;
	if (align === 'start' && rawLeft + width > viewportWidth - margin) {
		align = 'end';
		rawLeft = anchor.right - width;
	} else if (align === 'end' && rawLeft < margin) {
		align = 'start';
		rawLeft = anchor.left;
	}
	return { left: clamp(rawLeft, margin, viewportWidth - margin - width), align };
}

/**
 * THE TALLEST A PANEL OF THIS WIDTH MAY BE and still sit beside its anchor
 * without covering it or running under the reserved corner. A panel no taller
 * than this always has a place `anchorPosition` will give it: at the columns it
 * takes beside its key (`anchorColumns`), the larger of the two rooms there
 * (`anchorRooms`), because `anchorPosition` takes the preferred side when it fits
 * and the larger side when it does not.
 *
 * AND WHERE THOSE COLUMNS CROSS THE CORNER, A SHORT MOVE SIDEWAYS IS WEIGHED
 * BEFORE THE PANEL IS SHORTENED (ledger 0396, integration review 4). Crossing
 * the corner by a few pixels used to cap the panel to the room above the button
 * outright: the Quick note at 667x375 crossed the button's columns by 37px and
 * opened 249px tall, its writing box cut and Save and Open notebook out of
 * reach, while `anchorPosition` with the same inputs would have put it left of
 * the button at 285px. So the room is the largest any of `besideCorner`'s
 * places offers (`sidewaysColumns`, the same list in the same order), and a
 * panel that needs more than its own columns give it is moved there by
 * `anchorPosition`, which reaches the same list when the panel does not fit
 * where it is. Off its key's columns a panel may take the whole height above
 * the floor (`roomAt`): beside its key, it covers nothing.
 *
 * The action writes it on the panel as `--anchor-room` (in px) on every
 * placement, and a panel whose content can outgrow its room caps itself with it
 * (`max-height: min(<its own cap>, var(--anchor-room, 100vh))`) and scrolls
 * inside: the header's Quick note opened at 344px while its editor loaded and
 * grew to 448px, which a short window's room below its key could not take, so
 * the next placement clamped it up over the Menu key that opened it (ledger
 * 0396, integration review 3). Never below zero.
 */
export function anchorFitHeight(
	anchor: AnchorBox,
	width: number,
	viewport: AnchorSize,
	options: AnchorOptions = {}
): number {
	const gap = options.gap ?? DEFAULT_GAP;
	const margin = options.margin ?? DEFAULT_MARGIN;
	const avoid = options.avoid ?? null;
	const { left, align } = anchorColumns(anchor, width, viewport.width, options.align ?? 'start', margin);
	let best = roomAt(anchor, left, width, viewport, avoid, gap, margin);
	// THE SAME CONDITION `anchorPosition` MOVES A PANEL SIDEWAYS ON: its own
	// columns cross the corner. Anywhere else the corner takes nothing from it.
	if (avoid && clearBottom({ left, right: left + width }, viewport.height, avoid) < viewport.height) {
		for (const l of sidewaysColumns(anchor, width, viewport.width, align, avoid, gap, margin)) {
			best = Math.max(best, roomAt(anchor, l, width, viewport, avoid, gap, margin));
		}
	}
	return Math.max(0, best);
}

/**
 * THE TALLEST A PANEL AT THESE COLUMNS MAY BE: on its key's columns, the larger
 * room above or below the key; off them, the window's whole height above the
 * floor, since a panel beside its key may sit level with it (`placeRows` clamps
 * it there and `placementClear` finds nothing covered).
 */
function roomAt(
	anchor: AnchorBox,
	left: number,
	width: number,
	viewport: AnchorSize,
	avoid: AnchorBox | null,
	gap: number,
	margin: number
): number {
	const span = { left, right: left + width };
	const room = anchorRooms(anchor, span, viewport, { gap, margin, avoid });
	if (span.right <= anchor.left || span.left >= anchor.right) return room.floor - 2 * margin;
	return Math.max(room.above, room.below);
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
 *
 * A KEY ABOVE THE WINDOW (a header scrolled away under an open panel) leaves
 * the panel the window's height below the top margin, never more: its top is
 * clamped there, so the room below counts from the margin, not from a key
 * foot 170px above the window (integration review 4: the home Quick note was
 * told it had 976px in a 900px window).
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
		below: floor - margin - Math.max(anchor.bottom + gap, margin),
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
	for (const left of sidewaysColumns(anchor, panel.width, viewport.width, placed.align, avoid, gap, margin)) {
		const at = placeRows(anchor, panel, viewport, left, avoid, gap, margin, preferSide);
		if (placementClear(anchor, panel, viewport, { left, top: at.top }, avoid, margin)) {
			return { left, top: at.top, side: at.side, align: placed.align, flipped: true };
		}
	}
	return null;
}

/**
 * THE PLACES SIDEWAYS A PANEL CROSSING THE CORNER MAY MOVE TO, in the order
 * they are tried: beside its key on the side it already extends to, beside its
 * key on the other side, then left of the corner; only the ones inside the
 * window. `besideCorner` places a panel at the first that takes it and
 * `anchorFitHeight` sizes a panel to the largest, from this one list, so the
 * cap and the placement cannot disagree about where a panel may go.
 */
function sidewaysColumns(
	anchor: AnchorBox,
	width: number,
	viewportWidth: number,
	align: 'start' | 'end',
	avoid: AnchorBox,
	gap: number,
	margin: number
): number[] {
	const toLeft = anchor.left - gap - width;
	const toRight = anchor.right + gap;
	const columns = align === 'end' ? [toLeft, toRight] : [toRight, toLeft];
	columns.push(avoid.left - margin - width);
	return columns.filter((left) => left >= margin && left + width <= viewportWidth - margin);
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

/**
 * `anchorPosition` AGAINST THE WINDOW AS IT IS NOW, keeping clear of the corner
 * reserve: for a component that places its own panel rather than through the
 * action (IdeaCAD's right-click menu, its feature tree's row menu, its command
 * search and context toolbar, the grading roster's card). Those called
 * `anchorPosition` with no `avoid`, so a menu opened near the bottom-right drew
 * its last rows under the feedback button (ledger 0396, integration review 3:
 * IdeaCAD's Search commands row hit-tested as the button at 1440x900). `avoid`
 * left out means the live reserve; null means none, for a panel painted above
 * the button anyway.
 */
export function anchorInWindow(anchor: AnchorBox, panel: AnchorSize, options: AnchorOptions = {}): AnchorPlacement {
	const viewport = { width: window.innerWidth, height: window.innerHeight };
	return anchorPosition(anchor, panel, viewport, { ...options, avoid: options.avoid === undefined ? cornerReserve() : options.avoid });
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
 * HOW MANY RESIZE-DRIVEN PLACEMENTS IN A ROW MAY MOVE THE PANEL'S COLUMNS (or
 * its side or alignment, which a stylesheet could key on) before the action
 * stops following the panel's size. Placing a panel writes its left, its top
 * and `--anchor-room`; the room is written BEFORE the panel is measured, so a
 * resize it causes is already in the size the placement used and reports
 * nothing new, and a fixed box's top cannot change its size. So the only way a
 * placement can resize the panel it just placed is through its left (a panel
 * that shrinks to fit the room right of it) or a selector on its side: a loop
 * moves one of them on EVERY pass, and this many passes in a row is a loop, not
 * content arriving. Content that grows with the panel held in place (a note
 * being typed, an editor that finishes loading) resets the count, and so does
 * any placement the page asked for (open, an update, a scroll, a resize).
 */
export const ANCHOR_RESIZE_CHAIN_LIMIT = 4;

/**
 * `use:anchored={{ anchor, open }}` on the PANEL element.
 *
 * While open it writes `position: fixed`, two coordinates and `--anchor-room`
 * (the tallest the panel may be, `anchorFitHeight`); while closed it removes
 * every property it set, so the element's stylesheet -- including `@media
 * print` -- is back in sole charge of it.
 *
 * IT RE-PLACES WHEN THE PANEL'S OWN SIZE CHANGES (a ResizeObserver on the
 * node), as well as on a scroll or a resize of the window: a panel whose content
 * arrives after it opens (the Quick note's editor loads about 100ms in, growing
 * the panel from 344 to 448px) was placed at its first size and stayed there,
 * under the corner button, until something scrolled (ledger 0396, integration
 * review 3). And A SCROLL INSIDE THE PANEL ITSELF IS NOT A REASON TO MOVE IT:
 * its own content scrolling does not move its key, and every keystroke that
 * scrolled the note's caret into view used to re-place the whole panel.
 */
export function anchored(node: HTMLElement, params: AnchoredParams = {}) {
	let current: AnchoredParams = params;
	let cancel: (() => void) | null = null;
	let listening = false;
	let observer: ResizeObserver | null = null;
	/** A resize-driven placement waiting for its frame. */
	let pendingResize: (() => void) | null = null;
	/** The panel's size as the last placement measured it, so a resize reporting that same size is no news. */
	let placedWidth = -1;
	let placedHeight = -1;
	/** Resize-driven placements in a row that moved the panel's columns, side or alignment (`ANCHOR_RESIZE_CHAIN_LIMIT`). */
	let chain = 0;

	/** Where the panel went, and the size it was measured at. */
	function place(): { left: number; side: string; align: string } | null {
		const anchor = current.anchor;
		if (!anchor || !current.open) return null;
		const avoid = current.keepClear === false ? null : (current.avoid ?? cornerReserve());
		const viewport = { width: window.innerWidth, height: window.innerHeight };
		const box = anchor.getBoundingClientRect();
		let panel = node.getBoundingClientRect();
		// THE ROOM FIRST, then the size it leaves: a panel that caps itself with
		// it is measured at its capped height, so the placement is the one that
		// fits and the resize the cap causes reports nothing new.
		const room = `${Math.floor(anchorFitHeight(box, panel.width, viewport, { ...current, avoid }))}px`;
		if (node.style.getPropertyValue('--anchor-room') !== room) {
			node.style.setProperty('--anchor-room', room);
			panel = node.getBoundingClientRect();
		}
		const at = anchorPosition(box, { width: panel.width, height: panel.height }, viewport, { ...current, avoid });
		node.style.position = 'fixed';
		node.style.left = `${Math.round(at.left)}px`;
		node.style.top = `${Math.round(at.top)}px`;
		node.dataset.anchorSide = at.side;
		node.dataset.anchorAlign = at.align;
		placedWidth = panel.width;
		placedHeight = panel.height;
		return { left: Math.round(at.left), side: at.side, align: at.align };
	}

	/** A placement the page asked for: it ends any resize chain. */
	function placeNow() {
		chain = 0;
		place();
	}

	/** A placement the panel's own size asked for, counted while it keeps moving the columns. */
	function placeForResize() {
		pendingResize = null;
		const before = { left: node.style.left, side: node.dataset.anchorSide, align: node.dataset.anchorAlign };
		const at = place();
		if (!at) return;
		const moved = `${at.left}px` !== before.left || at.side !== before.side || at.align !== before.align;
		chain = moved ? chain + 1 : 0;
	}

	function onResize() {
		if (!current.open || pendingResize || chain >= ANCHOR_RESIZE_CHAIN_LIMIT) return;
		const r = node.getBoundingClientRect();
		if (Math.abs(r.width - placedWidth) < 0.5 && Math.abs(r.height - placedHeight) < 0.5) return;
		// ON THE NEXT FRAME, never inside the observer's own callback: a write
		// there that resizes the node is reported again in the same frame, and
		// past the observer's depth limit Chromium raises "ResizeObserver loop
		// completed with undelivered notifications" as a page error.
		pendingResize = schedule(placeForResize);
	}

	function observe(on: boolean) {
		if (on) {
			if (observer || typeof ResizeObserver !== 'function') return;
			observer = new ResizeObserver(onResize);
			observer.observe(node);
		} else {
			observer?.disconnect();
			observer = null;
			pendingResize?.();
			pendingResize = null;
		}
	}

	function clear() {
		node.style.position = '';
		node.style.left = '';
		node.style.top = '';
		node.style.removeProperty('--anchor-room');
		delete node.dataset.anchorSide;
		delete node.dataset.anchorAlign;
		placedWidth = -1;
		placedHeight = -1;
	}

	const onScroll = (event: Event) => {
		// The panel's own content scrolling (a long note following its caret)
		// moves nothing the panel is placed against.
		const target = event.target;
		if (target instanceof Node && node.contains(target)) return;
		placeNow();
	};
	const onWindowResize = () => placeNow();

	function listen(on: boolean) {
		if (on === listening) return;
		listening = on;
		// CAPTURE, so a scroll inside any ancestor container reaches this and not
		// just a scroll of the document: scroll does not bubble.
		const fn = on ? window.addEventListener : window.removeEventListener;
		fn('scroll', onScroll, true);
		fn('resize', onWindowResize);
	}

	function apply(next: AnchoredParams) {
		current = next;
		cancel?.();
		cancel = null;
		if (next.open && next.anchor) {
			placeNow();
			// A second pass once layout has settled: the panel may have been
			// measured before its own text wrapped to its final height.
			cancel = schedule(placeNow);
			listen(true);
			observe(true);
		} else {
			listen(false);
			observe(false);
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
			observe(false);
		}
	};
}
