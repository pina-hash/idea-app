/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE GAME REQUEST BOARD (ledger 0360, report b2ba6d74), as a student and as
 * an administrator, over one fixture.
 *
 * THE ABSENCE: a student's board has no Hide key. The admin board beside it,
 * on the same requests, has one per open request, which is the control.
 * Every offer carries the sentence that the site moves no IDEA Coins.
 */
export default {
	path: '/dev/foundry-requests',
	label: 'Foundry request board: a student and an admin view (report b2ba6d74)',
	presence: [
		{ selector: '[data-view="student"] [data-testid="foundry-request-form"]', label: 'the student can post', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="student"] [data-status="open"]', label: 'three open requests', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="student"] [data-testid="foundry-request-hide"]', label: 'no Hide on a student board', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="admin"] [data-testid="foundry-request-hide"]', label: 'POSITIVE CONTROL: Hide on each open request for an admin', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="student"] [data-testid="foundry-request-close"]', label: 'Close only on the viewer own request', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="student"] [data-status="open"] .fdy-req-offer', label: 'the open offer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The closed request sits under a CLOSED Disclosure, hidden in CSS and
		   still in the DOM (so it prints): present, and not on screen. */
		{ selector: '[data-view="student"] [data-status="closed"] .fdy-req-offer', label: 'the closed offer, folded away', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 }
	],
	textContains: [
		{ selector: '[data-view="student"] [data-status="open"] .fdy-req-offer', label: 'an open offer says the site moves no coins', must: ['The site does not move IDEA Coins for requests.'] },
		{ selector: '[data-view="student"] [data-testid="foundry-request-form"]', label: 'the form says the name is shown, and about coins', must: ['Your name is shown on your request.', 'The site does not move IDEA Coins for requests.'] }
	],
	tapTargets: [
		{ selector: '[data-view="student"] [data-testid="foundry-request-post"]', label: 'Post the request', min: 44 },
		{ selector: '[data-view="student"] .fdy-req-field :is(input, textarea)', label: 'the three fields', min: 44 },
		{ selector: '[data-view="student"] [data-testid="foundry-request-close"]', label: 'Close it', min: 44 },
		{ selector: '[data-view="admin"] [data-testid="foundry-request-hide"]', label: 'Hide it', min: 44 }
	],
	contrast: [
		{ selector: '[data-view="student"] .fdy-req-title', label: 'a request title', min: 4.5 },
		{ selector: '[data-view="student"] .fdy-req-body', label: 'a request message', min: 4.5 },
		{ selector: '[data-view="student"] .fdy-req-by', label: 'who asked', min: 4.5 },
		{ selector: '[data-view="student"] .fdy-req-day', label: 'when', min: 4.5 },
		{ selector: '[data-view="student"] .fdy-req-offer-note', label: 'the no-coins sentence', min: 4.5 },
		{ selector: '[data-view="student"] .fdy-req-field > span', label: 'a field label', min: 4.5 }
	]
};
