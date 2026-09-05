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
 *     and in `theme-harness.mjs` are compared by a reader looking at two rows;
 *     `tests/theme-identity.test.ts` pins the same claim off the stylesheet so
 *     it also reddens with no browser at all.
 *
 *  3. THE RAIN IS GATED. `.bg-fx` animates under `no-preference` and is
 *     entirely still under `reduce` -- `animation-name: none`, no transform,
 *     and PAINTED, because the whole point is a still version rather than an
 *     absent one. `motionSweep` measures both phases; the base spec's
 *     `expect: 'never'` on the same selector is the negative control that says
 *     the animation is the theme's and not something that was always there.
 *
 *  4. THE CONTROL IS STILL A CONTROL. The theme radios are measured at the
 *     44px floor with the menu OPEN, because a theme cannot change geometry
 *     but can very easily make a control invisible.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import { boardContrast, BOARD_CELLS } from './_theme-shared.mjs';

export default {
	path: '/dev/themes?state=matrix',
	label: 'Site theme ON (Matrix): every repainted role, the accents, the gate',
	/* THE ROUND TRIP, THROUGH THE SHIPPING CONTROL, IN BOTH DIRECTIONS.
	   `?state=matrix` starts the page themed, so the first thing this does is
	   turn it OFF from the ProfileMenu and prove the document comes back with
	   no `data-theme` attribute at all -- "turning it off must be complete" is
	   a claim about residue, and an absent attribute is the only shape of it
	   that has none. Then it turns it back ON, and everything below is
	   measured on a page a press put into that state.

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
			until: `() => document.documentElement.getAttribute('data-theme') === null && localStorage.getItem('idea_site_theme') === null`,
			label: 'turn the theme OFF: no attribute and no stored key left behind'
		},
		{
			click: '.pm-theme:not(.selected)',
			until: `() => document.documentElement.getAttribute('data-theme') === 'matrix'`,
			label: 'turn it back ON from the same control'
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
	motion: [{ selector: '.bg-fx', label: 'the rain (gated on reduced motion)', expect: 'gated' }]
};
