/**
 * The student coin page for a STUDENT AUDITOR (0245): the auditor block lists
 * two classmates' counts with Approve and Deny and says that every check
 * carries the auditor's name and none can be their own; an automatic fine
 * already disputed shows "waiting for your teacher" and no second Dispute key;
 * nothing is held, so coins out is a form with its first press.
 */
export default {
	path: '/dev/coin-balance?scenario=auditor',
	label: 'Student coin page (V2): Student Auditor, a disputed fine, coins out form',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-coin-hydrated]")' }],
	presence: [
		{ selector: '[data-testid="coin-auditor"]', label: 'the auditor block', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="audit-row"]', label: 'two classmates waiting', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="audit-approve"]', label: 'Approve on each', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="audit-deny"]', label: 'Deny on each', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="coin-dispute-state"]', label: 'the dispute, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-dispute"]', label: 'no second Dispute while one waits', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="payout-arm"]', label: 'coins out, a first press', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="payout-held"]', label: 'nothing held', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="coin-auditor"]', label: 'the auditor rules', must: ['carries your name', 'never check your own', 'Mateo Ruiz', 'Priya Shah'] },
		{ selector: '[data-testid="coin-dispute-state"]', label: 'waiting', must: ['waiting for your teacher'] }
	],
	tapTargets: [
		{ selector: '[data-testid="coin-page"] button', label: 'every button', min: 44 },
		{ selector: '[data-testid="coin-auditor"] input', label: 'the note fields', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="coin-auditor"] .cpx-name', label: 'classmate names', min: 4.5 },
		{ selector: '[data-testid="coin-auditor"] .cpx-meta', label: 'their counts', min: 4.5 },
		{ selector: '[data-testid="coin-dispute-state"]', label: 'the dispute chip', min: 4.5 },
		{ selector: '[data-testid="payout-blocked"]', label: 'why coins out waits', min: 4.5 }
	]
};
