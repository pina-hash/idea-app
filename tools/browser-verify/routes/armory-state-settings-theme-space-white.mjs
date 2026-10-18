/**
 * THE SOLIDWORKS VERSION UNDER SPACE WHITE, ARMED (ledger 0404): the version,
 * the armed key and the cost sentence it puts under itself, measured on the
 * light plate's panel.
 */
import { ARMORY_HYDRATED } from './_armory.mjs';

export default {
	path: '/dev/armory?state=settings&theme=space-white',
	label: 'IDEA Armory: moving the SolidWorks version up, armed, under Space White',
	prepare: [
		...ARMORY_HYDRATED,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ click: '[data-testid="armory-release-raise"]', until: `() => (document.querySelector('[data-testid="armory-release-raise"]')?.textContent ?? '').includes('Press again')` }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="armory-release-cost"][role="alert"]', label: 'the cost is said before the second press', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-release-cancel"]', label: 'and a way to keep 2025', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="armory-release"] :is(.ar-big, .ar-message)', label: 'the version and its sentences', min: 4.5 },
		{ selector: '[data-testid="armory-release"] .btn', label: 'the armed key, the choices and Keep', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="armory-release"] .btn', label: 'the version keys', min: 44 }]
};
