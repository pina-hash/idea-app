/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { certHydrated } from './_cert-desk.mjs';

/**
 * TELEMETRY WITH DATA: the nine tiles, six plain-SVG bar charts (one bar per
 * row, the figure printed at its end, a legend in words) and the stalled list.
 */
export default {
	path: '/dev/cert-telemetry',
	label: 'IDEA Certifications telemetry: tiles and plain-SVG charts with data',
	prepare: certHydrated('telemetry'),
	orderResult: [
		{ label: 'the active chart draws two bars for each of its three rows', evaluate: `() => [(() => document.querySelectorAll('[data-chart="active"] svg rect.bar').length)()]`, expected: [6] },
		{ label: 'every bar chart prints a figure beside every bar', evaluate: `() => [(() => [...document.querySelectorAll('[data-testid="cert-chart"] svg.cert-chart')].every((s) => s.querySelectorAll('rect.bar').length === s.querySelectorAll('text').length - s.querySelectorAll('g.row').length) ? 'every figure printed' : 'a bar without its figure')()]`, expected: ['every figure printed'] }
	],
	presence: [
		{ selector: '[data-testid="cert-tile"]', label: 'nine tiles', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="cert-chart"]', label: 'seven chart panels', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-chart"] svg.cert-chart', label: 'six SVG charts', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-chart="stalled"] .dk-row', label: 'one stalled attempt as a row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-chart-empty"]', label: 'nothing says it is empty', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-chart"] .dk-legend', label: 'a legend under every drawn chart', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	textContains: [
		{ selector: '[data-chart="exam-topics"]', label: 'topics by their own words', must: ['MILL-1 setup', 'MILL-1 speeds', 'SAFE-1 ppe', '% correct'] },
		{ selector: '[data-chart="stalled"]', label: 'the stalled row in words', must: ['Cy Nguyen', '41 days idle'] }
	],
	contrast: [
		{ selector: '[data-testid="cert-tile-figure"]', label: 'tile figures', min: 4.5 },
		{ selector: '.dk-tile-word', label: 'tile words', min: 4.5 },
		{ selector: '[data-testid="cert-chart"] h2', label: 'chart titles', min: 4.5 },
		{ selector: '.dk-legend li', label: 'legends', min: 4.5 },
		{ selector: '[data-chart="stalled"] .dk-row-name', label: 'the stalled name', min: 4.5 }
	]
};
