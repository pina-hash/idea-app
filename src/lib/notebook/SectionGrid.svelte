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
		onOpen
	}: {
		grid: SectionGrid;
		/** The cell currently expanded below, highlighted in place. */
		selectedEntryId?: string | null;
		onOpen: (cell: GridCell) => void;
	} = $props();

	const sessions = $derived(sessionsInOrder(grid.sessions));
	const index = $derived(cellIndex(grid));
	const summaries = $derived(summarize(grid));

	function cellFor(studentId: string, sessionId: string): GridCell | undefined {
		return index.get(`${studentId}|${sessionId}`);
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
		<h2>Compliance grid</h2>
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
					{#each summaries as summary (summary.student.id)}
						<tr>
							<th scope="row" class="name-col">
								<span class="student-name">{summary.student.name}</span>
								{#if summary.student.free_entries > 0}
									<span
										class="free"
										title="Entries filed in this section with no check-in attached. They are not counted in the grid."
										>+{summary.student.free_entries} free</span
									>
								{/if}
							</th>
							{#each sessions as session (session.id)}
								{@const cell = cellFor(summary.student.id, session.id)}
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
		gap: 0.9rem;
	}
	.grid-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.grid-head h2 {
		margin: 0;
	}
	.legend {
		list-style: none;
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		font-size: 0.72rem;
		color: var(--nb-ink-faint);
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.chip {
		display: inline-grid;
		place-items: center;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 3px;
		/* Explicit, where it used to inherit from the legend: the glyph
		   rendering (✓ ⤴ ○ ! E –) is a locked contract, so the chips keep
		   Share Tech Mono even though the legend labels went sans. */
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		line-height: 1;
	}
	.empty {
		color: var(--nb-ink-soft);
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
		border-bottom: 1px solid var(--nb-hairline);
	}
	thead th {
		vertical-align: bottom;
		border-bottom: 1px solid var(--nb-hairline-strong);
	}
	.name-col {
		text-align: left;
		position: sticky;
		left: 0;
		background: var(--nb-surface);
		min-width: 11rem;
		font-weight: 400;
	}
	.student-name {
		color: var(--nb-ink);
	}
	.free {
		display: block;
		font-size: 0.7rem;
		color: var(--nb-ink-faint);
	}
	.session-col {
		min-width: 5.4rem;
		max-width: 8rem;
	}
	.col-label {
		display: block;
		font-size: 0.8rem;
		color: var(--nb-ink);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.col-date {
		display: block;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.count-col {
		min-width: 5rem;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}
	.count {
		color: var(--nb-ink-faint);
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
		border-radius: 4px;
		border: 1px solid transparent;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.9rem;
		line-height: 1;
		background: transparent;
	}
	button.cell {
		cursor: pointer;
	}
	button.cell:hover,
	button.cell:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px rgba(38, 34, 27, 0.3);
	}
	/* The open cell keeps the raw gold ring -- the accent thread, unchanged. */
	.cell.selected {
		box-shadow: 0 0 0 2px var(--gold);
	}

	.chip.on_time,
	.cell.on_time {
		background: color-mix(in srgb, var(--green) 26%, transparent);
		border-color: var(--green);
		color: var(--green);
	}
	.chip.late,
	.cell.late {
		background: color-mix(in srgb, var(--amber) 26%, transparent);
		border-color: var(--amber);
		color: var(--amber);
	}
	.chip.pending_review,
	.cell.pending_review {
		background: color-mix(in srgb, var(--cyan) 20%, transparent);
		border-color: var(--cyan);
		color: var(--cyan);
	}
	.chip.flagged,
	.cell.flagged {
		background: color-mix(in srgb, var(--crimson) 30%, transparent);
		border-color: var(--crimson);
		color: var(--crimson);
	}
	.chip.excused,
	.cell.excused {
		background: transparent;
		border: 1px dashed var(--ice);
		color: var(--ice);
	}
	.chip.missing,
	.cell.missing {
		background: transparent;
		border: 1px dashed var(--gear);
		color: var(--dim);
	}

	.badge {
		position: absolute;
		top: -0.3rem;
		right: -0.3rem;
		min-width: 0.9rem;
		padding: 0 0.15rem;
		border-radius: 999px;
		/* Was --bg0 (the dark page); the badge floats on the light card now. */
		background: var(--nb-surface);
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
