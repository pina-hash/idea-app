<script lang="ts">
	import { FormulaSheet, isError, type FormulaValue } from '$lib/notebook/formula';
	import {
		NOTE_GRID_MAX_COLS,
		NOTE_GRID_MAX_ROWS,
		cellRef,
		gridCells,
		gridCols,
		type NoteGrid
	} from './grid-doc';

	/**
	 * THE GRID A STUDENT TYPES INTO. Mounted by the ProseMirror NodeView beside
	 * it (`grid-nodeview.ts`), and by `/dev/notebook-sheet` directly -- the same
	 * component both times, never a copy, so the harness measures the thing that
	 * ships.
	 *
	 * IT OWNS NO DOCUMENT AND NO HISTORY. `grid` comes in as a prop and every
	 * change leaves through `oncommit` as a WHOLE grid; there is no store here,
	 * no local copy of the document, and nothing that outlives a keystroke except
	 * the one cell currently being typed into. That is what makes the undo
	 * question answerable: the only writer is ProseMirror.
	 *
	 * ==================================================================
	 * ONE TRANSACTION PER CELL COMMIT, NOT ONE PER KEYSTROKE
	 * ==================================================================
	 *
	 * The decision, and the reasoning, because ledger 0187 asked for it in
	 * writing.
	 *
	 * A cell being typed into lives in `draft` -- this component's own state, in
	 * the DOM input -- and reaches the document only when the student COMMITS it:
	 * Enter, Tab, or moving focus away. Escape abandons it. So:
	 *
	 *   * ONE UNDO STEP IS ONE CELL EDIT, which is what a spreadsheet user
	 *     expects and what every spreadsheet they have used does. Per-keystroke
	 *     undo inside a cell would mean Ctrl+Z walked backwards through the
	 *     characters of a formula and then, without any change of feel, out into
	 *     the prose above -- the same interleaving problem a second history has,
	 *     arriving through the front door.
	 *   * THE APPEND-ONLY REVISION CHAIN PREFERS IT. A note write INSERTS a
	 *     revision (0078). `EntryNotes.svelte:162` is `autosave: false`, so the
	 *     turned-in path mints nothing per keystroke either way; the composer's
	 *     draft path autosaves, and 0129's coalescing REPLACES the head revision
	 *     rather than appending -- but coalescing absorbs writes, it does not make
	 *     them free, and a transaction per keystroke in a 2,000-cell grid is the
	 *     write amplification ledger 0180 named as the thing this chain is least
	 *     able to take.
	 *   * IT IS STRUCTURAL, NOT A DISCIPLINE. `grid-node.ts` exposes exactly one
	 *     write command and it replaces the WHOLE grid, so there is no per-cell
	 *     command a later edit could start calling on `oninput`.
	 *
	 * WHAT IT COSTS, stated rather than discovered: Ctrl+Z WHILE TYPING IN A CELL
	 * is the browser's own text undo inside the input, not ProseMirror's, because
	 * the characters are not in the document yet. That is the ordinary behaviour
	 * of every text field on the web and it is what a student expects from one;
	 * the moment the cell commits, Ctrl+Z is ProseMirror's and undoes the whole
	 * edit. `tests/dom/notebook-sheet-undo.test.ts` measures both halves.
	 */
	let {
		grid,
		oncommit,
		editable = true,
		label = 'Grid'
	}: {
		grid: NoteGrid;
		/**
		 * A committed change, as a WHOLE grid. Absent means read-only, and
		 * ABSENCE IS THE MECHANISM: with no callback there is no write to
		 * execute, so a read-only grid is structural rather than a flag somebody
		 * has to remember to check. `editable` below only stops the inputs taking
		 * focus; it is not what makes this safe.
		 */
		oncommit?: (next: NoteGrid) => void;
		editable?: boolean;
		label?: string;
	} = $props();

	const writable = $derived(editable && !!oncommit);
	const cols = $derived(gridCols(grid));

	/**
	 * THE COMPUTED SHEET, DERIVED AND NEVER STORED. A cell holds its SOURCE; the
	 * value is worked out here on every render of a changed grid. Storing the
	 * value would be a second copy of an answer the engine already gives, going
	 * stale the moment a precedent changed, with nothing to report it.
	 *
	 * REBUILT WHOLE RATHER THAN MUTATED. `FormulaSheet` has an incremental
	 * `setCell` that recomputes exactly the affected cells, and it is deliberately
	 * NOT used here: this component is handed a whole new grid on every commit
	 * and has no way to know which cell moved (an undo can move several at once,
	 * and a paste can move all of them). `setCells` loads them in ONE
	 * recalculation, which is the constructor's own documented reason for
	 * existing -- loading one `setCell` at a time would report a cycle for every
	 * forward reference on the way through.
	 */
	const sheet = $derived(new FormulaSheet(gridCells(grid)));

	/** The cell being typed into, as `A1`, or null. */
	let editing = $state<string | null>(null);
	/** Its uncommitted text. Nothing else in this component survives a keystroke. */
	let draft = $state('');

	function valueAt(ref: string): FormulaValue {
		return sheet.value(ref);
	}

	/**
	 * WHAT A CELL SHOWS. Its computed value normally; its SOURCE while it is
	 * being edited, which is the one thing a spreadsheet must get right -- a
	 * student clicking a cell that reads `47` has to see `=SUM(A1:A4)`, or they
	 * cannot correct it.
	 */
	function display(ref: string): string {
		return sheet.display(ref);
	}

	function sourceAt(row: number, col: number): string {
		return grid.rows[row]?.[col] ?? '';
	}

	function beginEdit(row: number, col: number) {
		if (!writable) return;
		editing = cellRef(row, col);
		draft = sourceAt(row, col);
	}

	/**
	 * COMMIT. Builds the whole next grid and hands it over; the parent turns that
	 * into exactly one ProseMirror transaction.
	 *
	 * A COMMIT THAT CHANGES NOTHING SENDS NOTHING, which is the same comparison
	 * `EditBaseline` makes one level up and is here for the same reason: clicking
	 * into a cell and out of it again is not an edit, and reporting it as one
	 * would put an undo step in the history for a thing nobody did.
	 */
	function commit() {
		const ref = editing;
		editing = null;
		if (!ref || !oncommit) return;
		const row = Number(ref.slice(1)) - 1;
		const col = ref.charCodeAt(0) - 65;
		if (sourceAt(row, col) === draft) return;
		const rows = grid.rows.map((r, i) =>
			i === row ? r.map((c, j) => (j === col ? draft : c)) : r
		);
		oncommit({ type: 'grid', rows });
	}

	function cancel() {
		editing = null;
		draft = '';
	}

	function onCellKey(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancel();
		}
		// TAB IS DELIBERATELY NOT INTERCEPTED. The blur handler commits, so
		// tabbing out of a cell saves it and moves to the next one by the
		// browser's own focus order -- which is the grid's reading order, because
		// the inputs are in document order. Reimplementing that would be a second
		// idea of where the next cell is, and it would break the moment a row
		// wrapped or a column was hidden.
	}

	function resize(rowDelta: number, colDelta: number) {
		if (!oncommit) return;
		const nextRows = Math.min(Math.max(1, grid.rows.length + rowDelta), NOTE_GRID_MAX_ROWS);
		const nextCols = Math.min(Math.max(1, cols + colDelta), NOTE_GRID_MAX_COLS);
		const rows = Array.from({ length: nextRows }, (_, r) =>
			Array.from({ length: nextCols }, (_, c) => grid.rows[r]?.[c] ?? '')
		);
		oncommit({ type: 'grid', rows });
	}

	const atRowCap = $derived(grid.rows.length >= NOTE_GRID_MAX_ROWS);
	const atColCap = $derived(cols >= NOTE_GRID_MAX_COLS);
