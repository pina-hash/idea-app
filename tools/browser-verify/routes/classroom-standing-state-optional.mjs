/**
 * FINISHED WORK NEVER READS MISSING (ledger 0360, reports d983e776, 2d83c063
 * and 8f78d5bd), on the REAL class page over the `optional` fixture's four worksheets,
 * read through the real `readWorksheetCompletions`:
 *
 *   - an optional photo slot left empty, everything required in, finished
 *     after the due instant: "Complete, late";
 *   - a checkbox the document stored as a string: "Complete";
 *   - THE CONTROL, both directions: the same Portfolio manifest with its
 *     REQUIRED photo missing still reads "Missing";
 *   - a worksheet partly answered on the server reads "Missing" until the
 *     "Finished in this tab" toggle feeds the class layout's own `overlayWork`,
 *     and then "Complete, late" -- with ZERO reads, counted off the harness's
 *     fake client before and after.
 */
import { STANDING, STANDING_READY, STANDING_ROWS } from './_classroom-standing.mjs';

export default {
	path: `${STANDING}?state=optional`,
	label: 'What a student owes: an optional slot, a checkbox string, and the open worksheet finishing',
	prepare: [
		STANDING_READY,
		{
			/* THE READS BEFORE THE TOGGLE, kept on the page so the row below can
			   compare them with the reads after it. */
			evaluate: '() => { window.__readsBefore = window.__standing.reads; return window.__readsBefore; }'
		},
		{
			click: '[data-testid="standing-finished-here"]',
			until: `() => [...document.querySelectorAll('[data-testid="standing-student"] [data-testid="item-row"]')].some((r) => r.querySelector('.row-name')?.textContent.trim() === 'Concept sketches' && r.querySelector('[data-testid="work-status"]')?.textContent.includes('Complete'))`
		}
	],
	orderResult: [
		{
			label: 'every row after the toggle: the two finished worksheets Complete, the control Missing, the open one Complete, late',
			evaluate: STANDING_ROWS,
			expected: [
				'Concept sketches | Complete, late | -',
				'Portfolio capture | Complete, late | -',
				'Portfolio capture, photo missing | Missing | -',
				'Safety check | Complete | -'
			]
		},
		{
			label: 'the row moved with no read: the fake client counted the same reads before and after',
			evaluate: '() => ["before=" + window.__readsBefore, "after=" + window.__standing.reads, "same=" + (window.__readsBefore === window.__standing.reads), "nonzero=" + (window.__readsBefore > 0)]',
			expected: ['before=4', 'after=4', 'same=true', 'nonzero=true']
		}
	],
	presence: [
		{ selector: '[data-testid="standing-student"] [data-testid="work-status"][data-missing="true"]', label: 'missing chips (the required-photo control only)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="standing-finished-here"][aria-pressed="true"]', label: 'the toggle, pressed', expectPresent: 1, maxPresent: 1 }
	],
	tapTargets: [{ selector: '[data-testid="standing-finished-here"]', label: 'the harness toggle', min: 44 }]
};
