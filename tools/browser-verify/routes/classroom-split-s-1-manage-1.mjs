// original array position 8 of 25 -- see ../README.md for what `order` means
export const order = 8;

/**
 * THE DRAG IS A POINTER DRAG NOW (prompt 0118, item TWELVE). ClassView used
 * to wire native HTML5 DnD (`draggable`, `dragstart`/`dragover`/`drop`) and
 * this spec dispatched synthetic `DragEvent`s at it. That mechanism is gone:
 * `$lib/classroom/sort-drag` listens for `pointerdown` on a grip, `pointermove`
 * with the pointer held, and `pointerup` to commit, and the drop index is
 * computed from where the dragged row's CENTRE is against the other rows'
 * centres at drag start. So the prepare step below dispatches real
 * `PointerEvent`s with `clientY` values read off the rows' REAL rects, in
 * steps, so the same threshold, the same centre arithmetic and the same
 * commit run as under a finger.
 *
 * What the `orderResult` proves is still not that a drag happened, but that
 * the DROP wrote the id array it should, read back from the dev transport's
 * own log (`window.__composeProbe().orders`), never from the fixture's static
 * render order: the fixture never actually reorders on screen, so a DOM read
 * here would pass even if `setOrder` silently dropped the write.
 */
const POINTER_DRAG = `async () => {
	const grip = document.querySelector('[data-testid="row-grip-i-2b"]');
	const fromRow = grip && grip.closest('li.row-wrap');
	const targetRow = document.querySelector('[data-testid="row-select-i-1"]');
	const toRow = targetRow && targetRow.closest('li.row-wrap');
	if (!grip || !fromRow || !toRow) throw new Error('drag fixture rows not found');
	const g = grip.getBoundingClientRect();
	const f = fromRow.getBoundingClientRect();
	const t = toRow.getBoundingClientRect();
	const x = g.left + g.width / 2;
	const y0 = g.top + g.height / 2;
	/* The dragged row's centre travels by the pointer's travel. Land it 4px
	   ABOVE i-1's centre: the drop index is the count of OTHER centres above
	   it, which is then exactly one (i-crowded), so i-2b goes to index 1. */
	const rowCentre = f.top + f.height / 2;
	const y1 = y0 + (t.top + t.height / 2 - 4 - rowCentre);
	const ev = (type, y, extra) => new PointerEvent(type, Object.assign({
		bubbles: true, cancelable: true, composed: true,
		pointerId: 7, pointerType: 'mouse', isPrimary: true,
		button: 0, buttons: 1, clientX: x, clientY: y
	}, extra || {}));
	grip.dispatchEvent(ev('pointerdown', y0));
	const steps = 8;
	for (let i = 1; i <= steps; i++) {
		grip.dispatchEvent(ev('pointermove', y0 + ((y1 - y0) * i) / steps));
		await new Promise((r) => setTimeout(r, 16));
	}
	const midDrag = {
		sorting: !!document.querySelector('.rows.is-sorting'),
		dragging: !!fromRow.classList.contains('is-dragging'),
		shifted: document.querySelectorAll('[data-sort-shifted="true"]').length
	};
	grip.dispatchEvent(ev('pointerup', y1, { buttons: 0, button: 0 }));
	await new Promise((r) => setTimeout(r, 50));
	return 'dragged i-2b ' + Math.round(y0) + '->' + Math.round(y1) + 'px; mid-drag sorting=' + midDrag.sorting
		+ ' dragging=' + midDrag.dragging + ' shifted=' + midDrag.shifted
		+ '; after: sorting=' + !!document.querySelector('.rows.is-sorting');
}`;

