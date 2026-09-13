/**
 * THE NOTEBOOK GRID'S STORED SHAPE, ITS CAPS, AND THE PURE HELPERS OVER IT.
 *
 * Plain data + pure functions only (the `curriculum.ts` / `pathways.ts`
 * convention): no Svelte, no DOM, no Supabase, no `$lib/server`. It is imported
 * by the ProseMirror node beside it, by the dev harness, and by the tests that
 * hold it and `0210_notebook_note_grid.sql` to the same numbers.
 *
 * WHY THE SHAPE LIVES HERE AND NOT IN `$lib/notebook-notes`, WHICH IS SETTLED
 * NOW RATHER THAN PENDING. Ledger 0192 wrote this paragraph in the future tense
 * -- the producer bundle would give `NoteBlock` a `NoteGrid` arm, the normalizer
 * a branch and `NoteContent` a renderer -- and said the edit must MOVE nothing
 * and IMPORT this. Ledger 0199 made all three of those edits and moved nothing:
 * `NoteBlock` re-exports `NoteGrid` from here, and this is still the only
 * declaration of the shape, the caps and the length arithmetic. A second
 * declaration in `notebook-notes.ts` would be two ideas of what a grid is with
 * `_notebook_note_grid_len` mirroring only one of them.
 *
 * ONE BLOCK OWNS THE WHOLE GRID, AND THAT IS `0195`'s PRECEDENT RATHER THAN A
 * SIMPLIFICATION. `src/lib/classroom/html-assignment/manifest.ts` states it in
 * its own comment: a table is one block whose value is the whole table, and
 * there is no per-cell field. The reason transfers exactly. A per-cell id in a
 * note would be a join key against `notebook_entry_notes`, where a `block_id` is
 * permanent by construction, and `0128`'s real port is what happens when a
 * runtime-minted per-cell key meets a parent that can only drop it silently.
 * There is no cell id here and there must never be one: a cell is addressed by
 * its POSITION, which is also what `A1` means.
 *
 * A CELL STORES ITS SOURCE, NEVER ITS VALUE. `=SUM(A1:A3)` is what is written
 * down; the number is computed at render by `$lib/notebook/formula`. That is
 * this repository's derive-don't-store rule and it is not a preference here: a
 * stored value is a second copy of an answer the engine already gives, it goes
 * stale the moment a precedent changes under a schema migration or an engine
 * fix, and nothing anywhere would report it. A grid is therefore exactly as
 * large as what a student typed.
 */

/**
 * THE NODE'S NAME IN THE SCHEMA, AND IN A STORED DOCUMENT'S `type`.
 *
 * DECLARED IN THE PURE MODULE AND RE-EXPORTED BY `grid-node.ts`, WHICH IS WHERE
 * IT WAS DECLARED IN LEDGER 0192 AND WHY IT MOVED. `docToTiptap` in
 * `$lib/notebook-notes` has to name the node to seed the editor from a stored
 * grid, and `$lib/notebook-notes` is imported by `$lib/server/notebook-notes` --
 * the normalizer -- so reading the constant from `grid-node.ts` would pull
 * `@tiptap/core` and the whole of ProseMirror into every server route that
 * touches a note, to read one string. There is still exactly ONE declaration of
 * it; what changed is which of the two modules beside each other holds it, and
 * the one that holds it is the one with no dependencies.
 */
export const GRID_NODE_NAME = 'notebookGrid';

/**
 * The stored grid block.
 *
 * `rows` is RECTANGULAR: every row is the same length, empty cells are the
 * empty string, and the column count IS `rows[0].length`. A `cols` field beside
 * it would be a second source of truth for one number, and the first time a row
 * was pushed without it being updated the two would disagree with nothing able
 * to say which was right. Rectangularity is enforced by `gridProblem` below and
 * again by the SQL gate, which is what makes `rows[0].length` safe to read.
 */
export interface NoteGrid {
	type: 'grid';
	rows: string[][];
}

