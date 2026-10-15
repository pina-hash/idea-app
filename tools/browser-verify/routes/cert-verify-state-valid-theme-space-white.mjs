/**
 * THE VERIFY PAGE UNDER SPACE WHITE (ledger 0391), on a valid record with
 * "Check it yourself" opened: the green status ring, the payload `<pre>` on
 * the light well and the mono serial are the rows whose contrast changes with
 * the plate.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_TAP_TARGETS, SPACE_WHITE_ON } from './_cert.mjs';

export default {
	path: '/dev/cert-verify?state=valid&theme=space-white',
	label: 'IDEA Certifications: a valid certificate on the verify page under Space White, with Check it yourself open',
	prepare: [
		...certHydrated('verify'),
		SPACE_WHITE_ON,
		{ click: '[data-testid="cert-verify-check"]', until: `() => document.querySelector('[data-testid="cert-verify-check"]')?.getAttribute('aria-expanded') === 'true'` }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-verify-result"][data-state="valid"]', label: 'the valid panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-verify-payload"]', label: 'the payload, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-verify-signature"]', label: 'the signature, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-verify-public-key"]', label: 'the public key link', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cert-verify-payload"]', label: 'the payload is the canonical eight keys, a hash and never an address', must: ['"v": 1', '"serial"', '"email_sha256"', '"certifier_name"'], mustNot: ['@'] }
	],
	tapTargets: [...SHELL_TAP_TARGETS, { selector: '[data-testid="cert-verify-input"]', label: 'the serial box', min: 44 }, { selector: '[data-testid="cert-verify-check"]', label: 'Check', min: 44 }, { selector: '[data-testid="cert-verify-public-key"]', label: 'the public key link', min: 24 }],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.cert-verify-title', label: 'the status word', min: 4.5 },
		{ selector: '.cert-verify-body', label: 'the status sentence', min: 4.5 },
		{ selector: '.cert-verify-facts dd', label: 'the facts', min: 4.5 },
		{ selector: '.cert-verify-facts dt', label: 'the fact labels', min: 4.5 },
		{ selector: '.cert-verify-pre', label: 'the payload and signature on the well', min: 4.5 },
		{ selector: '.cert-verify-serial', label: 'the serial', min: 4.5 },
		{ selector: '.cert-verify-ok .cert-verify-glyph', label: 'the green status ring on the light plate', min: 3 }
	]
};
