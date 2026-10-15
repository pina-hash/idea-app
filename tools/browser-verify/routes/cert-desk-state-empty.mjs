import { certHydrated } from './_cert-desk.mjs';

/**
 * THE DESK WITH NOTHING WAITING: the queue and the requests say so in words,
 * every tile reads a figure of zero with its word, and every chart says there
 * is nothing to chart yet rather than drawing an empty axis.
 */
export default {
	path: '/dev/cert-desk?state=empty',
	label: 'IDEA Certifications desk: nothing waiting',
	prepare: certHydrated('desk'),
	presence: [
		{ selector: '[data-testid="cert-desk-queue-empty"]', label: 'the queue says nothing is waiting', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-queue-row"]', label: 'and holds no row', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-desk-requests-empty"]', label: 'the requests say nothing is waiting', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-tile"]', label: 'the nine tiles still draw', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="cert-chart-empty"]', label: 'every chart says nothing to chart yet', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-chart"] svg.cert-chart', label: 'and no empty axis is drawn', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="cert-telemetry"]', label: 'the words', must: ['Nothing to chart yet.'] }],
	contrast: [
		{ selector: '[data-testid="cert-desk-queue-empty"]', label: 'the empty sentence', min: 4.5 },
		{ selector: '[data-testid="cert-chart-empty"]', label: 'the chart sentences', min: 4.5 }
	]
};
