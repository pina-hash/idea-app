<script lang="ts">
	import { tick, untrack } from 'svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import SessionManager from '$lib/notebook/SessionManager.svelte';
	import SectionGrid from '$lib/notebook/SectionGrid.svelte';
	import EntryReview from '$lib/notebook/EntryReview.svelte';
	import DocumentationCheck from '$lib/notebook/DocumentationCheck.svelte';
	import NotebookMasthead from '$lib/notebook/NotebookMasthead.svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import { revealDetailPane } from '$lib/shell/reveal';
	import { notebookThemeAttr } from '$lib/notebook/notebook-theme.svelte';
	import '$lib/notebook/notebook-theme.css';
	import {
		REVIEW_KEYS,
		cellReviewed,
		clampCursor,
		cursorCell,
		firstCursor,
		gridReviewReady,
		isTypingTarget,
		moveCursor,
		nextUnreviewed,
		reviewAction,
		sectionName,
		unitsOf,
		type GridCell,
		type GridCursor,
		type GridSession,
		type ReviewAction,
		type ReviewSection,
		type ReviewTransports,
		type SectionGrid as SectionGridData,
		type ReviewEntry
	} from '$lib/notebook-review';
	import type { DocCheckTransports } from '$lib/notebook-documentation-check';

	/**
	 * The whole instructor review screen, factored out of /notebook/review so
	 * a dev harness mounts the SAME component against sample data (the
	 * NotebookView / CoinBalanceView convention).
	 *
	 * IT IS AN APPLICATION, NOT A PAGE, and that is the rebuild. It used to be
	 * a stack: a hero, then the pickers, then the check-in manager, then the
	 * grid with a 21rem panel beside it, then the Documentation Check under the
	 * whole thing. Reviewing one student was click a cell, read a photograph too
	 * small to read, click a verdict, click the next cell; grading a unit was a
	 * scroll past the entire roster and back up to see what you were grading.
	 * Now: one bar of chrome, three modes, and a grid beside an open entry that
	 * both fit the viewport at 1440px. The arrow keys walk the grid, one key
	 * acknowledges and moves on, and the keys are printed in the bar.
	 *
	 * IT OWNS THE ORCHESTRATION -- which section, which unit, which mode, where
	 * the cursor is, refetching after a write, what live updates do -- but not
	 * the transport: every server call is injected, so the real page points them
	 * at the RPCs and the harness answers in memory. That split is what makes
	 * "a flag reaches notebook_flag_entry with these exact arguments" checkable
	 * with no backend, and it is now also what makes the realtime path
	 * drivable: `transports.subscribe` is a function the harness can call.
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
		initialSectionId = null,
		transports,
		docCheck = null
	}: {
		sections: ReviewSection[];
		isChair: boolean;
		/**
		 * Which section to open on, from `?section=` -- so a class page can link
		 * straight into its own grid rather than dropping the instructor on
		 * whichever section happens to sort first.
		 *
		 * The CALLER validates it against the list it is passing; an id that is
		 * not in `sections` falls through to the default below, which is the
		 * same stale-selection rule the picker already applies. It changes only
		 * which section is preselected, never which the viewer may reach --
		 * notebook_get_section_grid decides that.
		 */
		initialSectionId?: string | null;
		/** 0069 applied; false renders the fail-soft card instead of a broken page. */
		configured?: boolean;
		transports: ReviewTransports;
		/**
		 * The Documentation Check panel's own transports (0097). Null omits the
		 * MODE entirely, which is the fail-soft state on a deployment where 0097
		 * is not applied yet -- the grid, the check-in manager and every review
		 * action are untouched by its absence.
		 */
		docCheck?: DocCheckTransports | null;
	} = $props();

	/**
	 * THE THREE MODES, and why this is a mode rather than a tab in the detail
	 * pane or a third column.
	 *
	 * All three of these are FULL-WIDTH tasks that are not done at the same
	 * time as each other. Reviewing is a grid beside one entry. Managing
	 * check-ins is a list of dates and the classes they run in. Grading the
	 * Documentation Check is a per-student table of four rubric criteria, and
	 * squeezed into a 34rem detail pane it would be exactly the surface this
	 * rebuild is removing. A third column would take the room the grid needs to
	 * show eight check-ins without a horizontal bar.
	 *
	 * What the brief actually asked for is that grading is reachable WITHOUT
	 * SCROLLING PAST THE GRID, and a mode switch in the bar is one click from
	 * anywhere, at any scroll position, on every screen size. It also fixes the
	 * same complaint one layer up: the check-in manager used to sit ABOVE the
	 * grid and pushed it off the first screen on every load.
	 */
	type Mode = 'review' | 'checkins' | 'grade';
	let mode = $state<Mode>('review');

	// Seeded ONCE, then owned by the picker: a later navigation within the
	// console must not be yanked back to the id the URL arrived with.
	// svelte-ignore state_referenced_locally
	let sectionId = $state<string | null>(initialSectionId);
	let unit = $state<number | null>(null);
	/** null = "all units"; otherwise the selected unit number. */
	let unitChoice = $state<string>('all');

	let sessions = $state<GridSession[]>([]);
	let grid = $state<SectionGridData | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	/** A live update landed and the grid is being re-read. Never blanks anything. */
	let liveTick = $state(0);
	let live = $state(false);

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
	/** The split's detail pane, for revealDetailPane. See $lib/shell/reveal.ts. */
	let detailEl = $state<HTMLElement | null>(null);
	let openEntry = $state<ReviewEntry | null>(null);
	let entryLoading = $state(false);
	let entryError = $state<string | null>(null);

	/** WHERE THE REVIEWER IS. Survives a refetch; see `clampCursor`. */
	let cursor = $state<GridCursor | null>(null);
	/** A keyboard request for a control inside the panel. See EntryReview. */
	let focusRequest = $state<{ target: 'flag' | 'pages'; nonce: number } | null>(null);
	let keyNonce = 0;
	/** Said out loud after an accept, and when a column runs out. */
	let actionNote = $state<string | null>(null);

	const openCell = $derived(
		grid?.cells.find((c) => c.entry_id !== null && c.entry_id === openEntryId) ?? null
	);
	const cursorAt = $derived(grid && cursor ? (cursorCell(grid, cursor) ?? null) : null);
	/**
	 * Can this deployment record an acknowledgement at all? Read from the GRID
	 * PAYLOAD rather than from a flag, so the button and the RPC cannot
	 * disagree -- and the transport has to be there too, which is what a
	 * read-only mount omits.
	 */
	const canAccept = $derived(!!transports.acceptEntry && gridReviewReady(grid));

	/**
	 * Where a student's WHOLE notebook lives -- the free-form entries the grid
	 * cannot show, since a cell is by definition a check-in.
	 *
	 * It MIRRORS `notebook_review_student_notebook`'s own guard rather than
	 * guessing: that RPC admits the chair for anyone, and an instructor only for
	 * a student with an ACTIVE enrollment in a section they teach. The grid's
	 * roster deliberately also carries students who have LEFT but filed work
	 * here (0094), and for those the RPC refuses -- so an instructor gets no
	 * link rather than a link into a 404. Their filed work is still reachable
	 * cell by cell, which is what that roster rule was protecting.
	 *
	 * A student with no account yet still gets a link: their notebook is
	 * genuinely empty and the page says so, which is a real answer rather than a
	 * permission problem, and hiding it would look like the same thing.
	 *
	 * COURTESY, NOT A BOUNDARY. The RPC re-checks every caller regardless of
	 * what this returns.
	 */
	function studentNotebookHref(student: SectionGridData['students'][number]): string | null {
		if (!student.email) return null;
		if (!isChair && !student.enrolled) return null;
		return `/notebook/review/student/${encodeURIComponent(student.email)}`;
	}

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
		cursor = null;
	});

	/**
	 * THE DOCUMENTATION CHECK GRADES ONE UNIT, so it is not reachable while the
	 * unit picker says "all". Falling back rather than rendering a panel that
	 * cannot answer: the mode button says why it is disabled.
	 */
	$effect(() => {
		if (mode === 'grade' && (unit === null || !docCheck)) mode = 'review';
	});

	/**
	 * Guards against a stale response overwriting a newer one: switching
	 * section twice quickly leaves two loads in flight, and the first to
	 * return is not necessarily the one asked for last. It is what makes the
	 * live path safe as well -- a burst of changes fires several refetches and
	 * only the last one may land.
	 */
	let loadToken = 0;

	/**
	 * `quiet` is the LIVE path: no spinner, no cleared grid, no error banner
	 * replacing what is on screen. A student filing an entry mid-review must
	 * change the cells and nothing else -- an instructor who is reading a
	 * photograph should not see the screen flash, and a socket that delivers a
	 * change while the network is briefly down must not blank a grid that is
	 * still perfectly good.
	 */
	async function refresh(id = sectionId, unitNumber = unit, opts: { quiet?: boolean } = {}) {
		if (!id) return;
		const token = ++loadToken;
		if (!opts.quiet) {
			loading = true;
			loadError = null;
		}
		const [sessionResult, gridResult] = await Promise.all([
			transports.loadSessions(id),
			transports.loadGrid(id, unitNumber)
		]);
		if (token !== loadToken) return;
		if (!opts.quiet) loading = false;
		if (!sessionResult.ok) {
			if (!opts.quiet) loadError = sessionResult.error;
			return;
		}
		if (!gridResult.ok) {
			if (!opts.quiet) {
				loadError = gridResult.error;
				grid = null;
			}
			return;
		}
		sessions = sessionResult.value;
		grid = gridResult.value;
		// THE CURSOR SURVIVES THE REFETCH. It is a (student, check-in) pair, not
		// an index, so a student who appears above it does not move it; clamping
		// only matters when the row or the column it names has gone.
		cursor = clampCursor(gridResult.value, cursor);
		if (opts.quiet) liveTick++;
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
	 *
	 * THIS IS THE LOAD-TIME FETCH AND IT STAYS. Realtime is an update path; a
	 * socket that never connects must degrade to exactly this console, not to
	 * an empty grid.
	 */
	$effect(() => {
		const id = sectionId;
		const unitNumber = unit;
		untrack(() => void refresh(id, unitNumber));
	});

	/**
	 * LIVE UPDATES.
	 *
	 * One channel per SECTION, torn down and rebuilt when the section changes,
	 * which is the gauntlet-room and tournament pattern: subscribe on mount,
	 * `removeChannel` on teardown, and a filter so a class is not woken by
	 * another class's rows. The transport owns the channel; this owns when.
	 *
	 * IT CARRIES NO PAYLOAD, ON PURPOSE. A change means "re-read the grid",
	 * never "apply this row" -- two instructors working the same section
	 * converge on what the database says instead of each patching a local copy
	 * from events that can arrive out of order or not at all.
	 *
	 * DEBOUNCED, because one student turning in an entry with four photos is
	 * five row events inside a second, and five refetches of the same grid is
	 * four wasted round trips and four chances to land out of order.
	 *
	 * `untrack` for the same reason the loader above uses it: `subscribe` is an
	 * injected function and this effect must depend on the section id alone.
	 */
	$effect(() => {
		const id = sectionId;
		const subscribe = transports.subscribe;
		if (!id || !subscribe) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const unsubscribe = untrack(() =>
			subscribe(id, () => {
				if (stopped) return;
				clearTimeout(timer);
				timer = setTimeout(() => {
					void refresh(id, untrack(() => unit), { quiet: true });
					void reloadOpenEntry();
				}, 250);
			})
		);
		live = true;
		return () => {
			stopped = true;
			live = false;
			clearTimeout(timer);
			unsubscribe();
		};
	});

	function closeEntry() {
		openEntryId = null;
		openEntry = null;
		entryError = null;
	}

	async function openFromCell(cell: GridCell) {
		const entryId = cell.entry_id;
		if (!entryId) {
			// A cell with nothing filed is a real cursor stop; the panel says so
			// rather than leaving the previous student's entry beside it, which
			// would be the wrong page next to the wrong name.
			closeEntry();
			return;
		}
		if (openEntryId === entryId) return;
		openEntryId = entryId;
		openEntry = null;
		entryError = null;
		entryLoading = true;
		// Below the split's breakpoint the panel is not beside the grid, so a
		// cell clicked far down a long roster would open it off-screen and read
		// as nothing happening. Revealed as soon as the pane EXISTS -- before the
		// entry has loaded -- so the instructor is looking at the loading state
		// rather than at the fetch finishing somewhere they cannot see. Above the
		// breakpoint `shouldReveal` answers false and this does nothing.
		void tick().then(() => revealDetailPane(detailEl));
		const result = await transports.loadEntry(entryId);
		entryLoading = false;
		// A second click while the first was in flight wins; drop the stale one.
		if (openEntryId !== entryId) return;
		if (!result.ok) {
			entryError = result.error;
			return;
		}
		openEntry = result.value;
		// AND AGAIN ONCE IT HAS LOADED. The first reveal ran against a pane
		// holding one line of "Loading entry...", so the document was shorter
		// than it is now and the scroll landed short of where the panel ended up.
		// `shouldReveal` makes the second call a no-op wherever the pane is
		// already in view, which is every desktop width.
		void tick().then(() => revealDetailPane(detailEl));
	}

	/** The live path's half of the entry reload: quiet, and only if one is open. */
	async function reloadOpenEntry() {
		const entryId = openEntryId;
		if (!entryId) return;
		const reloaded = await transports.loadEntry(entryId);
		// Still the same entry, and still ok: a failure here leaves what is on
		// screen alone rather than replacing a readable panel with an error
		// somebody did not ask for.
		if (reloaded.ok && openEntryId === entryId) openEntry = reloaded.value;
	}

	/**
	 * After a write both the grid and the entry are stale. The CELL needs no
	 * repair -- it is derived from the refetched grid.
	 */
	async function afterReview(entryId: string) {
		await refresh();
		const reloaded = await transports.loadEntry(entryId);
		if (reloaded.ok && openEntryId === entryId) openEntry = reloaded.value;
	}

	async function flagEntry(
		entryId: string,
		reason: Parameters<ReviewTransports['flagEntry']>[1],
		comment: string | null
	) {
		const result = await transports.flagEntry(entryId, reason, comment);
		if (result.ok) await afterReview(entryId);
		return result;
	}

	async function resolveEntry(entryId: string, comment: string | null) {
		const result = await transports.resolveEntry(entryId, comment);
		if (result.ok) await afterReview(entryId);
		return result;
	}

	/**
	 * ACKNOWLEDGE, THEN MOVE ON, and the move is the point: this is the verdict
	 * that applies to most entries, so the loop it belongs to is "look, accept,
	 * next" rather than "look, accept, find the next one". It advances to the
	 * next student DOWN THE SAME COLUMN who has something nobody has looked at,
	 * and says so when there is nothing left below.
	 */
	async function acceptEntry(entryId: string) {
		if (!transports.acceptEntry) {
			return { ok: false as const, error: 'Marking an entry reviewed is not available.' };
		}
		actionNote = null;
		const result = await transports.acceptEntry(entryId);
		if (!result.ok) return result;
		await afterReview(entryId);
		advanceAfterAccept();
		return result;
	}

	function advanceAfterAccept() {
		const current = grid;
		if (!current || !cursor) return;
		const next = nextUnreviewed(current, cursor);
		if (!next) {
			actionNote = 'Nothing further down this check-in needs reviewing.';
			return;
		}
		moveTo(next);
	}

	async function unacceptEntry(entryId: string) {
		if (!transports.unacceptEntry) {
			return { ok: false as const, error: 'Undoing a review is not available.' };
		}
		const result = await transports.unacceptEntry(entryId);
		if (result.ok) await afterReview(entryId);
		return result;
	}

	/**
	 * A DELETE closes the panel rather than reloading it: unlike a flag or a
	 * resolve, there is no entry left to describe. The grid still needs a
	 * refresh -- the cell this entry backed now reads missing.
	 */
	async function deleteEntry(entryId: string) {
		if (!transports.deleteEntry) {
			return { ok: false as const, error: 'Deleting is not available.' };
		}
		const result = await transports.deleteEntry(entryId);
		if (result.ok) {
			closeEntry();
			await refresh();
		}
		return result;
	}

	/**
	 * A note delete RELOADS the panel rather than closing it, unlike
	 * `deleteEntry` above: the entry is still there, just missing one thread.
	 * `afterReview` is the same reload `flagEntry`/`resolveEntry` already use.
	 */
	async function deleteNote(entryId: string, noteId: string) {
		if (!transports.deleteNote) {
			return { ok: false as const, error: 'Deleting notes is not available.' };
		}
		const result = await transports.deleteNote(noteId);
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

	async function addSessionSections(id: string, sectionIds: string[]) {
		const result = await transports.addSessionSections(id, sectionIds);
		if (result.ok) await refresh();
		return result;
	}

	async function removeSessionSection(id: string, target: string) {
		const result = await transports.removeSessionSection(id, target);
		// Refetch on a real removal only: `ok: false` is the last-posting
		// refusal, which changed nothing.
		if (result.ok && result.value.ok) {
			closeEntry();
			await refresh();
		}
		return result;
	}

	// -----------------------------------------------------------------------
	// The cursor, and the keys that drive it.
	// -----------------------------------------------------------------------

	/** Move, and let the panel follow. One place, so a click and a key agree. */
	function moveTo(next: GridCursor) {
		cursor = next;
		actionNote = null;
		const current = grid;
		if (!current) return;
		const cell = cursorCell(current, next);
		if (cell) void openFromCell(cell);
		else closeEntry();
	}

	function onCursor(next: GridCursor) {
		cursor = next;
		actionNote = null;
	}

	/**
	 * THE KEYS, ON THE WINDOW, and three guards that decide whether a press is
	 * ours.
	 *
	 * ON THE WINDOW rather than on the grid, because the loop does not stop at
	 * the pane boundary: an instructor who has just clicked Accept has focus in
	 * the panel, and the next arrow press has to move the cursor from there. The
	 * console is the whole page, so there is nothing else on screen the press
	 * could have belonged to.
	 *
	 *   1. TYPING WINS. A single-letter shortcut over a screen with a comment
	 *      box is how "insufficient detail" becomes an accept halfway through
	 *      the word "flag".
	 *   2. A MODAL DIALOG WINS. The photo viewer is a native <dialog> in the top
	 *      layer with its own keys; accepting an entry from inside the picture
	 *      of it is not a thing anybody asked for.
	 *   3. REVIEW MODE ONLY. In the check-in and grading modes these keys mean
	 *      nothing, the legend is not shown, and the arrow keys belong to
	 *      whatever field the instructor is in.
	 */
	function onWindowKey(event: KeyboardEvent) {
		if (mode !== 'review') return;
		const target = event.target as (HTMLElement & { isContentEditable?: boolean }) | null;
		if (target && isTypingTarget(target)) return;
		if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return;
		const action = reviewAction(event);
		if (!action) return;
		event.preventDefault();
		onAction(action);
	}

	function onAction(action: ReviewAction) {
		const current = grid;
		if (!current) return;
		if (action === 'close') {
			closeEntry();
			return;
		}
		if (action === 'accept') {
			const cell = cursorAt;
			if (cell?.entry_id && canAccept && cellReviewed(cell) === false) {
				void acceptEntry(cell.entry_id);
			} else if (cell?.entry_id && cellReviewed(cell) === true) {
				actionNote = 'Already reviewed.';
			} else {
				actionNote = 'Nothing filed here to review.';
			}
			return;
		}
		if (action === 'flag' || action === 'pages') {
			if (!openEntryId) {
				actionNote = 'Nothing filed here.';
				return;
			}
			focusRequest = { target: action === 'flag' ? 'flag' : 'pages', nonce: ++keyNonce };
			return;
		}
		// A movement. Starting from nothing picks the first cell rather than
		// doing nothing, so the first arrow press always has an effect.
		const from = cursor ?? firstCursor(current);
		if (!from) return;
		if (!cursor) {
			moveTo(from);
			return;
		}
		const next = moveCursor(current, from, action);
		if (!next) return; // the edge: the cursor stays where it is
		moveTo(next);
	}

	const openStudent = $derived.by(() => {
		const cell = openCell;
		return cell ? grid?.students.find((s) => s.id === cell.student_id) : undefined;
	});
	const openSession = $derived.by(() => {
		const cell = openCell;
		return cell ? grid?.sessions.find((s) => s.id === cell.session_id) : undefined;
	});
	/** The student and check-in the cursor names, for the empty panel. */
	const cursorStudent = $derived(
		grid?.students.find((s) => s.student_key === cursor?.studentKey) ?? null
	);
	const cursorSession = $derived(grid?.sessions.find((s) => s.id === cursor?.sessionId) ?? null);
</script>

<svelte:head>
	<title>Section review // IDEA Notebook</title>
</svelte:head>

<svelte:window onkeydown={onWindowKey} />

<!-- .nb-root scopes the notebook's editorial theme (notebook-theme.css) and,
     through data-nb-theme, which of its three palettes is showing; the review
     console lives in the same room as the student feed, in every light.
     `cr-app` is the shell's application frame: above 1024px this room IS the
     viewport, and the body under the bar takes whatever is left. -->
<div class="nb-root cr-app" data-nb-theme={notebookThemeAttr()}>
<NotebookMasthead backHref="/notebook" backLabel="My Notebook" />

{#snippet gridPane()}
	{#if grid}
		<SectionGrid
			{grid}
			{cursor}
			selectedEntryId={openEntryId}
			onOpen={openFromCell}
			{onCursor}
			studentHref={studentNotebookHref}
		/>
	{/if}
{/snippet}

{#snippet entryPane()}
	<div class="entry-col" aria-label="Open entry">
		{#if entryLoading}
			<section class="card"><p class="note">Loading entry...</p></section>
		{:else if entryError}
			<section class="card"><p class="msg error" role="alert">{entryError}</p></section>
		{:else if openEntry && openCell}
			<!--
				KEYED ON THE ENTRY ID. Moving to another student destroys the panel
				and the comment half-typed in it, so a note written against one
				student's page can never be submitted against another's -- which is
				structural here rather than an effect that has to remember to fire.
				A LIVE reload of the same entry keeps the same key, so an update
				arriving mid-sentence does not throw the sentence away.
			-->
			{#key openEntry.id}
				{@const entryId = openEntry.id}
				<EntryReview
					entry={openEntry}
					cell={openCell}
					student={openStudent}
					session={openSession}
					reviewed={cellReviewed(openCell)}
					{focusRequest}
					onFlag={flagEntry}
					onResolve={resolveEntry}
					onAccept={canAccept ? acceptEntry : undefined}
					onUnaccept={canAccept && transports.unacceptEntry ? unacceptEntry : undefined}
					onDelete={transports.deleteEntry ? deleteEntry : undefined}
					onDeleteNote={transports.deleteNote
						? (noteId) => deleteNote(entryId, noteId)
						: undefined}
					onClose={closeEntry}
				/>
			{/key}
		{:else if cursor}
			<!-- THE CURSOR IS ON A CELL WITH NOTHING IN IT, which is a real answer
			     and a common one: it is who the instructor is often looking for. -->
			<section class="card empty-panel" data-testid="empty-cell-panel">
				<div class="eyebrow">{cursorStudent?.name ?? 'Student'}</div>
				<h2>{cursorSession?.session_label ?? 'Check-in'}</h2>
				<p class="note">
					{#if cursorAt?.excused}
						Excused from this check-in. Nothing is expected.
					{:else}
						Nothing filed for this check-in.
					{/if}
				</p>
			</section>
		{:else}
			<section class="card empty-panel">
				<h2>Pick a cell</h2>
				<p class="note">
					Click any cell, or press an arrow key, to open it here.
				</p>
			</section>
		{/if}
	</div>
{/snippet}

<main class="review-console cr-app-body">
	{#if !configured}
		<div class="console-panel">
			<section class="card">
				<h2>Not available yet</h2>
				<p class="note">
					The notebook's data layer is not set up on this deployment. Apply migration
					<code>0069_notebook.sql</code> in the Supabase SQL editor and reload.
				</p>
			</section>
		</div>
	{:else if sections.length === 0}
		<div class="console-panel">
			<section class="card">
				<h2>No sections yet</h2>
				<p class="note">
					{isChair
						? 'No notebook sections exist. Create one first; a section names its instructor, which is what puts this page in front of them.'
						: 'You are not listed as the instructor of a notebook section yet. A site admin creates sections and assigns instructors.'}
				</p>
			</section>
		</div>
	{:else}
		<!--
			ONE BAR OF CHROME. Everything that used to be a card stacked above the
			grid -- the hero, the two pickers, the check-in manager -- is either
			here or is a mode, because every row above the grid is a row of the
			grid that is not on screen.
		-->
		<div class="console-bar">
			<div class="bar-pickers">
				<label class="field">
					<span>Section</span>
					<select bind:value={sectionId} data-testid="section-picker">
						{#each sections as s (s.id)}
							<option value={s.id}>{sectionName(s)}</option>
						{/each}
					</select>
				</label>
				<label class="field unit">
					<span>Unit</span>
					<select bind:value={unitChoice} disabled={units.length === 0}>
						<option value="all">All units</option>
						{#each units as u (u)}
							<option value={String(u)}>Unit {u}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="bar-modes" role="group" aria-label="Console mode">
				<button
					type="button"
					class="mode"
					class:on={mode === 'review'}
					aria-pressed={mode === 'review'}
					data-testid="mode-review"
					onclick={() => (mode = 'review')}>Review</button
				>
				<button
					type="button"
					class="mode"
					class:on={mode === 'checkins'}
					aria-pressed={mode === 'checkins'}
					data-testid="mode-checkins"
					onclick={() => (mode = 'checkins')}>Check-ins</button
				>
				{#if docCheck}
					<button
						type="button"
						class="mode"
						class:on={mode === 'grade'}
						aria-pressed={mode === 'grade'}
						disabled={unit === null}
						aria-disabled={unit === null}
						data-testid="mode-grade"
						title={unit === null
							? 'Pick a unit above: a Documentation Check grades one unit.'
							: 'Grade this unit as a Documentation Check'}
						onclick={() => (mode = 'grade')}>Grade unit</button
					>
				{/if}
			</div>

			<div class="bar-status">
				{#if loading}<span class="pill">Loading...</span>{/if}
				{#if live}
					<!-- Word and mark, never a green dot on its own. -->
					<span
						class="pill live"
						data-testid="live-pill"
						data-live-updates={liveTick}
						title="Updating as students file work"
						><span class="live-dot" aria-hidden="true"></span>Live</span
					>
				{/if}
			</div>

			<!--
				THE KEYS, PRINTED. "Discoverable in the interface, not just
				documented" is a property of this row rendering the SAME array the
				handler dispatches from (REVIEW_KEYS), so a key that stops working
				stops being advertised.
			-->
			{#if mode === 'review'}
				<ul class="bar-keys" data-testid="key-legend">
					{#each REVIEW_KEYS as k (k.keys)}
						<li><kbd>{k.keys}</kbd> {k.label}</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if loadError}
			<div class="console-panel">
				<section class="card"><p class="msg error" role="alert">{loadError}</p></section>
			</div>
		{/if}

		{#if mode === 'review'}
			{#if grid}
				<!--
					THE GRID AND THE OPEN ENTRY, SIDE BY SIDE AND BOTH ON SCREEN.

					`scroll="fill"` rather than the `page` this console used to use:
					the split IS the page here now that the chrome above it is one
					bar, so each pane owns its own scroll at the height of the body
					it is in -- no viewport arithmetic, and nothing above or below
					it to be wrong about. `detailWidth="roomy"` because the panel is
					read rather than filled in.

					Deliberately not an overlay: covering the grid would defeat the
					whole point, which is moving from cell to cell.
				-->
				<!-- The bounded parent `scroll="fill"` needs: it takes the rest of
				     the body's column, and the split takes all of it. -->
				<div class="console-split">
					<ClassSplit
						navWidth="wide"
						detailWidth="roomy"
						scroll="fill"
						narrow="stack-nav-first"
						bind:detailEl
						hasDetail
						nav={gridPane}
					>
						{@render entryPane()}
					</ClassSplit>
				</div>
			{/if}
			{#if actionNote}
				<p class="action-note" role="status" data-testid="action-note">{actionNote}</p>
			{/if}
		{:else if mode === 'checkins'}
			<div class="console-panel scrolls">
				{#if sectionId}
					<SessionManager
						{sectionId}
						{sections}
						{sessions}
						onSave={saveSession}
						onDelete={deleteSession}
						onAddSections={addSessionSections}
						onRemoveSection={removeSessionSection}
					/>
				{/if}
			</div>
		{:else if mode === 'grade' && docCheck && section && unit !== null}
			<div class="console-panel scrolls">
				<DocumentationCheck {section} unitNumber={unit} {grid} transports={docCheck} />
			</div>
		{/if}
	{/if}

	<VersionBadge app="portal" />
</main>
</div>

<style>
	/* THE CONSOLE IS A BAR AND A BODY. app.css caps every <main> at 880px and
	   gives it 3rem/5rem of its own padding; both belong to the single-column
	   shell and neither belongs to an application frame. */
	/* A COLUMN, not a two-row grid: the number of things above the split is not
	   fixed (an error banner appears, a mode swaps the body out), and a grid
	   with named rows would have put the split in an auto row the moment one of
	   them rendered -- which is exactly the shape that stops bounding it and
	   hands the page a second scrollbar. Everything is auto height and the ONE
	   growable child says so itself. */
	.review-console {
		max-width: none;
		margin: 0;
		padding: var(--space-3) 0 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.console-split {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
	}
	/* The bar and any single-panel mode read the same measure and gutter the
	   split does, so the chrome and the panes start and end on the same line.
	   The split is NOT in this rule -- it declares those values itself, from
	   the same two properties. */
	.console-bar,
	.console-panel,
	.action-note {
		width: 100%;
		min-width: 0;
		max-width: var(--measure-split);
		margin-inline: auto;
		padding-inline: var(--cr-gutter);
		box-sizing: border-box;
	}
	.console-bar {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.bar-pickers {
		display: flex;
		gap: var(--space-3);
		min-width: 0;
	}
	.field {
		display: grid;
		gap: var(--space-1);
		min-width: min(11rem, 100%);
		max-width: 100%;
	}
	.field.unit {
		min-width: min(7rem, 100%);
	}
	.field span {
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.field select {
		/* min-width: 0 stops the select's intrinsic width (its longest option
		   text) from propagating up and forcing the page wider than a phone --
		   the section names are long, and at 375px this was the one thing that
		   made the whole layout viewport overflow. */
		width: 100%;
		min-width: 0;
		padding: var(--space-2);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.9rem;
	}
	.field select:focus {
		outline: none;
		border-color: var(--nb-accent);
	}

	.bar-modes {
		display: flex;
		gap: 0;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		overflow: hidden;
	}
	/* 44px tall: this is ordinary page chrome, not the grid's locked density,
	   so it takes the tap-target rule without an exception. */
	.mode {
		min-height: 44px;
		padding: 0 var(--space-3);
		border: none;
		border-right: 1px solid var(--nb-hairline-strong);
		background: var(--surface-1);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	.mode:last-child {
		border-right: none;
	}
	/* THE ACTIVE MODE, and its label is --text-1 rather than the accent ink.
	   Measured on the light plate, gold-on-gold-wash comes to 4.26:1 for
	   12.5px bold, which is under the bar; the room's own ink over the same
	   wash is not. Nothing is lost: the wash, the weight and `aria-pressed`
	   all still say which one is on, so the accent was never the only signal. */
	.mode.on {
		background: var(--nb-accent-wash);
		color: var(--text-1);
		font-weight: 700;
	}
	/* aria-disabled rather than `disabled` on a control that has to explain
	   itself: a genuinely disabled button swallows pointer events, so its own
	   "pick a unit first" tooltip could never fire from it. */
	.mode[aria-disabled='true'] {
		color: var(--text-3);
		cursor: not-allowed;
	}
	.mode:focus-visible {
		outline: 2px solid var(--nb-accent);
		outline-offset: -2px;
	}

	.bar-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: 0.72rem;
		color: var(--text-3);
	}
	.pill.live {
		color: var(--nb-ok);
	}
	.live-dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 999px;
		background: currentColor;
	}

	.bar-keys {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin: 0 0 0 auto;
		padding: 0;
		font-size: 0.7rem;
		/* Real instructional copy, so --text-2: the room's tertiary ink is
		   3.66:1 on the light plate and this is the one place on the screen that
		   teaches the keyboard. */
		color: var(--text-2);
	}
	.bar-keys li {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.bar-keys kbd {
		padding: 0.1em 0.35em;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 3px;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}

	/* A single-panel mode owns the body's whole height and scrolls inside it,
	   so switching modes never puts the page into a second scrollbar. Below the
	   breakpoint `.cr-app` is not a viewport frame and this is inert. */
	.console-panel.scrolls {
		min-height: 0;
		overflow-y: auto;
		padding-bottom: var(--space-5);
	}
	.entry-col {
		min-width: 0;
	}
	.empty-panel h2 {
		margin: var(--space-1) 0 var(--space-2);
		font-size: 1.05rem;
	}
	.action-note {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.note {
		color: var(--text-2);
		font-size: 0.88rem;
	}
	.msg {
		margin: 0;
		font-size: 0.9rem;
	}
	.msg.error {
		color: var(--nb-error);
	}
</style>
