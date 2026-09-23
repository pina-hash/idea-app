/**
 * Shared steps and probes for the /dev/classroom-todo specs (ledger 0297): a
 * student's cross-class to-do on the REAL ClassroomShell, the REAL TodoPage
 * and the REAL MyClasses, over one fixture pinned at 8pm Pacific on Thursday
 * 2026-08-27 (03:00 UTC on the 28th), where the school's calendar day and
 * the UTC one disagree.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 */

export const TODO = '/dev/classroom-todo/todo';
export const MY_CLASSES = '/dev/classroom-todo';

/** The to-do page has hydrated once its view controls are on screen. */
export const TODO_READY = { waitFor: '() => !!document.querySelector(\'[data-testid="todo-view-assigned"]\')', timeoutMs: 20000 };

/**
 * THE PAGE'S GROUPS AND ROWS, IN DOCUMENT ORDER, as `<group>: <row key>` --
 * one array answers "which rows, under which heading, in what order", so a
 * row in the wrong group or the wrong place is one visible diff.
 */
export const TODO_ROWS = `() => [...document.querySelectorAll('[data-testid="todo-group"]')].flatMap((g) =>
	[...g.querySelectorAll('[data-testid="todo-row"]')].map((r) => g.getAttribute('data-group') + ': ' + r.getAttribute('data-key'))
)`;

/** The state each row names, in words, in the same order. */
export const TODO_STATES = `() => [...document.querySelectorAll('[data-testid="todo-state"]')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim())`;

/** The three view counts, assigned / missing / done. */
export const TODO_COUNTS = `() => ['assigned', 'missing', 'done'].map((v) => document.querySelector('[data-testid="todo-count-' + v + '"]')?.textContent.trim() ?? 'absent')`;

/** Which view control is pressed. */
export const TODO_PRESSED = `() => ['assigned', 'missing', 'done'].filter((v) => document.querySelector('[data-testid="todo-view-' + v + '"]')?.getAttribute('aria-pressed') === 'true')`;
