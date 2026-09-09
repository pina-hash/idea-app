/**
 * DRAG TO REORDER, WITH THE POINTER AND NOT THE HTML5 DRAG MODEL.
 *
 * The class list used native `draggable="true"` + `dragover`/`drop`. That
 * mechanism is the reason a reorder felt clunky and no easing could fix it:
 *   - the browser paints a translucent SNAPSHOT of the row and the real row
 *     stays put, so nothing on screen moves until the drop lands;
 *   - `dragover` fires on whatever row the cursor is over, so the insertion
 *     mark jumps row to row rather than following the pointer;
 *   - there is no touch support at all on most mobile browsers, so a phone
 *     could not reorder anything;
 *   - `dragend` fires late and the cursor changes are the OS's, not ours.
 *
 * This is the other mechanism: `pointerdown` on a handle, `pointermove` with
 * the pointer captured, `pointerup` to commit. The dragged row FOLLOWS the
 * pointer (a `translateY` of the pointer's travel), the rows it passes SHIFT
 * out of its way (a `translateY` of the dragged row's height, eased by the
 * consumer's CSS), and the drop index is computed from where the dragged row's
 * CENTRE is against the other rows' centres -- so the list looks reordered
 * while the finger is still down, and the commit is what the person already
 * sees. Mouse, pen and touch are one code path (`touch-action: none` on the
 * handle is what stops a touch drag scrolling the pane instead).
 *
 * KEYBOARD IS THE SAME CONTRACT. A handle that is focusable takes ArrowUp /
 * ArrowDown and commits a one-step move through the same `ondrop`, so a
 * reorder is reachable without a pointer and the consumer has ONE place to
 * write the reorder. The consumer's own Move up / Move down menu items may
 * stay as a second, discoverable spelling of the same thing.
 *
 * WHAT IT DOES NOT DO. It never reorders the DOM: it paints transforms during
 * the drag, clears them on release, and hands `(from, to)` to `ondrop`. The
 * consumer's own state is what reorders the list (and a keyed `{#each}` is
 * what keeps rows stable across it). It also never scrolls the document; it
 * nudges the nearest scrollable ANCESTOR when the pointer is near its edge,
 * because the class pane is its own scroll container above 1024px.
 *
 * The arithmetic is pure and exported on its own (`sortDropIndex`,
 * `sortShifts`) so it is assertable in the node project with no DOM; the
 * action is the thin DOM binding over it.
 */

export interface SortRect {
	top: number;
	height: number;
}

/**
 * Where the dragged item lands, given every item's rect (as measured at drag
 * start, transforms zero) and where the dragged item's CENTRE now is.
 *
 * The rule: the new index is the number of OTHER items whose centre sits
 * above the dragged centre. Stable under small jitter (a row is passed only
 * when the dragged centre crosses its centre), symmetric up and down, and it
 * never lands outside the list.
 */
export function sortDropIndex(rects: readonly SortRect[], from: number, centreY: number): number {
	if (rects.length === 0) return 0;
	let above = 0;
	for (let i = 0; i < rects.length; i++) {
		if (i === from) continue;
		const centre = rects[i].top + rects[i].height / 2;
		if (centre < centreY) above += 1;
	}
	return Math.max(0, Math.min(rects.length - 1, above));
}

/**
 * The `translateY` each item takes while `from` is being dragged to `to`,
 * in pixels, one entry per item; the dragged item's own entry is 0 because it
 * follows the pointer rather than a shift. Items between the two indices move
 * by the dragged item's slot -- its height plus the gap to its neighbour --
 * in the direction that opens a hole at `to`.
 */
export function sortShifts(rects: readonly SortRect[], from: number, to: number): number[] {
	const shifts = rects.map(() => 0);
	if (rects.length < 2 || from === to || from < 0 || from >= rects.length) return shifts;
	const gapAfter = (i: number) =>
		i + 1 < rects.length ? rects[i + 1].top - (rects[i].top + rects[i].height) : 0;
	const gapBefore = (i: number) => (i > 0 ? rects[i].top - (rects[i - 1].top + rects[i - 1].height) : 0);
	const slot = rects[from].height + (from + 1 < rects.length ? gapAfter(from) : gapBefore(from));
	if (to > from) {
		for (let i = from + 1; i <= to; i++) shifts[i] = -slot;
	} else {
		for (let i = to; i < from; i++) shifts[i] = slot;
	}
	return shifts;
}

