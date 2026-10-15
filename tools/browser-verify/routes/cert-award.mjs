/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { certHydrated } from './_cert-desk.mjs';

/**
 * THE AWARD PAGE, LOCKED: a part still pending, so the award key is dark
 * (`aria-disabled`, never `disabled`, so it can explain itself) with the
 * locked sentence beside it, the checklist naming every part's state, and the
 * dialog closed. The lit state is `cert-award-state-confirm.mjs`.
 */
export default {
	path: '/dev/cert-award',
	label: 'IDEA Certifications award: a part pending, the key dark and saying why',
	prepare: certHydrated('award'),
	presence: [
		{ selector: '[data-testid="cert-award-key"][aria-disabled="true"]', label: 'the award key is dark', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-key"][disabled]', label: 'and never natively disabled', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-award-held"]', label: 'the sentence saying why', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-checklist"] .cert-check-row', label: 'five parts on the checklist', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="cert-award-checklist"] .cert-check-row[data-state="done"]', label: 'one done', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-checklist"] .cert-check-row[data-state="pending"]', label: 'four pending', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="cert-award-dialog"][data-open="yes"]', label: 'the dialog is closed', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-award-facts"]', label: 'no record to show (nothing prepared)', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cert-award-held"]', label: 'the locked sentence', must: ['lights up when every required part is checked'] },
		{ selector: '[data-testid="cert-award-checklist"]', label: 'every part by its word and state', must: ['Training', 'Guided project', 'Exam', 'Autonomous project', 'Checkout', 'Done', 'Pending'] }
	],
	tapTargets: [{ selector: '[data-testid="cert-award-key"]', label: 'the award key (56px by design)', min: 44 }],
	contrast: [
		{ selector: '[data-testid="cert-award-held"]', label: 'the held sentence', min: 4.5 },
		{ selector: '[data-testid="cert-award-checklist"] .cert-check-word', label: 'part words', min: 4.5 },
		{ selector: '[data-testid="cert-award-checklist"] .cert-check-meta', label: 'state words', min: 4.5 }
	]
};
