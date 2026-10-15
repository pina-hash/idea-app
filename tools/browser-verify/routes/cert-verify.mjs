/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA CERTIFICATIONS, THE PUBLIC VERIFY PAGE (ledger 0391): every state
 * stacked on /dev/cert-verify through the real `VerifyPage`. What has to be
 * true: ONE large status panel per answer with the state's word, a glyph and
 * a tone, never colour alone; the facts and the "Check it yourself" disclosure
 * only for a found record; a serial nothing matches says "No such certificate."
 * and NOTHING about which check failed; no email anywhere; the serial box and
 * the Check key clear 44px.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_PRESENCE, SHELL_TAP_TARGETS } from './_cert.mjs';

export default {
	path: '/dev/cert-verify',
	label: 'IDEA Certifications: verify by serial (valid, suspended, revoked, expired, none, limited, idle)',
	prepare: [...certHydrated('verify')],
	presence: [
		...SHELL_PRESENCE,
		{ selector: '[data-view="valid"] [data-testid="cert-verify-result"][data-state="valid"]', label: 'a valid record: one status panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="valid"] [data-testid="cert-verify-facts"]', label: 'with its facts', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="valid"] [data-testid="cert-verify-check"]', label: 'and Check it yourself', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="valid"] [data-testid="cert-verify-check"][aria-expanded="false"]', label: 'closed on arrival', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="valid"] [data-testid="cert-verify-payload"]', label: 'the signed payload is in the DOM (hidden until opened)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-view="suspended"] [data-testid="cert-verify-result"][data-state="suspended"]', label: 'suspended', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="revoked"] [data-testid="cert-verify-result"][data-state="revoked"]', label: 'revoked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="expired"] [data-testid="cert-verify-result"][data-state="expired"]', label: 'expired', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="none"] [data-testid="cert-verify-result"][data-state="none"]', label: 'no such certificate', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="none"] [data-testid="cert-verify-facts"], [data-view="none"] [data-testid="cert-verify-check"]', label: 'and no facts, no payload (the control)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="limited"] [data-testid="cert-verify-facts"]', label: 'rate limited: no facts', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="idle"] [data-testid="cert-verify-serial"]', label: 'nothing asked yet: no serial echoed', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-verify-input"]', label: 'one serial box per form', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-verify-input"][placeholder="IDEA-XXXX-XXXX-XXXX-XXXX"]', label: 'with the serial shape as its placeholder', expectPresent: 7, maxPresent: 7 }
	],
	textContains: [
		{ selector: '[data-view="valid"] [data-testid="cert-verify-result"]', label: 'the valid words and facts', must: ['Valid', 'genuine and in good standing', 'Ana Reyes', 'Manual Mill Level 1', 'MILL-1', 'November 5, 2026', 'Mr. Pina', 'Never', 'IDEA-7K3Q-M9XD-2HTR-W4PB'] },
		{ selector: '[data-view="valid"] [data-testid="cert-verify-input"]', label: 'the box keeps what was typed', mustNot: ['@'] },
		{ selector: '[data-view="suspended"] [data-testid="cert-verify-title"]', label: 'suspended', must: ['Suspended'] },
		{ selector: '[data-view="revoked"] [data-testid="cert-verify-title"]', label: 'revoked', must: ['Revoked'] },
		{ selector: '[data-view="expired"] [data-testid="cert-verify-result"]', label: 'expired with its date', must: ['Expired', 'August 17, 2026'] },
		{ selector: '[data-view="none"] [data-testid="cert-verify-result"]', label: 'no such certificate, and nothing about why', must: ['No such certificate.'], mustNot: ['signature', 'key', 'mismatch'] },
		{ selector: '[data-view="limited"] [data-testid="cert-verify-result"]', label: 'rate limited, in one sentence', must: ['Too many checks from this connection. Try again in a minute.'] },
		{ selector: '[data-testid="cert-root"]', label: 'no email anywhere on the page', mustNot: ['@boscotech', '@gmail'] }
	],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-testid="cert-verify-input"]', label: 'the serial box', min: 44 },
		{ selector: '[data-testid="cert-verify-check"]', label: 'Check', min: 44 },
		{ selector: '[data-view="valid"] [data-testid="cert-verify-check"]', label: 'Check it yourself', min: 44 }
	],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.cert-verify-title', label: 'the status words', min: 4.5 },
		{ selector: '.cert-verify-body', label: 'the status sentence', min: 4.5 },
		{ selector: '.cert-verify-serial', label: 'the echoed serial', min: 4.5 },
		{ selector: '[data-view="valid"] .cert-verify-facts dd', label: 'the facts', min: 4.5 },
		{ selector: '[data-view="valid"] .cert-verify-facts dt', label: 'the fact labels', min: 4.5 },
		{ selector: '.cert-verify-field > span', label: 'the Serial label', min: 4.5 },
		{ selector: '.cert-verify-form .cert-help', label: 'the typing help', min: 4.5 },
		{ selector: '.cert-verify-glyph', label: 'the status glyph rings', min: 3 },
		{ selector: '.cert-verify-result', label: 'the panel edges', min: 3 }
	]
};
