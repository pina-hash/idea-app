// original array position 8 of 25 -- see ../README.md for what `order` means
export const order = 8;

export default {
	path: '/dev/classroom-split/s-1?manage=1',
	label: 'Class stream, bulk selection bar + drag reorder (teacher)',
	/* Mounts the REAL ClassSplit/ClassView/ClassroomShell against the
	   classroom-split fixture (u-1: i-1, i-crowded [pinned], i-2, i-2b).
	   Checking one row's own checkbox is what a teacher does to reveal the
	   bulk-action bar -- selecting BEFORE measuring is the correct state,
	   the same way /dev/pathways dismisses its overlay before measuring
	   the chips underneath it.

	   The drag itself is dispatched as synthetic DragEvents rather than
	   simulated pointer motion, because the handlers ClassView wires up
	   (`ondragstart`/`ondragover`/`ondrop`) are native DnD, which Chromium
	   answers identically either way -- what the second `evaluate` proves
	   is not that a drag happened, but that the DROP wrote the id array it
	   should, read back from the dev transport's own log
	   (`window.__composeProbe().orders`), never from the fixture's static
	   render order: the fixture never actually reorders on screen, so a
	   DOM read here would pass even if `setOrder` silently dropped the
	   write.

	   `groupItems` (the drop handler's argument) is the WHOLE per-unit
	   list, pinned items first -- unit u-1 renders
	   [i-crowded(pinned), i-1, i-2, i-2b, i-3..i-7] (see
	   classroom-split/fixture.ts: all seven unpinned items share one
	   `created_at`, so the newest-first tiebreak falls through to array
	   order). i-2b is dragged onto i-1's row: `dragReorderedIds` moves it
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
			evaluate: `() => {
				const dt = new DataTransfer();
				const grip = document.querySelector('[data-testid="row-grip-i-2b"]');
				const targetRow = document.querySelector('[data-testid="row-select-i-1"]').closest('li.row-wrap');
				if (!grip || !targetRow) throw new Error('drag fixture rows not found');
				grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
				targetRow.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
				targetRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
			}`,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '[data-testid="bulk-bar"]', label: 'bulk-action bar (one row selected)', expectPresent: 1 }
	],
	tapTargets: [
		{ selector: '[data-testid="bulk-publish"], [data-testid="bulk-delete"], [data-testid="bulk-clear"]', label: 'bulk-bar buttons', min: 44 },
		{ selector: '[data-testid="bulk-unit-select"]', label: 'bulk-bar file-into select', min: 44 }
	],
	orderResult: [
		{
			evaluate: '() => window.__composeProbe().orders.at(-1)',
			expected: ['i-crowded', 'i-2b', 'i-1', 'i-2', 'i-3', 'i-4', 'i-5', 'i-6', 'i-7'],
			label: 'setOrder recorded the id array the drop should have produced'
		}
	]
};
