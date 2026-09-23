import base from './notebook-state-corrector.mjs';

/**
 * THE SAME CORRECTOR UNDER SPACE WHITE. The notebook follows the light theme
 * now, and the photo overlays are the one part of it that stays DARK: a
 * viewfinder that glares and a drag quad that has to hold contrast over an
 * arbitrary photograph are not preferences (`.nb-island` in space-white.css).
 * This is the row that says the island still paints dark inside a white
 * classroom, and that top-layer placement does not depend on the theme.
 */
export default {
	...base,
	path: '/dev/notebook?state=corrector&site=space-white',
	label: 'The photo corrector under Space White: still a dark island, still on top',
	prepare: [
		{
			waitFor: '() => document.documentElement.getAttribute("data-theme") === "space-white"',
			timeoutMs: 5_000
		},
		...base.prepare
	],
	orderResult: [
		...base.orderResult,
		{
			label: 'the island paints dark on a white page',
			evaluate: `() => {
				const lum = (rgb) => {
					const [r, g, b] = rgb.match(/[\\d.]+/g).slice(0, 3).map(Number);
					return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
				};
				const dlg = document.querySelector('dialog.pc-overlay');
				const page = getComputedStyle(document.body).backgroundColor;
				const island = dlg ? getComputedStyle(dlg).backgroundColor : 'rgb(255,255,255)';
				return ['page is light: ' + (lum(page) > 0.6), 'corrector is dark: ' + (lum(island) < 0.15)];
			}`,
			expected: ['page is light: true', 'corrector is dark: true']
		}
	]
};
