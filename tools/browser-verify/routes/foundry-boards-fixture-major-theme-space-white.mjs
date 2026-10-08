/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { MAJOR_PREPARE } from './foundry-boards-fixture-major.mjs';

/**
 * THE MAJOR RELEASES SECTION UNDER SPACE WHITE.
 *
 * The cards are a DARK ISLAND in every theme: the badge chip, a generated
 * cover and a house card all paint pinned colours, so their composited
 * readings must come out the same here as on the dark plate, and that is
 * what this measures beside the room's own words (the section heading, its
 * note and the All apps heading), which do take the light twin's inks.
 *
 * The harness writes the theme attribute (it holds no session, so ThemeRoot
 * decides "none" there), the /dev/foundry-room way.
 */
export default {
	path: '/dev/foundry-boards?fixture=major&theme=space-white',
	label: 'Foundry gallery: the Major releases section under Space White',
	prepare: [
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		...MAJOR_PREPARE
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-gallery-major"] > li', label: 'the section, four cards', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card-major"]', label: 'the two list badges', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	orderResult: [
		{
			label: 'the room sits on a light ground',
			evaluate: `() => { const r = document.querySelector('.fg-root'); const m = getComputedStyle(r).backgroundColor.match(/\\d+(\\.\\d+)?/g).map(Number); const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const L = 0.2126 * lin(m[0]) + 0.7152 * lin(m[1]) + 0.0722 * lin(m[2]); return [L > 0.5 ? 'light ground' : 'dark ground ' + getComputedStyle(r).backgroundColor]; }`,
			expected: ['light ground']
		},
		{
			label: 'the badge chip is pinned: the same colours as on the dark plate',
			evaluate: `() => { const c = document.querySelector('[data-testid="fdy-card-major"] .fdy-major'); if (!c) return ['NO BADGE']; return [getComputedStyle(c).backgroundColor, getComputedStyle(c.querySelector('.fdy-major-word')).color, getComputedStyle(c.querySelector('.fdy-major-glyph')).fill]; }`,
			expected: ['rgba(6, 5, 4, 0.9)', 'rgb(236, 232, 224)', 'rgb(160, 138, 199)']
		}
	],
	contrast: [
		{ selector: '#fdy-gal-major-h', label: 'section heading', min: 4.5 },
		{ selector: '.fdy-gal-major-note', label: 'section note', min: 4.5 },
		{ selector: '[data-testid="foundry-gallery-all-heading"]', label: 'All apps heading', min: 4.5 }
	]
};
