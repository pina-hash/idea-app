/**
 * THE EMAIL HARNESS UNDER SPACE WHITE (ledger 0391, surface f), on the award
 * email: the harness's own words (the subject, the labels, the text part on
 * its well, the lit key) re-measured on the light plate. The email inside the
 * frames is its own paper and does not follow the site theme.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_TAP_TARGETS, SPACE_WHITE_ON } from './_cert.mjs';

export default {
	path: '/dev/cert-emails?kind=awarded&theme=space-white',
	label: 'IDEA Certifications: the award email on the harness under Space White',
	prepare: [...certHydrated('emails'), SPACE_WHITE_ON],
	ignoreConsole: ['idea-logo-600\\.png', 'ERR_FAILED', 'ERR_BLOCKED_BY_CLIENT'],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-email"][data-kind="awarded"]', label: 'the award email', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-emails-key"][data-kind="awarded"].on', label: 'its key lit', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [...SHELL_TAP_TARGETS, { selector: '[data-testid="cert-emails-key"], [data-testid="cert-emails-all"]', label: 'the kind keys', min: 44 }],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.ce-kind', label: 'the kind heading', min: 4.5 },
		{ selector: '.ce-subject', label: 'the subject', min: 4.5 },
		{ selector: '.ce-label', label: 'the mono labels', min: 4.5 },
		{ selector: '.ce-to', label: 'the recipient', min: 4.5 },
		{ selector: '.ce-pre', label: 'the text part on the light well', min: 4.5 },
		{ selector: '[data-testid="cert-email-subject-length"]', label: 'the length readout (green on the light panel)', min: 4.5 },
		{ selector: '[data-testid="cert-emails-key"].on', label: 'the lit key word', min: 4.5 },
		{ selector: '[data-testid="cert-emails-key"]:not(.on)', label: 'the other key words', min: 4.5 },
		{ selector: '.ce-iframe', label: 'the frame edges on the light plate', min: 3 }
	]
};
