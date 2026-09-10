/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * PROMPT 0118, ITEM SEVEN: FILING, BY CLICK AND BY DRAG.
 *
 * Two doors onto `setItemUnit`, and neither existed on the class pane before
 * this bundle in a form a person could find: filing lived in a select inside
 * the row's overflow menu and in the bulk bar's File into... picker.
 *
 *   - BY CLICK: once something is ticked, every OPEN group header grows a
 *     "File here" button. The state is reached the way a teacher reaches it,
 *     by ticking a row's own checkbox.
 *   - BY DRAG: a row released over ANOTHER group's card is filed into that
 *     unit (`sortDrag`'s `zones` + `ondropzone`), and the card under the
 *     pointer is marked `data-sort-zone-active` while the row is over it.
 *     The prepare step drags i-7 (the last row of Unit 1) by real
 *     `PointerEvent`s onto Unit 2's card. What is asserted is the WRITE, off
 *     the dev transport's own log: `setItemUnit(i-7, u-2)` and then the
 *     destination renumbered with i-7 appended -- never a DOM read, since
 *     the fixture is static and re-renders nothing.
 *
 * `aliasOf` because this is a STATE of the manage-1 route, not a route.
 */
const DRAG_TO_FILE = `async () => {
	const grip = document.querySelector('[data-testid="row-grip-i-7"]');
	const fromRow = grip && grip.closest('li.row-wrap');
	const zone = document.querySelector('.group-card[data-group-id="u-2"]');
	const head = zone && zone.querySelector('[data-testid="group-head"]');
	if (!grip || !fromRow || !zone || !head) throw new Error('drag-to-file fixture not found');
	/* THE TARGET HAS TO BE IN THE VIEWPORT: \`elementFromPoint\` answers null
	   outside it, by specification, and at 375px Unit 2's card sits below
	   nine rows of Unit 1. Centring the card puts i-7 -- the row directly
	   above it -- in view too, at both widths. Scrolled back afterwards so
	   the base spec's own geometry reads are taken where it takes them. */
	zone.scrollIntoView({ block: 'center', behavior: 'instant' });
	await new Promise((r) => setTimeout(r, 60));
	const g = grip.getBoundingClientRect();
	const h = head.getBoundingClientRect();
	const x0 = g.left + g.width / 2;
	const y0 = g.top + g.height / 2;
	const x1 = h.left + h.width / 2;
	const y1 = h.top + h.height / 2;
	const ev = (type, x, y, extra) => new PointerEvent(type, Object.assign({
		bubbles: true, cancelable: true, composed: true,
		pointerId: 9, pointerType: 'touch', isPrimary: true,
		button: 0, buttons: 1, clientX: x, clientY: y
	}, extra || {}));
	grip.dispatchEvent(ev('pointerdown', x0, y0));
	const steps = 10;
	for (let i = 1; i <= steps; i++) {
		grip.dispatchEvent(ev('pointermove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps));
		await new Promise((r) => setTimeout(r, 16));
	}
	const under = document.elementFromPoint(x1, y1);
	const mid = {
		zoneActive: zone.getAttribute('data-sort-zone-active'),
		activeCount: document.querySelectorAll('[data-sort-zone-active="true"]').length,
		underPointer: under ? (under.closest('.group-card') || {}).getAttribute?.('data-group-id') : null,
		draggedIgnoresHits: getComputedStyle(fromRow).pointerEvents
	};
	grip.dispatchEvent(ev('pointerup', x1, y1, { buttons: 0 }));
	await new Promise((r) => setTimeout(r, 80));
	const after = document.querySelectorAll('[data-sort-zone-active="true"]').length;
	window.scrollTo({ top: 0, behavior: 'instant' });
	const nav = document.querySelector('.cr-split > .cr-nav');
	if (nav) nav.scrollTop = 0;
	return 'dragged i-7 to u-2 (' + Math.round(x0) + ',' + Math.round(y0) + ')->(' + Math.round(x1) + ',' + Math.round(y1)
		+ '); mid-drag zone=' + mid.zoneActive + ' activeZones=' + mid.activeCount + ' under=' + mid.underPointer
		+ ' draggedPointerEvents=' + mid.draggedIgnoresHits + '; after: activeZones=' + after;
}`;

export default {
	path: '/dev/classroom-split/s-1?manage=1&state=selected',
	aliasOf: '/dev/classroom-split/s-1?manage=1',
	label: '0118 SEVEN: File here on every open unit while something is ticked, and filing by drag',
	prepare: [
		{ click: '[data-testid="row-select-i-1"]', until: '() => !!document.querySelector(\'[data-testid="bulk-count"]\')' },
		{
			evaluate: DRAG_TO_FILE,
			until: '() => (window.__composeProbe().filed.length > 0)',
			waitMs: 300
		}
	],
	presence: [
		/* FILING BY CLICK: three open units (u-1, u-2, u-3; every fixture item
		   is filed, so there is no unfiled group), three File here controls. */
		{ selector: '[data-testid="group-file-here"]', label: 'File here on every open group (3 units)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="bulk-count"]', label: 'the selection count the controls hang off', expectPresent: 1, expectVisible: 1 },
		/* The keyboard spelling stays beside it. */
		{ selector: '[data-testid="bulk-unit-select"].cr-select', label: 'bulk File into select (kept, .cr-select)', expectPresent: 1, maxPresent: 1 },
		/* Nothing is left lit once the row is released. */
		{ selector: '[data-sort-zone-active="true"]', label: 'active drop zone after release (none)', expectPresent: 0 }
	],
	tapTargets: [
		{ selector: '[data-testid="group-file-here"]', label: 'File here', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="group-file-here"]', label: 'File here label', min: 4.5 }
	],
	textContains: [
		{ selector: '[data-testid="group-file-here"]', label: 'the control carries its word', must: ['File here'] }
	],
	orderResult: [
		{
			evaluate: `() => { const f = window.__composeProbe().filed.at(-1); return f ? [f.itemId, f.unitId] : ['no filing recorded']; }`,
			expected: ['i-7', 'u-2'],
			label: 'a release over Unit 2 filed i-7 into u-2 (setItemUnit), not a reorder'
		},
		{
			/* Filing renumbers the DESTINATION with the arrival last -- the same
			   `renumberedForFiling` the menu picker and the bulk bar run. u-2
			   renders [i-draft, i-sched, i-8..i-12] (array order, see the base
			   spec's note on the tiebreak). */
			evaluate: '() => window.__composeProbe().orders.at(-1)',
			expected: ['i-draft', 'i-sched', 'i-8', 'i-9', 'i-10', 'i-11', 'i-12', 'i-7'],
			label: 'and then renumbered Unit 2 with i-7 appended'
		},
		{
			/* THE NEGATIVE: the drag was a filing, so the source group was NOT
			   reordered -- exactly one setOrder, and it is the destination's. */
			evaluate: `() => { const o = window.__composeProbe().orders; return [o.length, o.length ? (o[0].includes('i-crowded') ? 'source' : 'destination') : 'none']; }`,
			expected: [1, 'destination'],
			label: 'one order write, and it is the destination, not the source group'
		}
	],
	/* The crowded fixture's image attachment goes through a route that needs
	   a session this placeholder-.env dev server cannot provide; fixture-only,
	   same as the item route's own ignore. */
	ignoreConsole: ['Failed to load resource: the server responded with a status of 401']
};
