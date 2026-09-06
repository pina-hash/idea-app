/**
 * THE SITE THEME, OFF. The baseline half of the pair: `/dev/themes` in its
 * default state, which is the standard IDEA palette with no `data-theme`
 * attribute anywhere.
 *
 * It exists because "the theme clears its floors" is only half a claim. The
 * other half is that the numbers it is compared against were taken on the same
 * board, in the same browser, in the same run -- so a cell that moved is the
 * theme moving it and not the fixture changing underneath.
 *
 * THE LAUNCHER ROW IS THE ONE THAT MATTERS MOST. Twelve-odd cards, and the
 * only thing letting a person pick one out of the grid at a glance is its own
 * accent pair. Counting DISTINCT pairs here and again in the themed spec is
 * what turns "identity is not themeable" from a sentence in a CSS header into
 * a measurement: two runs, same number, or one of them reddens.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import { BOARD_CELLS } from './_theme-shared.mjs';

export default {
	path: '/dev/themes',
	label: 'Site theme OFF: the board and the launcher on the base palette',
	/* AppLauncher stamps `opacity: 0` inline on every card at mount and clears
	   it from an IntersectionObserver callback, so a card below the fold is
	   present and invisible. `SETTLE_ENTRANCE` puts the component into the
	   state its own cleanup reaches -- byte-identically what the reduced-motion
	   path renders from the first frame -- and REPORTS how many it settled, so
	   a step that silently stopped matching says so. */
	prepare: [{ evaluate: SETTLE_ENTRANCE, label: 'settle the launcher entrance' }],
	presence: [
		{
			selector: '.board [data-role]',
			label: `chrome-board cells`,
			expectPresent: BOARD_CELLS,
			maxPresent: BOARD_CELLS
		},
		/* The launcher mounts the real component with isAdmin true, so every
		   card including the three admin-only ones is on screen. A floor AND a
		   ceiling: a launcher that quietly rendered one card would satisfy a
		   floor of 1 and tell nobody. */
		{ selector: '.launcher .app-card', label: 'launcher cards', expectPresent: 13, maxPresent: 13 },
		/* The theme control itself, closed. Two radios, in the menu, which is
		   shut until something opens it -- so present 0 is correct here and the
		   themed spec is where the control is measured. */
		{ selector: '.pm-root', label: 'ProfileMenu (signed in)', expectPresent: 1, maxPresent: 1 },
		/* NO RAIN WITH THE THEME OFF. The canvas exists only while the theme is
		   on (ThemeRoot mounts it keyed on the applied attribute), and this row
		   is the negative control for the themed spec's "one canvas, running":
		   a canvas that leaked onto the base palette would be a theme that had
		   not turned off. */
		{ selector: '.bg-fx canvas', label: 'rain canvas (theme off)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.pm-theme', label: 'theme radios (menu closed)', expectPresent: 0, maxPresent: 0 }
	],
	/* THE BOARD IS NOT ASSERTED HERE, AND THAT IS DELIBERATE RATHER THAN A GAP.
	   The base palette does not clear 4.5:1 on every one of these pairings and
	   never has: --gear on --bg2 measures 3.57 and --boundary on --green-tint
	   2.86, both in Chromium, both pre-existing, and CLAUDE.md already says in
	   words that "--dim on --bg1 or --bg2 is still a failure waiting for a
	   use". Asserting them would put two permanently red rows into every future
	   run of this harness -- a ratchet that records what the palette happens to
	   be rather than checking anything, and the exact shape of test CLAUDE.md
	   forbids. Fixing them is a palette bundle with its own answer for every
	   surface that reads those tokens, not a side effect of a theme.

	   WHAT THIS SPEC IS FOR is the pair of numbers the themed spec is compared
	   against: the launcher's card count and its distinct accents, the absent
	   animation on `.bg-fx`, and the two page-level roles below. The full
	   base-to-matrix table over all 54 cells was measured by hand in the same
	   browser and is in the history entry. */
	contrast: [
		{ selector: '.harness h1', label: 'page heading', min: 4.5 },
		{ selector: '.harness .note', label: 'note copy', min: 4.5 }
	],
	tapTargets: [{ selector: '.switch .sw', label: 'theme switch buttons', min: 44 }],
	/* `.bg-fx` is unthemed here: its own scanline lives on a ::after, which
	   `getAnimations` on the element cannot see, so the ELEMENT carries no
	   animation at all on the base palette. The themed spec says `never` too
	   now -- the rain is a JS-driven canvas and the theme's CSS hatch is gone
	   -- so the two rows agree, and what tells them apart is the canvas rows:
	   0 here, 1 running there. */
	motion: [{ selector: '.bg-fx', label: 'background layer (unthemed)', expect: 'never' }]
};
