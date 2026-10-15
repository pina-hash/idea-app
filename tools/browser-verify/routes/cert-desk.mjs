/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { certHydrated } from './_cert-desk.mjs';

/**
 * THE CERTIFIER DESK (ledger 0391, surface d), busy: two submissions waiting
 * oldest first with how long each has waited in words, one sitting request,
 * the nine tiles each with a figure and a word, every chart drawn with a
 * legend in words, the admin's seven tabs and the always-visible student
 * search. Every key clears 44px, every word 4.5:1, nothing scrolls sideways.
 */
export default {
	path: '/dev/cert-desk',
	label: 'IDEA Certifications desk: queue, requests, tiles and telemetry (busy)',
	prepare: certHydrated('desk'),
	presence: [
		{ selector: '[data-testid="cert-desk-tabs"] .cert-tab', label: 'an admin gets seven desk tabs', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-desk-tabs"] .cert-tab[aria-current="page"]', label: 'no tab is current on the harness address (the real route marks one)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-desk-search"] input', label: 'the student search box', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-queue-row"]', label: 'two submissions waiting', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-queue-review"]', label: 'one Review key a row', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cert-desk-queue-empty"]', label: 'the empty sentence is absent while rows exist', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="cert-request-row"]', label: 'one sitting request', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cert-tile"]', label: 'nine tiles', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="cert-chart"]', label: 'seven chart panels', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cert-chart"] svg.cert-chart', label: 'six are drawn as SVG (the stalled list is rows)', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="cert-chart-empty"]', label: 'no chart says it is empty while every one has data', expectPresent: 0, maxPresent: 0 }
	],
	domOrder: [
		{ before: '[data-testid="cert-queue-row"][data-part="guided"]', after: '[data-testid="cert-queue-row"][data-part="checkout"]', label: 'the queue is oldest first: the guided project (50 hours) above the checkout (6 hours)' }
	],
	textContains: [
		{ selector: '[data-testid="cert-desk-queue"]', label: 'the wait is said in words', must: ['waited 2 days', 'waited 6 hours', 'Ana Reyes', 'Ben Okafor', 'MILL-1'] },
		{ selector: '[data-testid="cert-desk-tiles"]', label: 'every tile carries its word', must: ['Active attempts', 'Dormant attempts', 'Waiting for review', 'Oldest wait', 'Awards, last 30 days', 'Exams today'] },
		{ selector: '[data-testid="cert-chart"][data-chart="pass-rates"] .dk-legend', label: 'a legend in words beside the bars', must: ['Green: passed', 'Red: failed'] }
	],
	tapTargets: [
		{ selector: '[data-testid="cert-desk-tabs"] .cert-tab', label: 'the desk tabs', min: 44 },
		{ selector: '[data-testid="cert-desk-search"] input', label: 'the search box', min: 44 },
		{ selector: '[data-testid="cert-desk-search-go"]', label: 'the search key', min: 44 },
		{ selector: '[data-testid="cert-queue-review"]', label: 'Review keys', min: 44 },
		{ selector: '[data-testid="cert-request-open"]', label: 'the request Open key', min: 44 },
		{ selector: '[data-testid="cert-queue-row"]', label: 'queue rows', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="cert-desk-tabs"] .cert-tab', label: 'tab words', min: 4.5 },
		{ selector: '[data-testid="cert-queue-row"] .dk-row-name', label: 'student names', min: 4.5 },
		{ selector: '[data-testid="cert-queue-row"] .dk-row-meta', label: 'certification and wait words', min: 4.5 },
		{ selector: '[data-testid="cert-tile-figure"]', label: 'tile figures', min: 4.5 },
		{ selector: '.dk-tile-word', label: 'tile words', min: 4.5 },
		{ selector: '.dk-legend li', label: 'chart legends', min: 4.5 },
		{ selector: '[data-testid="cert-chart"] h2', label: 'chart titles', min: 4.5 },
		{ selector: '.cert-panel', label: 'panel edges', min: 3 }
	]
};
