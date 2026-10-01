/* NO `order` EXPORT -- see routes.mjs. */

/**
 * OPEN ELSEWHERE, IN THE CARD AND THE WORK HEAD (ledger 0360). `?state=` puts
 * every row in one state by moving the stamps, so the first student is OPEN and
 * the second's card is up, both reading OPEN ELSEWHERE: the state word is
 * measured on both grounds it now lands on. `presence.mjs` carries the other
 * three states' readings; one card shows at a time, which is why the four are
 * spread over three specs.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/presence?state=open-elsewhere',
	label: 'Presence: OPEN ELSEWHERE in the card and the work head',
	widths: WIDTHS,
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length === 5`, label: 'the roster has loaded (5 rows)' },
		{
			click: '.roster-row',
			until: `() => !!document.querySelector('[data-testid="work-presence"] [data-presence-state="open-elsewhere"]')`,
			label: 'open the first student'
		},
		{
			evaluate: `() => { const r = document.querySelectorAll('.roster-row')[1]; r.focus(); return document.activeElement === r ? 'focused' : 'focus missed'; }`,
			until: `() => !!document.querySelector('[data-testid="roster-card"] [data-presence-state="open-elsewhere"]')`,
			label: 'focus the second: the card is up'
		}
	],
	presence: [
		{ selector: '[data-testid="roster-card"] [data-presence-state="open-elsewhere"]', label: 'the state in the card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="work-presence"] [data-presence-state="open-elsewhere"]', label: 'the state in the work head', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="roster-card"] .pword', label: 'OPEN ELSEWHERE, in the card', min: 4.5 },
		{ selector: '[data-testid="work-presence"] .pword', label: 'OPEN ELSEWHERE, in the work head', min: 4.5 },
		{ selector: '[data-testid="roster-presence"]', label: 'the row glyph (graphical, 3:1)', min: 3 }
	]
};