export default {
	path: '/dev/classroom-split/s-1?manage=1',
	label: 'Class stream, bulk selection bar + pointer drag reorder (teacher)',
	/* Mounts the REAL ClassSplit/ClassView/ClassroomShell against the
	   classroom-split fixture (u-1: i-1, i-crowded [pinned], i-2, i-2b).
	   Checking one row's own checkbox is what a teacher does to reveal the
	   bulk-action bar -- selecting BEFORE measuring is the correct state,
	   the same way /dev/pathways dismisses its overlay before measuring
	   the chips underneath it.

	   `groupItems` (the commit's argument) is the WHOLE per-unit list,
	   pinned items first -- unit u-1 renders
	   [i-crowded(pinned), i-1, i-2, i-2b, i-3..i-7] (see
	   classroom-split/fixture.ts: all seven unpinned items share one
	   `created_at`, so the newest-first tiebreak falls through to array
	   order). i-2b is dragged to i-1's slot: `dragReorderedIds` moves it
	   from index 3 to index 1, giving
	   ['i-crowded','i-2b','i-1','i-2','i-3','i-4','i-5','i-6','i-7']. */
	/* THE PREDICATE IS THE COUNT, NOT THE BAR, and this is the pre-click
	   short-circuit `clickUntil` documents rather than a new mechanism. The bar
	   renders at REST now (it is what tells a manager the checkboxes drive
	   anything at all), so `!!document.querySelector('[data-testid="bulk-bar"]')`
	   is true before the click and the click never physically fired: the whole
	   selected state went unmeasured and both tap-target rows reported "0
	   matched". `bulk-count` exists only while something is selected, so it
	   answers the question the step is actually asking. */
	prepare: [
		{ click: '[data-testid="row-select-i-1"]', until: '() => !!document.querySelector(\'[data-testid="bulk-count"]\')' },
		{
			evaluate: POINTER_DRAG,
			until: '() => (window.__composeProbe().orders.length > 0)',
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="bulk-bar"]', label: 'bulk-action bar (one row selected)', expectPresent: 1 },
		/* ITEM TWELVE: the grip is a real BUTTON now (focusable, named), one per
		   item row; 20 rows in the fixture, none folded. */
		{ selector: 'button.row-grip[data-sort-handle]', label: 'grip buttons, one per item row', expectPresent: 20, maxPresent: 20 },
		/* And nothing left of the mechanism it replaced. */
		{ selector: '[draggable="true"]', label: 'native draggable rows (the retired mechanism)', expectPresent: 0 },
		/* ITEM ELEVEN: the row checkboxes carry the shared redrawn class. */
		{ selector: 'input.row-select.cr-check', label: 'row checkboxes carrying .cr-check', expectPresent: 20, maxPresent: 20 },
		{ selector: '[data-testid="bulk-unit-select"].cr-select', label: 'bulk File into select carrying .cr-select', expectPresent: 1, maxPresent: 1 }
	],
	tapTargets: [
		{ selector: '[data-testid="bulk-publish"], [data-testid="bulk-delete"], [data-testid="bulk-clear"]', label: 'bulk-bar buttons', min: 44 },
		{ selector: '[data-testid="bulk-unit-select"]', label: 'bulk-bar file-into select', min: 44 },
		/* THE GRIP IS 44px ON BOTH AXES -- the one row control that is, because
		   it is HELD for the length of a drag rather than tapped, and it is
		   what a finger reorders with on a phone now that the mechanism has a
		   touch path at all. The checkbox and expand control keep their
		   documented 30px width. */
		{ selector: 'button.row-grip', label: 'row grips (held for a drag, 44 both axes)', min: 44 }
	],
	orderResult: [
		{
			evaluate: '() => window.__composeProbe().orders.at(-1)',
			expected: ['i-crowded', 'i-2b', 'i-1', 'i-2', 'i-3', 'i-4', 'i-5', 'i-6', 'i-7'],
			label: 'setOrder recorded the id array the pointer drop should have produced'
		},
		{
			/* THE REDRAW IS COMPUTED, NOT A CLASS: `appearance: none` is what
			   lets the room paint the box and the chevron; a class that lost its
			   rule would still match the presence rows above. */
			evaluate: `() => {
				const checks = [...document.querySelectorAll('input.row-select.cr-check')];
				const selects = [...document.querySelectorAll('select.cr-select')];
				const app = (el) => getComputedStyle(el).appearance || getComputedStyle(el).webkitAppearance;
				return [
					'checks ' + checks.length + ' appearance=' + [...new Set(checks.map(app))].join('|'),
					'selects ' + selects.length + ' appearance=' + [...new Set(selects.map(app))].join('|')
				];
			}`,
			expected: ['checks 20 appearance=none', 'selects 1 appearance=none'],
			label: 'cr-check and cr-select compute appearance: none'
		}
	]
};
