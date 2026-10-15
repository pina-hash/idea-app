/**
 * THE COIN DESK QUEUE (IDEA Coin V2, 2.2), as a full coin admin sees it: every
 * pending card of every kind, with the kind in words, the amount, the balance,
 * the kind's own detail, and Approve and Deny on each.
 *
 * WHAT A SCREEN CANNOT SAY AND THESE ROWS DO:
 *  - Nine cards, one per seeded request, and every one says its kind in a
 *    word (never a color alone).
 *  - Only the donation and contract cards take an amount (three boxes), and
 *    the "Other" donation starts empty.
 *  - The four photos are real thumbnails reached through the photo transport.
 *  - Approve All is offered and explains itself while no kind is chosen.
 */
const ready =
	'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-queue-card\\"]").length === 9 && document.querySelectorAll("[data-testid=\\"cd-queue-photo\\"] img").length === 4';

export default {
	path: '/dev/coin-desk-staff',
	label: 'Coin V2 queue, full coin admin, every kind waiting',
	prepare: [{ waitFor: ready, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="cd-queue-card"]', label: 'one card per pending request', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="cd-queue-kind"]', label: 'the kind in words on every card', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="cd-queue-approve"]', label: 'Approve on every card', expectPresent: 9, maxPresent: 9 },
		{ selector: '[data-testid="cd-queue-deny"]', label: 'Deny on every card', expectPresent: 9, maxPresent: 9 },
		{ selector: '[data-testid="cd-queue-amount-input"]', label: 'an amount box on the two donations and the contract only', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="cd-queue-photo"] img', label: 'the four photo thumbnails', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="cd-queue-all-arm"]', label: 'Approve All, offered', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-queue-all-confirm"]', label: 'no Approve All confirmation at rest', expectPresent: 0 },
		{ selector: '[data-testid="cd-queue-reason"]', label: 'no deny reason box at rest', expectPresent: 0 },
		{ selector: '[data-testid="cd-queue-recent"]', label: 'recent decisions, collapsed', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="cd-queue-explain"]', label: 'the queue says nothing expires', must: ['Nothing in the queue expires'] },
		{ selector: '[data-testid="cd-queue-card"][data-kind="split"]', label: 'the split card names both parts', must: ['Digital part already paid', 'Physical coins to collect'] },
		{ selector: '[data-testid="cd-queue-card"][data-kind="role_day"]', label: 'the role day card says why it failed', must: ['Why it failed', 'Shop steward'] },
		{ selector: '[data-testid="cd-queue-card"][data-kind="dispute"]', label: 'the dispute names the fine', must: ['The fine:', 'Long bathroom break'] }
	],
	orderResult: [
		{
			label: 'the Other donation starts with an empty amount, the listed one with its rate times quantity',
			evaluate:
				'() => [...document.querySelectorAll("[data-testid=\\"cd-queue-card\\"][data-kind=\\"donation\\"] [data-testid=\\"cd-queue-amount-input\\"]")].map((i) => i.value)',
			expected: ['4', '']
		}
	],
	contrast: [
		{ selector: '[data-testid="cd-queue-card"] .q-name', label: 'student name', min: 4.5 },
		{ selector: '[data-testid="cd-queue-card"] .q-section', label: 'class', min: 4.5 },
		{ selector: '[data-testid="cd-queue-kind"]', label: 'kind chip', min: 4.5 },
		{ selector: '[data-testid="cd-queue-detail"] li', label: 'card detail', min: 4.5 },
		{ selector: '[data-testid="cd-queue-explain"]', label: 'explanation', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="cd-queue-approve"]', label: 'Approve', min: 44 },
		{ selector: '[data-testid="cd-queue-deny"]', label: 'Deny', min: 44 },
		{ selector: '[data-testid="cd-queue-filter"]', label: 'kind filters', min: 44 },
		{ selector: '[data-testid="cd-queue-photo"]', label: 'photo thumbnails', min: 44 },
		{ selector: '[data-testid="cd-queue-amount-input"]', label: 'amount boxes', min: 44 }
	]
};
