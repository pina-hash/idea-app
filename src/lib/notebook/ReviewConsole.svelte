<script lang="ts">
	import { untrack } from 'svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import SessionManager from '$lib/notebook/SessionManager.svelte';
	import SectionGrid from '$lib/notebook/SectionGrid.svelte';
	import EntryReview from '$lib/notebook/EntryReview.svelte';
	import '$lib/notebook/notebook-theme.css';
	import { todayIso } from '$lib/notebook';
	import {
		buildCsv,
		csvFilename,
		unitsOf,
		type GridCell,
		type GridSession,
		type ReviewSection,
		type ReviewTransports,
		type SectionGrid as SectionGridData,
		type ReviewEntry
	} from '$lib/notebook-review';

	/**
	 * The whole instructor review screen, factored out of /notebook/review so
	 * a dev harness mounts the SAME component against sample data (the
	 * NotebookView / CoinBalanceView convention).
	 *
	 * It owns the ORCHESTRATION -- which section, which unit, refetching after
	 * a write, which cell is open -- but not the transport: every server call
	 * is injected, so the real page points them at 0069's RPCs and the harness
	 * answers in memory. That split is what makes "a flag reaches
	 * notebook_flag_entry with these exact arguments" checkable with no
	 * backend.
	 *
	 * SECTION SCOPING IS THE CALLER'S. `sections` arrives already limited to
	 * what this viewer may touch (a section instructor gets only their own
	 * rows, the chair tier gets all of them), which is the same question
	 * `/notebook` asks via notebook-access.ts. This component never decides
	 * who sees what -- and could not be trusted to, since the real boundary is
	 * `notebook_get_section_grid`'s own instructor-or-admin check.
	 */
	let {
		sections,
		isChair,
		configured = true,
		transports
	}: {
		sections: ReviewSection[];
		isChair: boolean;
		/** 0069 applied; false renders the fail-soft card instead of a broken page. */
		configured?: boolean;
		transports: ReviewTransports;
	} = $props();

	let sectionId = $state<string | null>(null);
	let unit = $state<number | null>(null);
	/** null = "all units"; otherwise the selected unit number. */
	let unitChoice = $state<string>('all');

	let sessions = $state<GridSession[]>([]);
	let grid = $state<SectionGridData | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	/**
	 * The open cell is identified by its ENTRY ID and the cell itself is
	 * derived from the current grid, never snapshotted at click time. A
	 * snapshot goes stale the moment a flag or resolve refetches the grid --
	 * which it did: the panel's own status chip kept reading "Late" beside a
	 * cell that had just turned red. Deriving it means the two cannot
	 * disagree, and a cell that stops existing (its check-in was deleted)
	 * closes the panel rather than describing something that is gone.
	 */
	let openEntryId = $state<string | null>(null);
	let openEntry = $state<ReviewEntry | null>(null);
	let entryLoading = $state(false);
	let entryError = $state<string | null>(null);

	const openCell = $derived(
		grid?.cells.find((c) => c.entry_id !== null && c.entry_id === openEntryId) ?? null
	);

	const section = $derived(sections.find((s) => s.id === sectionId) ?? null);
	const units = $derived(unitsOf(sessions));

	/**
	 * Default to the first section this viewer may touch, and re-default if
	 * the selection ever stops being one of them -- which is the same shape as
	 * NotebookView's stale-quick-pick rule: a selection that is no longer
	 * valid must fall back rather than persist into a query that would only
	 * be refused.
	 */
	$effect(() => {
		if (!sections.some((s) => s.id === sectionId)) sectionId = sections[0]?.id ?? null;
	});

	/**
	 * The unit picker is scoped to the SELECTED section, so a unit that only
	 * exists in another section must not survive a section change. Reset to
	 * "all" whenever the selected section's units no longer contain the
	 * choice, rather than silently querying a unit this section has none of.
	 */
	$effect(() => {
		if (unitChoice !== 'all' && !units.includes(Number(unitChoice))) unitChoice = 'all';
	});

	$effect(() => {
		unit = unitChoice === 'all' ? null : Number(unitChoice);
	});

	/** Section changed: drop everything scoped to the old one. */
	$effect(() => {
		void sectionId;
		closeEntry();
	});

	/**
	 * Guards against a stale response overwriting a newer one: switching
	 * section twice quickly leaves two loads in flight, and the first to
	 * return is not necessarily the one asked for last.
	 */
	let loadToken = 0;

	async function refresh(id = sectionId, unitNumber = unit) {
		if (!id) return;
		const token = ++loadToken;
		loading = true;
		loadError = null;
		const [sessionResult, gridResult] = await Promise.all([
			transports.loadSessions(id),
			transports.loadGrid(id, unitNumber)
		]);
		if (token !== loadToken) return;
		loading = false;
		if (!sessionResult.ok) {
			loadError = sessionResult.error;
			return;
		}
		if (!gridResult.ok) {
			loadError = gridResult.error;
			grid = null;
			return;
		}
		sessions = sessionResult.value;
		grid = gridResult.value;
	}

	/**
	 * Reload whenever the section or the unit changes -- and ONLY then.
	 *
	 * The refetch is deliberately `untrack`ed. An effect tracks every reactive
	 * read that happens while it runs, INCLUDING ones inside a function it
	 * calls, so running the transports in the tracked scope would silently
	 * make this effect depend on whatever state those injected functions
	 * happen to touch. That is not hypothetical: it made this effect both read
	 * and write the harness's own call log and spun until Svelte's update-depth
	 * guard fired. The section and the unit are the real dependencies, so they
	 * are the only two things read here.
	 */
	$effect(() => {
		const id = sectionId;
		const unitNumber = unit;
		untrack(() => void refresh(id, unitNumber));
	});

	function closeEntry() {
		openEntryId = null;
		openEntry = null;
		entryError = null;
	}

	async function openFromCell(cell: GridCell) {
		const entryId = cell.entry_id;
		if (!entryId) return;
		// Clicking the open cell again closes it.
		if (openEntryId === entryId) {
			closeEntry();
			return;
		}
		openEntryId = entryId;
		openEntry = null;
		entryError = null;
		entryLoading = true;
		const result = await transports.loadEntry(entryId);
		entryLoading = false;
		// A second click while the first was in flight wins; drop the stale one.
		if (openEntryId !== entryId) return;
		if (!result.ok) {
			entryError = result.error;
			return;
		}
		openEntry = result.value;
	}

	/**
	 * After a flag or resolve both the grid and the entry are stale. The CELL
	 * needs no repair -- it is derived from the refetched grid.
	 */
	async function afterReview(entryId: string) {
		await refresh();
		const reloaded = await transports.loadEntry(entryId);
		if (reloaded.ok && openEntryId === entryId) openEntry = reloaded.value;
	}

	async function flagEntry(entryId: string, reason: Parameters<ReviewTransports['flagEntry']>[1], comment: string | null) {
		const result = await transports.flagEntry(entryId, reason, comment);
		if (result.ok) await afterReview(entryId);
		return result;
	}

	async function resolveEntry(entryId: string, comment: string | null) {
		const result = await transports.resolveEntry(entryId, comment);
		if (result.ok) await afterReview(entryId);
		return result;
	}

	async function saveSession(input: Parameters<ReviewTransports['saveSession']>[0]) {
		const result = await transports.saveSession(input);
		if (result.ok) await refresh();
		return result;
	}

	async function deleteSession(id: string) {
		const result = await transports.deleteSession(id);
		if (result.ok) {
			// A detached entry may have been the open cell's.
			closeEntry();
			await refresh();
		}
		return result;
	}

	function exportCsv() {
		if (!grid) return;
		const blob = new Blob([buildCsv(grid)], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = csvFilename(grid, todayIso());
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	const openStudent = $derived.by(() => {
		const cell = openCell;
		return cell ? grid?.students.find((s) => s.id === cell.student_id) : undefined;
	});
	const openSession = $derived.by(() => {
		const cell = openCell;
		return cell ? grid?.sessions.find((s) => s.id === cell.session_id) : undefined;
	});
</script>

<svelte:head>
	<title>Section review // IDEA Notebook</title>
</svelte:head>

<!-- .nb-root scopes the notebook's editorial light theme (notebook-theme.css);
     the review console lives in the same room as the student feed. -->
<div class="nb-root">
<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/notebook">&lsaquo; My Notebook</a>
		<ProfileMenu />
	</div>
</div>

<main class="review-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Notebook</div>
		<h1>Section review</h1>
		<p class="lead">
			Every student in a section against every scheduled check-in. You are seeing
			{isChair ? 'every section' : 'the sections you teach'}.
		</p>
	</section>

	{#if !configured}
		<section class="card">
			<h2>Not available yet</h2>
			<p class="note">
				The notebook's data layer is not set up on this deployment. Apply migration
				<code>0069_notebook.sql</code> in the Supabase SQL editor and reload.
			</p>
		</section>
	{:else if sections.length === 0}
		<section class="card">
			<h2>No sections yet</h2>
			<p class="note">
				{isChair
					? 'No notebook sections exist. Create one first; a section names its instructor, which is what puts this page in front of them.'
					: 'You are not listed as the instructor of a notebook section yet. A site admin creates sections and assigns instructors.'}
			</p>
		</section>
	{:else}
		<section class="card pickers">
			<label class="field">
				<span>Section</span>
				<select bind:value={sectionId}>
					{#each sections as s (s.id)}
						<option value={s.id}>{s.section_label} · {s.course_id}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Unit</span>
				<select bind:value={unitChoice} disabled={units.length === 0}>
					<option value="all">All units</option>
					{#each units as u (u)}
						<option value={String(u)}>Unit {u}</option>
					{/each}
				</select>
			</label>
			<div class="picker-actions">
				<button
					type="button"
					class="btn secondary"
					onclick={exportCsv}
					disabled={!grid || grid.students.length === 0}
				>
					Export CSV
				</button>
				{#if loading}<span class="loading">Loading...</span>{/if}
			</div>
		</section>

		{#if loadError}
			<section class="card">
				<p class="msg error" role="alert">{loadError}</p>
			</section>
		{/if}

		{#if sectionId}
			<SessionManager {sectionId} {sessions} onSave={saveSession} onDelete={deleteSession} />
		{/if}

		{#if grid}
			<SectionGrid {grid} selectedEntryId={openEntryId} onOpen={openFromCell} />

			{#if entryLoading}
				<section class="card"><p class="note">Loading entry...</p></section>
			{:else if entryError}
				<section class="card"><p class="msg error" role="alert">{entryError}</p></section>
			{:else if openEntry && openCell}
				<EntryReview
					entry={openEntry}
					cell={openCell}
					student={openStudent}
					session={openSession}
					onFlag={flagEntry}
					onResolve={resolveEntry}
					onClose={closeEntry}
				/>
			{/if}

			<section class="card scoring">
				<h2>About the suggested score</h2>
				<p class="note">
					The CSV suggests a presence score out of 7 as
					<strong>sessions covered / total sessions x 7</strong>, rounded, and leaves the final
					score column blank for you. Covered means an entry was filed, whatever its status. An
					<strong>excused</strong> session is reported in its own column rather than folded into
					that fraction, so raise the score by hand where an excusal explains a gap.
					{#if section}
						Exporting {section.section_label}, {grid.unit_number === null
							? 'all units'
							: `unit ${grid.unit_number}`}.
					{/if}
				</p>
			</section>
		{/if}
	{/if}

	<VersionBadge app="portal" />
</main>
</div>

<style>
	/* Same room as the student feed (palette + type from .nb-root), but the
	   console keeps its working density -- the grid is for scanning. */
	.review-page {
		max-width: 76rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
		display: grid;
		gap: 1.1rem;
	}
	.pickers {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.field {
		display: grid;
		gap: 0.25rem;
		min-width: min(12rem, 100%);
		max-width: 100%;
	}
	.field span {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--nb-ink-faint);
	}
	.field select {
		/* min-width: 0 stops the select's intrinsic width (its longest option
		   text) from propagating up and forcing the page wider than a phone --
		   the section names are long, and at 375px this was the one thing that
		   made the whole layout viewport overflow. */
		width: 100%;
		min-width: 0;
		padding: 0.45rem 0.55rem;
		background: var(--nb-surface);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--nb-radius-control);
		color: var(--nb-ink);
		font-family: inherit;
		font-size: 0.95rem;
	}
	.field select:focus {
		outline: none;
		border-color: var(--nb-accent);
	}
	.picker-actions {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-left: auto;
	}
	.loading {
		font-size: 0.78rem;
		color: var(--nb-ink-faint);
	}
	.note {
		color: var(--nb-ink-soft);
		font-size: 0.88rem;
	}
	.note strong {
		color: var(--nb-ink);
	}
	.msg {
		margin: 0;
		font-size: 0.9rem;
	}
	.msg.error {
		color: var(--nb-error);
	}
	.scoring h2 {
		margin: 0 0 0.3rem;
		font-size: 1rem;
	}
</style>
