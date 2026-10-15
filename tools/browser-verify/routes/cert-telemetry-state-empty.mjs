import { NO_SIDEWAYS, certHydrated } from './_cert-desk.mjs';

/** TELEMETRY WITH NOTHING: every chart says so in words and no empty axis is drawn. */
export default {
	path: '/dev/cert-telemetry?state=empty',
	label: 'IDEA Certifications telemetry: nothing to chart yet',
	prepare: certHydrated('telemetry'),
	orderResult: [NO_SIDEWAYS],
	presence: [
		{ selector: '[data-testid="cert-chart-empty"]', label: 'seven charts say nothing to chart yet', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-chart"] svg.cert-chart', label: 'and no axis is drawn', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-tile"]', label: 'the tiles still read zero with their words', expectPresent: 9, maxPresent: 9, expectVisible: 9 }
	],
	textContains: [{ selector: '[data-testid="cert-telemetry"]', label: 'the words', must: ['Nothing to chart yet.'] }],
	contrast: [{ selector: '[data-testid="cert-chart-empty"]', label: 'the chart sentences', min: 4.5 }]
};
