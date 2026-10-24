/**
 * REOPENED (ledger 0431): the closed sentence goes as soon as the lock moves
 * back, with no reload.
 */
export default {
	path: '/dev/html-assignment-live?state=reopened',
	aliasOf: '/dev/html-assignment-live',
	label: 'HTML assignment: closed, then reopened, with no reload',
	prepare: [
		{ waitFor: '() => window.__hxLive?.ready === true', attempts: 40, gapMs: 250 },
		{ click: '[data-drive="close"]', until: '() => !!document.querySelector(\'[data-hx-lock="closed"]\')' },
		{ click: '[data-drive="reopen"]', until: '() => !document.querySelector(\'[data-hx-lock]\')' }
	],
	presence: [
		{ selector: '[data-hx-lock]', label: 'no lock sentence once reopened', expectPresent: 0, maxPresent: 0 },
		{ selector: 'iframe[data-hx-frame]', label: 'the same frame', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{ label: 'the page says open', evaluate: `() => ['lock=' + window.__hxLive?.lock]`, expected: ['lock=open'] }
	]
};
