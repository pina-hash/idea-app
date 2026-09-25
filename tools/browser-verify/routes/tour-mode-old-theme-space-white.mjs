/**
 * THE HOME TOUR OFFER ON SPACE WHITE (ledger 0298). The home page is in Space
 * White's scope (`THEME_SCOPE_EXACT`), so the offer row is painted on the
 * light theme's grounds for anybody who chose it, and its words, buttons and
 * the edge of each button are measured there too.
 *
 * `/dev/tour` IS NOT IN THE THEME'S HARNESS SCOPE, so this spec puts the room
 * in place the way `ThemeRoot` does in production: it writes
 * `data-theme="space-white"` on <html>, which is the whole of what the theme
 * is, and reports that it did. The row's own geometry is printed beside it.
 */
import { HIDE_HARNESS_PANEL, OFFER_EDGES, OFFER_UP } from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=old&theme=space-white',
	aliasOf: '/dev/tour?mode=old',
	label: 'Home tour offer on Space White: the words, the buttons and their edges on the light grounds',
	settleMs: 1500,
	prepare: [
		HIDE_HARNESS_PANEL,
		OFFER_UP,
		{
			evaluate: `() => {
				document.documentElement.setAttribute('data-theme', 'space-white');
				const row = document.querySelector('[data-testid="tour-offer"]');
				const r = row.getBoundingClientRect();
				return 'data-theme=' + document.documentElement.getAttribute('data-theme')
					+ '; offer row ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' at y=' + Math.round(r.top + scrollY)
					+ ', ground ' + getComputedStyle(row).backgroundColor;
			}`,
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white'
				&& getComputedStyle(document.querySelector('[data-testid="tour-offer"]')).backgroundColor !== 'rgb(16, 19, 18)'`,
			waitMs: 200
		},
		OFFER_EDGES
	],
	presence: [
		{ selector: '[data-testid="tour-offer"]', label: 'the offer row', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="tour-offer"] .hto-text', label: 'the offer words on Space White', min: 4.5 },
		{ selector: '[data-testid="tour-offer-start"]', label: 'Show me around on Space White', min: 4.5 },
		{ selector: '[data-testid="tour-offer-dismiss"]', label: 'Not now on Space White', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="tour-offer"] button', label: 'the offer buttons', min: 44 }]
};
