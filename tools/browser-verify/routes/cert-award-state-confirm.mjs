import { certHydrated } from './_cert-desk.mjs';

/**
 * THE AWARD CONFIRM: every part checked, the key lit, and the native dialog
 * open on load with the exact record as facts (student, email, certification,
 * code, level, category, date, expiry, certifier) under the confirm sentence,
 * with Cancel and Award.
 */
export default {
	path: '/dev/cert-award?state=confirm',
	label: 'IDEA Certifications award: the confirm dialog with the exact record',
	prepare: certHydrated('award'),
	orderResult: [
		{ label: 'the dialog is modal (showModal)', evaluate: `() => { const d = document.querySelector('[data-testid="cert-award-dialog"]'); return [d && d.open && d.matches(':modal') ? 'modal' : 'not modal']; }`, expected: ['modal'] }
	],
	presence: [
		{ selector: '[data-testid="cert-award-key"]:not([aria-disabled])', label: 'the award key is lit', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-held"]', label: 'no held sentence while lit', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-award-ready"]', label: 'the ready sentence instead (the control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-dialog"][data-open="yes"]', label: 'the dialog is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-award-facts"] dd', label: 'nine facts', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="cert-award-cancel"], [data-testid="cert-award-commit"]', label: 'Cancel and Award', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-award-problem"]', label: 'no refusal shown', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cert-award-dialog"]', label: 'the title, the sentence and the record', must: ['Record this award', 'cannot be undone', 'Ben Okafor', 'ben.okafor@boscotech.net', 'Manual Mill Level 1', 'MILL-1', 'Machining', 'Mr. Pina', 'Never'] }
	],
	tapTargets: [
		{ selector: '[data-testid="cert-award-cancel"], [data-testid="cert-award-commit"]', label: 'the dialog keys', min: 44 },
		{ selector: '[data-testid="cert-award-key"]', label: 'the award key', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="cert-award-dialog"] h2', label: 'the dialog title', min: 4.5 },
		{ selector: '[data-testid="cert-award-dialog"] > p', label: 'the confirm sentence', min: 4.5 },
		{ selector: '[data-testid="cert-award-facts"] dt', label: 'fact labels', min: 4.5 },
		{ selector: '[data-testid="cert-award-facts"] dd', label: 'fact values', min: 4.5 },
		{ selector: '[data-testid="cert-award-cancel"], [data-testid="cert-award-commit"]', label: 'key words', min: 4.5 }
	]
};
