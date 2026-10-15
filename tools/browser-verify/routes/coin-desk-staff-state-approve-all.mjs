/**
 * THE QUEUE FILTERED TO DONATIONS, APPROVE ALL ARMED: the confirmation names
 * the count and says the "Other" donation (no amount) will be skipped and
 * stay. Nothing is approved by the first press.
 */
const ready =
	'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-queue-card\\"]").length === 9';

export default {
	path: '/dev/coin-desk-staff-state-approve-all',
	aliasOf: '/dev/coin-desk-staff',
	label: 'Coin V2 queue, donations only, Approve All armed',
	prepare: [
		{ waitFor: ready, timeoutMs: 20000 },
		{
			click: '[data-testid="cd-queue-filter"][data-kind="donation"]',
			until: '() => document.querySelectorAll("[data-testid=\\"cd-queue-card\\"]").length === 2'
		},
		{
			click: '[data-testid="cd-queue-all-arm"]',
			until: '() => !!document.querySelector("[data-testid=\\"cd-queue-all-confirm\\"]")'
		}
	],
	presence: [
		{ selector: '[data-testid="cd-queue-card"]', label: 'the two donation cards only', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cd-queue-all-confirm"]', label: 'the confirmation', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-queue-all-result"]', label: 'nothing approved by the first press', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cd-queue-all"]', label: 'the count and the skip are named', must: ['Approve all 2', '1 without an amount will be skipped'] }
	],
	statePairs: [
		{
			activeSelector: '[data-testid="cd-queue-filter"][data-kind="donation"]',
			inactiveSelector: '[data-testid="cd-queue-filter"][data-kind="all"]',
			label: 'the chosen kind looks chosen'
		}
	],
	tapTargets: [{ selector: '[data-testid="cd-queue-all-confirm"]', label: 'confirm Approve All', min: 44 }]
};
