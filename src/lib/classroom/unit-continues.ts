/**
 * A UNIT THAT CONTINUES INTO THE NEXT COLUMN SAYS SO AT THE TOP OF THAT COLUMN
 * (ledger 0468, feedback c27b2be7).
 *
 * The class stream is a multi-column container, and a unit of ten or more rows
 * may break between rows into the next column (`.stream` in ClassView, ledger
 * 0297), drawn as a whole framed card on each side. Its header stayed on the
 * first part only, so the second column opened on rows with no unit named
 * above them, which ui-shell.md recorded as open. CSS cannot repeat content
 * in a column fragment, so this marks the first row of every continued part
 * with `data-continues` ("Unit 3, continued"), and ClassView's stylesheet draws
 * that as a label in the room the card keeps at the top of every part.
 *
 * MARKING NEVER MOVES ANYTHING. The label is an absolutely placed `::after` in
 * space the card already reserves, so writing the attribute cannot change
 * where the columns break, and the measurement cannot chase its own output.
 *
 * `continuedRows` is the arithmetic, pure and testable without a layout
 * engine: given each row's left edge in order, the indexes that start a new
 * column. The action reads the edges off the page and writes the attribute.
 */

/** Indexes of the rows that begin a new column: the left edge moved right. */
export function continuedRows(lefts: readonly number[], tolerance = 2): number[] {
	const out: number[] = [];
	for (let i = 1; i < lefts.length; i++) if (lefts[i] - lefts[i - 1] > tolerance) out.push(i);
	return out;
}

/** The label a continued part carries. */
export function continuesLabel(unit: string): string {
	const name = unit.trim();
	return name ? `${name}, continued` : 'Continued';
}

const ATTR = 'data-continues';

/** Mark every continued part's first row under `node`; clear marks that no longer apply. */
export function markContinuations(node: HTMLElement): void {
	for (const card of node.querySelectorAll<HTMLElement>('.group-card')) {
		const rows = [...card.querySelectorAll<HTMLElement>('.rows > li.row-wrap')];
		const lefts = rows.map((r) => r.getBoundingClientRect().left);
		const starts = new Set(continuedRows(lefts));
		const label = continuesLabel(card.querySelector('.group-label')?.textContent ?? '');
		rows.forEach((row, i) => {
			if (starts.has(i)) {
				if (row.getAttribute(ATTR) !== label) row.setAttribute(ATTR, label);
			} else if (row.hasAttribute(ATTR)) row.removeAttribute(ATTR);
		});
	}
}

/**
 * The Svelte action: re-mark after the stream's size or contents change, on
 * the next frame (or a short timeout, so a background tab still settles).
 */
export function unitContinues(node: HTMLElement) {
	// A hook a browser check waits on: the marker is live (it runs only once
	// the page has hydrated, which on a cold dev server is seconds in).
	node.dataset.unitContinues = 'on';
	let pending = false;
	const run = () => {
		if (pending) return;
		pending = true;
		const go = () => {
			if (!pending) return;
			pending = false;
			markContinuations(node);
		};
		requestAnimationFrame(go);
		setTimeout(go, 120);
	};
	const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
	resize?.observe(node);
	const mutate = typeof MutationObserver === 'function' ? new MutationObserver(run) : null;
	mutate?.observe(node, { childList: true, subtree: true });
	run();
	return {
		destroy() {
			pending = false;
			resize?.disconnect();
			mutate?.disconnect();
		}
	};
}
