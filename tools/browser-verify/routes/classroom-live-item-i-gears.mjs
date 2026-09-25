/**
 * THE LIVE CLASS ON A PORTED HTML WORKSHEET (decision 37, ledger 0298, the
 * consistency follow-up to Tier A item 3). A worksheet has no turn-in, so a
 * student who filled in every block is handed in: this grid now says so in
 * the student chip's own words, as their class page does, instead of reading
 * them as away with a Missing mark.
 *
 * WHAT IS MEASURED, off the fixture in `src/routes/dev/classroom-live/worksheet.ts`
 * (due yesterday evening, so Missing can be said):
 *   - Gus finished before the due time and reads Needs grading, "Complete";
 *     Kim finished after it and reads "Complete, late"; neither is Missing;
 *   - Jo was graded (not returned) and reads Handed in, "Graded"; Lee was
 *     returned and reads "Returned";
 *   - Hana answered one block of two and Ivan the other one: a classmate's
 *     answer finishes nobody, so both stay "Draft saved" AND Missing;
 *   - the six with nothing are Not opened and Missing: 8 Missing marks, beside
 *     the 4 finished students who carry none (both directions, one list).
 * `classroom-live-item-i-gears-worksheet-broken` is the same page with the
 * manifest read failing, which is the grid as it was before this change.
 */
import { LIVE_GROUPS } from './_classroom-live.mjs';

/** Every row as "name / state / detail[ / Missing]", sorted by name. */
const ROWS = `() => [...document.querySelectorAll('[data-testid="live-cell"]')].map((c) =>
	[c.querySelector('.lg-name')?.textContent.trim(), c.getAttribute('data-state'), c.querySelector('.lg-detail')?.textContent.trim() || '-']
		.concat(c.querySelector('[data-testid="live-cell-missing"]') ? ['Missing'] : []).join(' / ')
).sort()`;

export default {
	path: '/dev/classroom-live?item=i-gears',
	label: 'Live class on an HTML worksheet: a finished worksheet reads Complete, not Missing',
	prepare: [
		{
			waitFor: `() => !!document.querySelector('[data-testid="live-group-needs-grading"]')`,
			timeoutMs: 30000
		}
	],
	orderResult: [
		{
			label: 'the chooser is on the worksheet',
			evaluate: `() => [document.querySelector('[data-testid="live-item"]').value]`,
			expected: ['i-gears']
		},
		{
			label: 'the groups, in the order a teacher acts on them',
			evaluate: LIVE_GROUPS,
			expected: ['away 2', 'not-opened 6', 'needs-grading 2', 'submitted 2']
		},
		{
			label: 'every student, as their class page would read them',
			evaluate: ROWS,
			expected: [
				'Ana Reyes / not-opened / - / Missing',
				'Ben Okafor / not-opened / - / Missing',
				'Cruz Delgado / not-opened / - / Missing',
				'Dee Marsh / not-opened / - / Missing',
				'Eli Nakamura / not-opened / - / Missing',
				'Fay Obi / not-opened / - / Missing',
				'Gus Varga / needs-grading / Complete',
				'Hana Ito / away / Draft saved / Missing',
				'Ivan Petrov / away / Draft saved / Missing',
				'Jo Lindqvist / submitted / Graded',
				'Kim Soto / needs-grading / Complete, late',
				'Lee Amari / submitted / Returned'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="live-cell"]', label: 'rows on the grid', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="live-cell-missing"]', label: 'Missing marks (8: the four finished carry none)', expectPresent: 8, maxPresent: 8 },
		{ selector: '[data-testid="live-cell"][data-state="needs-grading"]', label: 'finished and waiting to be graded', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="live-missing-count"]', label: 'the Missing tally chip', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="live-missing-count"]', label: 'the tally counts eight', must: ['8'] },
		{ selector: '[data-testid="live-group-needs-grading"]', label: 'the chip words', must: ['Complete', 'Complete, late'], mustNot: ['Missing'] }
	],
	contrast: [
		{ selector: '.lc-root .lg-name', label: 'student name', min: 4.5 },
		{ selector: '.lc-root .lg-detail', label: 'row detail', min: 4.5 },
		{ selector: '.lc-root .lg-missing', label: 'Missing mark', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.lc-root button', label: 'buttons' },
		{ selector: '.lc-root select', label: 'item chooser' }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
