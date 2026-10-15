import { NO_SIDEWAYS, SPACE_WHITE_ON, certHydrated } from './_cert-desk.mjs';

/** THE ENGINE EDITOR UNDER SPACE WHITE: the sub-bar, the problems and the field labels on the light grounds. */
export default {
	path: '/dev/cert-engine?state=editor&theme=space-white',
	label: 'IDEA Certifications engine editor under Space White',
	prepare: [...certHydrated('engine'), SPACE_WHITE_ON],
	orderResult: [NO_SIDEWAYS],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-engine-subbar"]', label: 'the sub-bar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-engine-problems"] li', label: 'three problems', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cert-engine-editor"] .disc-trigger', label: 'fourteen sections', expectPresent: 14, maxPresent: 14, expectVisible: 14 }
	],
	tapTargets: [
		{ selector: '[data-testid="cert-engine-subbar"] .btn', label: 'the sub-bar keys', min: 44 },
		{ selector: '[data-testid="cert-engine-editor"] .disc-trigger', label: 'the section triggers', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="cert-engine-subbar"] .dk-subbar-code', label: 'the code', min: 4.5 },
		{ selector: '[data-testid="cert-engine-state"]', label: 'the state readout', min: 4.5 },
		{ selector: '[data-testid="cert-engine-problems"] li', label: 'the problems', min: 4.5 },
		{ selector: '[data-testid="cert-engine-editor"] .disc-label', label: 'section words', min: 4.5 },
		{ selector: '[data-testid="cert-engine-editor"] .cert-field > span', label: 'field labels', min: 4.5 },
		{ selector: '[data-testid="cert-engine-subbar"] .btn', label: 'key words', min: 4.5 }
	]
};
