<script lang="ts">
	import Pending from '$lib/Pending.svelte';
	import { PRESENCE_STALE_NOTE } from '$lib/classroom/presence/state';
	import {
		LIVE_CELL_DISPLAY,
		LIVE_GROUP_ORDER,
		liveGroups,
		liveTally,
		type LiveCell,
		type LiveCellState,
		type LiveItemChoice,
		type LivePresenceStatus
	} from './grid';

	/**
	 * THE STUDENTS-BY-WORK GRID, private to the teacher's control view.
	 *
	 * Presentation only: the cells arrive classified (`liveCells` in grid.ts is
	 * the one classifier), the chooser's options arrive ranked, and a choice is
	 * reported up through `onchoose`. Nothing here reads a clock, a transport or
	 * the roster.
	 *
	 * GROUPED BY STATE, STUCK FIRST. A teacher at the front of the room asks
	 * "who needs me", so the idle and away students are the first names read,
	 * and every group carries its word, its glyph and its count, never a colour
	 * alone. The groups are panels of unequal height side by side, so they sit in
	 * a MULTI-COLUMN container rather than a grid (the ClassView column rule): a
	 * grid row is as tall as its tallest member and a short group beside a long
	 * one would leave its column dead.
	 *
	 * THE TALLY CHIPS FILTER. One press narrows the groups to one state ("who has
	 * not opened it"); a second press, or Show everyone, takes it off. A chip is
	 * an `aria-pressed` button with the word and the count on it.
	 */
	let {
		cells,
		choices,
		chosenId,
		presenceStatus,
		loading = false,
		gradeHref = null,
		onchoose
	}: {
		cells: LiveCell[];
		choices: LiveItemChoice[];
		chosenId: string | null;
		presenceStatus: LivePresenceStatus;
		/** The hand-in read has not landed yet. */
		loading?: boolean;
		/** The grading console for the chosen assignment, or null (a material, or no item). */
		gradeHref?: string | null;
		onchoose: (itemId: string) => void;
	} = $props();

	let picked = $state<LiveCellState | null>(null);
	const tally = $derived(liveTally(cells));
	// A filter left pointing at a state nobody is in any more would read as an
	// empty grid with no reason on screen, so it lets go by itself.
	const only = $derived(picked && tally[picked] > 0 ? picked : null);
	const groups = $derived(liveGroups(only ? cells.filter((c) => c.state === only) : cells));
	const missingCount = $derived(cells.filter((c) => c.missing).length);
	const chosen = $derived(choices.find((c) => c.id === chosenId) ?? null);
	const assignments = $derived(choices.filter((c) => c.signal));
	const others = $derived(choices.filter((c) => !c.signal));
</script>

