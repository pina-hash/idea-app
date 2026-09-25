/**
 * THE LIVE CLASS ON A PORTED WORKSHEET WHOSE MANIFEST COULD NOT BE READ
 * (ledger 0298). The harness makes the manifest read THROW, and the grid must
 * be exactly the grid it was before a worksheet could read Complete here:
 * every finished student reads as their answers alone say ("Draft saved",
 * Missing past the due time), the graded-but-not-returned draft reads the same,
 * and only the returned student is handed in. Never "complete", never an error
 * on a screen a teacher runs a class from. The positive side is
 * `classroom-live-item-i-gears`.
 */
import { LIVE_GROUPS } from './_classroom-live.mjs';

const ROWS = `() => [...document.querySelectorAll('[data-testid="live-cell"]')].map((c) =>
	[c.querySelector('.lg-name')?.textContent.trim(), c.getAttribute('data-state'), c.querySelector('.lg-detail')?.textContent.trim() || '-']
		.concat(c.querySelector('[data-testid="live-cell-missing"]') ? ['Missing'] : []).join(' / ')
).sort()`;

export default {
	path: '/dev/classroom-live?item=i-gears&worksheet=broken',
	label: 'Live class on an HTML worksheet whose manifest read fails: the grid as it was',
	prepare: [
		{
			waitFor: `() => !!document.querySelector('[data-testid="live-group-submitted"]')`,
			timeoutMs: 30000
		}
	],
	orderResult: [
		{
			label: 'the groups: no finished worksheet is handed in',
			evaluate: LIVE_GROUPS,
			expected: ['away 5', 'not-opened 6', 'submitted 1']
		},
		{
			label: 'every student, by their answers alone',
			evaluate: ROWS,
			expected: [
				'Ana Reyes / not-opened / - / Missing',
				'Ben Okafor / not-opened / - / Missing',
				'Cruz Delgado / not-opened / - / Missing',
				'Dee Marsh / not-opened / - / Missing',
				'Eli Nakamura / not-opened / - / Missing',
				'Fay Obi / not-opened / - / Missing',
				'Gus Varga / away / Draft saved / Missing',
				'Hana Ito / away / Draft saved / Missing',
				'Ivan Petrov / away / Draft saved / Missing',
				'Jo Lindqvist / away / Draft saved / Missing',
				'Kim Soto / away / Draft saved / Missing',
				'Lee Amari / submitted / Returned'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="live-cell"]', label: 'rows on the grid', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="live-group-needs-grading"]', label: 'no finished worksheet waiting to be graded', expectPresent: 0 },
		{ selector: '[data-testid="live-cell-missing"]', label: 'Missing marks', expectPresent: 11, maxPresent: 11 }
	],
	textContains: [
		{ selector: '[data-testid="live-control"]', label: 'no word of a completion the grid could not judge', must: ['Who is working'], mustNot: ['Complete'] }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
