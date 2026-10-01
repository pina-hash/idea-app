/* NO `order` EXPORT -- see routes.mjs. */

/**
 * AWAY, IN THE CARD AND THE WORK HEAD (ledger 0360). The twin of
 * `presence-state-open-elsewhere.mjs` for the fourth state: the resting state of
 * most of a roster most of the time, painted in the secondary-copy tier, which
 * is the one most likely to fall under 4.5:1 on a new ground.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/presence?state=away',
	label: 'Presence: AWAY in the card and the work head',
	widths: WIDTHS,
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length === 5`, label: 'the roster has loaded (5 rows)' },
		{
			click: '.roster-row',
			until: `() => !!document.querySelector('[data-testid="work-presence"] [data-presence-state="away"]')`,
			label: 'open the first student'
		},
		{
			evaluate: `() => { const r = document.querySelectorAll('.roster-row')[1]; r.focus(); return document.activeElement === r ? 'focused' : 'focus missed'; }`,
			until: `() => !!document.querySelector('[data-testid="roster-card"] [data-presence-state="away"]')`,
			label: 'focus the second: the card is up'
		}
	],
	presence: [
		{ selector: '[data-testid="roster-card"] [data-presence-state="away"]', label: 'the state in the card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="work-presence"] [data-presence-state="away"]', label: 'the state in the work head', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="roster-card"] .pword', label: 'AWAY, in the card', min: 4.5 },
		{ selector: '[data-testid="work-presence"] .pword', label: 'AWAY, in the work head', min: 4.5 },
		{ selector: '[data-testid="roster-presence"]', label: 'the row glyph (graphical, 3:1)', min: 3 }
	]
};
