/**
 * THE ARENA BOARD ON SPACE WHITE (ledger 0360). `/tournaments` is a site-plate
 * page, so it is in the theme's scope now, and the room carries a light twin
 * of its own tokens in `tournaments-theme.css` (it redeclares the portal tier
 * on its wrapper, so the theme's values on <html> would never reach it). The
 * board's structure and every word are the signed-out board's own rows,
 * imported from `tournaments-view-list.mjs` rather than retyped, measured
 * here on the light grounds.
 *
 * THE THEME IS PINNED, as `ThemeRoot` would write it: the harness holds no
 * session. The `until` reads the room's own panel token back, so a pin that
 * did not take, or a twin that did not apply, fails the step rather than
 * measuring the dark room by accident.
 *
 * WHAT IS NOT MEASURED HERE: a word ON a student's own banner. Its ground is
 * the banner's `.bg` layer, an absolutely positioned sibling the contrast walk
 * cannot see, so every styled banner reads as light ink on the panel (a false
 * 1.11:1). Banner styles are the students' own palette and are not themed.
 */
import { BOARD_CONTRAST, BOARD_PRESENCE, BOARD_TAPS, BOARD_WORDS } from './tournaments-view-list.mjs';

export default {
	path: '/dev/tournaments?view=list&theme=space-white',
	aliasOf: '/dev/tournaments?view=list',
	label: 'The arena board on Space White: the room twin, every word on the light grounds',
	settleMs: 900,
	prepare: [
		{
			evaluate: `() => {
				const h = document.documentElement;
				const apply = () => { if (h.getAttribute('data-theme') !== 'space-white') h.setAttribute('data-theme', 'space-white'); };
				apply();
				const iv = setInterval(apply, 40);
				setTimeout(() => clearInterval(iv), 60000);
				const board = document.querySelector('[data-testid="tournament-board"]');
				return 'data-theme=' + h.getAttribute('data-theme')
					+ '; --tnm-panel ' + (board ? getComputedStyle(board).getPropertyValue('--tnm-panel').trim() : 'no board')
					+ '; --tnm-accent ' + (board ? getComputedStyle(board).getPropertyValue('--tnm-accent').trim() : 'no board');
			}`,
			until: `() => { const b = document.querySelector('[data-testid="tournament-board"]'); return document.documentElement.getAttribute('data-theme') === 'space-white' && !!b && getComputedStyle(b).getPropertyValue('--tnm-panel').trim().toLowerCase() === '#f7f9f9'; }`,
			waitMs: 200
		}
	],
	presence: BOARD_PRESENCE,
	contrast: BOARD_CONTRAST,
	tapTargets: BOARD_TAPS,
	textContains: BOARD_WORDS
};
