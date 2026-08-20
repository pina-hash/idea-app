<script lang="ts">
	import {
		CELL_STATES,
		cellDisplay,
		cellGlyph,
		cellIndex,
		cellLabel,
		completionLabel,
		hasEntry,
		sessionsInOrder,
		shortDate,
		summarize,
		type GridCell,
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
	 * A cell with no entry has nothing to open and is rendered as plain text
	 * rather than a dead button.
	 */
	let {
		grid,
		selectedEntryId = null,
		onOpen,
		studentHref
	}: {
		grid: SectionGrid;
		/** The cell currently expanded below, highlighted in place. */
		selectedEntryId?: string | null;
		onOpen: (cell: GridCell) => void;
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
	 * Keyed on the roster's `student_key`, not the uuid: since 0094 a student
	 * who is enrolled but has never signed in has no uuid at all, and every one
	 * of them would otherwise share the key "null|<session>".
	 */
	function cellFor(studentKey: string, sessionId: string): GridCell | undefined {
		return index.get(`${studentKey}|${sessionId}`);
	}

	function cellTitle(cell: GridCell): string {
		const display = cellDisplay(cell);
		const bits = [cellLabel(display)];
		if (cell.entry_count > 1) bits.push(`${cell.entry_count} entries, showing the latest`);
		if (cell.excused && cell.entry_id) bits.push('also excused');
		if (cell.entry_id) bits.push('click to open');
		return bits.join(' · ');
	}
</script>

<section class="card grid-card">
	<header class="grid-head">
		<div class="grid-title">
			<h2>Compliance grid</h2>
			<!--
				What this grid DOES was previously only discoverable by hovering a
				cell and reading "click to open" at the end of a tooltip, or by
				clicking one and finding out. Two capabilities, said once, in
				plain words, where someone opening this page for the first time
				will read them.
			-->
			<p class="grid-hint">
				Click any cell that has an entry to open it beside the grid.{#if anyStudentLink}{' '}Click
					a student's name to read their whole notebook.{/if}
			</p>
		</div>
		<ul class="legend">
			{#each CELL_STATES as state (state.key)}
				<li title={state.hint}>
					<span class="chip {state.key}" aria-hidden="true">{state.glyph}</span>
					{state.label}
				</li>
			{/each}
		</ul>
	</header>

	{#if sessions.length === 0}
		<p class="empty">
			This unit has no check-ins scheduled, so there is nothing to grade against yet. Add one above.
		</p>
	{:else if grid.students.length === 0}
		<p class="empty">
			No students are on this section's roster yet. A student joins it by pinning this class on the
			homepage, or by filing an entry against it.
		</p>
	{:else}
		<div class="table-scroll">
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
										>+{summary.student.free_entries} free</span
									>
								{/if}
							</th>
							{#each sessions as session (session.id)}
								{@const cell = cellFor(summary.student.student_key, session.id)}
								<td>
									{#if cell && hasEntry(cell)}
										<button
											type="button"
											class="cell {cellDisplay(cell)}"
											class:selected={selectedEntryId !== null && cell.entry_id === selectedEntryId}
											title={cellTitle(cell)}
											onclick={() => onOpen(cell)}
										>
											<span aria-hidden="true">{cellGlyph(cellDisplay(cell))}</span>
											<span class="sr-only"
												>{summary.student.name}, {session.session_label}: {cellLabel(
													cellDisplay(cell)
												)}</span
											>
											{#if cell.entry_count > 1}<span class="badge">{cell.entry_count}</span>{/if}
										</button>
									{:else if cell}
										<span class="cell static {cellDisplay(cell)}" title={cellTitle(cell)}>
											<span aria-hidden="true">{cellGlyph(cellDisplay(cell))}</span>
											<span class="sr-only"
												>{summary.student.name}, {session.session_label}: {cellLabel(
													cellDisplay(cell)
												)}</span
											>
										</span>
									{:else}
										<span class="cell static missing" aria-hidden="true">–</span>
									{/if}
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
	{/if}
</section>

<style>
	.grid-card {
		display: grid;
		gap: var(--space-4);
	}
	.grid-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.grid-head h2 {
		margin: 0;
	}
	.grid-title {
		display: grid;
		gap: var(--space-1);
	}
	.grid-hint {
		margin: 0;
		max-width: 34rem;
		font-size: 0.78rem;
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
	.empty {
		color: var(--text-2);
		font-size: 0.9rem;
	}

	.table-scroll {
		overflow-x: auto;
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
	}
	.name-col {
		text-align: left;
		position: sticky;
		left: 0;
		background: var(--surface-1);
		min-width: 11rem;
		font-weight: 400;
	}
	.student-name {
		color: var(--text-1);
	}
	/* The one gold thread this console already uses for links and active
	   states; the six status colours stay a locked contract and are not
	   borrowed here. */
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
	}
	button.cell {
		cursor: pointer;
	}
	/* THE FOCUS RING WAS NOT BEING DRAWN. It was a hardcoded ink rgba tuned for
	   paper, and it measured 1.02:1 on the dark plate and 1.03:1 on IDEA -- i.e.
	   a keyboard user tabbing through the grid had no visible indicator at all in
	   two of the three rooms, and 1.88:1 in the third. --nb-cell-ring is the
	   room's own ink, so it follows the plate: 4.2:1 light, 8.9:1 dark. */
	button.cell:hover,
	button.cell:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--nb-cell-ring);
	}
	/* The open cell keeps the raw gold ring -- the accent thread, unchanged. */
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
