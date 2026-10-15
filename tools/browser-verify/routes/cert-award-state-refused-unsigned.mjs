import { certHydrated } from './_cert-desk.mjs';

/**
 * THE AWARD REFUSED FOR WANT OF A SIGNING KEY: the dialog stays open, the
 * server's sentence renders verbatim inside it as a bad notice, and the Award
 * key is enabled again so a set key can be tried without reloading.
 */
export default {
	path: '/dev/cert-award?state=refused-unsigned',
	label: 'IDEA Certifications award: the no-signing-key refusal, verbatim, in the dialog',
	prepare: certHydrated('award'),
	presence: [
		{ selector: '[data-testid="cert-award-dialog"][data-open="yes"]', label: 'the dialog is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-problem"]', label: 'one refusal notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-commit"]:not([aria-disabled])', label: 'the Award key is enabled again', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cert-award-problem"]', label: 'the admin-facing sentence', must: ['CERT_SIGNING_PRIVATE_KEY is not set', 'Nothing is ever awarded unsigned'] }
	],
	contrast: [{ selector: '[data-testid="cert-award-problem"] span:not(.cert-notice-glyph)', label: 'the refusal words', min: 4.5 }]
};
