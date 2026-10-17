/**
 * THE CLASS TOOLBAR'S LINES, MEASURED AND CORRECTED (ledger 0396, part 7,
 * review rounds 3 and 4). The thin part of `class-toolbar.ts`, which holds the
 * rule and the reasons.
 *
 * THE STYLESHEET DRAWS THE PLAN; THIS ONLY CORRECTS IT (round 4). ClassView's
 * container queries draw the planned lines for the rows a class page usually
 * holds (`data-shape`, `.tb-br`), so the server render already has them and a
 * full page load moves nothing when the page hydrates. On every change this
 * reads where the keys actually landed, scores that arrangement
 * (`toolbarCost`) against the best one (`toolbarLines`), and writes nothing
 * when it is as good. Only a row the stylesheet has no rule for (a shape no
 * rule names, or keys wider than the rules were measured on) is drawn here:
 * the row is marked `data-planned`, which hides the stylesheet's breaks, and
 * the plan is written as the two adjustments `toolbarFit` describes.
 *
 * WHILE THE SEARCH IS TYPED INTO, THE ROW STAYS AS IT WAS (round 4, polish
 * rounds 1 and 2). From the moment the field takes the focus until it is left
 * empty, the row is drawn on the lines it had when the hold began, each key
 * known by its own identity (`keyId`), so a Videos key the search takes away
 * and brings back returns to its own line and no other key moves for it; the
 * field keeps its width, the room of a key that sat before it on its line, and
 * its top (`toolbarPinnedLines`, and the row's own top padding for a line
 * above it that emptied). A selection that hides the field while it holds a word keeps the
 * hold for it, so Clear selection hands the field back where it was. Escape and
 * Clear end the hold once they have emptied the field, so the row is planned
 * afresh exactly as at rest.
 *
 * WHAT IT NEVER DOES. It never makes the row take more lines than the plain
 * wrap, never reorders anything (keys keep their DOM order, so reading order
 * and tab order are what is on screen), and never hides one. Where it cannot
 * measure (a server render, a test DOM with no layout) the row is whatever the
 * stylesheet drew.
 *
 * AND IT CHECKS ITSELF. After writing, it reads where each key landed; a row
 * that did not break where the plan said (a rounding the arithmetic did not
 * foresee) is put back to the stylesheet's arrangement rather than left
 * half-planned.
 *
 * It re-runs when the row's box changes (a resize, the Videos band opening),
 * when anything inside it changes (a count, a filter's chip, the selection's
 * tray arriving), when a web font finishes loading, and when the search field
 * takes or leaves the focus. Its own writes are inline styles and an attribute
 * on the row, which it does not watch, so it never triggers itself.
 */
import {
	compareToolbarCost,
	toolbarCost,
	toolbarFit,
	toolbarLines,
	toolbarPinnedLines,
	type ToolbarFit,
	type ToolbarItem
} from './class-toolbar';

/** The row's keys: its flex items, looking through `display: contents` (the status chips' group, the Videos key's section). */
function rowItems(row: HTMLElement): HTMLElement[] {
	const out: HTMLElement[] = [];
	const walk = (el: Element) => {
		for (const child of Array.from(el.children)) {
			if (!(child instanceof HTMLElement)) continue;
			const cs = getComputedStyle(child);
			if (cs.display === 'none') continue;
			if (cs.display === 'contents') {
				walk(child);
				continue;
			}
			// Out of flow (the live count for a screen reader), a line of its own
			// after the keys (the Videos band, `order: 1`; the count of a narrowed
			// list), or a line break the stylesheet showed: not keys on a line.
			if (cs.position === 'absolute' || cs.position === 'fixed') continue;
			if (cs.order !== '0') continue;
			if (child.matches('.tb-br, .find-result')) continue;
			out.push(child);
		}
	};
	walk(row);
	return out;
}

const px = (value: string, fallback: number) => {
	const n = parseFloat(value);
	return Number.isFinite(n) ? n : fallback;
};

/** Where each line starts: a key sits wholly below the one before it (Select all keeps the right edge, so "left of" is not enough). */
function landedStarts(els: HTMLElement[]): number[] {
	const starts: number[] = [];
	let prevBottom = -Infinity;
	els.forEach((el, i) => {
		const rect = el.getBoundingClientRect();
		if (i === 0 || rect.top >= prevBottom - 1) starts.push(i);
		prevBottom = rect.bottom;
	});
	return starts;
}

/**
 * A key's identity across a remount: its hook, or its own first class. The
 * Videos key is a new element each time the search brings it back, and keyed
 * on the element it was a stranger to the hold (polish round 1).
 */
function keyId(el: HTMLElement): string {
	return el.getAttribute('data-testid') ?? (el.classList.length ? `.${el.classList[0]}` : el.tagName);
}

