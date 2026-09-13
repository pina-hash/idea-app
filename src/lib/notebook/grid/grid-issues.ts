/**
 * WHAT A GRID SAYS TO THE STUDENT WHO IS LOOKING AT IT: the refusals, in
 * sentences, and the one thing a grid can be that stops the note saving.
 *
 * Plain data + pure functions only (the `grid-doc.ts` convention beside it): no
 * Svelte, no DOM, no engine construction of its own. It is imported by the
 * editor's grid, by the read-only renderer, and by the tests that hold the two
 * to the same words.
 *
 * =====================================================================
 * WHY THIS EXISTS AT ALL: A CODE IN A CELL IS NOT A MESSAGE
 * =====================================================================
 *
 * Ledger 0187 built four refusals and built them WELL -- a circular reference
 * carries its path, a malformed formula carries the POSITION of the problem, a
 * division by zero is a cell error rather than a NaN, and an empty cell is zero
 * in arithmetic rather than an error at all. Every one of those arrives as a
 * `FormulaError` with a `message` a person can act on.
 *
 * WHAT THE GRID DOES WITH THAT MESSAGE IS PUT IT IN A `title`, AND THAT IS THE
 * GAP. `toDisplay` renders an error as its CODE -- `#DIV/0!` -- which is
 * correct for a cell six characters wide and is the whole of what a student
 * sees. `CLAUDE.md`'s own rule is that a `title` tooltip is not discoverable and
 * a phone cannot hover, and the notebook is a phone-first surface. So a
 * fifteen-year-old reads `#CYCLE!` in a cell, has nowhere to find out what it
 * means, and the four refusals might as well not carry messages.
 *
 * THE ANSWER IS `FoundryIssues`'s, NOT A BIGGER TOOLTIP. A problem list under
 * the thing that has the problems, each line naming its cell and carrying the
 * engine's own sentence VERBATIM. Verbatim is the half that matters: the
 * message is produced by the engine and re-toning it here would make this a
 * second, softer statement of a rule the engine already states -- the exact
 * duplication `FoundryIssues.svelte` refuses for the same reason.
 *
 * IT IS DERIVED AND NEVER STORED. A grid stores cell SOURCES; the errors are a
 * function of the sheet the engine just computed, so this takes the sheet
 * rather than building one -- the caller already has it, and a second
 * `FormulaSheet` over the same cells is a second recalculation whose answers
 * could differ from the ones on screen.
 */

import { isError, type FormulaSheet } from '$lib/notebook/formula';
import { cellRef, gridCols, gridTextLength, type NoteGrid } from './grid-doc';

/**
 * One thing wrong with a grid, ready to render.
 *
 * `ref` is null for a problem about the WHOLE grid (there is exactly one, and
 * it is the empty grid below); otherwise it is the cell's `A1` name. `code` is
 * the engine's own error code, kept so a renderer can show the mark the cell
 * shows and a reader can join the two by eye.
 */
export interface GridIssue {
	ref: string | null;
	code: string | null;
	message: string;
	/** 0-based index into the cell's source, `=` included, where there is one. */
	position?: number;
}

/**
 * WHAT A GRID WITH NOTHING TYPED IN IT IS TOLD, AND WHY IT IS A SENTENCE RATHER
 * THAN A REFUSAL ON SAVE.
 *
 * `0210` made a grid's own cell text count toward the note's character total,
 * which is what lets a note whose only content is a materials table be saved at
 * all. The floor line itself is byte-identical to `0125`'s: `v_total > 0`. So a
 * note holding nothing but an EMPTY grid still totals zero and the database
 * still refuses it -- correctly, and by a decision ledger 0192 took
 * deliberately.
 *
 * THE FAILURE THAT DECISION LEAVES BEHIND IS A TIMING ONE. A student inserts a
 * grid, types nothing, presses save, and gets `A note needs some text.` about a
 * note that visibly has a grid in it. The refusal is right and it arrives at
 * the worst possible moment, from the furthest possible place, about something
 * they cannot see. So the grid says it ITSELF, while the grid is on screen and
 * empty, before anything is pressed.
 *
 * IT IS A NOTICE AND NOT AN ERROR. Nothing is wrong yet: a grid a student is
 * about to fill in is the ordinary first second of using one. It says what will
 * happen, not that something has gone wrong, and it disappears the moment any
 * cell holds anything.
 */
export const GRID_EMPTY_NOTICE =
	'This grid is empty, so it does not count as writing yet. Type into a cell, or add a sentence to the note, before saving.';

/**
 * THE THING A STUDENT IS MOST LIKELY TO TYPE THAT THIS ENGINE CANNOT DO.
 *
 * `VLOOKUP` does not exist here and Mr. Pina accepted that on 2026-09-12; the
 * engine's answer is its ordinary `#NAME?`, which already names the function and
 * carries a position. This adds NOTHING to that sentence and does not
 * special-case the name -- half-building a lookup is what the decision refused,
 * and a bespoke message for one missing function is the first half of that.
 * What the problem list contributes is that the sentence is READ at all.
 */

/**
 * Every problem a grid currently has, in reading order: whole-grid first, then
 * cell by cell, left to right and top to bottom.
 *
 * THE ORDER IS THE GRID'S OWN, NEVER THE SHEET'S. `FormulaSheet` keys its cells
 * in a `Map` whose order is insertion order, which for a recalculation is
 * topological -- correct for the engine and meaningless to a reader looking at
 * a grid. Walking the rows is what makes the list match the thing above it.
 *
 * A CELL APPEARS ONCE. A formula whose precedent is in error shows the SAME
 * error propagated (that is the value model: an error is a value), so a grid
 * with one bad cell and three totals over it lists four lines -- which is
 * correct and is what a spreadsheet does. Collapsing them would hide the fact
 * that the totals are unusable.
 */
export function gridIssues(grid: NoteGrid, sheet: FormulaSheet): GridIssue[] {
	const issues: GridIssue[] = [];

	if (gridTextLength(grid) === 0) {
		issues.push({ ref: null, code: null, message: GRID_EMPTY_NOTICE });
	}

	const cols = gridCols(grid);
	for (let r = 0; r < grid.rows.length; r += 1) {
		for (let c = 0; c < cols; c += 1) {
			const ref = cellRef(r, c);
			const value = sheet.value(ref);
			if (!isError(value)) continue;
			issues.push({
				ref,
				code: value.code,
				message: value.message,
				...(value.position === undefined ? {} : { position: value.position })
			});
		}
	}

	return issues;
}

/**
 * How a problem line is labelled.
 *
 * SEPARATED FROM THE MESSAGE RATHER THAN PREFIXED ONTO IT, which is
 * `$lib/foundry/preflight.ts`'s `locationOf` rule arriving here: several of the
 * engine's sentences already name a cell (`Circular reference: B2 -> B3 -> B2.`)
 * and a renderer that pasted the location onto the front of every one of them
 * would print it twice for those and put the stutter on the clipboard when
 * somebody copies the line.
 *
 * So the LABEL is the cell's own name and the mark it shows, and the SENTENCE is
 * the engine's, unchanged.
 */
export function gridIssueLabel(issue: GridIssue): string {
	if (!issue.ref) return 'This grid';
	return issue.code ? `${issue.ref} ${issue.code}` : issue.ref;
}
