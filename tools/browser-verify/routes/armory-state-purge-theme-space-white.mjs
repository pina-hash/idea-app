/**
 * DELETE FOREVER UNDER SPACE WHITE: the cost sentence, the box's label, the
 * danger key and the held-key sentence, measured on the light plate's panel.
 */
import { ARMORY_HYDRATED } from './_armory.mjs';

export default {
	path: '/dev/armory?state=purge&theme=space-white',
	label: 'IDEA Armory: Delete forever under Space White',
	prepare: [
		...ARMORY_HYDRATED,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ waitFor: `() => /212 files/.test(document.querySelector('[data-testid="armory-purge-cost"]')?.textContent ?? '')`, timeoutMs: 10000 }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="armory-purge-key"][aria-disabled="true"]', label: 'the key waits for the name', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="armory-purge-cost"]', label: 'the cost sentence', min: 4.5 },
		{ selector: '[data-testid="armory-purge"] .ar-field > span', label: 'the box label', min: 4.5 },
		{ selector: '[data-testid="armory-purge-key"]', label: 'the danger key', min: 4.5 },
		{ selector: '[data-testid="armory-archived-notice"]', label: 'the archived notice', min: 4.5 },
		{ selector: '.ar-tab', label: 'the tabs', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="armory-purge"] :is(input, button)', label: 'the box and the key', min: 44 }]
};
