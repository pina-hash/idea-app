/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { FLIP, HYDRATED, READ_BETWEEN, DOCUMENTS_AT_LEAST, TYPE_THEN_PRESS } from './_deploy-safety.mjs';

/**
 * A NEW VERSION IS LIVE, AN ANSWER IS HALF-TYPED, AND THE STUDENT PRESSES A
 * LINK: the answer is saved FIRST, and then the next page arrives as exactly
 * ONE full page load.
 *
 * The REAL `AssignmentEngine` on `/dev/deploy-safety`, its save acknowledged
 * after 300ms. The link is pressed 20ms after the last keystroke, inside the
 * engine's 800ms autosave window, so the save guard must cancel, flush, and
 * re-issue -- and `DeployWatch` must recognise the re-issued `goto` as the
 * student's own link (the `resumed` mark) or it would refuse to upgrade.
 *
 * `deploy-safety-case-control` is this exact run with the flag NOT flipped,
 * which must load NO document: the negative control that says this spec's one
 * is caused by the new version and not by the harness.
 */
export default {
	path: '/dev/deploy-safety?case=text',
	label: 'Deploy safety: unsaved answer, then a link, with a new version live',
	prepare: [
		{ waitFor: HYDRATED, timeoutMs: 45_000 },
		{ evaluate: FLIP },
		{
			evaluate: TYPE_THEN_PRESS('The lower chord buckled first.', '[data-testid="link-next"]', 'click'),
			waitMs: 100
		},
		{ waitFor: DOCUMENTS_AT_LEAST(2), timeoutMs: 15_000 },
		{ waitFor: `() => location.pathname === '/dev/deploy-safety/next'`, timeoutMs: 15_000 }
	],
	orderResult: [
		{
			evaluate: READ_BETWEEN('click', null),
			expected: [
				'documents 1',
				'to /dev/deploy-safety/next',
				'verdicts reload/goto',
				'acknowledged first yes'
			],
			label:
				'exactly one full page load, to the link target, by the save guard re-issuing the link after the answer was acknowledged'
		}
	],
	presence: [
		{
			selector: '[data-testid="arrived"]',
			label: 'the link target, arrived at',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],
	contrast: [{ selector: '[data-testid="ds-bar"] .ds-chip', label: 'the harness counters', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="link-back"]', label: 'Back to the assignment' }]
};
