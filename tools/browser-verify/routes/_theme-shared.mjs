import { SETTLE_ENTRANCE } from './_shared.mjs';
/**
 * What the three `theme-*` specs share: the board's own role floors, and the
 * prepare step that reaches the themed state.
 *
 * THE FLOORS ARE READ OFF THE PAGE, NOT RESTATED HERE. `/dev/themes` stamps
 * `data-min` on every cell from its own ROLES map, and the rows below select
 * BY that attribute -- so a floor changed on the page moves the assertion with
 * it, and a role added to the page with no row here shows up as a row whose
 * selector matches nothing (see the `presence` cell-count row each spec
 * carries, which is what makes that loud instead of silent).
 */

/** Every role floor the board uses, as a `[data-min]` selector and its number. */
export const ROLE_FLOORS = [
	{ min: 4.5, label: 'text roles (4.5:1)' },
	{ min: 3, label: 'boundary (3:1, non-text)' }
];

/** Contrast rows: one per floor, sweeping every cell that declares it. */
export const boardContrast = (prefix) =>
	ROLE_FLOORS.map(({ min, label }) => ({
		selector: `.board [data-role][data-min="${min}"]`,
		label: `${prefix}: ${label}`,
		min
	}));

/**
 * THE TOTAL CELL COUNT IS PINNED SO A BOARD THAT STOPPED RENDERING CANNOT PASS.
 * `contrast` reports the worst of what it MATCHED; matching nothing is not a
 * failure there, it is an empty sweep. 54 is the number the page renders: six
 * page grounds at eight roles, --plate at three (a hero panel's copy) and
 * --green-tint at three (a selected row's copy plus its boundary).
 */
export const BOARD_CELLS = 54;

/**
 * THE ROOMS THE RAIN REACHES INTO (ledger 0117, report 25), one spec per
 * room from this factory. `/dev/themes?room=<room>` wraps the page in the
 * room's real root class with the room's real stylesheet imported, so the
 * document holds the room rule (`body:has(<root>) .bg-fx { display: none }`,
 * an opaque root) and the theme rule that reaches past it, and nothing else.
 *
 * FOUR CLAIMS PER ROOM, THE FIRST A POSITIVE CONTROL. With the theme OFF the
 * room hides the shell layer -- `.bg-fx` computes `display: none` -- which
 * proves the room stylesheet is actually in the document; without that row a
 * missing import would pass every claim below vacuously. With the theme ON:
 * the layer is back (`display: block`), the room's root paints no colour
 * (background-color alpha 0), and the rain canvas is inside the layer and
 * running. The launcher and the board are still on the page and still
 * measured, because a room root aliases the tokens the board reads and the
 * numbers must still clear.
 */
export const roomSpec = (room, rootClass) => ({
	path: `/dev/themes?state=matrix&room=${room}`,
	label: `Site theme ON inside the ${room} room: the rain reaches past the room's own suppression`,
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, label: 'settle the launcher entrance' },
		{
			click: '.pm-trigger',
			until: `() => document.querySelectorAll('.pm-theme').length === 2`,
			label: 'open the profile menu onto the theme control'
		},
		{
			click: '.pm-theme:not(.selected)',
			until: `() => document.documentElement.getAttribute('data-theme') === null && getComputedStyle(document.querySelector('.bg-fx')).display === 'none'`,
			label: `theme OFF: the ${room} room hides the shell layer (positive control: the room stylesheet is in the document)`
		},
		{
			click: '.pm-theme:not(.selected)',
			until: `() => document.documentElement.getAttribute('data-theme') === 'matrix' && getComputedStyle(document.querySelector('.bg-fx')).display === 'block'`,
			label: 'theme ON: the shell layer is back under the room'
		},
		{
			waitFor: `() => { const c = document.querySelector('.bg-fx canvas.matrix-rain'); return !!c && c.dataset.motion === 'running' && Number(c.dataset.frames) >= 30; }`,
			label: 'the rain is running inside the room: a canvas inside .bg-fx, data-motion running, at least 30 painted frames',
			timeoutMs: 15_000
		},
		{
			evaluate: `() => { const root = document.querySelector('.${rootClass}'); const cs = getComputedStyle(root); const fx = getComputedStyle(document.querySelector('.bg-fx')); return 'root .${rootClass} background-color ' + cs.backgroundColor + '; .bg-fx display ' + fx.display + '; canvas ' + (document.querySelector('.bg-fx canvas.matrix-rain') ? 'present' : 'ABSENT'); }`,
			label: 'what the room root and the shell layer compute under the theme'
		}
	],
	presence: [
		{ selector: `[data-testid="theme-room"].${rootClass}`, label: `the ${room} room root is mounted (positive control)`, expectPresent: 1, maxPresent: 1 },
		{ selector: '.bg-fx > canvas.matrix-rain', label: 'the rain canvas, inside .bg-fx', expectPresent: 1, maxPresent: 1 },
		{ selector: '.bg-fx > canvas[data-motion="running"]', label: 'the rain canvas is running', expectPresent: 1, maxPresent: 1 },
		{ selector: '.board [data-role]', label: 'chrome-board cells', expectPresent: BOARD_CELLS, maxPresent: BOARD_CELLS }
	],
	orderResult: [
		{
			label: `under the theme the ${room} root is transparent and the shell layer displays`,
			evaluate: `() => { const root = document.querySelector('.${rootClass}'); if (!root) return ['NO ROOM ROOT']; const bg = getComputedStyle(root).backgroundColor; const m = bg.match(/rgba?\\(([^)]+)\\)/); const alpha = m ? (m[1].split(',').length === 4 ? Number(m[1].split(',')[3]) : 1) : (bg === 'transparent' ? 0 : 1); const fx = getComputedStyle(document.querySelector('.bg-fx')).display; return [alpha === 0 ? 'room root transparent' : 'room root paints ' + bg, fx === 'block' ? 'shell layer displays' : 'shell layer ' + fx]; }`,
			expected: ['room root transparent', 'shell layer displays']
		}
	],
	/* NOT THE BOARD. Under a room root the board's cells read the room's
	   aliased grounds (`.fg-root` puts `--bg2` on the forge's own surface,
	   `.nb-root` on the notebook's), which is a pairing no shipping page makes
	   -- the board exists to sweep the PORTAL's pairings and is measured on
	   the two `themes*` specs. Measured here once anyway before this row was
	   written: `--gear` came back 4.49 on the forge and 4.43 on the notebook,
	   both a token-on-room pairing that predates the rain and neither on any
	   page. What IS real in a room is the profile panel, which the notebook
	   and the Foundry mount in their headers, so its copy is what is measured. */
	contrast: [
		{ selector: '.pm-theme-name', label: `theme option name, inside the ${room} room`, min: 4.5 },
		{ selector: '.pm-theme-note', label: `theme option note, inside the ${room} room`, min: 4.5 },
		{ selector: '.pm-label', label: `panel section labels, inside the ${room} room`, min: 4.5 }
	],
	tapTargets: [{ selector: '.pm-theme', label: 'theme radios', min: 44 }]
});
