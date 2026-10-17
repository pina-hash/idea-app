/**
 * THE CLASS CARD'S LINK AND FOLD KEY UNDER SPACE WHITE (ledger 0396, part 3): the
 * same presses and readings as ./home-feed-state-fold-key.mjs, with the theme
 * forced first, so the key's word, the class title in the link and both
 * 44px targets are measured on this theme's own grounds.
 */
import { FORCE_THEME } from './_hover-ink.mjs';
import base from './home-feed-state-fold-key.mjs';

export default {
	...base,
	path: '/dev/home-feed?state=fold-key&theme=space-white',
	label: 'Home class card under space-white: the fold is its own key, folds and opens without navigating',
	prepare: [FORCE_THEME('space-white'), ...base.prepare],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'space-white is on', expectPresent: 1, maxPresent: 1 }, ...base.presence]
};
