import { hydrated, SPACE_WHITE_ON } from './_coin-market.mjs';

/** The three banner looks on Space White, every word re-measured on the light plate. */
export default {
	path: '/dev/coin-market-banner-space-white',
	aliasOf: '/dev/classroom-coin-banner?theme=space-white',
	label: 'Classroom banner on Space White',
	prepare: [...hydrated('data-banner-hydrated'), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="coin-banner"]', label: 'three banners', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	tapTargets: [{ selector: '[data-testid="coin-banner"] button', label: 'every banner key', min: 44 }],
	contrast: [
		{ selector: '[data-testid="coin-banner"] .cb-title', label: 'pin titles', min: 4.5 },
		{ selector: '[data-testid="coin-banner"] .cb-sub', label: 'pin lines', min: 4.5 },
		{ selector: '[data-testid="coin-banner"] .cb-label', label: 'the IDEA Market label', min: 4.5 },
		{ selector: '[data-testid="coin-banner"] .cb-key', label: 'banner keys', min: 4.5 }
	]
};
