/**
 * THE SAME WIDE CARDS UNDER SPACE WHITE: the generated look's light face,
 * the live thumbnails told the light scheme, and the titles under each slot.
 */
import { FORCE_THEME } from './_hover-ink.mjs';
import base from './home-feed-thumbs-1-mine-wide.mjs';

export default {
	...base,
	path: '/dev/home-feed?thumbs=1&mine=wide&theme=space-white',
	label: "Home page class cards with the person's Wide, under Space White",
	prepare: [...base.prepare, FORCE_THEME('space-white'), { evaluate: `() => 'settled'`, waitMs: 800 }],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 }, ...base.presence]
};
