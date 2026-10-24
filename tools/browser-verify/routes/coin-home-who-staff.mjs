/**
 * /coin as coin staff (ledger 0422): the Coin Desk tab in the bar and the Coin
 * Desk card, whose area keys open their own areas above the card's own link.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/coin-home?who=staff',
	label: 'Coin home for coin staff: the Coin Desk tab and card',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="coin-bar"] a', label: 'tabs (home, four pages, the desk)', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="coin-bar-desk"]', label: 'the Coin Desk tab', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.ch-card', label: 'preview cards', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="ch-card-desk"] .ch-area', label: 'Staff tools area keys (the Coin Desk folded in, ledger 0432)', expectPresent: 11, maxPresent: 11 }
	],
	orderResult: [
		{
			label: 'no horizontal scroll',
			evaluate: `() => [document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow ' + document.documentElement.scrollWidth]`,
			expected: ['no overflow']
		},
		{
			label: 'an area key opens its area, not the card',
			evaluate: `() => { const k = document.querySelector('[data-testid="ch-card-desk"] .ch-area'); k.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = k.getBoundingClientRect(); const a = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).closest('a'); return [a === k ? 'the area' : 'covered']; }`,
			expected: ['the area']
		}
	],
	contrast: [{ selector: '.ch-area', label: 'area keys', min: 4.5 }],
	tapTargets: [
		{ selector: '[data-testid="coin-bar"] a', label: 'every coin bar tab', min: 44 },
		{ selector: '.ch-area', label: 'every area key', min: 44 }
	]
};
