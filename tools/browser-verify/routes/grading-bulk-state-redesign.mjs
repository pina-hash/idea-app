/* NO `order` EXPORT -- see routes.mjs. */

/**
 * LEDGER 0347 (decision 43): THE GRADING CONSOLE REDESIGN, MEASURED WHERE A
 * BROWSER IS THE ONLY INSTRUMENT.
 *
 * Mr. Pina's two reports from 2026-09-28:
 *
 *   R16 "there's this tiny little scroll bar to go through the different
 *       export options and it was such a pain trying to use this"
 *   R17 "I click check boxes and I don't really see any options to do anything
 *       with those checks ... there's a paragraph above it which I don't even
 *       know what that's for"
 *
 * WHAT THIS SPEC SAYS, and each is a claim `tests/dom/` cannot make because
 * happy-dom has no layout engine:
 *
 *   1. THE PAGE'S TOOLS ARE IN THE PAGE HEADER. Export, the pager and (where the
 *      route hands a close transport in) Close assignment sit in `.gc-head`, and
 *      NOTHING export-shaped is left in the roster card.
 *   2. NOTHING EXPORT-SHAPED SCROLLS IN A SLIVER. With the panel open, no
 *      export control has an ancestor that is a scroll container holding more
 *      than it shows (the document itself excepted). That is R16 as a number.
 *   3. SELECTION IS A MODE. No tick boxes at rest; the Select key shows one per
 *      row and the bar that acts on them ABOVE the names; leaving the mode
 *      takes them away again and clears the selection.
 *   4. "TO GRADE" SHOWS WHAT ITS KEY COUNTS. The number printed on the key is
 *      the number of rows the list then shows.
 *
 * THE FIRST PREPARE STEP REPORTS, IT DOES NOT ASSERT. It prints the roster
 * tools region's height and how many names are fully on screen in the list,
 * which is the before/after figure the history entry quotes; a fixed expected
 * value there would be a width-specific number in a shared array.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/grading-bulk?state=redesign',
	aliasOf: '/dev/grading-bulk',
	label: 'Grading console redesign: tools in the header, no export sliver, selection as a mode',
	widths: WIDTHS,
	prepare: [
		{
			waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 7',
			label: 'the roster has loaded'
		},
		{
			label: 'REPORT: the roster tools region and how many names are fully on screen',
			evaluate: `() => {
				const tools = document.querySelector('.roster-tools');
				const rows = [...document.querySelectorAll('.roster-list .roster-row')];
				const vh = window.innerHeight;
				const full = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.height > 0 && b.top >= 0 && b.bottom <= vh; }).length;
				return 'toolsHeight=' + Math.round(tools?.getBoundingClientRect().height ?? -1) + ' namesFullyOnScreen=' + full + ' of ' + rows.length + ' at ' + window.innerWidth + 'x' + vh;
			}`
		}
	],
	presence: [
		{ selector: '.gc-head', label: 'the page header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.gc-head [data-testid="work-export-disclosure"]', label: 'Export, in the header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.gc-head [data-testid="student-pager"]', label: 'the pager, in the header, before anybody is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE ABSENCES, each beside the positive control above it. */
		{ selector: '.roster [data-testid="work-export-disclosure"], .roster [data-testid="work-export"], .roster [data-testid="export-csv"]', label: 'any export left in the roster card', expectPresent: 0 },
		{ selector: '.roster [data-testid="close-disclosure"]', label: 'the close tool left in the roster card', expectPresent: 0 },
		/* SELECTION IS A MODE: nothing at rest, and the key that starts it. */
		{ selector: '[data-testid="roster-pick"]', label: 'tick boxes at rest (none until Select)', expectPresent: 0 },
		{ selector: '[data-testid="batch-bar"]', label: 'the selection bar at rest (none until Select)', expectPresent: 0 },
		{ selector: '[data-testid="select-mode"]', label: 'the Select key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="roster-filter-to-grade"]', label: 'the To grade key', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: '[data-testid="work-export-disclosure"]', label: 'Export', min: 44 },
		{ selector: '[data-testid="student-prev"]', label: 'Previous', min: 44 },
		{ selector: '[data-testid="student-next"]', label: 'Next', min: 44 },
		{ selector: '[data-testid="select-mode"]', label: 'Select', min: 44 },
		{ selector: '[data-testid="roster-filter-all"]', label: 'All', min: 44 },
		{ selector: '[data-testid="roster-filter-to-grade"]', label: 'To grade', min: 44 }
	],
	contrast: [
		{ selector: '.gc-head h1', label: 'the assignment title', min: 4.5 },
		{ selector: '.gc-position', label: 'the pager position', min: 4.5 },
		{ selector: '[data-testid="work-export-disclosure"] .disc-label', label: 'the Export word', min: 4.5 },
		{ selector: '[data-testid="roster-count"]', label: 'the roster count', min: 4.5 }
	],
	orderResult: [
		{
			label: 'with Export open, no export control scrolls inside a region smaller than its content',
			evaluate: `async () => {
				const trigger = document.querySelector('[data-testid="work-export-disclosure"]');
				if (!trigger) return ['trigger=false'];
				if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
				await new Promise((r) => setTimeout(r, 300));
				const controls = [...document.querySelectorAll('[data-testid="work-export"] button, [data-testid="work-export"] label, [data-testid="work-export"] select')];
				const trapped = controls.filter((c) => {
					for (let el = c.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
						const ov = getComputedStyle(el).overflowY;
						if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true;
					}
					return false;
				});
				const visible = controls.filter((c) => { const b = c.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
				trigger.click();
				await new Promise((r) => setTimeout(r, 200));
				return [
					'open=true',
					'controlsFound=' + (controls.length >= 5),
					'allPainted=' + (visible.length === controls.length),
					'inASliver=' + trapped.length,
					'csvInsidePanel=' + !!document.querySelector('[data-testid="work-export"] [data-testid="export-csv"]')
				];
			}`,
			expected: ['open=true', 'controlsFound=true', 'allPainted=true', 'inASliver=0', 'csvInsidePanel=true']
		},
		{
			label: 'Select shows a box per row and the bar above the names; leaving clears it',
			evaluate: `async () => {
				const key = document.querySelector('[data-testid="select-mode"]');
				if (!key) return ['key=false'];
				const wait = () => new Promise((r) => setTimeout(r, 250));
				const rows = document.querySelectorAll('.roster-list .roster-row').length;
				key.click();
				await wait();
				const boxes = document.querySelectorAll('[data-testid="roster-pick"]').length;
				const bar = document.querySelector('[data-testid="batch-bar"]');
				const list = document.querySelector('.roster-list');
				const barAbove = !!bar && !!list && bar.getBoundingClientRect().bottom <= list.getBoundingClientRect().top + 1;
				document.querySelector('[data-preset="all"]')?.click();
				await wait();
				const ticked = [...document.querySelectorAll('[data-testid="roster-pick"] input')].filter((i) => i.checked).length;
				const pressed = key.getAttribute('aria-pressed');
				key.click();
				await wait();
				const after = document.querySelectorAll('[data-testid="roster-pick"]').length;
				key.click();
				await wait();
				const tickedAfterReturn = [...document.querySelectorAll('[data-testid="roster-pick"] input')].filter((i) => i.checked).length;
				key.click();
				await wait();
				return [
					'boxesMatchRows=' + (boxes === rows),
					'keyPressed=' + pressed,
					'barAboveNames=' + barAbove,
					'allTicked=' + (ticked === rows),
					'boxesGoneAfter=' + (after === 0),
					'selectionClearedOnLeave=' + (tickedAfterReturn === 0)
				];
			}`,
			expected: ['boxesMatchRows=true', 'keyPressed=true', 'barAboveNames=true', 'allTicked=true', 'boxesGoneAfter=true', 'selectionClearedOnLeave=true']
		},
		{
			label: 'To grade shows exactly the number its key prints, and Everyone brings the rest back',
			evaluate: `async () => {
				const key = document.querySelector('[data-testid="roster-filter-to-grade"]');
				const all = document.querySelector('[data-testid="roster-filter-all"]');
				if (!key || !all) return ['keys=false'];
				const wait = () => new Promise((r) => setTimeout(r, 250));
				const total = document.querySelectorAll('.roster-list .roster-row').length;
				const printed = Number(((key.textContent || '').match(/(\\d+)/) || [])[1] ?? -1);
				key.click();
				await wait();
				const shown = document.querySelectorAll('.roster-list .roster-row').length;
				const pressed = key.getAttribute('aria-pressed');
				all.click();
				await wait();
				const back = document.querySelectorAll('.roster-list .roster-row').length;
				return ['printedMatchesShown=' + (printed === shown), 'fewerThanAll=' + (shown < total), 'keyPressed=' + pressed, 'everyoneBack=' + (back === total)];
			}`,
			expected: ['printedMatchesShown=true', 'fewerThanAll=true', 'keyPressed=true', 'everyoneBack=true']
		}
	]
};
