import { certHydrated } from './_cert-desk.mjs';

/**
 * THE IMPORT PAGE AFTER STEP 1: the summary as facts, the diff as a table of
 * path, before and after, no problems, and the Import key free. Step 2 is a
 * press this spec does not make (it navigates away).
 */
export default {
	path: '/dev/cert-engine?state=import-diff',
	label: 'IDEA Certifications engine: a package checked, the diff before Import',
	prepare: certHydrated('engine'),
	presence: [
		{ selector: '[data-testid="cert-import-summary"] dd', label: 'seven summary facts', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-package-change"]', label: 'three changes', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-import-problems"]', label: 'no problems', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-import-confirm"]:not([aria-disabled])', label: 'Import is free', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-import-check"][aria-disabled="true"]', label: 'Check is held until a file is picked (the control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cert-import-summary"]', label: 'the outcome in words', must: ['A new revision of an existing certification', 'MILL-1'] },
		{ selector: '[data-testid="cert-package-diff"]', label: 'paths and values', must: ['certification.json/definition', 'videos.json/items[2]', '42 questions'] }
	],
	tapTargets: [{ selector: '[data-testid="cert-import-check"], [data-testid="cert-import-confirm"]', label: 'the two step keys', min: 44 }],
	contrast: [
		{ selector: '[data-testid="cert-import-summary"] dd', label: 'summary values', min: 4.5 },
		{ selector: '[data-testid="cert-package-change"] td', label: 'diff cells', min: 4.5 }
	]
};