/**
 * THE CAPS, AND THE ARITHMETIC BEHIND THEM RATHER THAN THREE ROUND NUMBERS.
 *
 * `100 x 20` is 2,000 cells, which is the ceiling on the WORK one grid can ask
 * the gate to do and is deliberately expressed as two caps whose product is that
 * number rather than as a third `MAX_CELLS` -- a third cap would make two of the
 * three unreachable in some shapes and the refusal message would name whichever
 * one happened to bite first.
 *
 * TWENTY COLUMNS IS `A` THROUGH `T`, one letter each, which is the readable half
 * of `A1` notation and is as many columns as a 375px phone can show without the
 * grid becoming a horizontal scroll with no landmarks. A hundred rows is a
 * generous materials list.
 *
 * FIVE HUNDRED CHARACTERS IN A CELL is a label or a formula, not a paragraph. A
 * student with more to say has the note around the grid.
 *
 * NONE OF THESE IS THE BINDING CAP IN PRACTICE. `NOTE_MAX_CHARS` is 20,000 over
 * the WHOLE note and grid cell text counts toward it (see the migration's own
 * header on the text floor), so a grid full of five-hundred-character cells is
 * refused by the note's own ceiling long before it reaches any of the three.
 * They exist so that the gate's work is bounded before that total is reached,
 * which a character ceiling alone cannot do.
 *
 * THEY ARE ASSERTED AGAINST THE SQL, not merely mirrored into it:
 * `tests/db/notebook-sheet-gate.test.ts` reads the migration text and fails if
 * any of the three numbers here is not the number the gate enforces.
 */
export const NOTE_GRID_MAX_ROWS = 100;
export const NOTE_GRID_MAX_COLS = 20;
export const NOTE_GRID_MAX_CELL_CHARS = 500;

/** What a fresh grid is when a student inserts one: small, and visibly a grid. */
export const NOTE_GRID_DEFAULT_ROWS = 4;
export const NOTE_GRID_DEFAULT_COLS = 3;

/** Is this block a grid? The gates' own question, as a type guard. */
export function isNoteGrid(block: unknown): block is NoteGrid {
	return (
		!!block &&
		typeof block === 'object' &&
		(block as { type?: unknown }).type === 'grid' &&
		Array.isArray((block as { rows?: unknown }).rows)
	);
}

/**
 * WHY THIS RETURNS A SENTENCE RATHER THAN A BOOLEAN. The SQL gate can only
 * answer yes or no -- it is a CHECK predicate and its callers raise one fixed
 * message -- so a refusal that reaches a student through the database says
 * nothing about which rule was broken. This is the client-side half, and its job
 * is to be the sentence the database cannot give: a surface that is about to
 * emit a grid asks here FIRST and reports the problem where the person is
 * working, exactly as `preflight.ts` does in front of `foundry-ingest`.
 *
 * IT IS NOT THE BOUNDARY AND MUST NEVER BE DESCRIBED AS ONE. The boundary is
 * `_notebook_note_content_ok`, which is re-asked inside every write RPC and
 * cannot be routed around through PostgREST. This is the message; that is the
 * refusal. The two agree case for case, and the test that says so puts the same
 * corpus to both.
 *
 * `null` means no problem.
 */
export function gridProblem(grid: unknown): string | null {
	if (!grid || typeof grid !== 'object') return 'A grid must be an object.';
	const block = grid as { type?: unknown; rows?: unknown };
	if (block.type !== 'grid') return 'A grid block must have type "grid".';

	// The per-block key whitelist, which is what the `p` and `ul` branches of the
	// SQL gate already do and is why there is nowhere to smuggle a field onto a
	// block. A key nobody named is a key nobody validates.
	for (const key of Object.keys(grid)) {
		if (key !== 'type' && key !== 'rows') return `A grid has no "${key}" field.`;
	}

	const rows = block.rows;
	if (!Array.isArray(rows)) return 'A grid needs a list of rows.';
	if (rows.length === 0) return 'A grid needs at least one row.';
	if (rows.length > NOTE_GRID_MAX_ROWS) {
		return `A grid is capped at ${NOTE_GRID_MAX_ROWS} rows, and this one has ${rows.length}.`;
	}

	const width = Array.isArray(rows[0]) ? rows[0].length : -1;
	if (width <= 0) return 'A grid needs at least one column.';
	if (width > NOTE_GRID_MAX_COLS) {
		return `A grid is capped at ${NOTE_GRID_MAX_COLS} columns, and this one has ${width}.`;
	}

	for (let r = 0; r < rows.length; r += 1) {
		const row = rows[r];
		if (!Array.isArray(row)) return `Row ${r + 1} of the grid is not a row.`;
		// RECTANGULAR, checked per row rather than inferred. A ragged grid has no
		// honest column count, and `A1` notation needs one.
		if (row.length !== width) {
			return `Every row of a grid needs the same number of cells; row ${r + 1} has ${row.length} against ${width}.`;
		}
		for (let c = 0; c < row.length; c += 1) {
			const cell = row[c];
			if (typeof cell !== 'string') {
				return `Cell ${cellRef(r, c)} must be text; a grid stores what was typed, not what it worked out.`;
			}
			if (cell.length > NOTE_GRID_MAX_CELL_CHARS) {
				return `Cell ${cellRef(r, c)} is ${cell.length} characters, and one cell is capped at ${NOTE_GRID_MAX_CELL_CHARS}.`;
			}
		}
	}

	return null;
}

