/**
 * THE DIGEST FOR A FULL COIN ADMIN: five autopay lines, Undo on the four that
 * are not already undone, the queue count with its link, money in and out,
 * and the Friday notification switch (off).
 */
export default {
	path: '/dev/coin-desk-staff?view=digest',
	label: 'Coin V2 digest, full coin admin',
	prepare: [
		{
			waitFor:
				'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-digest-autopay-row\\"]").length === 5',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '[data-testid="cd-digest-autopay-row"]', label: 'five autopay lines', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="cd-digest-undo"]', label: 'Undo on the four reversible lines', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="cd-digest-notify-toggle"]', label: 'the notification switch', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-digest-queue"] a[href]', label: 'the queue link', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-digest-gainer"]', label: 'two gainers', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="cd-digest-debt"]', label: 'one student in chronic debt', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cd-digest-notify-toggle"]', label: 'the switch says its state in a word', must: ['Off'] },
		{ selector: '[data-testid="cd-digest-money"]', label: 'money in against money out', must: ['in,', 'out.'] }
	],
	contrast: [
		{ selector: '[data-testid="cd-digest-autopay-row"] .d-who', label: 'autopay name', min: 4.5 },
		{ selector: '[data-testid="cd-digest-autopay-row"] .d-what', label: 'autopay category', min: 4.5 },
		{ selector: '[data-testid="cd-digest-explain"]', label: 'explanation', min: 4.5 },
		{ selector: '[data-testid="cd-digest-money"] .d-figure', label: 'net figure', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="cd-digest-undo"]', label: 'Undo', min: 44 },
		{ selector: '[data-testid="cd-digest-notify-toggle"]', label: 'notification switch', min: 44 },
		{ selector: '[data-testid="cd-digest-queue"] a', label: 'queue link', min: 44 }
	]
};
