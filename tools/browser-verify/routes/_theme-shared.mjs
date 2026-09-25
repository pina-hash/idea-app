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
 * THE ROLE BOARD (ledger 0297): ten role inks on seven grounds plus each of
 * the four status inks on its own fill, and the two ground-step cells beside
 * them. Pinned for the reason BOARD_CELLS is -- a sweep that matched nothing
 * reports nothing.
 */
export const ROLE_CELLS = 74;
export const STEP_CELLS = 2;

/**
 * THE LAUNCHER'S CARD COUNT, written once for the three theme specs. It read
 * 12 in each of them and the launcher renders 13 on this tree (the IdeaCAD
 * card landed after the specs were written), so all three reported a finding
 * on a surface this bundle never touched. Still an exact count, for the reason
 * BOARD_CELLS is one.
 */
export const LAUNCHER_CARDS = 13;

/** How many themes the picker lists; the profile menu renders one radio each. */
export const THEME_ROWS = 3;

/**
 * THE PROJECTOR-WASHOUT ROWS, one per floor the board stamps as `data-wash`.
 * The model is `PROJECTOR_MODEL` in ../checks.mjs: a 300:1 projector with
 * ambient light at 10% of white added to every pixel, L' = L(1 - 1/300) +
 * 1/300 + 0.10, ratio L'hi / L'lo with no flare term. `gate: false` records
 * the numbers at a floor of 0 -- a dark palette is expected to fail this
 * model, and IDEA and Matrix are measured to be reported, not fixed here.
 */
export const WASH_FLOORS = [
	{ wash: '4.5', label: 'body copy on the wall (4.5 washed)' },
	{ wash: '3', label: 'muted copy and status inks on the wall (3.0 washed)' },
	{ wash: '2', label: 'load-bearing lines on the wall (2.0 washed)' }
];
export const washoutRows = (prefix, { gate }) => [
	...WASH_FLOORS.map(({ wash, label }) => ({
		selector: `.board [data-role][data-wash="${wash}"]`,
		label: `${prefix}: projector, ${label}${gate ? '' : ' [recorded, not gated]'}`,
		min: gate ? Number(wash) : 0,
		projector: true
	})),
	/* The role board carries no body-copy row: every ink on it is a status,
	   accent or signal colour (3.0 washed) or the focus ring (2.0 washed). */
	...WASH_FLOORS.filter(({ wash }) => wash !== '4.5').map(({ wash, label }) => ({
		selector: `.sboard [data-srole][data-wash="${wash}"]`,
		label: `${prefix}: projector, role board, ${label}${gate ? '' : ' [recorded, not gated]'}`,
		min: gate ? Number(wash) : 0,
		projector: true
	})),
	{
		selector: '.sboard [data-sstep]',
		label: `${prefix}: projector, panels separable, ground step (1.1 washed)${gate ? '' : ' [recorded, not gated]'}`,
		min: gate ? 1.1 : 0,
		projector: true
	}
];

/**
 * THE ROOMS THE RAIN REACHES INTO (ledger 0117, report 25), one spec per
 * room from this factory -- the classroom and the Foundry; the notebook's
 * pair was withdrawn when ledger 0119's own Matrix plate landed saying no
 * rain (see matrix.css). `/dev/themes?room=<room>` wraps the page in the
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
			until: `() => document.querySelectorAll('.pm-theme').length === ${THEME_ROWS}`,
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

/* THE LAUNCHER'S GLYPHS AND DEFAULT INKS, card by card (ledger 0298,
   decision 40 items 1 and 3). Every mark is measured at the launcher's own
   34px against its own card: the `.app-icon`'s colour is the glyph's edge
   stroke (the faces are translucent mixes of it), so this is the contrast the
   drawing is carried by, held to the 3:1 a graphical object owes. The three
   redrawn marks and the four cards that paint from the shared default are
   named one by one, because a worst-of-all row hides a single card. */
export const launcherRows = ({ gateWall }) => [
	{ selector: '.launcher .app-card .app-icon', label: 'every card glyph at 34px on its card (3:1, graphical)', min: 3 },
	...['ideacad', 'greenline', 'dashboard'].map((id) => ({
		selector: `.launcher .app-card[data-app='${id}'] .app-icon`,
		label: `redrawn mark: ${id} at 34px (3:1, graphical)`,
		min: 3
	})),
	...['classroom', 'notebook', 'ideacad', 'coin-desk'].map((id) => ({
		selector: `.launcher .app-card[data-app='${id}'] .app-title`,
		label: `default card ${id}: title`,
		min: 4.5
	})),
	{
		selector: '.launcher .app-card .app-icon',
		label: `on the wall: every card glyph (2.0 washed, graphical)${gateWall ? '' : ' [recorded, not gated]'}`,
		min: gateWall ? 2 : 0,
		projector: true
	},
	{
		selector: ".launcher .app-card:is([data-app='classroom'], [data-app='notebook'], [data-app='ideacad'], [data-app='coin-desk']) .app-title",
		label: `on the wall: default card titles (3.0 washed)${gateWall ? '' : ' [recorded, not gated]'}`,
		min: gateWall ? 3 : 0,
		projector: true
	}
];
