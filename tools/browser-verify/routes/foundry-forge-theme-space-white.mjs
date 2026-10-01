/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE FORGE'S LIGHT TWIN, ALL OF IT ON ONE SCREEN (ledger 0360, the Foundry
 * half of Space White).
 *
 * `forge.css` declares `:root[data-theme='space-white'] .fg-root`: the room's
 * grounds and inks, the heat ink, and the five status trios, each moved in
 * lightness only, with a measured table beside it. `/foundry` is NOT in Space
 * White's route scope on this tree (that list is the site lane's `theme.ts`),
 * so production never reaches this state yet; the harness writes the
 * attribute so the twin is measured before anything turns it on.
 *
 * `/dev/foundry-forge` is the surface because it renders all six status tones
 * at once, the shell with its hot review count, both seam variants and the
 * real FoundryMine. Every contrast row scores EVERY match (the runner forces
 * `all`), so the chip row is six readings and reports the worst.
 *
 * NO GLOW: a halo that reads as heat on iron reads as a smudge on paper, so
 * the twin takes the glow token to transparent and the pour drops its shadow.
 */
export default {
	path: '/dev/foundry-forge?theme=space-white',
	label: 'Forge identity harness under Space White: chips, shell, seam and FoundryMine',
	prepare: [
		/* Past the one cold-start reload Vite performs while it optimizes a
		   route's dependencies, so the attribute read below is the hydrated
		   page's own. */
		{ waitFor: `() => !!document.querySelector('[data-forge-hydrated="true"]')`, timeoutMs: 20000, waitMs: 2000 },
		{ waitFor: `() => !!document.querySelector('[data-forge-hydrated="true"]')`, timeoutMs: 20000 },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="chips"] .fg-chip', label: 'the six status tones (positive control for the chip row)', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '.fg-pour', label: 'the seams the glow row reads', expectPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			/* THE TWIN APPLIED, read as tokens on the room, not as a ground: on a
			   page inside `.site-plate` the room's ground is the site plate's
			   (`site-plate.css`, the site lane's), and the twin's inks are
			   measured against both in forge.css's own table. */
			label: 'the twin tokens are in force on the room',
			evaluate: `() => { const r = document.querySelector('.fg-root'); if (!r) return ['NO ROOM']; const cs = getComputedStyle(r); return [cs.getPropertyValue('--fg-ink').trim(), cs.getPropertyValue('--fg-heat-ink').trim(), cs.getPropertyValue('--fg-heat-glow').trim()]; }`,
			expected: ['#0d1311', '#914f0d', 'transparent']
		},
		{
			label: 'the room sits on a light ground',
			evaluate: `() => { const r = document.querySelector('.fg-root'); const m = getComputedStyle(r).backgroundColor.match(/\\d+(\\.\\d+)?/g).map(Number); const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const L = 0.2126 * lin(m[0]) + 0.7152 * lin(m[1]) + 0.0722 * lin(m[2]); return [L > 0.5 ? 'light ground' : 'dark ground ' + getComputedStyle(r).backgroundColor]; }`,
			expected: ['light ground']
		},
		{
			label: 'no pour carries a glow under Space White',
			evaluate: `() => { const p = [...document.querySelectorAll('.fg-pour')]; if (!p.length) return ['NO POUR']; const lit = p.filter((e) => getComputedStyle(e).boxShadow !== 'none').length; return [lit === 0 ? 'no glow' : lit + ' of ' + p.length + ' pours glow']; }`,
			expected: ['no glow']
		}
	],
	contrast: [
		{ selector: '[data-testid="chips"] .fg-chip', label: 'each status word on its own pinned fill', min: 4.5 },
		{ selector: '.fg-tabs .fg-tab', label: 'the shell tabs', min: 4.5 },
		{ selector: '.fg-count[data-hot]', label: 'the hot review count (the heat ink)', min: 4.5 },
		{ selector: '.fg-wordmark', label: 'the Foundry wordmark', min: 4.5 },
		{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'FoundryMine download control', min: 4.5 }
	],
	tapTargets: [{ selector: '.fdy-detail .fdy-versions a.btn[download]', label: 'FoundryMine download control', min: 44 }]
};