</script>

<!--
	THE SCROLLER RESERVES ITS OWN SPACE RATHER THAN RELYING ON A PAINTED
	SCROLLBAR. Ledger 0186 measured that this Chromium paints no scrollbar into a
	screenshot at any colour -- proven with a magenta-on-green control -- and
	ledger 0171 lost two rows below an invisible fold in exactly this way. A grid
	is the surface where every content check passes over a broken layout, so the
	horizontal scroller carries `scrollbar-gutter: stable` and the row region
	carries a visible EDGE FADE plus a counted row line, neither of which is a
	scrollbar and both of which survive a raster.
-->
<div class="nb-grid" data-testid="notebook-grid" role="group" aria-label={label}>
	<div class="nb-grid-scroll" data-testid="notebook-grid-scroll">
		<table class="nb-grid-table">
			<thead>
				<tr>
					<th class="nb-grid-corner" scope="col"><span class="sr-only">Row</span></th>
					{#each Array(cols) as _, c (c)}
						<th class="nb-grid-colhead" scope="col">{String.fromCharCode(65 + c)}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each grid.rows as row, r (r)}
					<tr>
						<th class="nb-grid-rowhead" scope="row">{r + 1}</th>
						{#each row as _source, c (c)}
							{@const ref = cellRef(r, c)}
							{@const value = valueAt(ref)}
							{@const bad = isError(value)}
							<td class="nb-grid-cell" class:is-error={bad}>
								{#if editing === ref}
									<!-- svelte-ignore a11y_autofocus -->
									<input
										class="nb-grid-input"
										type="text"
										bind:value={draft}
										onkeydown={onCellKey}
										onblur={commit}
										autofocus
										aria-label={`Cell ${ref}`}
										data-testid={`grid-input-${ref}`}
									/>
								{:else}
									<button
										type="button"
										class="nb-grid-face"
										disabled={!writable}
										onclick={() => beginEdit(r, c)}
										aria-label={`Cell ${ref}${bad ? `, ${value.code}` : ''}`}
										title={bad ? value.message : sourceAt(r, c)}
										data-testid={`grid-cell-${ref}`}
									>
										<!-- COLOUR IS NEVER THE ONLY SIGNAL. An error cell shows its
										     CODE as a word (`#DIV/0!`), which is the whole content of
										     the cell, so the tone is decoration over a legible mark. -->
										<span class="nb-grid-text">{display(ref)}</span>
									</button>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="nb-grid-foot">
		<span class="nb-grid-size" data-testid="notebook-grid-size">
			{grid.rows.length} x {cols}
		</span>
		{#if writable}
			<span class="nb-grid-controls">
				<button
					type="button"
					class="nb-grid-btn tap-44"
					onclick={() => resize(1, 0)}
					disabled={atRowCap}
					title={atRowCap ? `A grid is capped at ${NOTE_GRID_MAX_ROWS} rows.` : undefined}
					data-testid="grid-add-row">Add row</button
				>
				<button
					type="button"
					class="nb-grid-btn tap-44"
					onclick={() => resize(-1, 0)}
					disabled={grid.rows.length <= 1}
					data-testid="grid-remove-row">Remove row</button
				>
				<button
					type="button"
					class="nb-grid-btn tap-44"
					onclick={() => resize(0, 1)}
					disabled={atColCap}
					title={atColCap ? `A grid is capped at ${NOTE_GRID_MAX_COLS} columns.` : undefined}
					data-testid="grid-add-col">Add column</button
				>
				<button
					type="button"
					class="nb-grid-btn tap-44"
					onclick={() => resize(0, -1)}
					disabled={cols <= 1}
					data-testid="grid-remove-col">Remove column</button
				>
			</span>
		{/if}
	</div>
</div>

<style>
	/*
		THE ROOM HOOK PATTERN, not the portal tokens directly. This component is
		written in the notebook and will also be mounted in the harness's plain
		room, so every colour reads `var(--nb-*, <portal fallback>)` the way
		`Disclosure` reads `--disc-accent`: the notebook plate points the name at
		its own corrected value and the shell renders byte-identically. A token
		declared here instead would sit on a DESCENDANT of the room's wrapper and
		beat it.
	*/
	.nb-grid {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: var(--nb-surface, var(--surface-1));
		margin: 0 0 var(--space-3);
	}

	/*
		`scrollbar-gutter: stable` RESERVES THE TRACK WHETHER OR NOT ANYTHING IS
		PAINTED IN IT. See the comment above the markup: this Chromium paints no
		scrollbar into a raster, so a layout that depends on one being visible is
		a layout nobody can measure. The gutter is space, and space rasterizes.
	*/
	.nb-grid-scroll {
		overflow-x: auto;
		overflow-y: visible;
		scrollbar-gutter: stable;
		/*
			AND THE FAR EDGE IS MARKED. A grid wider than its pane is the case
			ledger 0171 lost rows to; a fade at the trailing edge says there is
			more without pretending to be a control (CLAUDE.md: "A gradient says
			there is more; it is not a control"), and the scroller itself keeps its
			real scrollbar for anyone whose platform paints one.
		*/
		mask-image: linear-gradient(to right, #000 calc(100% - 18px), transparent);
	}
	.nb-grid-table {
		border-collapse: collapse;
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.86rem;
	}
	.nb-grid-colhead,
	.nb-grid-rowhead,
	.nb-grid-corner {
		background: var(--nb-surface-dim, var(--surface-2));
		color: var(--text-2);
		font-weight: 500;
		text-align: center;
		border: 1px solid var(--hairline);
		padding: var(--space-1) var(--space-2);
	}
	.nb-grid-rowhead,
	.nb-grid-corner {
		/*
			A STICKY ROW HEADER NEEDS A `z-index`, AND THE CELLS BESIDE IT ARE WHY.
			`position: sticky` makes a box POSITIONED, and so does anything else in
			the row that needs one -- with `z-index: auto` on both, positioned
			siblings paint in TREE order and the cells (later in the row) paint
			straight over the header. An opaque background does nothing about it: a
			background only covers what paints beneath it.
		*/
		position: sticky;
		left: 0;
		z-index: 2;
		min-width: 2.2rem;
	}
	.nb-grid-cell {
		border: 1px solid var(--hairline);
		padding: 0;
		min-width: 5.5rem;
	}
	.nb-grid-cell.is-error {
		background: var(--nb-error-wash, color-mix(in srgb, var(--crimson) 10%, transparent));
	}
	.nb-grid-face,
	.nb-grid-input {
		display: block;
		width: 100%;
		/*
			44px, THE STUDENT-FACING FLOOR, AS A `min-height` AND NEVER A `height`.
			A note is a student surface at every width, so there is no
			instructor-density exemption to claim here; and a floor written as a
			height rounds BOTH ways, which is how a mechanical sweep takes a 43px
			control to 41 and reports success.
		*/
		min-height: 44px;
		box-sizing: border-box;
		padding: var(--space-1) var(--space-2);
		font: inherit;
		text-align: left;
		background: transparent;
		color: var(--text-1);
		border: 0;
	}
	.nb-grid-face:disabled {
		color: var(--text-2);
	}
	.nb-grid-input {
		background: var(--nb-accent-wash, var(--surface-2));
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	.nb-grid-text {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		/* `min-width: 0` on a flex/grid child; here the ellipsis needs the block
		   to be allowed to be narrower than its content. */
		min-width: 0;
	}
	.nb-grid-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border-top: 1px solid var(--hairline);
	}
	.nb-grid-size {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.nb-grid-controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-left: auto;
	}
	.nb-grid-btn {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0 var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		background: var(--nb-surface-dim, var(--surface-2));
		color: var(--text-1);
		cursor: pointer;
	}
	.nb-grid-btn:disabled {
		color: var(--text-2);
		cursor: default;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
