/**
 * A NOTICE DISAPPEARS ON ITS OWN (ledger 0360, report R22), at 375 and 1440.
 *
 * Mr. Pina: an expired post disappears on its own. The fixture's first notice
 * ends four seconds after the page loads. The run waits for it to go and then
 * counts what is left, with the harness's own read counter as the proof that
 * nothing asked the server: an end needs no network.
 */
import { IGNORE, READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?expiring=1',
	label: 'Quick posts: a notice whose end passes leaves the page with no request',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the header and its notices have painted' },
		{
			label: 'the ending notice is on the page at first',
			evaluate: `() => { window.__qpBefore = document.querySelectorAll('[data-testid="quick-post"]').length; return 'notices at load=' + window.__qpBefore; }`
		},
		{
			waitFor: `() => !document.querySelector('[data-post="qp-soon"]')`,
			timeoutMs: 15000,
			label: 'the notice whose end passed has gone'
		}
	],
	presence: [
		{ selector: '[data-post="qp-soon"]', label: 'the notice whose end passed', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="quick-post"]', label: 'the notice that is still up (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'two notices at load, one after the end, and no read of the server',
			evaluate: `() => ['before=' + window.__qpBefore, 'after=' + document.querySelectorAll('[data-testid="quick-post"]').length, 'reads=' + document.querySelector('[data-testid="class-header-harness"]').dataset.reads]`,
			expected: ['before=2', 'after=1', 'reads=0']
		}
	]
};
