/* NO `order` EXPORT -- see routes.mjs. */

/**
 * PRESENCE ON THE GRADING CONSOLE, AT REST: one student per state, plus a fifth
 * who has never opened the assignment.
 *
 * WHAT ONLY A REAL BROWSER CAN SAY HERE. `tests/dom/` mounts the identical
 * components and asserts the structure -- five lines, four chips, one
 * "Not opened", the words, the glyphs -- but happy-dom has no layout engine, so
 * every geometric and chromatic claim it could make reads zero and passes
 * vacuously. The three below are exactly the claims that need a rendered page:
 *
 *   1. FOUR DIFFERENT HUES ARE FOUR DIFFERENT HUES, and each clears 4.5:1
 *      against the ground it is actually painted on. A chip whose tone token
 *      resolved to the same value as its neighbour's would be structurally
 *      perfect and visually useless.
 *   2. THE LINE STAYS INSIDE THE ROSTER PANE at 375px. It is a flex row of a
 *      chip and two monospace figures inside a column that is already narrow,
 *      and a `nowrap` child's min-content is what pushes a whole page wider
 *      than the viewport.
 *   3. IT SITS BELOW THE NAME RATHER THAN BESIDE IT, which is the layout
 *      decision the console's own comment argues for -- the chip row above
 *      already carries up to four chips and a fifth would ellipsise the name.
 *
 * NO TAP TARGET IS MEASURED, AND THAT IS THE POINT OF THE ONE ASSERTION THAT
 * LOOKS LIKE ONE. The presence line contains no control at all -- it is
 * information, not an action -- so the `presence: 0` check below is what says
 * so. A chip that became a button would need to clear 44px and would need the
 * console to declare a density class it deliberately does not have.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/presence',
	label: 'Presence: four states on one roster, each legible, inside the pane at 375',
	widths: WIDTHS,
	/**
	 * THE ROSTER ARRIVES ON A PROMISE, AND WITHOUT THIS THE SPEC MEASURES THE
	 * PAGE BEFORE IT.
	 *
	 * `GradingConsole` calls `loadGrading` from an effect, so `.roster-row` goes
	 * 0 to 5 between roughly 300ms and 700ms after load. `waitForApp` returns on
	 * DOM STABILITY, which this page reaches while the console is still empty --
	 * paint is not the payload -- so every count below was read at whichever of
	 * those two moments the run happened to land on. Ledger 0168 DOM-probed it
	 * and `measured/presence-presence-off.json` recorded the result: one row
	 * outside threshold, "the roster itself, unchanged", on byte-identical code.
	 *
	 * A LONGER `settleMs` IS THE WRONG FIX and `waitUntil`'s own header says why:
	 * a fixed timeout measures an empty page the day the payload gets slower and
	 * reports honest zeros about a surface that had not finished loading. The
	 * predicate names the thing being waited for and the wait is REPORTED in
	 * milliseconds, so a page that suddenly needs four seconds says so instead of
	 * passing quietly.
	 *
	 * IT WAITS FOR FIVE, NOT FOR ONE. The roster renders as a unit here, but a
	 * predicate satisfied by the first row would be satisfied by a partial render
	 * the day it does not -- and this spec's whole job is to distinguish "the
	 * region was removed" from "the console never rendered".
	 */
	prepare: [
		{
			waitFor: `() => document.querySelectorAll('.roster-row').length === 5`,
			label: 'the roster has loaded (5 rows)'
		}
	],
	presence: [
		{
			selector: '[data-testid="presence-line"]',
			label: 'one presence line per roster row (five students)',
			expectPresent: 5,
			maxPresent: 5,
			expectVisible: 5,
			maxVisible: 5
		},
		{
			selector: '[data-testid="presence-chip"]',
			label: 'four chips: one per student with a presence row',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4,
			maxVisible: 4
		},
		{
			selector: '[data-testid="presence-never"]',
			label: 'the fifth student, who has never opened it',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		{
			selector: '[data-testid="presence-note"]',
			label: 'the coverage sentence, once, above the list',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		{
			/* INFORMATION, NOT AN ACTION. Nothing inside a presence line is
			   operable, which is why no 44px floor applies to any of it. */
			selector: '[data-testid="presence-line"] button, [data-testid="presence-line"] a, [data-testid="presence-line"] input',
			label: 'controls inside a presence line (none: it is text)',
			expectPresent: 0
		}
	],
	contrast: [
		{
			selector: '[data-presence-state="working"] .pword',
			label: 'WORKING, on the roster card',
			min: 4.5
		},
		{
			selector: '[data-presence-state="viewing"] .pword',
			label: 'VIEWING, on the roster card',
			min: 4.5
		},
		{
			selector: '[data-presence-state="open-elsewhere"] .pword',
			label: 'OPEN ELSEWHERE, on the roster card',
			min: 4.5
		},
		{
			selector: '[data-presence-state="away"] .pword',
			label: 'AWAY, on the roster card',
			min: 4.5
		},
		{
			selector: '[data-testid="presence-worked"]',
			label: 'when each student last worked',
			min: 4.5
		},
		{
			selector: '[data-testid="presence-active"]',
			label: 'how long each has worked',
			min: 4.5
		},
		{
			selector: '[data-testid="presence-note"]',
			label: 'the coverage sentence',
			min: 4.5
		}
	],
	textContains: [
		{
			selector: '[data-testid="presence-note"]',
			label: 'the sentence says what the figure does NOT include',
			must: ['typed in', 'paper'],
			/* IT MUST NOT READ AS A MEASURE OF EFFORT. "Time on task" is the
			   phrase this number is most likely to be mistaken for. */
			mustNot: ['time on task', 'effort']
		}
	],
	orderResult: [
		{
			/* FOUR DISTINCT HUES. Read off the rendered elements rather than off the
			   stylesheet: `--green`, `--teal`, `--amber` and `--text-2` are room
			   tokens, and a room that aliased two of them to one value would leave
			   four chips saying four things in one colour with nothing to report it.
			   A flat list, because the harness compares a nested array element-wise
			   as strings. */
			evaluate: `() => {
				const words = Array.from(document.querySelectorAll('[data-testid="presence-chip"] .pword'));
				const colours = words.map((w) => getComputedStyle(w).color);
				return [new Set(colours).size === 4, colours.every((c) => c && c !== 'rgba(0, 0, 0, 0)')];
			}`,
			expected: [true, true],
			label: 'the four states resolve to four distinct, painted colours'
		},
		{
			/* BELOW THE NAME, AND INSIDE THE PANE. Per row: the line's top is at or
			   below the name button's bottom, and its box is within the roster
			   card's own box. Measured for all five rows, flat, in document order. */
			evaluate: `() => Array.from(document.querySelectorAll('.roster-item')).flatMap((li) => {
				const line = li.querySelector('[data-testid="presence-line"]');
				const btn = li.querySelector('.roster-row');
				const card = li.closest('.roster');
				if (!line || !btn || !card) return [false, false];
				const l = line.getBoundingClientRect();
				const b = btn.getBoundingClientRect();
				const c = card.getBoundingClientRect();
				return [l.top >= b.bottom - 0.5, l.left >= c.left - 0.5 && l.right <= c.right + 0.5];
			})`,
			expected: [true, true, true, true, true, true, true, true, true, true],
			label: 'every presence line sits below its name and inside the roster card'
		}
	]
};
