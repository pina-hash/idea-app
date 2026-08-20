<script lang="ts">
	import { untrack } from 'svelte';
	import {
		CELL_STATES,
		cellDisplay,
		cellGlyph,
		cellIndex,
		cellLabel,
		cellReviewed,
		completionLabel,
		hasEntry,
		sessionsInOrder,
		shortDate,
		summarize,
		type GridCell,
		type GridCursor,
		type SectionGrid
	} from '$lib/notebook-review';

	/**
	 * The compliance grid: one ROW per student the RPC put on the roster, one
	 * COLUMN per session in the selected unit, exactly the shape
	 * `notebook_get_section_grid` returns.
	 *
	 * Roster membership is NOT re-derived here. The RPC already resolved it
	 * (enrollment UNION anyone holding entries or excusals in the section, so
	 * a transferred student stays visible) and this renders `grid.students`
	 * verbatim.
	 *
	 * Every cell state is a COLOUR AND A GLYPH, never colour alone, so the
	 * grid is readable at a glance and still readable without colour vision.
	 *
	 * IT IS A GRID YOU WALK, NOT A LIST OF BUTTONS. There is one cursor; the
	 * arrow keys move it, and the cell it is on is the only cell in the table
	 * that is tabbable (a roving tabindex -- 240 stops would otherwise be
	 * between the grid and everything after it). EVERY cell is focusable that
	 * way, including the ones with nothing filed: those used to render as inert
	 * text, which is right for a mouse and wrong for a cursor, since a student
	 * who has filed nothing is exactly who an instructor is looking for. Opening
	 * one shows what the console knows about it rather than nothing.
	 *
	 * THE ARITHMETIC IS NOT HERE. Which cell is next, where the edges are, and
	 * which key means what all live in notebook-review.ts as pure functions, so
	 * the whole loop is testable without a DOM. This component owns focus and
	 * scrolling, and no rules.
	 */
	let {
		grid,
		selectedEntryId = null,
		cursor = null,
		onOpen,
		onCursor,
		studentHref
	}: {
		grid: SectionGrid;
		/** The cell currently open in the detail pane, highlighted in place. */
		selectedEntryId?: string | null;
		/**
		 * WHERE THE REVIEWER IS. Owned by the console (it survives a refetch and
		 * drives what the detail pane shows), rendered here.
		 */
		cursor?: GridCursor | null;
		onOpen: (cell: GridCell) => void;
		/** A click or an arrow moved the cursor. */
		onCursor?: (cursor: GridCursor) => void;
		/**
		 * Where this student's whole notebook lives, or null when this viewer
		 * cannot open it -- which is a real case, not a formality: since 0106 the
		 * instructor tier is keyed on an ACTIVE enrollment, so a student who has
		 * left the class (the `left` chip below) keeps their row and their filed
		 * cells but has no full-notebook view for this instructor. Returning null
		 * renders the name as plain text rather than a link into a 404.
		 *
		 * The DECISION is the caller's; this component only renders it. Omitting
		 * the prop entirely leaves every name plain, which is what the dev harness
		 * and any future read-only mount get for free.
		 */
		studentHref?: (student: SectionGrid['students'][number]) => string | null;
	} = $props();

	const sessions = $derived(sessionsInOrder(grid.sessions));
	const index = $derived(cellIndex(grid));
	const summaries = $derived(summarize(grid));
	/**
	 * Whether the hint should mention the name link at all. It is per-student
	 * (0106 refuses a student who has left the class, and a read-only mount
	 * passes no `studentHref`), so a blanket sentence would promise something
	 * this particular roster may not offer.
	 */
	const anyStudentLink = $derived(
		!!studentHref && grid.students.some((s) => studentHref(s) !== null)
	);

	/**
	 * Does this payload carry the acknowledgement dimension at all (0121)? On a
	 * database without it the mark and its legend entry are simply absent, which
	 * is the honest rendering: "nothing is marked" would be a lie about every
	 * cell in the class.
	 */
	const reviewReady = $derived(grid.cells.some((c) => c.reviewed !== undefined));

	/**
	 * Keyed on the roster's `student_key`, not the uuid: since 0094 a student
	 * who is enrolled but has never signed in has no uuid at all, and every one
	 * of them would otherwise share the key "null|<session>".
	 */
	function cellFor(studentKey: string, sessionId: string): GridCell | undefined {
		return index.get(`${studentKey}|${sessionId}`);
	}

	const cursorKey = $derived(cursor ? `${cursor.studentKey}|${cursor.sessionId}` : null);

	/**
	 * THE FALLBACK TAB STOP. With a roving tabindex exactly one cell is
	 * tabbable, and if the cursor is null (nothing has been picked yet) that
	 * would be none -- a table the keyboard cannot enter at all. The first cell
	 * takes the stop until a cursor exists.
	 */
	const firstKey = $derived(
		grid.students.length && sessions.length
			? `${grid.students[0].student_key}|${sessions[0].id}`
			: null
	);
	const tabKey = $derived(cursorKey ?? firstKey);

	/** Cell elements by key, so the cursor can follow the focus and the scroll. */
	let cellEls: Record<string, HTMLButtonElement | null> = {};
	let tableEl = $state<HTMLElement | null>(null);
	/** The key the DOM focus was last moved to, so a refetch never re-moves it. */
	let focusedKey: string | null = null;

	/**
	 * FOCUS FOLLOWS THE CURSOR, AND THE CONDITION IS THE WHOLE RULE.
	 *
	 * It moves when focus is ALREADY in the grid (the instructor is arrowing
	 * through it) or when NOTHING has focus (they have pressed an arrow with
	 * the page freshly loaded, and the grid is where that press belongs). It
	 * does NOT move when focus is anywhere else -- which is what makes a live
	 * update harmless: an entry filed by a student mid-review refetches the
	 * grid, and if the instructor is typing a comment in the panel beside it,
	 * or reading a photograph full screen, nothing may move. Scrolling is under
	 * the same condition for the same reason.
	 *
	 * The `focusedKey` guard means a refetch that leaves the cursor where it was
	 * re-runs this and does nothing at all.
	 *
	 * `untrack` around the DOM work: reading `cellEls` inside the tracked scope
	 * would make this effect depend on a map it is also written to by every
	 * `bind:this` in the table.
	 */
	$effect(() => {
		const key = cursorKey;
		if (!key) return;
		untrack(() => {
			if (key === focusedKey) return;
			const el = cellEls[key];
			if (!el) return;
			const active = typeof document !== 'undefined' ? document.activeElement : null;
			const inside = !!(tableEl && active && tableEl.contains(active));
			const cold = !active || active === document.body;
			if (!inside && !cold) return;
			focusedKey = key;
			el.focus();
			// 'nearest' + instant: advancing down a class must bring the next row
			// into view without animating (app.css sets a global smooth scroll,
			// which a throttled window never finishes) and without recentring a
			// row that is already on screen.
			el.scrollIntoView({
				block: 'nearest',
				inline: 'nearest',
				behavior: 'instant' as ScrollBehavior
			});
		});
	});

	/**
	 * THE ROW THE INSTRUCTOR IS ON DOES NOT MOVE UNDER THEM.
	 *
	 * A live update can insert a row ABOVE the cursor -- a student from another
	 * class files against a shared check-in and joins this roster (0094's union)
	 * -- which pushes everything below it down by a row. The cursor still names
	 * the same student and the same check-in, but the thing the eye is on has
	 * slid, and in a class of thirty that is losing your place.
	 *
	 * So the cursor cell's VIEWPORT POSITION is measured before the update and
	 * the scroller is nudged by the difference after it. `$effect.pre` is what
	 * makes that possible: it runs before the DOM is patched, which is the only
	 * moment the old position exists.
	 *
	 * WHAT IT CANNOT DO, and it is worth being plain about: a grid short enough
	 * not to scroll has no offset to give back, so a row inserted above it does
	 * move the rows under it by one row height. Nothing but a scroll can absorb
	 * that, and inventing one would be worse than the shift.
	 */
	let anchorTop: number | null = null;
	$effect.pre(() => {
		void grid;
		untrack(() => {
			const el = cursorKey ? cellEls[cursorKey] : null;
			anchorTop = el ? el.getBoundingClientRect().top : null;
		});
	});
	$effect(() => {
		void grid;
		untrack(() => {
			const previous = anchorTop;
			anchorTop = null;
			if (previous === null || !tableEl) return;
			const el = cursorKey ? cellEls[cursorKey] : null;
			if (!el) return;
			const delta = el.getBoundingClientRect().top - previous;
			if (Math.abs(delta) > 0.5) tableEl.scrollTop += delta;
		});
	});

	function pick(studentKey: string, sessionId: string) {
		focusedKey = `${studentKey}|${sessionId}`;
		onCursor?.({ studentKey, sessionId });
		const cell = cellFor(studentKey, sessionId);
		if (cell) onOpen(cell);
	}

	function cellTitle(cell: GridCell): string {
		const display = cellDisplay(cell);
		const bits = [cellLabel(display)];
		const reviewed = cellReviewed(cell);
		if (reviewed === false) bits.push('not reviewed yet');
		else if (reviewed === true) bits.push('reviewed');
		if (cell.entry_count > 1) bits.push(`${cell.entry_count} entries, showing the latest`);
		if (cell.excused && cell.entry_id) bits.push('also excused');
		if (cell.entry_id) bits.push('click to open');
		return bits.join(' · ');
	}

	/** The same sentence, for a screen reader, on every cell. */
	function cellSpoken(cell: GridCell | undefined, studentName: string, sessionLabel: string): string {
		if (!cell) return `${studentName}, ${sessionLabel}: nothing filed`;
		const reviewed = cellReviewed(cell);
		const state = cellLabel(cellDisplay(cell));
		const review = reviewed === null ? '' : reviewed ? ', reviewed' : ', not reviewed';
		return `${studentName}, ${sessionLabel}: ${state}${review}`;
	}
