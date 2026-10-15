import { SPACE_WHITE_ON, certHydrated } from './_cert-desk.mjs';

/** THE AWARD CONFIRM UNDER SPACE WHITE: the dialog, its facts and its keys on the light grounds. */
export default {
	path: '/dev/cert-award?state=confirm&theme=space-white',
	label: 'IDEA Certifications award confirm under Space White',
	prepare: [...certHydrated('award'), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-award-dialog"][data-open="yes"]', label: 'the dialog is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-facts"] dd', label: 'nine facts', expectPresent: 9, maxPresent: 9, expectVisible: 9 }
	],
	tapTargets: [{ selector: '[data-testid="cert-award-cancel"], [data-testid="cert-award-commit"]', label: 'the dialog keys', min: 44 }],
	contrast: [
		{ selector: '[data-testid="cert-award-dialog"] h2', label: 'the dialog title', min: 4.5 },
		{ selector: '[data-testid="cert-award-dialog"] > p', label: 'the confirm sentence', min: 4.5 },
		{ selector: '[data-testid="cert-award-facts"] dt', label: 'fact labels', min: 4.5 },
		{ selector: '[data-testid="cert-award-facts"] dd', label: 'fact values', min: 4.5 },
		{ selector: '[data-testid="cert-award-cancel"], [data-testid="cert-award-commit"]', label: 'key words', min: 4.5 },
		{ selector: '[data-testid="cert-award-dialog"]', label: 'the dialog edge', min: 3 }
	]
};
