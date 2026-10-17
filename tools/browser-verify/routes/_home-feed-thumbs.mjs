/**
 * Shared probes for the /dev/home-feed post thumbnail specs (ledger 0396,
 * polish round): the home page's class cards drawing each post in the shape
 * the person chose in Display settings (`&mine=`, written into this device's
 * classroom slot, which is where the home page reads it), else the class's
 * default (`&classShape=`, Period 1), else Tile.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export const HOME_THUMBS = '/dev/home-feed?thumbs=1';

/** The cards are settled (the home page's entrance never runs on a harness) and the slot read has landed. */
export const HOME_THUMBS_READY = [
	{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
	{ waitFor: `() => document.querySelectorAll('.feed-card').length === 3`, timeoutMs: 30000 },
	{ evaluate: `() => 'settled'`, waitMs: 2600 }
];

/** Every row of every card, in page order: its shape and what its mark or slot shows. */
export const HOME_ROWS = `() => [...document.querySelectorAll('.feed-card .assignment-list > .feed-row, .feed-card .assignment-list > .feed-own')].map((r) => {
	const shape = r.getAttribute('data-thumbs');
	const pt = r.querySelector('[data-testid="post-thumb"]');
	const mark = pt ? pt.getAttribute('data-source') : r.querySelector('img') ? 'cover' : r.querySelector('.assignment-icon-thumb svg') ? 'glyph' : 'none';
	return shape + ' ' + mark;
})`;

/** The two image requests the fixture makes that no harness can answer (an uploaded thumbnail, and its fallback). */
export const HOME_THUMBS_CONSOLE = [/api\/classroom\/thumbnail\/i-overdue/, /status of 404 \(Not Found\)$/, /Failed to load resource: net::ERR_FAILED/];

/**
 * EVERY OPEN CARD SHOWS EVERY ROW AND ITS OPEN CLASS LINK, WHOLE (review of
 * the polish round). A presence count calls a row visible when it has a box,
 * whatever an ancestor clips, so app.css's 1200px collapse cap hid three rows
 * and the Open class link of a Wide card at 375 with every presence check
 * green. This reads the list's own box against each child's, and the list's
 * content height against its height, per open card, and names the overflow
 * (`clip`, which no focus or `scrollIntoView` can scroll).
 */
export const HOME_LIST_FITS = {
	label: 'every open card holds every row and its Open class link inside its list, and the list cannot scroll',
	evaluate: `() => [...document.querySelectorAll('.feed-card:not(.collapsed) > .assignment-list')].map((l) => {
		const box = l.getBoundingClientRect();
		const kids = [...l.querySelectorAll(':scope > .feed-row, :scope > .feed-own, :scope > .feed-more')];
		const outside = kids.filter((k) => { const r = k.getBoundingClientRect(); return r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5; }).length;
		const fits = l.scrollHeight <= l.clientHeight + 1 ? 'fits' : 'clipped ' + l.clientHeight + '/' + l.scrollHeight;
		return fits + ', ' + outside + ' of ' + kids.length + ' outside, overflow ' + getComputedStyle(l).overflowY;
	})`
};

/**
 * A WIDE ROW'S DEADLINE MARKER HUGS ITS OWN POST (review of the polish
 * round): in columns a row's leading edge is the line between two columns, so
 * the marker is drawn 4px from the post's own slot, from the slot's top to the
 * title's foot, and the row itself draws none. Per marked row: its step, the
 * gap to its own slot, whether it spans the slot and the title, the row's own
 * shadow, and the marker's.
 */
export const HOME_WIDE_MARKS = {
	label: "each marked Wide row's deadline marker sits 4px from its own slot, down the slot and the title, and the row draws none",
	evaluate: `() => [...document.querySelectorAll('.feed-card .assignment-list > [data-thumbs="wide"][data-urgency]')].filter((r) => ['imminent', 'today', 'overdue'].includes(r.getAttribute('data-urgency'))).map((r) => {
		const mark = r.querySelector(':scope > .feed-mark');
		if (!mark) return r.getAttribute('data-urgency') + ' no marker';
		const m = mark.getBoundingClientRect();
		const slot = r.querySelector('[data-testid="post-thumb"]').getBoundingClientRect();
		const name = r.querySelector('.assignment-name').getBoundingClientRect();
		const spans = m.top <= slot.top + 0.5 && m.bottom >= name.bottom - 0.5;
		const own = getComputedStyle(r).boxShadow;
		return r.getAttribute('data-urgency') + ' ' + Math.round(slot.left - m.right) + 'px from its slot, ' + (spans ? 'down the slot and the title' : 'short') + ', row ' + own + ', marker ' + (getComputedStyle(mark).boxShadow === 'none' ? 'none' : 'drawn');
	})`
};