</script>

<section class="card grid-card">
	<header class="grid-head">
		<h2>Compliance grid</h2>
		<ul class="legend">
			{#each CELL_STATES as state (state.key)}
				<li title={state.hint}>
					<span class="chip {state.key}" aria-hidden="true">{state.glyph}</span>
					{state.label}
				</li>
			{/each}
			{#if reviewReady}
				<!-- NOT a seventh cell state: the six glyphs, their hues and the cell
				     box are a locked contract. Acknowledgement is a separate question
				     from what the cell says about the work, so it is a separate mark
				     in a separate corner, and it carries a word here like the rest. -->
				<li title="Filed, and nobody has looked at it yet.">
					<span class="chip plain" aria-hidden="true"><span class="todo-dot"></span></span>
					Not reviewed
				</li>
			{/if}
		</ul>
	</header>

	{#if sessions.length === 0}
		<p class="empty">
			This unit has no check-ins scheduled, so there is nothing to grade against yet. Add one in
			Check-ins.
		</p>
	{:else if grid.students.length === 0}
		<p class="empty">
			No students are on this section's roster yet. A student joins it by pinning this class on the
			homepage, or by filing an entry against it.
		</p>
	{:else}
		<!--
			THE KEYS ARE NOT HANDLED HERE. The console listens on the window, so
			the same press works whether focus is on a cell or on a control in the
			panel beside it -- a loop that stopped at the pane boundary would not
			be a loop. This element is bound only so the focus rule above can ask
			whether focus is inside the table.
		-->
		<div class="table-scroll" bind:this={tableEl} data-testid="grid-scroll">
			<table>
				<thead>
					<tr>
						<th scope="col" class="name-col">Student</th>
						{#each sessions as session (session.id)}
							<th scope="col" class="session-col">
								<span class="col-label">{session.session_label}</span>
								<span class="col-date">U{session.unit_number} · {shortDate(session.session_date)}</span>
							</th>
						{/each}
						<th scope="col" class="count-col">Covered</th>
					</tr>
				</thead>
				<tbody>
					{#each summaries as summary (summary.student.student_key)}
						{@const href = studentHref?.(summary.student) ?? null}
						<tr>
							<th scope="row" class="name-col">
								{#if href}
									<a
										class="student-name student-link"
										{href}
										title="Open {summary.student.name}'s whole notebook, including entries with no check-in"
										>{summary.student.name}</a
									>
								{:else}
									<span class="student-name">{summary.student.name}</span>
								{/if}
								{#if !summary.student.enrolled}
									<span
										class="left-class"
										title="No longer on this class's roster. Their row stays so the work they filed here is not hidden."
										>left</span
									>
								{/if}
								{#if summary.student.free_entries > 0}
									<span
										class="free"
										title="Entries filed in this section with no check-in attached. They are not counted in the grid."
										>+{summary.student.free_entries} free{#if summary.student.free_entries_unreviewed}<span
												class="free-new">, {summary.student.free_entries_unreviewed} new</span
											>{/if}</span
									>
								{/if}
							</th>
							{#each sessions as session (session.id)}
								{@const key = `${summary.student.student_key}|${session.id}`}
								{@const cell = cellFor(summary.student.student_key, session.id)}
								{@const display = cell ? cellDisplay(cell) : 'missing'}
								{@const todo = cell ? cellReviewed(cell) === false : false}
								<td>
									<button
										type="button"
										class="cell {display}"
										class:selected={selectedEntryId !== null &&
											cell?.entry_id === selectedEntryId}
										class:at-cursor={cursorKey === key}
										class:empty-cell={!cell || !hasEntry(cell)}
										tabindex={tabKey === key ? 0 : -1}
										aria-current={cursorKey === key ? 'true' : undefined}
										title={cell ? cellTitle(cell) : 'Nothing filed'}
										bind:this={cellEls[key]}
										onclick={() => pick(summary.student.student_key, session.id)}
									>
										<span aria-hidden="true">{cellGlyph(display)}</span>
										{#if todo}
											<span class="todo-dot" aria-hidden="true" data-testid="cell-todo"></span>
										{/if}
										<span class="sr-only"
											>{cellSpoken(cell, summary.student.name, session.session_label)}</span
										>
										{#if cell && cell.entry_count > 1}<span class="badge">{cell.entry_count}</span
											>{/if}
									</button>
								</td>
							{/each}
							<td class="count-col">
								<span class="count" class:full={summary.covered === summary.total}>
									{completionLabel(summary)}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="grid-hint">
			Arrow keys move; the entry beside the grid follows.{#if anyStudentLink}{' '}Click a student's
				name to read their whole notebook.{/if}
		</p>
	{/if}
</section>

<style>
	/* THE CARD IS THE PANE'S HEIGHT and scrolls its BODY, not itself: the
	   column headers name the check-ins the cells belong to and are worth
	   nothing scrolled off the top. `minmax(0, 1fr)` on the table row is what
	   lets the row shrink below its content -- `1fr` alone has an automatic
	   minimum of min-content, which is the whole roster. In an unbounded parent
	   (below the split's breakpoint, where the document scrolls) the same rule
	   sizes to content and nothing scrolls internally at all. */
	.grid-card {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--space-3);
		overflow: hidden;
	}
	.grid-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.grid-head h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.grid-hint {
		margin: 0;
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.legend {
		list-style: none;
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		font-size: 0.72rem;
		color: var(--text-3);
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.chip {
		display: inline-grid;
		place-items: center;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: var(--radius-control);
		/* Explicit, where it used to inherit from the legend: the glyph
		   rendering (✓ ⤴ ○ ! E –) is a locked contract, so the chips keep
		   Share Tech Mono even though the legend labels went sans. */
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1;
	}
	.chip.plain {
		border: 1px solid var(--hairline);
	}
	.empty {
		color: var(--text-2);
		font-size: 0.9rem;
	}

	.table-scroll {
		overflow: auto;
		min-height: 0;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	/* Grid DENSITY is untouched -- same paddings, same cell sizes; scanning
	   many cells quickly is the point. Only the chrome speaks editorial. */
	th,
	td {
		padding: 0.35rem 0.4rem;
		text-align: center;
		border-bottom: 1px solid var(--hairline);
	}
	thead th {
		vertical-align: bottom;
		border-bottom: 1px solid var(--nb-hairline-strong);
		/* The column headers stay while the roster scrolls under them. They are
		   the only thing that says which check-in a cell belongs to. */
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface-1);
	}
	.name-col {
		text-align: left;
		position: sticky;
		left: 0;
		background: var(--surface-1);
		min-width: 11rem;
		font-weight: 400;
	}
	thead .name-col {
		z-index: 3;
	}
	.student-name {
		color: var(--text-1);
	}
	/*
	 * The underline is ALWAYS on. It used to appear on hover, which means the
	 * only way to find out a name opens something was to put a mouse on it --
	 * and the row is otherwise indistinguishable from the plain names beside
	 * it, which are genuinely not links. Inline borders sit inside the line
	 * box, so the row height is unchanged.
	 */
	.student-link {
		color: var(--nb-accent-ink);
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, currentColor 45%, transparent);
	}
	.student-link:hover,
	.student-link:focus-visible {
		border-bottom-color: currentColor;
	}
	.free {
		display: block;
		font-size: 0.7rem;
		color: var(--text-3);
	}
	/* The unreviewed half of that count, in the same muted register: it is a
	   to-do, not a problem with the student. */
	.free-new {
		color: var(--nb-accent-ink);
	}
	/*
	 * Roster context, never a review signal -- so it borrows the same muted
	 * treatment as `.free` rather than any of the six status colours, which
	 * are a locked contract.
	 */
	.left-class {
		display: inline-block;
		margin-left: 0.35rem;
		padding: 0 0.3rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 3px;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
		font-weight: 500;
	}
	.session-col {
		min-width: 5.4rem;
		max-width: 8rem;
	}
	.col-label {
		display: block;
		font-size: 0.8rem;
		color: var(--text-1);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.col-date {
		display: block;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}
	.count-col {
		min-width: 5rem;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}
	.count {
		color: var(--text-3);
	}
	.count.full {
		color: var(--nb-ok);
	}

	/* One cell = colour AND glyph AND fill style, so no state depends on
	   colour alone. */
	.cell {
		display: inline-grid;
		place-items: center;
		position: relative;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: var(--radius-card);
		border: 1px solid transparent;
		font-family: var(--font-mono);
		font-size: 0.9rem;
		line-height: 1;
		background: transparent;
		cursor: pointer;
	}
	/* A cell with nothing filed is still a cursor stop and still opens (the
	   panel says what the console knows about it), but it must not read as an
	   action waiting to be taken. */
	.cell.empty-cell {
		cursor: default;
	}
	/* THE FOCUS RING WAS NOT BEING DRAWN. It was a hardcoded ink rgba tuned for
	   paper, and it measured 1.02:1 on the dark plate and 1.03:1 on IDEA -- i.e.
	   a keyboard user tabbing through the grid had no visible indicator at all in
	   two of the three rooms, and 1.88:1 in the third. --nb-cell-ring is the
	   room's own ink, so it follows the plate: 4.2:1 light, 8.9:1 dark. */
	.cell:hover,
	.cell:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--nb-cell-ring);
	}
	/* WHERE THE CURSOR IS, drawn whether or not the grid has focus -- an
	   instructor who clicks into the panel to type a comment must not lose
	   their place in a class of thirty. The open cell keeps the gold ring; the
	   two coincide almost always, and where they do not the gold wins by
	   ordering. */
	.cell.at-cursor {
		box-shadow: 0 0 0 2px var(--nb-cell-ring);
	}
	.cell.selected {
		box-shadow: 0 0 0 2px var(--gold);
	}

	/* THE SIX STATUS STATES, PER PLATE, AND WHY THAT CHANGED.
	 *
	 * These were the PORTAL's tokens -- --green, --amber, --cyan, --crimson,
	 * --ice, --gear/--dim -- used directly. Those were tuned against the portal's
	 * dark green plate, and the notebook renders them on three grounds, one of
	 * which is white paper. Measured, before this change, on the ground the cell
	 * actually composites over (--surface-1, the card, NOT the page):
	 *
	 *            light   dark   idea        (glyph against its own resolved fill)
	 *   on time   1.93   4.32   4.49
	 *   late      2.36   3.62   3.84
	 *   awaiting  1.94   5.10   5.28
	 *   flagged   2.55   3.06   3.25
	 *   excused   2.01   8.38   8.73
	 *   missing   3.34   5.03   5.24
	 *
	 * Twelve of eighteen below 4.5:1, and on the DEFAULT palette all six were --
	 * five of them below even 3:1. The glyph is text at 14.4px, so 4.5:1 is the
	 * bar it has to clear, and it was not close.
	 *
	 * The values now come from --nb-cell-* (colors.css), declared once per plate.
	 * What is NOT per-plate, and is still the locked contract: the six glyphs, the
	 * 1.9rem cell box, the 0.35/0.4rem density, Share Tech Mono, and the hue
	 * identity of each state (green = on time, amber = late, cyan = awaiting,
	 * crimson = flagged, ice = excused, sage = missing). Only lightness moves,
	 * every value holds its source hue to within a degree, and no state depends
	 * on colour alone -- each still carries its own glyph and its own fill style.
	 * The fill is a PINNED colour rather than a mix of the ink, because a mix moves
	 * whenever the ink does and hands most of the contrast straight back. */
	.chip.on_time,
	.cell.on_time {
		background: var(--nb-cell-ontime-fill);
		border-color: var(--nb-cell-ontime);
		color: var(--nb-cell-ontime);
	}
	.chip.late,
	.cell.late {
		background: var(--nb-cell-late-fill);
		border-color: var(--nb-cell-late);
		color: var(--nb-cell-late);
	}
	.chip.pending_review,
	.cell.pending_review {
		background: var(--nb-cell-await-fill);
		border-color: var(--nb-cell-await);
		color: var(--nb-cell-await);
	}
	.chip.flagged,
	.cell.flagged {
		background: var(--nb-cell-flagged-fill);
		border-color: var(--nb-cell-flagged);
		color: var(--nb-cell-flagged);
	}
	.chip.excused,
	.cell.excused {
		background: transparent;
		border: 1px dashed var(--nb-cell-excused);
		color: var(--nb-cell-excused);
	}
	.chip.missing,
	.cell.missing {
		background: transparent;
		border: 1px dashed var(--nb-cell-missing-edge);
		color: var(--nb-cell-missing);
	}

	/* NOT YET LOOKED AT (0121). A mark in its own corner rather than a seventh
	   glyph or a seventh hue: what the cell says about the WORK and whether
	   anybody has SEEN it are two questions, and the six-glyph vocabulary is a
	   locked contract. It is a shape, and the cell's title and its screen-reader
	   line both say the words, so it is never colour on its own. */
	.todo-dot {
		display: block;
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 999px;
		background: var(--nb-accent-ink);
	}
	.cell .todo-dot {
		position: absolute;
		top: -0.15rem;
		left: -0.15rem;
		box-shadow: 0 0 0 1.5px var(--surface-1);
	}

	.badge {
		position: absolute;
		top: -0.3rem;
		right: -0.3rem;
		min-width: 0.9rem;
		padding: 0 0.15rem;
		border-radius: 999px;
		/* Was --bg0 (the dark page); the badge floats on the light card now. */
		background: var(--surface-1);
		border: 1px solid currentColor;
		font-size: 0.6rem;
		line-height: 0.95rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
