/**
 * THE QUEUE FOR SECTION COIN STAFF: the same component, only the caller's own
 * students (Block 2). The two Block 4 cards (Elena's background, Felix's
 * reported coins) are absent; the seven Block 2 cards are present.
 */
export default {
	path: '/dev/coin-desk-staff?view=queue&scope=section',
	label: 'Coin V2 queue, section coin staff, own students only',
	prepare: [
		{
			waitFor:
				'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-queue-card\\"]").length === 7',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '[data-testid="cd-queue-card"]', label: 'Block 2 cards', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="cd-queue-card"][data-kind="reported_coins"]', label: 'no Block 4 reported coins', expectPresent: 0 },
		{ selector: '[data-testid="cd-queue-card"][data-kind="background"]', label: 'only Ana’s background, not Elena’s', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cd-queue"]', label: 'no Block 4 student named', must: ['Ana Reyes'], mustNot: ['Elena Evans', 'Felix Fischer'] }
	]
};
