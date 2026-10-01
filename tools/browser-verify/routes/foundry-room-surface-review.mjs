/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * ROOM TO MANAGE WHAT IS WAITING (ledger 0360, report 647d1201: "There's like
 * no room on the screen for me to manage waiting for review items").
 *
 * The page is a 100dvh column that does not scroll. The trusted-publisher
 * roster sat UNDER the queue in that column and kept its own height, so the
 * queue's split got what was left -- about 145px at 1440x953 in the
 * screenshot, with the roster clipped off the bottom. The roster moved to its
 * own page behind a Publishers key, and the queue is the only thing here.
 *
 * WHAT FAILS WITHOUT THE FIX: the split row below. With the roster mounted
 * back under the queue, the split is a sliver at 1440x900.
 */
export default {
	path: '/dev/foundry-room?surface=review',
	label: 'Foundry room: the review queue has the page to itself (report 647d1201)',
	presence: [
		{ selector: '[data-testid="foundry-review-page"]', label: 'the shared page wrapper', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fg-root.cr-app', label: 'the queue is an application', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-review-work"]', label: 'the open app and its inspector', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fg-root [data-testid="foundry-trust-roster"]', label: 'no trust roster in the full-height column', expectPresent: 0, maxPresent: 0 },
		{ selector: '.fdy-rnav a.fdy-rnav-key', label: 'the two review keys', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '.fdy-rnav a.fdy-rnav-key.on[aria-current="page"]', label: 'the lit key is this page', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			/* THE NUMBER THE REPORT IS ABOUT, above the breakpoint where the page
			   is an application; below it the document scrolls and the question
			   does not arise. */
			label: 'the queue has its room: at least 60% of the window above the breakpoint, the document below it',
			evaluate: `() => { if (innerWidth < 1024) return [document.scrollingElement.scrollHeight > innerHeight ? 'the queue has its room' : 'the document does not scroll']; const s = document.querySelector('.cr-split'); if (!s) return ['NO SPLIT']; const h = s.getBoundingClientRect().height; return [h >= 0.6 * innerHeight ? 'the queue has its room' : 'split ' + h.toFixed(1) + 'px of ' + innerHeight]; }`,
			expected: ['the queue has its room']
		},
		{
			label: 'the review page spans the window, less the gutter',
			evaluate: `() => { const s = document.querySelector('.cr-split'); if (!s) return ['NO SPLIT']; const w = s.getBoundingClientRect().width; return [w >= innerWidth - 2 ? 'split spans the window' : 'split ' + w.toFixed(1) + 'px of ' + innerWidth]; }`,
			expected: ['split spans the window']
		}
	],
	tapTargets: [{ selector: '.fdy-rnav a.fdy-rnav-key', label: 'the Apps and Publishers keys', min: 44 }],
	contrast: [{ selector: '.fdy-rnav a.fdy-rnav-key', label: 'the review keys', min: 4.5 }]
};
