/**
 * THE SITE THEME, ON. The same board, the same launcher, the same browser,
 * reached through the SHIPPING switch rather than by writing the attribute --
 * so a run that comes back green is a run in which something in the
 * application actually turned the theme on.
 *
 * FOUR CLAIMS, AND EACH IS A NUMBER RATHER THAN A TICK:
 *
 *  1. EVERY REPAINTED ROLE CLEARS ITS OWN FLOOR ON EVERY GROUND IT LANDS ON.
 *     A green-on-black theme is exactly where contrast quietly fails, so the
 *     board is exhaustive over the pairings the app actually makes and the
 *     rows sweep it by declared floor.
 *
 *  2. THE LAUNCHER'S ACCENTS DID NOT MOVE. `--acc-primary`/`--acc-secondary`
 *     are IDENTITY (matrix.css's header states the rule): a theme that painted
 *     twelve cards one green would make the grid unreadable, which is the
 *     single worst thing this feature could do. The distinct-pair count here
 *     and in `themes.mjs` are compared by a reader looking at two rows;
 *     `tests/theme-tokens.test.ts` pins the same claim off the stylesheet so
 *     it also reddens with no browser at all.
 *
 *  3. THE RAIN IS RUNNING, AND IT IS A CANVAS. The theme's motion is
 *     `$lib/MatrixRain.svelte`, a <canvas> `ThemeRoot` mounts inside `.bg-fx`
 *     while the theme is on, painted from requestAnimationFrame. `motionSweep`
 *     reads `getAnimations()`, which cannot see a JS-driven picture, so the
 *     rain is measured off what the component itself reports: the canvas is
 *     present inside the shell layer, `data-motion` reads `running`, and
 *     `data-frames` (stamped every thirty paints) has advanced. The field's
 *     painted pixels are counted and printed. The reduced-motion half -- no
 *     frame ever scheduled under `reduce`, a seeded still field painted
 *     instead -- is asserted through the real component in
 *     `tests/dom/theme-rain-mount.svelte.test.ts`, because a spec cannot flip
 *     Chromium's media emulation; the motion row below says `never` because
 *     NO CSS ANIMATION is left on `.bg-fx` or anything inside it, which is
 *     also a claim (the first version of the theme animated a striped hatch
 *     there, and that rule is gone).
 *
 *  4. THE CONTROL IS STILL A CONTROL. The theme radios are measured at the
 *     44px floor with the menu OPEN, because a theme cannot change geometry
 *     but can very easily make a control invisible.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import { boardContrast, BOARD_CELLS } from './_theme-shared.mjs';

export default {
	path: '/dev/themes?state=matrix',
	label: 'Site theme ON (Matrix): every repainted role, the accents, the rain',
	/* THE ROUND TRIP, THROUGH THE SHIPPING CONTROL, IN BOTH DIRECTIONS.
	   `?state=matrix` starts the page themed, so the first thing this does is
	   turn it OFF from the ProfileMenu and prove the document comes back with
	   no `data-theme` attribute, no stored key and NO CANVAS -- "turning it off
	   must be complete" is a claim about residue, and the rain is the one piece
	   of residue a token theme could not have had. Then it turns it back ON,
	   and everything below is measured on a page a press put into that state.

	   Each step's `until` is a real predicate over the document, so a control
	   that stopped working fails HERE, above the numbers it would otherwise
	   have invalidated, with its attempt count printed. */
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, label: 'settle the launcher entrance' },
		{
			click: '.pm-trigger',
			until: `() => document.querySelectorAll('.pm-theme').length === 2`,
			label: 'open the profile menu onto the theme control'
		},
		{
			click: '.pm-theme:not(.selected)',
			until: `() => document.documentElement.getAttribute('data-theme') === null && localStorage.getItem('idea_site_theme') === null && !document.querySelector('.bg-fx canvas')`,
			label: 'turn the theme OFF: no attribute, no stored key and no canvas left behind'
		},
		{
			click: '.pm-theme:not(.selected)',
			until: `() => document.documentElement.getAttribute('data-theme') === 'matrix'`,
			label: 'turn it back ON from the same control'
		},
		{
			waitFor: `() => { const c = document.querySelector('.bg-fx canvas.matrix-rain'); return !!c && c.dataset.motion === 'running' && Number(c.dataset.frames) >= 30; }`,
			label: 'the rain is running: a canvas inside .bg-fx, data-motion running, at least 30 painted frames',
			timeoutMs: 15_000
		},
		{
			evaluate: `() => { const c = document.querySelector('.bg-fx canvas.matrix-rain'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++; return 'canvas ' + c.width + 'x' + c.height + ' motion=' + c.dataset.motion + ' frames=' + c.dataset.frames + ' lit px ' + lit + ' (' + (100 * lit / (d.length / 4)).toFixed(2) + '% of the field)'; }`,
			label: 'the field is painted: lit pixels on the canvas'
		}
	],
	presence: [
		{
			selector: '.board [data-role]',
			label: 'chrome-board cells',
			expectPresent: BOARD_CELLS,
			maxPresent: BOARD_CELLS
		},
		{ selector: '.launcher .app-card', label: 'launcher cards', expectPresent: 13, maxPresent: 13 },
		/* Exactly one canvas, inside the shell layer, and running. A second one
		   would be two loops painting one field; none would be the theme
		   silently back to a hatch. */
		{ selector: '.bg-fx > canvas.matrix-rain', label: 'the rain canvas, inside .bg-fx', expectPresent: 1, maxPresent: 1 },
		{ selector: '.bg-fx > canvas[data-motion="running"]', label: 'the rain canvas is running', expectPresent: 1, maxPresent: 1 },
		/* Two radios, one of them checked, and exactly one. A picker that lost
		   its selected state reads as "no theme is on" beside a themed page. */
		{ selector: '.pm-theme', label: 'theme radios (menu open)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{
			selector: '.pm-theme[aria-checked="true"]',
			label: 'exactly one radio checked',
			expectPresent: 1,
			maxPresent: 1
		},
		/* THE SELECTED ROW IS MARKED THREE WAYS and colour is never the only
		   signal: `aria-checked` is the one a screen reader gets, and it is
		   asserted above rather than inferred from the class. */
		{ selector: '.pm-theme.selected', label: 'selected row is marked', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		...boardContrast('matrix'),
		{ selector: '.harness h1', label: 'page heading', min: 4.5 },
		{ selector: '.harness .note', label: 'note copy', min: 4.5 },
		{ selector: '.pm-theme-name', label: 'theme option name', min: 4.5 },
		{ selector: '.pm-theme-note', label: 'theme option note', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.pm-theme', label: 'theme radios', min: 44 },
		{ selector: '.switch .sw', label: 'theme switch buttons', min: 44 }
	],
	/* `never`, and that is the claim: nothing under `.bg-fx` -- the layer or
	   the canvas -- carries a CSS animation in either media state. The rain's
	   motion is JS and is measured by the prepare rows above; a CSS animation
	   reappearing here would be a second, ungated copy of it. */
	motion: [{ selector: '.bg-fx', label: 'the shell layer and the canvas carry no CSS animation', expect: 'never' }]
};
