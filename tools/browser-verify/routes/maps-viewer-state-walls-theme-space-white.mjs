/**
 * THE MAPS VIEWER ON SPACE WHITE (ledger 0360). `/maps` is a site-plate page,
 * so it carries the theme now. Two things had to move for that, and both are
 * measured here on the walls fixture, which draws every kind of line the plan
 * has:
 *
 *   * the drawing ground, `--blueprint-bg`, a near-black CAD sheet in the base
 *     tokens, is the theme's light panel under Space White (space-white.css);
 *   * the room's jade identity moved in lightness only to #106b4f, and the
 *     veils derived from it were re-weighted (MapsViewer.svelte).
 *
 * WHAT IS MEASURED: every word the viewer paints at 4.5:1 (the same rows as
 * `maps-viewer.mjs`), and, read off the drawing itself, a room's outline and
 * the frame line against the ground they are drawn on. Composited in the page
 * from computed values, so the figure is the one on screen.
 *
 * THE THEME IS PINNED, as `ThemeRoot` would write it: the harness holds no
 * session. The `until` reads the drawing ground back, so a pin that did not
 * take fails the step rather than measuring the dark sheet.
 */
const RATIOS = `() => {
	/* PAINTED, NEVER PARSED: the veils resolve to color(srgb ...), which a
	   regex over a computed style misreads, so each colour is painted over its
	   ground on a 1x1 canvas and the pixel is read back. */
	const cv = document.createElement('canvas');
	cv.width = cv.height = 1;
	const ctx = cv.getContext('2d', { willReadFrequently: true });
	const paint = (...layers) => {
		ctx.clearRect(0, 0, 1, 1);
		for (const c of layers) { ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); }
		return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
	};
	const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const plan = document.querySelector('[data-testid="maps-viewer-drawing"]');
	let el = plan, groundCss = null;
	while (el && !groundCss) { const c = getComputedStyle(el).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') groundCss = c; el = el.parentElement; }
	const ground = paint('#fff', groundCss || '#fff');
	const shape = document.querySelector('[data-testid="maps-viewer-drawing"] .mv-shape path:not(.mv-wall)');
	const frame = document.querySelector('[data-testid="maps-viewer-drawing"] .mv-frame');
	const out = [];
	out.push(lum(ground) > 0.5 ? 'ground:light' : 'ground:DARK ' + groundCss);
	const s = shape ? ratio(paint('#fff', groundCss, getComputedStyle(shape).stroke), ground) : 0;
	out.push(s >= 3 ? 'room-outline>=3:yes' : 'room-outline>=3:NO ' + s.toFixed(2));
	const f = frame ? ratio(paint('#fff', groundCss, getComputedStyle(frame).stroke), ground) : 0;
	out.push(f >= 3 ? 'frame-line>=3:yes' : 'frame-line>=3:NO ' + f.toFixed(2));
	return out;
}`;

export default {
	path: '/dev/maps-viewer?state=walls&theme=space-white',
	aliasOf: '/dev/maps-viewer?state=walls',
	label: 'IDEA Maps viewer on Space White: the light drawing sheet, the plan lines and every word',
	settleMs: 900,
	prepare: [
		{
			evaluate: `() => {
				const h = document.documentElement;
				const apply = () => { if (h.getAttribute('data-theme') !== 'space-white') h.setAttribute('data-theme', 'space-white'); };
				apply();
				const iv = setInterval(apply, 40);
				setTimeout(() => clearInterval(iv), 60000);
				return 'data-theme=' + h.getAttribute('data-theme') + '; --blueprint-bg ' + getComputedStyle(h).getPropertyValue('--blueprint-bg').trim();
			}`,
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white'
				&& getComputedStyle(document.documentElement).getPropertyValue('--blueprint-bg').trim().toLowerCase() === '#f7f9f9'
				&& !!document.querySelector('[data-testid="maps-viewer-scale"]')`,
			waitMs: 200
		}
	],
	presence: [
		{ selector: '[data-testid="maps-viewer-drawing"] svg', label: 'the drawing', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="maps-viewer-drawing"] a[data-node]', label: 'the three rooms, each a link', expectPresent: 3, expectVisible: 3 }
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-head"] h1', label: 'the surface heading, in the maps accent', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-head"] .mv-desc', label: 'the lead copy', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-drawing"] .mv-plan-name', label: 'the frame name in the drawing caption', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-drawing"] .mv-plan-dim', label: 'the dimension beside it', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-scale"] .mv-scale-label', label: 'the scale bar label', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-search"] .mv-search-label', label: 'the search label', min: 4.5 },
		{ selector: '#mv-q-hint', label: 'the search hint', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row-name', label: 'a row name', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the drawing sits on a light sheet, and a room outline and the frame line each clear 3:1 on it',
			evaluate: RATIOS,
			expected: ['ground:light', 'room-outline>=3:yes', 'frame-line>=3:yes']
		}
	]
};