/** Move one element of a list from one index to another; pure. */
export function movedList<T>(list: readonly T[], from: number, to: number): T[] {
	const next = [...list];
	if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
}

export interface SortDragOptions {
	/** Selector for the sortable items, matched anywhere under the node. */
	items: string;
	/** Selector for the handle INSIDE an item. Defaults to `[data-sort-handle]`. */
	handle?: string;
	/** Pointer travel before a drag starts, so a tap on the handle is a tap. */
	threshold?: number;
	disabled?: boolean;
	/** The commit. Called once per completed drag or key press, `from !== to`. */
	ondrop: (from: number, to: number) => void;
	onstart?: (from: number) => void;
	onend?: () => void;
	/** ArrowUp / ArrowDown on a focused handle. On by default. */
	keyboard?: boolean;
}

const EDGE_PX = 40;
const EDGE_STEP_PX = 10;
const EDGE_TICK_MS = 16;

function scrollParent(el: HTMLElement | null): HTMLElement | null {
	let node = el?.parentElement ?? null;
	while (node) {
		const style = getComputedStyle(node);
		if (/(auto|scroll)/.test(style.overflowY)) return node;
		node = node.parentElement;
	}
	return null;
}

/**
 * The Svelte action. `use:sortDrag={{ items: '.row-wrap', ondrop }}` on the
 * list; a handle inside each item carries `data-sort-handle` (or the selector
 * in `handle`). See the file header for what it does and does not do.
 */