/** The lines held while the search is typed into: each key's line by its identity, and the field's width, left and top. */
interface Held {
	width: number;
	field: HTMLElement;
	fieldWidth: number;
	/** The field's left edge along its line, and its top from the row's own top, when the hold began. */
	fieldLeft: number;
	fieldTop: number;
	line: Map<string, number>;
}

export function balanceToolbar(row: HTMLElement) {
	if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return {};
	let touched: HTMLElement[] = [];
	let held: Held | null = null;
	/** Escape or Clear was pressed: once the field is empty, plan afresh. */
	let resetPending = false;

	function clear() {
		for (const el of touched) {
			el.style.removeProperty('margin-inline-start');
			el.style.removeProperty('margin-inline-end');
			el.style.removeProperty('flex-basis');
			el.style.removeProperty('max-width');
		}
		touched = [];
		row.style.removeProperty('padding-block-start');
		row.removeAttribute('data-planned');
	}

	function rowWidth(): number {
		const cs = getComputedStyle(row);
		const box = row.getBoundingClientRect();
		return box.width - px(cs.paddingLeft, 0) - px(cs.paddingRight, 0) - px(cs.borderLeftWidth, 0) - px(cs.borderRightWidth, 0);
	}

	/** Where a line starts, in the viewport: the row's content edge. */
	function lineLeft(): number {
		const cs = getComputedStyle(row);
		return row.getBoundingClientRect().left + px(cs.paddingLeft, 0) + px(cs.borderLeftWidth, 0);
	}

	function measure(els: HTMLElement[]): ToolbarItem[] {
		const groups = new Map<Element, string>();
		return els.map((el) => {
			const own = getComputedStyle(el);
			const rect = el.getBoundingClientRect();
			const groupEl = el.parentElement?.closest('[role="group"]');
			let group: string | undefined;
			if (groupEl && row.contains(groupEl)) {
				if (!groups.has(groupEl)) groups.set(groupEl, `g${groups.size}`);
				group = groups.get(groupEl);
			}
			if (px(own.flexGrow, 0) <= 0) {
				return { width: rect.width, aloneOk: el.matches('[data-testid="bulk-bar"]'), group };
			}
			const max = own.maxWidth === 'none' ? Infinity : px(own.maxWidth, Infinity);
			return { width: Math.min(px(own.flexBasis, rect.width), max), growsTo: max, aloneOk: true, group };
		});
	}

	function searchInput(): HTMLInputElement | null {
		return row.querySelector<HTMLInputElement>('.find-field input');
	}

	/** The search field holds the focus or a word, and is on screen: it is held. */
	function typing(): boolean {
		const input = searchInput();
		const field = input?.closest('.find-field');
		if (!input || !field || field.getClientRects().length === 0) return false;
		return document.activeElement === input || input.value !== '';
	}

	/** Every key's line as it is on screen now, and where the field sits. */
	function hold(els: HTMLElement[], width: number): Held | null {
		const field = row.querySelector<HTMLElement>('.find-field');
		const at = field ? els.indexOf(field) : -1;
		if (!field || at < 0) return null;
		const starts = landedStarts(els);
		const line = new Map<string, number>();
		els.forEach((el, i) => line.set(keyId(el), starts.filter((s) => s <= i).length - 1));
		const box = field.getBoundingClientRect();
		return {
			width,
			field,
			fieldWidth: box.width,
			fieldLeft: box.left - lineLeft(),
			fieldTop: box.top - row.getBoundingClientRect().top,
			line
		};
	}

	function write(els: HTMLElement[], fit: ToolbarFit, frozen: { el: HTMLElement; width: number; reserve: number } | null) {
		row.setAttribute('data-planned', '');
		if (frozen) {
			// Half a pixel short (the field's own grow takes it back, as in
			// `toolbarFit`), and never wider than it was.
			frozen.el.style.setProperty('flex-basis', `${Math.max(0, frozen.width - 0.5)}px`);
			frozen.el.style.setProperty('max-width', `${frozen.width}px`);
			// The room of a key that sat before the field on its line and has gone.
			if (frozen.reserve > 0) frozen.el.style.setProperty('margin-inline-start', `${frozen.reserve}px`);
			touched.push(frozen.el);
		}
		els.forEach((el, i) => {
			const margin = fit.endMargin[i];
			const basis = fit.basis[i];
			if (margin > 0) el.style.setProperty('margin-inline-end', `${margin}px`);
			if (basis !== null) el.style.setProperty('flex-basis', `${basis}px`);
			if (margin > 0 || basis !== null) touched.push(el);
		});
	}

	function run() {
		if (!row.isConnected) return;
		const width = rowWidth();
		const isTyping = typing();
		// Escape or Clear has emptied the field: the row is planned afresh, as
		// at rest, and held again from there while the field keeps the focus.
		let fresh = false;
		if (resetPending && searchInput()?.value === '') {
			resetPending = false;
			held = null;
			fresh = true;
		}
		// While anything is ticked the filters make way for the tray and the
		// field is not on screen; a hold over a field holding a word is kept
		// for it, so Clear selection hands the field back exactly where it was.
		const input = searchInput();
		const parked = !!held && !!input && input.value !== '' && row.classList.contains('selecting');
		// Begin holding from the lines on screen BEFORE anything is cleared, so
		// "as it was" is what the person was looking at when they began typing.
		if (!isTyping && !parked) held = null;
		else if (isTyping && !held && !fresh) held = hold(rowItems(row), width);
		// A different width is a different row (a turned phone): plan it afresh
		// and hold what that draws.
		if (held && Math.abs(held.width - width) > 0.5) held = null;
		clear();
		const els = rowItems(row);
		if (els.length < 2 || !(width > 0)) return;
		const gap = px(getComputedStyle(row).columnGap, 0);
		const items = measure(els);
		if (items.some((item) => !(item.width > 0))) return;

		let lines: number[];
		let planItems = items;
		let frozen: { el: HTMLElement; width: number; reserve: number } | null = null;
		const h = held;
		if (h && els.includes(h.field)) {
			const at = els.indexOf(h.field);
			const pinned = toolbarPinnedLines(
				items.map((item, i) => (i === at ? { width: h.fieldWidth - 0.5, aloneOk: true, group: item.group } : item)),
				width,
				gap,
				{ lineOf: els.map((el) => h.line.get(keyId(el)) ?? null), field: at, fieldLeft: h.fieldLeft }
			);
			frozen = { el: h.field, width: h.fieldWidth, reserve: pinned.reserve };
			planItems = pinned.items;
			lines = pinned.lines;
		} else {
			lines = toolbarLines(items, width, gap);
			// What the stylesheet drew is as good as the best: leave it.
			if (compareToolbarCost(toolbarCost(items, landedStarts(els)), toolbarCost(items, lines)) <= 0) {
				if (isTyping) held = hold(els, width);
				return;
			}
		}
		const fit = toolbarFit(planItems, width, gap, lines);
		write(els, fit, frozen);
		// Read it back: anything but the plan, and the row goes back to what the
		// stylesheet drew.
		const landed = landedStarts(els);
		if (landed.length !== fit.lines.length || landed.some((s, i) => s !== fit.lines[i])) clear();
		else if (h && frozen) {
			// A line above the field's that lost every key (the Videos key alone
			// on the first line, in a videos-first layout on a narrow phone) would
			// lift the field: the row keeps that line's height open above it.
			const lift = h.fieldTop - (h.field.getBoundingClientRect().top - row.getBoundingClientRect().top);
			if (lift > 0.5) row.style.setProperty('padding-block-start', `${lift}px`);
		}
		if (isTyping && !held) held = hold(els, width);
	}

	const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => run()) : null;
	resize?.observe(row);
	const mutate = typeof MutationObserver === 'function' ? new MutationObserver(() => run()) : null;
	mutate?.observe(row, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['class', 'hidden', 'disabled', 'data-open', 'data-shape', 'aria-expanded', 'aria-pressed']
	});
	const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
	fonts?.addEventListener?.('loadingdone', run);
	// The field taking the focus begins holding its line, at the lines on screen
	// then; leaving it (empty) lets the row be planned again, once the focus
	// has landed wherever it went.
	const onFocus = (event: FocusEvent) => {
		if (!(event.target instanceof HTMLElement) || !event.target.matches('.find-field input')) return;
		if (event.type === 'focusin') {
			if (!held) held = hold(rowItems(row), rowWidth());
		} else queueMicrotask(run);
	};
	// Escape in a field holding a word, and Clear, empty the field on purpose:
	// the row they leave is the one at rest. Captured, because the field's own
	// Escape handler stops the event there.
	const onReset = (event: Event) => {
		const target = event.target instanceof Element ? event.target : null;
		if (!target) return;
		if (event.type === 'keydown') {
			if ((event as KeyboardEvent).key !== 'Escape' || !target.matches('.find-field input')) return;
			if ((target as HTMLInputElement).value === '') return;
		} else if (!target.closest('.find-clear')) return;
		resetPending = true;
	};
	row.addEventListener('focusin', onFocus);
	row.addEventListener('focusout', onFocus);
	row.addEventListener('keydown', onReset, true);
	row.addEventListener('click', onReset, true);
	run();

	return {
		destroy() {
			resize?.disconnect();
			mutate?.disconnect();
			fonts?.removeEventListener?.('loadingdone', run);
			row.removeEventListener('focusin', onFocus);
			row.removeEventListener('focusout', onFocus);
			row.removeEventListener('keydown', onReset, true);
			row.removeEventListener('click', onReset, true);
			clear();
		}
	};
}