<section class="lg-root" data-testid="live-grid" aria-labelledby="lg-title">
	<div class="lg-head">
		<h2 id="lg-title" class="lg-title">Who is working</h2>
		{#if choices.length > 0}
			<label class="lg-choose">
				<span class="lg-choose-label">Item</span>
				<select
					data-testid="live-item"
					value={chosenId ?? ''}
					onchange={(e) => onchoose((e.currentTarget as HTMLSelectElement).value)}
				>
					{#if assignments.length}
						<optgroup label="Assignments">
							{#each assignments as c (c.id)}
								<option value={c.id}>{c.title}</option>
							{/each}
						</optgroup>
					{/if}
					{#if others.length}
						<optgroup label="Posted today">
							{#each others as c (c.id)}
								<option value={c.id}>{c.title}</option>
							{/each}
						</optgroup>
					{/if}
				</select>
			</label>
		{/if}
		{#if gradeHref}
			<a class="btn secondary lg-grade" href={gradeHref} data-testid="live-grade-link">Open grading</a>
		{/if}
	</div>

	{#if choices.length === 0}
		<p class="lg-empty" data-testid="live-grid-empty">Nothing posted yet</p>
	{:else}
		<div class="lg-tally" role="group" aria-label="Filter by state" data-testid="live-tally">
			{#each LIVE_GROUP_ORDER as state (state)}
				{#if tally[state] > 0}
					{@const d = LIVE_CELL_DISPLAY[state]}
					<button
						type="button"
						class="lg-chip"
						data-tone={d.tone}
						data-state={state}
						aria-pressed={only === state}
						data-testid="live-tally-{state}"
						onclick={() => (picked = only === state ? null : state)}
					>
						<span class="lg-glyph" aria-hidden="true">{d.glyph}</span>
						<span>{d.label}</span>
						<span class="lg-count">{tally[state]}</span>
					</button>
				{/if}
			{/each}
			{#if missingCount > 0}
				<span class="lg-chip lg-missing-chip" data-testid="live-missing-count">
					<span class="lg-glyph" aria-hidden="true">!</span>
					<span>Missing</span>
					<span class="lg-count">{missingCount}</span>
				</span>
			{/if}
			{#if only}
				<button type="button" class="lg-chip lg-clear" onclick={() => (picked = null)}>Show everyone</button>
			{/if}
		</div>

		{#if presenceStatus === 'stale'}
			<p class="lg-note" data-testid="live-presence-stale">{PRESENCE_STALE_NOTE}</p>
		{/if}
		{#if loading && cells.length === 0}
			<Pending label="Loading who is working" />
		{:else if cells.length === 0}
			<p class="lg-empty" data-testid="live-grid-no-students">No students on the roster</p>
		{:else}
			<div class="lg-groups" data-testid="live-groups">
				{#each groups as g (g.state)}
					{@const d = LIVE_CELL_DISPLAY[g.state]}
					<section class="lg-group" data-tone={d.tone} data-state={g.state} data-testid="live-group-{g.state}">
						<h3 class="lg-group-head">
							<span class="lg-glyph" aria-hidden="true">{d.glyph}</span>
							<span>{d.label}</span>
							<span class="lg-count">{g.cells.length}</span>
						</h3>
						<ul class="lg-list">
							{#each g.cells as c (c.email)}
								<li class="lg-row" data-testid="live-cell" data-state={c.state}>
									<span class="lg-name">{c.name}</span>
									{#if c.detail}<span class="lg-detail">{c.detail}</span>{/if}
									{#if c.missing}
										<span class="lg-missing" data-testid="live-cell-missing">
											<span aria-hidden="true">!</span> Missing
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	{/if}
	{#if chosen && !chosen.signal}
		<!-- A column state rather than a paragraph: the students above already read
		     "No signal", and this names why in two words beside the item it is about. -->
		<p class="lg-signal-chip" data-testid="live-no-signal">
			<span aria-hidden="true">⌀</span> Materials send no presence
		</p>
	{/if}
</section>

<style>
	.lg-root {
		min-width: 0;
	}
	.lg-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
	}
	.lg-title {
		margin: 0;
		font-size: 1.15rem;
		line-height: 1.3;
		flex: 1 1 auto;
	}
	.lg-choose {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		flex: 1 1 16rem;
		max-width: 28rem;
	}
	.lg-choose-label {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lg-choose select {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
		padding: 0 0.6rem;
	}
	.lg-grade {
		flex: none;
	}
	.lg-tally {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.lg-chip {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		color: var(--text-1);
		font: inherit;
		font-size: 0.92rem;
		cursor: pointer;
	}
	.lg-chip[aria-pressed='true'] {
		background: var(--surface-2);
		border-color: var(--accent-ink);
		box-shadow: inset 0 -3px 0 var(--accent-ink);
	}
	.lg-missing-chip {
		cursor: default;
		color: var(--status-warn);
	}
	.lg-clear {
		color: var(--text-2);
	}
	.lg-count {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		min-width: 1.4em;
		padding: 0.05rem 0.35rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		text-align: center;
		color: var(--text-2);
	}
	.lg-glyph {
		font-family: var(--font-mono);
		width: 1.1em;
		text-align: center;
	}
	[data-tone='ok'] .lg-glyph,
	.lg-chip[data-tone='ok'] .lg-glyph {
		color: var(--status-ok);
	}
	[data-tone='warn'] .lg-glyph,
	.lg-chip[data-tone='warn'] .lg-glyph {
		color: var(--status-warn);
	}
	[data-tone='info'] .lg-glyph,
	.lg-chip[data-tone='info'] .lg-glyph {
		color: var(--status-info);
	}
	[data-tone='quiet'] .lg-glyph,
	[data-tone='done'] .lg-glyph {
		color: var(--text-2);
	}
	.lg-note,
	.lg-empty {
		color: var(--text-2);
		margin: 0 0 var(--space-3);
	}
	/* THE GROUPS: a multi-column container, the ClassView column rule. The
	   width is a readable name plus its evidence; the count caps the columns
	   so two groups share the measure rather than leaving a dead third. */
	.lg-groups {
		columns: 15rem 4;
		column-gap: var(--space-3);
	}
	.lg-group {
		break-inside: avoid;
		margin: 0 0 var(--space-3);
		padding: var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.lg-group[data-tone='warn'] {
		border-left: 4px solid var(--status-warn);
	}
	.lg-group-head {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0 0 var(--space-2);
		font-size: 1rem;
		line-height: 1.3;
	}
	.lg-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.lg-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.1rem 0.6rem;
		min-width: 0;
	}
	.lg-name {
		color: var(--text-1);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.lg-detail {
		color: var(--text-2);
		font-size: 0.85rem;
	}
	.lg-missing {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--status-warn);
		border: 1px solid currentColor;
		border-radius: var(--radius-chip);
		padding: 0 0.35rem;
	}
	.lg-signal-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-chip);
		color: var(--text-2);
		font-size: 0.88rem;
	}
</style>
