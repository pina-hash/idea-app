/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA CERTIFICATIONS, MY CERTIFICATIONS (ledger 0391): the real
 * `MyCertifications` over a person holding two valid awards (one renewing),
 * one expired award, one active attempt, one dormant and one withdrawn. What
 * has to be true: earned awards are grouped by category then level, each with
 * its serial, date, status in a word, Print certificate and Verify; the
 * in-progress attempt says "n of 5 parts done"; the history is a closed
 * Disclosure holding exactly the withdrawn, the dormant and the expired.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_PRESENCE, SHELL_TAP_TARGETS } from './_cert.mjs';

export default {
	path: '/dev/cert-me',
	label: 'IDEA Certifications: My certifications (earned, in progress, history)',
	prepare: [...certHydrated('me')],
	presence: [
		...SHELL_PRESENCE,
		{ selector: '[data-testid="cert-award-card"]', label: 'two earned awards (the expired one is history)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-award-card"][data-status="valid"]', label: 'both valid', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-award-print"]', label: 'each with Print certificate', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-award-verify"]', label: 'and Verify', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '.cert-me-category', label: 'two categories', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-me-attempt"]', label: 'one attempt in progress', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-me-history-toggle"][aria-expanded="false"]', label: 'the history is closed on arrival', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-me-history-row"]', label: 'three history rows in the DOM (withdrawn, dormant, expired), hidden until opened', expectPresent: 3, maxPresent: 3, maxVisible: 0 },
		{ selector: '[data-testid="cert-me-history-row"][data-kind="expired"]', label: 'one of them the expired award', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-me-no-awards"], [data-testid="cert-me-no-progress"]', label: 'no empty-state words while there is content (the control)', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cert-award-card"][data-code="SAFE-1"]', label: 'the renewing award names its serial, date and expiry', must: ['IDEA-7K3Q-M9XD-2HTR-W4PB', 'August 20, 2026', 'Mr. Pina', 'Expires', 'August 16, 2027', 'Valid'] },
		{ selector: '[data-testid="cert-me-progress"]', label: 'progress in words', must: ['1 of 5 parts done'] },
		{ selector: '[data-testid="cert-me-attempt"]', label: 'and what is next', must: ['Next: Guided project'] },
		{ selector: '[data-testid="cert-me-history-toggle"]', label: 'the history trigger counts its items', must: ['History', '3 items'] },
		{ selector: '[data-testid="cert-me"]', label: 'no address', mustNot: ['@boscotech'] }
	],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-testid="cert-award-print"]', label: 'Print certificate', min: 44 },
		{ selector: '[data-testid="cert-award-verify"]', label: 'Verify', min: 44 },
		{ selector: '[data-testid="cert-me-attempt"] .btn', label: 'Continue', min: 44 },
		{ selector: '.cert-me-attempt-name', label: 'the attempt name link', min: 44 },
		{ selector: '[data-testid="cert-me-history-toggle"]', label: 'the History disclosure', min: 44 }
	],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.cert-award-name', label: 'award names', min: 4.5 },
		{ selector: '.cert-award-facts dd', label: 'award facts', min: 4.5 },
		{ selector: '.cert-award-facts dt', label: 'fact labels', min: 4.5 },
		{ selector: '.cert-serial', label: 'serials', min: 4.5 },
		{ selector: '[data-testid="cert-award-status"]', label: 'the Valid readouts', min: 4.5 },
		{ selector: '.cert-me-attempt-name', label: 'the attempt name', min: 4.5 },
		{ selector: '[data-testid="cert-me-progress"]', label: 'the progress readout (info ink)', min: 4.5 },
		{ selector: '.cert-me-attempt .cert-help', label: 'the attempt line', min: 4.5 },
		{ selector: '.cert-award', label: 'card edges', min: 3 }
	]
};
