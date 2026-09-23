/**
 * THE LIVE CLASS WATCHING A MATERIAL (ledger 0297). A material's page sends no
 * heartbeats, so presence cannot say who is reading it -- and the grid says so
 * with a chip rather than printing twelve students as "Not opened", which
 * would be a claim the instrument cannot make. Every row reads "No signal".
 */
import { LIVE_GROUPS, LIVE_READY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-live?item=i-levers',
	label: 'Live class on a material: no presence, said as a chip and a column state',
	prepare: [LIVE_READY],
	orderResult: [
		{ label: 'every row is No signal, none Not opened', evaluate: LIVE_GROUPS, expected: ['no-signal 12'] },
		{
			label: 'the chooser is on the material',
			evaluate: `() => [document.querySelector('[data-testid="live-item"]').value]`,
			expected: ['i-levers']
		}
	],
	presence: [
		{ selector: '[data-testid="live-no-signal"]', label: 'the "no presence" chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-group-not-opened"]', label: 'no Not opened group', expectPresent: 0 },
		{ selector: '[data-testid="live-cell"]', label: 'rows', expectPresent: 12, maxPresent: 12 }
	],
	textContains: [{ selector: '[data-testid="live-no-signal"]', label: 'the chip says why in words', must: ['presence'] }],
	contrast: [{ selector: '[data-testid="live-no-signal"]', label: 'no-signal chip', min: 4.5 }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
