/**
 * NOTHING POSTED, NOTHING DRAWN (ledger 0297): a class with no posted draw has
 * no teams region at all, rather than an empty card. The positive control is
 * the teacher spec, where the same harness with a draw renders one.
 */
export default {
	path: '/dev/classroom-live-door?teams=none',
	label: 'Class page with no posted teams',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="live-door"]')`, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="class-teams"]', label: 'no teams region', expectPresent: 0 },
		{ selector: '[data-testid="live-door"]', label: 'the page itself rendered (the door)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
