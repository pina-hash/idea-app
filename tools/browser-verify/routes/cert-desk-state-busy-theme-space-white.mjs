import { SPACE_WHITE_ON, certHydrated } from './_cert-desk.mjs';

/**
 * THE DESK UNDER SPACE WHITE: the same rows, tiles and charts measured on the
 * light grounds. The room reads only register tokens, so a light twin is the
 * theme's job and this spec is what proves it painted.
 */
export default {
	path: '/dev/cert-desk?state=busy&theme=space-white',
	label: 'IDEA Certifications desk under Space White',
	prepare: [...certHydrated('desk'), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cert-queue-row"]', label: 'two submissions waiting', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-tile"]', label: 'nine tiles', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="cert-chart"] svg.cert-chart', label: 'six SVG charts', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	tapTargets: [
		{ selector: '[data-testid="cert-desk-tabs"] .cert-tab', label: 'the desk tabs', min: 44 },
		{ selector: '[data-testid="cert-queue-review"]', label: 'Review keys', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="cert-desk-tabs"] .cert-tab', label: 'tab words', min: 4.5 },
		{ selector: '[data-testid="cert-queue-row"] .dk-row-name', label: 'student names', min: 4.5 },
		{ selector: '[data-testid="cert-queue-row"] .dk-row-meta', label: 'meta words', min: 4.5 },
		{ selector: '[data-testid="cert-queue-row"] .cert-readout', label: 'the part readouts', min: 4.5 },
		{ selector: '[data-testid="cert-tile-figure"]', label: 'tile figures', min: 4.5 },
		{ selector: '.dk-tile-word', label: 'tile words', min: 4.5 },
		{ selector: '.dk-legend li', label: 'chart legends', min: 4.5 },
		{ selector: '.cert-panel', label: 'panel edges', min: 3 }
	]
};
