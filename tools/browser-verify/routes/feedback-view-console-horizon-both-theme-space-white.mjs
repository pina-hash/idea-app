/**
 * THE SAME TWO LISTS ON SPACE WHITE (ledger 0360). `/admin/feedback` is a
 * site-plate page and so in the theme's scope now; `/dev/feedback` holds no
 * session, so this spec puts the room in place the way `ThemeRoot` does in
 * production -- it writes `data-theme="space-white"` on <html>, which is the
 * whole of what the theme is -- and reports that it did, with the console's
 * plate ground read back so a pin that did not take is a visible failure.
 */
import { HORIZON_CHECKS, HORIZON_PREPARE } from './_feedback-horizon.mjs';

export default {
	path: '/dev/feedback?view=console&horizon=both&theme=space-white',
	aliasOf: '/dev/feedback?view=console',
	label: 'Feedback console on Space White, Both: the two lists, their tags and their controls',
	settleMs: 900,
	prepare: [
		{
			/* Re-applied for a minute, the `_plate-text-sweep.mjs` pin: the
			   page's own ThemeRoot answers "no theme" for a visitor with no
			   session, and must not take the attribute back mid-measurement. */
			evaluate: `() => {
				const h = document.documentElement;
				const apply = () => { if (h.getAttribute('data-theme') !== 'space-white') h.setAttribute('data-theme', 'space-white'); };
				apply();
				const iv = setInterval(apply, 40);
				setTimeout(() => clearInterval(iv), 60000);
				return 'data-theme=' + document.documentElement.getAttribute('data-theme')
					+ '; body ' + getComputedStyle(document.body).backgroundColor;
			}`,
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white'
				&& getComputedStyle(document.documentElement).getPropertyValue('--text-1').trim().toLowerCase() === '#0d1311'`,
			waitMs: 200
		},
		...HORIZON_PREPARE
	],
	...HORIZON_CHECKS
};
