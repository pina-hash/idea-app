/**
 * THE AWARD EMAIL ALONE (ledger 0391, surface f): /dev/cert-emails?kind=awarded
 * renders only that kind, with its key lit, which is the page a screenshot of
 * the award email is taken of. The spec holds the single-kind contract: one
 * email, one lit kind key, Show all not lit, and the award's subject, serial
 * and verify URL.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_TAP_TARGETS } from './_cert.mjs';
import { FRAMES_CARRY_IDENTITY, NO_EM_DASH, SUBJECTS_UNDER_70 } from './cert-emails.mjs';

export default {
	path: '/dev/cert-emails?kind=awarded',
	label: 'IDEA Certifications: the award email alone',
	prepare: [...certHydrated('emails')],
	ignoreConsole: ['idea-logo-600\\.png', 'ERR_FAILED', 'ERR_BLOCKED_BY_CLIENT'],
	orderResult: [
		{ label: 'the subject is 70 characters or under', evaluate: SUBJECTS_UNDER_70, expected: ['1 subjects, all 70 or under'] },
		{ label: 'no em dash', evaluate: NO_EM_DASH, expected: ['no em dash in 1 subjects, 1 text parts and 1 documents'] },
		{ label: 'both frames carry the identity', evaluate: FRAMES_CARRY_IDENTITY, expected: ['2 of 2 documents carry the mark, the footer and tables, and no script'] }
	],
	presence: [
		{ selector: '[data-testid="cert-email"]', label: 'one email', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-email"][data-kind="awarded"]', label: 'the award', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-emails-key"][data-kind="awarded"].on', label: 'its key lit', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-emails-key"].on', label: 'and only its key', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-emails-all"].on', label: 'Show all not lit', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-emails-all"]', label: 'but offered (the control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cert-email-subject"]', label: 'the subject', must: ['MILL-1: awarded, serial IDEA-7K3Q-M9XD-2HTR-W4PB'] },
		{ selector: '[data-testid="cert-email-text"]', label: 'the serial and the verify URL in the text part', must: ['Serial: IDEA-7K3Q-M9XD-2HTR-W4PB', 'https://ideabosco.com/certifications/verify?serial=IDEA-7K3Q-M9XD-2HTR-W4PB', 'Hello Ana Reyes,'], mustNot: ['—'] }
	],
	tapTargets: [...SHELL_TAP_TARGETS, { selector: '[data-testid="cert-emails-key"], [data-testid="cert-emails-all"]', label: 'the kind keys', min: 44 }],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.ce-subject', label: 'the subject', min: 4.5 },
		{ selector: '.ce-pre', label: 'the text part', min: 4.5 },
		{ selector: '[data-testid="cert-emails-key"].on', label: 'the lit key word', min: 4.5 }
	]
};
