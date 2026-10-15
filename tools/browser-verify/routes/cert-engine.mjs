/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { NO_SIDEWAYS, certHydrated } from './_cert-desk.mjs';

/**
 * THE ENGINE'S LIST: three certifications in three states with their
 * readouts, counts and publish problems, an Open key each, New certification
 * (held until a code and a name are typed), the Import link and the four
 * settings fields.
 */
export default {
	path: '/dev/cert-engine',
	label: 'IDEA Certifications engine: the list, New certification and Settings',
	prepare: certHydrated('engine'),
	orderResult: [NO_SIDEWAYS],
	presence: [
		{ selector: '[data-testid="cert-engine-row"]', label: 'three certifications', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-engine-row"][data-state="published"]', label: 'two published', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-engine-row"][data-state="draft"]', label: 'one draft', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-problems"]', label: 'the draft shows its problem count', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-open"]', label: 'an Open key a row', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-engine-create"][aria-disabled="true"]', label: 'Create draft held until a code and a name', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-import-link"]', label: 'the import link', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-settings"] input', label: 'four settings fields', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="cert-engine-settings-none"]', label: 'settings are available (the control)', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cert-engine-list"]', label: 'states in words', must: ['Published', 'Draft', 'MILL-1', 'SAFE-1', 'LATHE-1'] },
		{ selector: '[data-testid="cert-engine-settings"]', label: 'the four settings by their words', must: ['School-year expiry date', 'Dormancy, days', 'Check-in timeout, seconds', 'Release window, minutes'] }
	],
	tapTargets: [
		{ selector: '[data-testid="cert-engine-open"]', label: 'Open keys', min: 44 },
		{ selector: '[data-testid="cert-engine-import-link"]', label: 'the import link', min: 44 },
		{ selector: '[data-testid="cert-engine-new"] input, [data-testid="cert-engine-create"]', label: 'the create form', min: 44 },
		{ selector: '[data-testid="cert-engine-settings"] input, [data-testid="cert-engine-settings-save"]', label: 'the settings form', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="cert-engine-row"] td', label: 'table cells', min: 4.5 },
		{ selector: '[data-testid="cert-engine-list"] th', label: 'table headings', min: 4.5 },
		{ selector: '[data-testid="cert-engine-row"] .cert-readout', label: 'state readouts', min: 4.5 },
		{ selector: '[data-testid="cert-engine-settings"] .cert-field > span', label: 'field labels', min: 4.5 },
		{ selector: '.cert-panel', label: 'panel edges', min: 3 }
	]
};
