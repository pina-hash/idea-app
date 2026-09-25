/**
 * THE CLASS PAGE'S MISSING FILTER, PRESSED (ledger 0298, R14 + R27).
 *
 * The count said three, so the filter must show three rows: the material,
 * because the check-in hanging off it is what is missing (before, the filter
 * judged the material on its own standing, which a material does not have, and
 * dropped it); the half-done worksheet; and the empty reading log. The two
 * finished worksheets are Done and stay out.
 */
import { STANDING, STANDING_READY, STANDING_ROWS } from './_classroom-standing.mjs';

export default {
	path: `${STANDING}?state=missing`,
	aliasOf: STANDING,
	label: 'What a student owes: Missing pressed on the class page',
	prepare: [
		STANDING_READY,
		{
			click: '[data-testid="standing-student"] [data-testid="stream-status-missing"]',
			until: '() => document.querySelector(\'[data-testid="standing-student"] [data-testid="stream-status-missing"]\')?.getAttribute("aria-pressed") === "true"'
		}
	],
	orderResult: [
		{
			label: 'the three rows the count counted, and only those',
			evaluate: STANDING_ROWS,
			expected: [
				'Day 24: gear trains | - | Check-in: Not filed yet',
				'Reading log | Missing | -',
				'Shaft worksheet | Missing | -'
			]
		},
		{
			label: 'the page says how many it is showing',
			evaluate: `() => [document.querySelector('[data-testid="standing-student"] [data-testid="stream-find-result"] span')?.textContent.trim()]`,
			expected: ['3 of 5 shown']
		}
	],
	presence: [
		{ selector: '[data-testid="standing-student"] [data-testid="item-row"]', label: 'missing rows', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="standing-student"] [data-testid="work-status"]:not([data-missing])', label: 'no finished worksheet under Missing', expectPresent: 0 }
	],
	tapTargets: [{ selector: '[data-testid="standing-student"] .find-chip', label: 'status chips' }]
};
