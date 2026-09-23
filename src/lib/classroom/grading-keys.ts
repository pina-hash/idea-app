/**
 * THE GRADING CONSOLE'S KEYS, as a module rather than a component constant.
 *
 * The table used to live inside `GradingConsole.svelte`, which was right while
 * the console was its only reader. The command registry (`$lib/shell/commands`)
 * is the second: the shortcut legend `?` opens and the palette list every key a
 * surface answers to, and they must read the SAME array the console dispatches
 * from, so a key that stops working stops being advertised everywhere at once.
 * A component constant cannot be imported by a plain module without dragging
 * the whole component in, so the table moved here and both import it.
 *
 * NOTHING ABOUT WHAT THE KEYS DO CHANGED. The array below is the console's,
 * character for character; `runAction` and `onWindowKey` stay in the console,
 * which is the only place that knows what "the selected criterion" is.
 *
 * The generic half (the binding shape, the modifier rule, the typing guard) is
 * `$lib/shell/keys`, shared with the notebook's review console.
 */
import type { KeyBinding } from '$lib/shell/keys';

export type GradeAction =
	| 'level-1'
	| 'level-2'
	| 'level-3'
	| 'level-4'
	| 'crit-prev'
	| 'crit-next'
	| 'level-prev'
	| 'level-next'
	| 'student-prev'
	| 'student-next'
	| 'save'
	| 'return'
	| 'close';

/**
 * THE LEGEND AND THE HANDLER ARE ONE LIST, so a key that stops working stops
 * being advertised.
 *
 * WHY THESE KEYS:
 *   * 1-4 pick a level directly. A criterion may hold at most four levels
 *     (the SQL constraint), so the digits cover every rubric exactly, and
 *     "the top level is 1" matches the order they are printed in.
 *   * Up/down move between criteria, left/right between levels inside one --
 *     the axes the grid on screen already has.
 *   * TAB is the browser's, not ours. Each criterion's level group is a
 *     roving tabindex with exactly one tabbable button, so Tab lands on the
 *     next criterion by native focus order. Swallowing Tab would trap focus
 *     in the rubric with no way out, which is a worse bargain than any
 *     shortcut is worth.
 *   * N and P are next and previous student: the pager convention, single
 *     letters that do not collide with the digits, and both readable as
 *     words in the legend.
 *   * S saves a draft, which is safe and reversible.
 *   * R RETURNS THE GRADE TO THE STUDENT, which is neither, so it is armed
 *     first and confirmed by a second R -- the same two-step every other
 *     irreversible control on the site uses. Escape or any other key
 *     disarms.
 *   * Escape closes the student and goes back to the roster (and is caught
 *     by the dirty guard like every other way out).
 */
export const GRADE_KEYS: KeyBinding<GradeAction>[] = [
	{
		keys: '1 – 4',
		label: 'Pick level',
		action: 'level-1',
		dispatch: { '1': 'level-1', '2': 'level-2', '3': 'level-3', '4': 'level-4' }
	},
	{
		keys: '↑ ↓',
		label: 'Criterion',
		action: 'crit-next',
		dispatch: { ArrowUp: 'crit-prev', ArrowDown: 'crit-next' }
	},
	{
		keys: '← →',
		label: 'Level',
		action: 'level-next',
		dispatch: { ArrowLeft: 'level-prev', ArrowRight: 'level-next' }
	},
	{ keys: 'Tab', label: 'Next criterion', native: true },
	{
		keys: 'N / P',
		label: 'Next / previous student',
		action: 'student-next',
		dispatch: { n: 'student-next', p: 'student-prev' }
	},
	{ keys: 'S', label: 'Save draft', action: 'save', dispatch: { s: 'save' } },
	{ keys: 'R R', label: 'Return to student', action: 'return', dispatch: { r: 'return' } },
	{ keys: 'Esc', label: 'Back to roster', action: 'close', dispatch: { Escape: 'close' } }
];
