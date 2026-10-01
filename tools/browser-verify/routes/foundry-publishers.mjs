/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE TRUSTED-PUBLISHER APPLICATION (ledger 0360, report 6d076258).
 *
 * THE ABSENCE THAT MATTERS: the student form shows the six questions and no
 * word saying which are tricks, which answers are red flags, or what the
 * reviewer looks for. The admin panel on the same page shows all three, which
 * is the positive control for that absence.
 *
 * The admin panels sit on the admin-only review page, but nothing there
 * declares an instructor density, so they are measured at the student floor.
 */
export default {
	path: '/dev/foundry-publishers',
	label: 'Foundry publishers: the student application and the admin decision (report 6d076258)',
	presence: [
		{ selector: '[data-state="open"] fieldset.fdy-apply-q', label: 'the six questions on the student form', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-state="open"] input[type="radio"]', label: 'the seven choices of the two choice questions', expectPresent: 7, maxPresent: 7 },
		{ selector: '[data-state="open"] [data-testid="foundry-publisher-send"]', label: 'the student Send control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-state="pending"] [data-standing="pending"]', label: 'the waiting state', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-state="pending"] fieldset', label: 'no form while an application waits', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-state="cooldown"] [data-standing="cooldown"]', label: 'the cooldown state', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-state="unavailable"] [data-testid="foundry-publisher-unavailable"]', label: 'the not-on-yet sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-publisher-application"]', label: 'the one pending application', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-publisher-approve"]', label: 'one Approve key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-publisher-decline"]', label: 'one Decline key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-publisher-question"]', label: 'the six editable questions', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="harness-admin"] [data-testid="foundry-trust-roster"]', label: 'the trusted roster, on the publishers page', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="harness-student"]', label: 'the student page never marks a trick', must: ['Send my application'], mustNot: ['Trick question', 'Red flag', 'What to look for'] },
		{ selector: '[data-testid="foundry-publisher-applications"]', label: 'POSITIVE CONTROL: the admin panel marks all three', must: ['Trick question', 'Red flag', 'What to look for', 'ana.reyes.2029@boscotech.net'] }
	],
	tapTargets: [
		{ selector: '[data-state="open"] [data-testid="foundry-publisher-send"]', label: 'Send my application', min: 44 },
		{ selector: '[data-state="open"] .fdy-apply-choice', label: 'each choice row', min: 44 },
		{ selector: '[data-testid="foundry-publisher-approve"], [data-testid="foundry-publisher-decline"]', label: 'Approve and Decline', min: 44 },
		{ selector: '.fdy-pq-row-do .btn', label: 'Up, Down and Retire', min: 44 },
		{ selector: '.fdy-rnav a.fdy-rnav-key', label: 'the review keys', min: 44 }
	],
	contrast: [
		{ selector: '[data-state="open"] .fdy-apply-q legend', label: 'a question', min: 4.5 },
		{ selector: '[data-state="open"] .fdy-apply-choice span', label: 'a choice', min: 4.5 },
		{ selector: '[data-state="open"] .fdy-apply-count', label: 'the character count', min: 4.5 },
		{ selector: '.fdy-pa-prompt', label: 'an answered prompt', min: 4.5 },
		{ selector: '.fdy-pa-said-text', label: 'an answer', min: 4.5 },
		{ selector: '.fdy-pa-tag', label: 'the trick tag', min: 4.5 },
		{ selector: '.fdy-pa-email', label: 'the applicant address', min: 4.5 },
		{ selector: '.fdy-pq-field > span', label: 'an editor label', min: 4.5 }
	]
};
