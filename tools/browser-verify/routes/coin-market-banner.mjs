import { hydrated } from './_coin-market.mjs';

/**
 * THE CLASSROOM HEADER BANNER'S THREE LOOKS (ledger 0402), the default
 * (Spotlight) first and marked, each the real banner over the same four pins,
 * inside the classroom's own room. Every key is 44px, the pause key is there
 * for anything that moves, and nothing pushes the page sideways (the ticker's
 * run is wider than any screen on purpose).
 */
export default {
	path: '/dev/coin-market-banner',
	aliasOf: '/dev/classroom-coin-banner',
	label: 'Classroom banner: the three candidate looks, the default first',
	prepare: hydrated('data-banner-hydrated'),
	presence: [
		{ selector: '[data-testid="coin-banner"]', label: 'three banners', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="coin-banner-pause"]', label: 'a Pause key on each', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="coin-banner-hide"]', label: 'Hide for today on each', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	orderResult: [
		{
			label: 'the default look comes first',
			evaluate: '() => [...document.querySelectorAll("[data-testid=\\"coin-banner\\"]")].map((b) => b.dataset.style)',
			expected: ['spotlight', 'ticker', 'cards']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="coin-banner"] button', label: 'every banner key', min: 44 },
		{ selector: '[data-testid="coin-banner-pin"]', label: 'every pin link', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="coin-banner"] .cb-title', label: 'pin titles', min: 4.5 },
		{ selector: '[data-testid="coin-banner"] .cb-sub', label: 'pin lines', min: 4.5 },
		{ selector: '[data-testid="coin-banner"] .cb-label', label: 'the IDEA Market label', min: 4.5 },
		{ selector: '[data-testid="coin-banner"] .cb-key', label: 'banner keys', min: 4.5 }
	]
};
