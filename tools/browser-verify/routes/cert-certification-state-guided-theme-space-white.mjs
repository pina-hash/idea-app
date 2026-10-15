/**
 * THE CERTIFICATION PAGE UNDER SPACE WHITE (ledger 0391), in the state with
 * the most on it: training done, the guided project's form open with its dark
 * Submit, every hint closed, the exam locked. Re-measured here because the
 * checklist's state words and the form's reasons carry tone inks that were
 * measured on the dark grounds first.
 */
import { certHydrated, SHELL_CONTRAST, SHELL_TAP_TARGETS, SPACE_WHITE_ON } from './_cert.mjs';

export default {
	path: '/dev/cert-certification?state=guided&theme=space-white',
	label: 'IDEA Certifications: the certification page (guided project open) under Space White',
	prepare: [...certHydrated('certification'), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-check-row"]', label: 'five parts', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="cert-check-row"][data-state="done"]', label: 'one done', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-submission-form"][data-part="guided"]', label: 'the guided form is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-submit"][aria-disabled="true"]', label: 'its Submit is dark, aria-disabled', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-step-hint"][aria-expanded="false"]', label: 'three hints closed', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-kit-section"]', label: 'nine sections', expectPresent: 9, maxPresent: 9, expectVisible: 9 }
	],
	textContains: [{ selector: '[data-testid="cert-check-row"][data-part="exam"]', label: 'the exam row says what unlocks it', must: ['Unlocks after Guided project'] }],
	tapTargets: [
		...SHELL_TAP_TARGETS,
		{ selector: '[data-testid="cert-check-open"]', label: 'the checklist Open keys', min: 44 },
		{ selector: '[data-testid="cert-withdraw"]', label: 'Withdraw', min: 44 },
		{ selector: '[data-testid="cert-submit"]', label: 'Submit for review', min: 44 },
		{ selector: '.cert-kit-section .disc-trigger', label: 'the section disclosures', min: 44 },
		{ selector: '[data-testid="cert-self-inspection"] .cert-choice', label: 'self-inspection boxes', min: 44 }
	],
	contrast: [
		...SHELL_CONTRAST,
		{ selector: '.cert-check-word', label: 'the part words', min: 4.5 },
		{ selector: '.cert-check-state', label: 'the state words', min: 4.5 },
		{ selector: '.cert-check-row.is-done .cert-check-state', label: 'the Done word in green on the light plate', min: 4.5 },
		{ selector: '.cert-check-desc', label: 'the part descriptions', min: 4.5 },
		{ selector: '.cert-check-meta', label: 'who checked it and when', min: 4.5 },
		{ selector: '.cert-kit-section .disc-label', label: 'the section labels', min: 4.5 },
		{ selector: '.cert-definition dd', label: 'the definition facts', min: 4.5 },
		{ selector: '.cert-step-title', label: 'step titles', min: 4.5 },
		{ selector: '.cert-submission-why li', label: 'the Submit reasons', min: 4.5 },
		{ selector: '.cert-field > label, .cert-field > span', label: 'form labels', min: 4.5 },
		{ selector: '.cert-form-why', label: 'why a form is shut', min: 4.5 },
		{ selector: '.cert-notice', label: 'the outside-help notice', min: 4.5 },
		{ selector: '.cert-readout', label: 'readouts', min: 4.5 },
		{ selector: '.cert-kit-section', label: 'section edges', min: 3 },
		{ selector: '.cert-check-glyph', label: 'checklist glyph rings', min: 3 }
	]
};