/**
 * A cell's `A1` name from its position.
 *
 * DELIBERATELY NOT `columnLabel` FROM `$lib/notebook/formula/references`, and
 * this is the one place the duplication rule is answered with "these are two
 * different questions". That function is the ENGINE's spelling of a column,
 * total over 16,384 of them and therefore multi-letter; this is a REFUSAL
 * MESSAGE about a grid that is capped at twenty columns, so it is single-letter
 * by construction and a call into the engine would be importing a parser to
 * format an error string. The two agree over the range that exists here, and
 * `tests/dom/notebook-sheet-grid.test.ts` asserts that over all twenty columns
 * rather than leaving it to the eye -- so if the cap ever passes 26 the pin
 * reddens and the engine's own function is what this becomes.
 */
export function cellRef(row: number, col: number): string {
	return `${String.fromCharCode(65 + col)}${row + 1}`;
}

/** A rectangular grid of empty cells. */
export function emptyGrid(
	rows: number = NOTE_GRID_DEFAULT_ROWS,
	cols: number = NOTE_GRID_DEFAULT_COLS
): NoteGrid {
	return {
		type: 'grid',
		rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
	};
}

/** How many columns this grid has. Safe because the shape is rectangular. */
export function gridCols(grid: NoteGrid): number {
	return grid.rows[0]?.length ?? 0;
}

/**
 * The grid's cells keyed by `A1`, which is what `FormulaSheet` takes.
 *
 * EMPTY CELLS ARE INCLUDED AS THE EMPTY STRING rather than skipped, and the
 * engine's own semantics are why: a blank is ZERO in arithmetic and is NOT
 * counted by `COUNT` or averaged by `AVERAGE` (ledger 0187's refusal two), and
 * that is a property of a cell whose source is `''`. A skipped key and a key
 * holding `''` answer the same today; writing the empty ones out is what makes
 * `sheet.refs()` the grid's own address space rather than a subset of it, so a
 * formula clearing its last precedent still has a cell to recompute.
 */
export function gridCells(grid: NoteGrid): Record<string, string> {
	const cells: Record<string, string> = {};
	grid.rows.forEach((row, r) => {
		row.forEach((source, c) => {
			cells[cellRef(r, c)] = source;
		});
	});
	return cells;
}

/**
 * THE GRID'S CONTRIBUTION TO A NOTE'S CHARACTER TOTAL, and the TypeScript twin
 * of `_notebook_note_grid_len` in `0210`.
 *
 * IT IS THE SUM OF THE CELL SOURCES' LENGTHS, WITH NO SEPARATOR, which is
 * exactly what `_notebook_note_run_len` contributes for a run and what
 * `_notebook_note_list_len` sums for a list. The gate counts CHARACTERS SOMEBODY
 * TYPED; it has never counted the newlines a plain-text projection would insert
 * between them, and a grid that counted its own row breaks would be a third
 * spelling of what `v_total` means.
 *
 * COMPUTED VALUES ARE NOT COUNTED, and that follows from the cell storing its
 * source: a grid of eight formulas that each render a six-digit number
 * contributes the formulas' own characters and not the numbers'. That is the
 * honest reading of "how much did this student write".
 *
 * `tests/db/notebook-sheet-gate.test.ts` puts the same corpus to this and to the
 * SQL and fails on any disagreement, which is the only thing that keeps a mirror
 * a mirror.
 */
export function gridTextLength(grid: NoteGrid): number {
	let total = 0;
	for (const row of grid.rows) for (const cell of row) total += cell.length;
	return total;
}
