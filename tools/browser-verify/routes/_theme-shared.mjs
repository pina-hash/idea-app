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
