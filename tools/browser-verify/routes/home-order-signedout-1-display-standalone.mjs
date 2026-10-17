import { SETTLE_ENTRANCE } from './_shared.mjs';
import { CLOSE_TOUR, HIDE_STRIP, KEY, OFFER } from './_install-key.mjs';

/**
 * RUNNING INSTALLED, THE INSTALL APP KEY IS NOT THERE (ledger 0396), even with
 * the browser's offer waiting. The harness's `?display=standalone` makes
 * `matchMedia('(display-mode: standalone)')` match, the way the installed app's
 * own window does. The positive controls are in the same reading: the offer was
 * taken and is sitting in the mailbox, so the key's absence is the standalone
 * rule and not a missing event; and the same offer with no `display` shows the
 * key (home-order-signedout-1-install-prompt.mjs).
 */
export default {
	path: '/dev/home-order?signedout=1&display=standalone',
	label: 'Install app key hidden when the site runs installed, with an offer waiting',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
		HIDE_STRIP,
		CLOSE_TOUR,
		OFFER,
		{ evaluate: `async () => { await new Promise((r) => setTimeout(r, 600)); return 'waited 600ms for a key that must not come'; }` }
	],
	presence: [
		{ selector: KEY, label: 'no Install app key', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-install="popup"]', label: 'no pop-up either', expectPresent: 0, maxPresent: 0 },
		{ selector: '.legacy-index .tour-link', label: 'Take the tour, where the key would be (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.legacy-index .signin', label: 'Sign in (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'the offer is waiting and the site is running installed, so the absence is the rule',
			evaluate: `() => [
				(window.__iaLog || []).join(','),
				window.__ideaInstall && window.__ideaInstall.event ? 'an offer is waiting in the mailbox' : 'NO OFFER IN THE MAILBOX',
				matchMedia('(display-mode: standalone)').matches ? 'display-mode standalone' : 'NOT STANDALONE',
				document.querySelector('${KEY}') ? 'KEY SHOWN' : 'no key'
			]`,
			expected: ['offer taken by the page', 'an offer is waiting in the mailbox', 'display-mode standalone', 'no key']
		}
	]
};