export function sortDrag(node: HTMLElement, initial: SortDragOptions) {
	let opts = initial;
	let dragging: {
		pointerId: number;
		handle: HTMLElement;
		items: HTMLElement[];
		rects: SortRect[];
		from: number;
		to: number;
		startY: number;
		started: boolean;
		scroller: HTMLElement | null;
		scrollStart: number;
		edgeTimer: ReturnType<typeof setInterval> | null;
	} | null = null;

	const itemsOf = () => Array.from(node.querySelectorAll<HTMLElement>(opts.items));
	const handleSelector = () => opts.handle ?? '[data-sort-handle]';

	function markHandles() {
		for (const item of itemsOf()) {
			for (const h of item.querySelectorAll<HTMLElement>(handleSelector())) {
				h.style.touchAction = 'none';
			}
		}
	}

	function paint() {
		if (!dragging || !dragging.started) return;
		const { items, rects, from, to } = dragging;
		const shifts = sortShifts(rects, from, to);
		items.forEach((item, i) => {
			if (i === from) return;
			item.style.transform = shifts[i] ? `translateY(${shifts[i]}px)` : '';
			item.dataset.sortShifted = shifts[i] ? 'true' : '';
		});
	}

	function clearPaint() {
		if (!dragging) return;
		for (const item of dragging.items) {
			item.style.transform = '';
			item.style.zIndex = '';
			item.style.position = '';
			item.classList.remove('is-dragging');
			delete item.dataset.sortShifted;
		}
		node.classList.remove('is-sorting');
	}

	function stopEdge() {
		if (dragging?.edgeTimer) {
			clearInterval(dragging.edgeTimer);
			dragging.edgeTimer = null;
		}
	}

	function moveTo(clientY: number) {
		if (!dragging) return;
		const d = dragging;
		const scrolled = d.scroller ? d.scroller.scrollTop - d.scrollStart : 0;
		const dy = clientY - d.startY + scrolled;
		if (!d.started) {
			if (Math.abs(dy) < (opts.threshold ?? 4)) return;
			d.started = true;
			node.classList.add('is-sorting');
			const item = d.items[d.from];
			item.classList.add('is-dragging');
			item.style.position = 'relative';
			item.style.zIndex = '3';
			opts.onstart?.(d.from);
		}
		const item = d.items[d.from];
		item.style.transform = `translateY(${dy}px)`;
		const centre = d.rects[d.from].top + d.rects[d.from].height / 2 + dy;
		const to = sortDropIndex(d.rects, d.from, centre);
		if (to !== d.to) {
			d.to = to;
			paint();
		}
		// Near the scroll container's edge, keep the pane moving under the
		// pointer. A timer rather than an animation frame (CLAUDE.md: rAF alone
		// never ticks on a throttled tab).
		if (d.scroller) {
			const box = d.scroller.getBoundingClientRect();
			const up = clientY - box.top < EDGE_PX;
			const down = box.bottom - clientY < EDGE_PX;
			if ((up || down) && !d.edgeTimer) {
				const dir = up ? -1 : 1;
				const lastY = clientY;
				d.edgeTimer = setInterval(() => {
					if (!dragging || !dragging.scroller) return stopEdge();
					dragging.scroller.scrollTop += dir * EDGE_STEP_PX;
					moveTo(lastY);
				}, EDGE_TICK_MS);
			} else if (!up && !down) {
				stopEdge();
			}
		}
	}

	function finish(commit: boolean) {
		if (!dragging) return;
		const d = dragging;
		stopEdge();
		const started = d.started;
		const { from, to } = d;
		clearPaint();
		try {
			if (typeof d.handle.releasePointerCapture === 'function') {
				d.handle.releasePointerCapture(d.pointerId);
			}
		} catch {
			/* A synthetic pointer was never captured. */
		}
		d.handle.removeEventListener('pointermove', onMove);
		d.handle.removeEventListener('pointerup', onUp);
		d.handle.removeEventListener('pointercancel', onCancel);
		window.removeEventListener('keydown', onKeyWhileDragging, true);
		dragging = null;
		if (started) {
			opts.onend?.();
			if (commit && from !== to) opts.ondrop(from, to);
		}
	}

	function onMove(e: PointerEvent) {
		if (!dragging || e.pointerId !== dragging.pointerId) return;
		e.preventDefault();
		moveTo(e.clientY);
	}
	function onUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== dragging.pointerId) return;
		finish(true);
	}
	function onCancel(e: PointerEvent) {
		if (!dragging || e.pointerId !== dragging.pointerId) return;
		finish(false);
	}
	function onKeyWhileDragging(e: KeyboardEvent) {
		if (e.key === 'Escape' && dragging) {
			e.preventDefault();
			finish(false);
		}
	}

	function onPointerDown(e: PointerEvent) {
		if (opts.disabled || dragging) return;
		// Primary button only; a right-click on a handle is a context menu.
		if (e.button !== 0) return;
		const target = e.target as Element | null;
		const handle = target?.closest<HTMLElement>(handleSelector());
		if (!handle || !node.contains(handle)) return;
		const items = itemsOf();
		const from = items.findIndex((item) => item.contains(handle));
		if (from < 0) return;
		const rects = items.map((item) => {
			const r = item.getBoundingClientRect();
			return { top: r.top, height: r.height };
		});
		const scroller = scrollParent(node);
		dragging = {
			pointerId: e.pointerId,
			handle,
			items,
			rects,
			from,
			to: from,
			startY: e.clientY,
			started: false,
			scroller,
			scrollStart: scroller?.scrollTop ?? 0,
			edgeTimer: null
		};
		try {
			if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(e.pointerId);
		} catch {
			/* happy-dom and synthetic events: capture is a nicety, the listeners
			   below are on the handle either way. */
		}
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onCancel);
		window.addEventListener('keydown', onKeyWhileDragging, true);
		// The handle is a grab, not a text selection.
		e.preventDefault();
	}

	function onKeyDown(e: KeyboardEvent) {
		if (opts.disabled || opts.keyboard === false) return;
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		const target = e.target as Element | null;
		const handle = target?.closest<HTMLElement>(handleSelector());
		if (!handle || !node.contains(handle)) return;
		const items = itemsOf();
		const from = items.findIndex((item) => item.contains(handle));
		if (from < 0) return;
		const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
		if (to < 0 || to >= items.length) return;
		e.preventDefault();
		opts.ondrop(from, to);
		// Keep focus on the SAME handle after the consumer re-renders the list
		// in its new order: the handle's item moved, and its element survives a
		// keyed `{#each}`, so refocusing it is what lets the next arrow press
		// keep moving the same row.
		queueMicrotask(() => {
			if (handle.isConnected) handle.focus();
		});
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('keydown', onKeyDown);
	markHandles();
	const observer =
		typeof MutationObserver === 'function' ? new MutationObserver(() => markHandles()) : null;
	observer?.observe(node, { childList: true, subtree: true });

	return {
		update(next: SortDragOptions) {
			opts = next;
			if (opts.disabled) finish(false);
			markHandles();
		},
		destroy() {
			finish(false);
			observer?.disconnect();
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('keydown', onKeyDown);
		}
	};
}
