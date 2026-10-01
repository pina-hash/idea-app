/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE CARD COVER IS A DARK ISLAND UNDER SPACE WHITE (ledger 0360).
 *
 * A generated cover is a pinned dark gradient and the name plate a pinned dark
 * scrim, so the words on them must stay light whatever the room's ink is --
 * under the light twin that ink is near-black, which on the cover would be
 * dark text on a dark ground. `FoundryCard` pins `--fdy-cover-ink` for that.
 *
 * WHY AN EVALUATE AND NOT A CONTRAST ROW: the contrast check composites
 * background-COLOURS only and reports the colour under an image, which here
 * would be the light page, not the gradient the name is drawn on. So the row
 * reads each generated name's own colour and scores it against the LIGHTER
 * stop of its own cover's computed gradient (the worse of the two), and says
 * how many it scored, so a sweep that matched nothing cannot pass.
 */
export default {
	path: '/dev/foundry-room?theme=space-white',
	label: 'Foundry gallery under Space White: the card covers stay a dark island',
	prepare: [
		/* Past the one cold-start reload first (see the play-quick spec), so
		   the theme attribute read below is the hydrated page's own. */
		{ waitFor: `() => !!document.querySelector('[data-room-hydrated="true"]')`, timeoutMs: 20000, waitMs: 2000 },
		{ waitFor: `() => !!document.querySelector('[data-room-hydrated="true"]')`, timeoutMs: 20000 },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card"]', label: 'every card in the mosaic', expectPresent: 16, maxPresent: 16 }
	],
	orderResult: [
		{
			label: 'every generated cover name clears 4.5:1 on its own gradient',
			evaluate: `() => {
				const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
				const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
				const rgb = (s) => (s.match(/rgba?\\(([^)]+)\\)/g) || []).map((m) => m.replace(/rgba?\\(|\\)/g, '').split(',').slice(0, 3).map(Number));
				const names = [...document.querySelectorAll('.fdy-card-made .fdy-card-made-name')];
				if (!names.length) return ['NO GENERATED COVERS'];
				let worst = Infinity;
				for (const n of names) {
					const fg = rgb(getComputedStyle(n).color)[0];
					const stops = rgb(getComputedStyle(n.closest('.fdy-card-made')).backgroundImage);
					if (!fg || stops.length < 2) return ['UNREADABLE COVER'];
					const lf = lum(fg);
					for (const s of stops) { const ls = lum(s); const r = (Math.max(lf, ls) + 0.05) / (Math.min(lf, ls) + 0.05); if (r < worst) worst = r; }
				}
				return [worst >= 4.5 ? 'cover names clear' : 'worst ' + worst.toFixed(2) + ':1 over ' + names.length + ' cover(s)'];
			}`,
			expected: ['cover names clear']
		},
		{
			label: 'the cover ink is the pinned light ink, not the room ink',
			evaluate: `() => { const n = document.querySelector('.fdy-card-made-name'); return [n ? getComputedStyle(n).color : 'NO GENERATED COVER']; }`,
			expected: ['rgb(236, 232, 224)']
		}
	],
	contrast: [
		{ selector: '.fdy-gal-head a[href="/foundry/requests"]', label: 'Request a game on the light plate', min: 4.5 },
		{ selector: '[data-testid="foundry-gallery-page"] h1', label: 'the gallery heading', min: 4.5 },
		{ selector: '.fdy-page-lead', label: 'the gallery lead', min: 4.5 }
	]
};
