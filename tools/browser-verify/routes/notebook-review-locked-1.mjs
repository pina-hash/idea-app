/**
 * A CLASS'S OWN NOTEBOOK TAB, AS ITS TEACHER SEES IT (ledger 0297, package
 * F4a): the class's review, LOCKED to the class. `?locked=1` mounts the real
 * ReviewConsole inside the real ClassroomShell with `lockedSectionId`, the way
 * `/classroom/<id>/notebook` does for a manager, replacing the old Check-ins
 * tab that left the class for /notebook/review.
 *
 * LOCKED MEANS NO SECTION PICKER, and the all-sections console is one link
 * away rather than a control on this page. Its positive control is
 * `/dev/notebook-review`, the all-sections console, where the picker renders.
 *
 * THE GRID FITS BESIDE AN EMPTY ENTRY PANE. With nothing filed under the
 * cursor the entry pane holds a name and a sentence, and it takes the narrow
 * detail width; measured before this package, the grid's Covered column sat
 * outside its scrollport at 1366 and 1440 while that pane held 122px. The
 * `layoutSanity`-free way to say "it fits" is the table's own scroll width
 * against its box, which the evaluate step below reads and returns.
 */
export default {
	path: '/dev/notebook-review?locked=1',
	label: "A class's Notebook tab, manager (the review locked to the class, inside the shell)",
	prepare: [
		{ waitFor: '() => document.querySelectorAll("button.cell").length >= 30', timeoutMs: 20_000 }
	],
	presence: [
		{ selector: '[data-testid="section-tab-notebook"][aria-current="page"]', label: 'Notebook tab, current', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="section-tab-people"]', label: 'People tab (manager)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cr-root.cr-app > .nb-root.cr-app-body', label: 'the console is the body of the classroom frame', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="section-picker"], select[aria-label="Section"]', label: 'a section picker (must be absent: the tab is locked to its class)', expectPresent: 0 },
		{ selector: '[data-testid="nb-theme-toggle"], [data-nb-theme]', label: 'the retired plate picker or a plate attribute (must be absent)', expectPresent: 0 },
		{ selector: 'button.cell', label: 'the compliance grid cells', expectPresent: 30 }
	],
	orderResult: [
		{
			label: 'the grid is not cut: its table fits its own scrollport, beside an entry pane that holds nothing filed',
			evaluate: `() => {
				const s = document.querySelector('.table-scroll');
				const nav = document.querySelector('.cr-nav');
				const detail = document.querySelector('.cr-detail');
				const empty = !!document.querySelector('[data-testid="empty-cell-panel"]');
				if (!s || !nav || !detail) return ['missing: ' + [!s && '.table-scroll', !nav && '.cr-nav', !detail && '.cr-detail'].filter(Boolean).join(', ')];
				// Side by side only above the split's breakpoint; below it the grid
				// has the whole width and scrolls on a phone by design.
				const beside = detail.getBoundingClientRect().left >= nav.getBoundingClientRect().right - 1;
				const cut = s.scrollWidth - s.clientWidth;
				return [
					'entry pane holds nothing filed: ' + empty,
					'grid cut while the entry pane sits beside it: ' + (beside && cut > 1 ? cut + 'px' : 'no')
				];
			}`,
			expected: ['entry pane holds nothing filed: true', 'grid cut while the entry pane sits beside it: no']
		}
	],
	contrast: [
		{ selector: '.legend', label: 'grid legend words', min: 4.5 },
		{ selector: '[data-testid="empty-cell-panel"] .note', label: 'empty-cell sentence', min: 4.5 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
