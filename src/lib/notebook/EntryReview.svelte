<script lang="ts">
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import EntryNotes from '$lib/notebook/EntryNotes.svelte';
	import { deletedNoteThreads, noteThreads } from '$lib/notebook-notes';
	import {
		entryTitle,
		flagReasonLabel,
		photoCountLabel,
		photoPages,
		type NotebookFlagReason
	} from '$lib/notebook';
	import {
		FLAG_REASONS,
		cellDisplay,
		cellLabel,
		stampLabel,
		type GridCell,
		type GridSession,
		type GridStudent,
		type ReviewEntry,
		type ReviewResult
	} from '$lib/notebook-review';

	/**
	 * One entry, opened from a grid cell: ENOUGH TO DECIDE, and the two verdicts.
	 *
	 * WHAT THIS PANEL IS FOR, and it changed. It used to render the entry's
	 * pages at full column width in a 21rem pane, which is neither: too small to
	 * read handwriting from, and tall enough that acting on it meant scrolling
	 * past it. The full-screen viewer is how a page is actually read (pan, zoom,
	 * the corrected/original toggle), so this panel's job is to say what the
	 * entry IS and let the instructor open it in one key press -- a strip of
	 * page thumbnails, the status, the stamp, and the notes behind a disclosure.
	 * It sits beside a grid the instructor is also looking at, and it fits on
	 * screen with it.
	 *
	 * THREE VERDICTS, and they are three different sentences:
	 *
	 *   ACCEPT (0121)  "I have looked at this." Writes reviewed_by/reviewed_at
	 *                  and nothing else -- not the status, not the flag, not the
	 *                  comment -- so it is never a second grade on work the unit
	 *                  is graded for once through the Documentation Check.
	 *   FLAG (0069)    "This needs fixing", with a reason the student sees.
	 *   CLEAR FLAG     notebook_resolve_entry: the flag comes off and the entry
	 *                  goes back to compliant. Only offered on a flagged entry,
	 *                  because it is the flag's own undo.
	 *
	 * Photos are rendered by the SAME NotebookPhotos the student's own feed
	 * uses, in its `strip` layout: same proxy, same pagination, same viewer.
	 *
	 * IT RESETS NOTHING ON ITS OWN. The console mounts this inside `{#key}` on
	 * the entry id, so moving to another student destroys the instance and its
	 * half-typed comment with it. That also means a LIVE reload of the same
	 * entry -- another instructor's write arriving over realtime -- does not
	 * throw away what this one is in the middle of typing, which an
	 * id-watching effect could not tell apart.
	 */
	let {
		entry,
		cell,
		student,
		session,
		reviewed = null,
		focusRequest = null,
		onFlag,
		onResolve,
		onAccept,
		onUnaccept,
		onDelete,
		onDeleteNote,
		onRestoreNote,
		adminMove,
		excusal,
		onClose
	}: {
		entry: ReviewEntry;
		cell: GridCell;
		student: GridStudent | undefined;
		session: GridSession | undefined;
		/**
		 * Has anybody looked at this entry (0121)? `null` means the question
		 * cannot be answered here -- a database without 0121 -- and renders as
		 * nothing rather than as "no".
		 */
		reviewed?: boolean | null;
		/**
		 * THE KEYBOARD REACHING INTO THIS PANEL. The console owns the keys and
		 * this component owns the controls, so a press arrives as a request with
		 * a nonce rather than as a DOM query across the boundary. The nonce is
		 * what makes pressing the same key twice two events.
		 */
		focusRequest?: { target: 'flag' | 'pages'; nonce: number } | null;
		onFlag: (
			entryId: string,
			reason: NotebookFlagReason,
			comment: string | null
		) => Promise<ReviewResult>;
		onResolve: (entryId: string, comment: string | null) => Promise<ReviewResult>;
		/**
		 * Acknowledging (0121, notebook_accept_entry). OMITTED removes the
		 * control entirely, which is the honest state on a deployment where 0121
		 * is not applied -- and the console decides that from the grid payload
		 * itself, so the button and the RPC cannot disagree.
		 */
		onAccept?: (entryId: string) => Promise<ReviewResult>;
		/**
		 * Taking it back (0121, notebook_unaccept_entry). It is not decoration:
		 * while an entry is acknowledged the STUDENT can no longer delete it or
		 * pull it back to a draft, so an accidental accept takes something away
		 * from somebody who is not in the room.
		 */
		onUnaccept?: (entryId: string) => Promise<ReviewResult>;
		/**
		 * An instructor removing this entry (0116, notebook_staff_delete_entry).
		 * OMITTED for a non-manager -- ReviewConsole only ever hands this in when
		 * its own transports carry one, which the RPC's own
		 * classroom_manages_section check is the real boundary for regardless.
		 */
		onDelete?: (entryId: string) => Promise<ReviewResult>;
		/**
		 * An instructor removing one note thread (0119, notebook_staff_delete_note),
		 * in the same danger-zone treatment as `onDelete` above. Handed straight to
		 * EntryNotes, which renders it per thread -- OMITTED for a non-manager the
		 * same way `onDelete` is.
		 */
		onDeleteNote?: (noteId: string) => Promise<ReviewResult>;
		/**
		 * An instructor putting one BACK (0119, `notebook_staff_restore_note`) --
		 * the half of `onDeleteNote` that was never wired. Same tier as the
		 * delete (`classroom_manages_section` OR `notebook_manages_student`), so
		 * the two arrive together, and handed straight to EntryNotes the same
		 * way.
		 */
		onRestoreNote?: (noteId: string) => Promise<ReviewResult>;
		/**
		 * ADMIN ONLY (`notebook_admin_override_entry`). A snippet rather than a
		 * transport because the control needs the console's own check-in list and
		 * section list, which this panel has no business loading -- so the
		 * console renders it and this decides WHERE it sits. Absent for a
		 * non-admin, which removes it outright.
		 */
		adminMove?: import('svelte').Snippet;
		/**
		 * The excusal control for THIS cell, rendered by the console for the same
		 * reason `adminMove` is. Present for every reviewer (an instructor reads
		 * an excusal and cannot write one; see CellExcusal), absent only where
		 * the deployment cannot answer at all.
		 */
		excusal?: import('svelte').Snippet;
		onClose: () => void;
	} = $props();

	let reason = $state<NotebookFlagReason>('not_dated');
	let comment = $state('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let deleteArmed = $state(false);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);

	/** The flag form is a disclosure: the common verdict is one button. */
	let flagOpen = $state(false);
	let dangerOpen = $state(false);
	let reasonEl = $state<HTMLSelectElement | null>(null);
	let wantReasonFocus = $state(false);

	/** Which page the full-screen viewer is on; NotebookPhotos renders it. */
	let viewerIndex = $state<number | null>(null);

	/**
	 * The LIVE notes on this entry (0119). Through `noteThreads` rather than
	 * `entry.notes.length`, because a note the student removed is still a row in
	 * that array -- so the raw length would both render an empty "Written notes"
	 * block and suppress the "no photos and no written notes" line on an entry
	 * that genuinely has neither.
	 *
	 * The console never offers to EDIT one -- `canEdit` is never set here and
	 * 0078's `notebook_edit_note` refuses anyone but the owner -- but since
	 * `onRestoreNote` it does offer to put a removed one back.
	 */
	const noteCount = $derived(noteThreads(entry.notes ?? []).length);
	const pageCount = $derived(photoPages(entry.photos).length);
	/**
	 * Removed threads, counted the same way EntryNotes counts them so the two
	 * cannot disagree about whether its disclosure has anything in it.
	 *
	 * IT IS WHY THE NOTES BLOCK CANNOT BE GATED ON `noteCount` ALONE ANY MORE.
	 * That counts LIVE threads, so an instructor who deletes the only note on an
	 * entry watches the whole block vanish -- taking the Restore with it, in
	 * exactly the case it exists for. Gated on either count, the block stays and
	 * the undo is reachable.
	 */
	const removedNoteCount = $derived(
		onRestoreNote ? deletedNoteThreads(entry.notes ?? []).length : 0
	);
	const notesBlock = $derived(noteCount > 0 || removedNoteCount > 0);

	/**
	 * The notes disclosure opens itself on a NOTE-ONLY entry, and only there.
	 * On a photo entry the pages are the thing to look at and the notes are
	 * context; on an entry with no pages at all the notes ARE the entry, and
	 * making somebody click to find that out is the panel failing at its one
	 * job. Initialized rather than derived, so it stays wherever the instructor
	 * puts it afterwards.
	 */
	// svelte-ignore state_referenced_locally
	let notesOpen = $state(pageCount === 0 && noteCount > 0);

	// entryTitle() is the same fallback derivation the student's own card uses
	// (session label -> custom_label -> a LIVE photo's filename -> first note's
	// opening words -> a REMOVED photo's filename -> "Untitled entry"), trimmed
	// and truthiness-tested rather than nullish-tested. This panel therefore
	// names a reviewed entry exactly as the student's own list does, including
	// when every page has been removed. ReviewEntry carries only `session_id`,
	// not an embedded session object, so the shape entryTitle needs is built from
	// the `session` prop already resolved by the caller.
	const title = $derived(
		entryTitle({
			session: session
				? {
						session_label: session.session_label,
						unit_number: session.unit_number,
						session_date: session.session_date
					}
				: null,
			custom_label: entry.custom_label,
			photos: entry.photos,
			notes: entry.notes
		})
	);

	/**
	 * A KEY PRESS FROM THE CONSOLE. The nonce guard is a plain `let`, not
	 * `$state`: it exists to stop one request being served twice, and making it
	 * reactive would make this effect depend on its own write.
	 */
	let servedNonce = 0;
	$effect(() => {
		const request = focusRequest;
		if (!request || request.nonce === servedNonce) return;
		servedNonce = request.nonce;
		// Deferred: this lands while Svelte is still settling the render that
		// delivered the prop, and writing state there throws state_unsafe_mutation
		// -- which surfaces as every button in the tree silently dying.
		queueMicrotask(() => {
			if (request.target === 'pages') {
				if (pageCount > 0) viewerIndex = 0;
				else notesOpen = true;
				return;
			}
			flagOpen = true;
			wantReasonFocus = true;
		});
	});

	/**
	 * Focus keyed on the ELEMENT, never on mount: the select does not exist
	 * until the disclosure has opened, so focusing it from the handler above
	 * would be a silent no-op.
	 */
	$effect(() => {
		const el = reasonEl;
		if (!el || !wantReasonFocus) return;
		queueMicrotask(() => {
			el.focus();
			wantReasonFocus = false;
		});
	});

	async function flag() {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		// Cleared in `finally`: a throw mid-submit would otherwise disable every
		// control on this panel for as long as it is open.
		try {
			const result = await onFlag(entry.id, reason, comment.trim() || null);
			if (!result.ok) {
				errorMsg = result.error;
				return;
			}
			notice = 'Flagged. The student sees the reason on their own notebook.';
			flagOpen = false;
		} finally {
			busy = false;
		}
	}

	async function resolve() {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		try {
			const result = await onResolve(entry.id, comment.trim() || null);
			if (!result.ok) {
				errorMsg = result.error;
				return;
			}
			notice = 'Flag cleared. This entry reads as compliant again.';
		} finally {
			busy = false;
		}
	}

	async function accept() {
		if (busy || !onAccept) return;
		busy = true;
		errorMsg = null;
		notice = null;
		try {
			const result = await onAccept(entry.id);
			if (!result.ok) errorMsg = result.error;
		} finally {
			busy = false;
		}
	}

	async function unaccept() {
		if (busy || !onUnaccept) return;
		busy = true;
		errorMsg = null;
		notice = null;
		try {
			const result = await onUnaccept(entry.id);
			if (!result.ok) errorMsg = result.error;
			else notice = 'Marked unreviewed. The student can delete or pull it back again.';
		} finally {
			busy = false;
		}
	}

	/** Two-step confirm (the FolderManager convention), naming the student. */
	async function deleteEntry() {
		if (!onDelete || deleting) return;
		if (!deleteArmed) {
			deleteArmed = true;
			deleteError = null;
			return;
		}
		deleting = true;
		deleteError = null;
		try {
			const result = await onDelete(entry.id);
			if (!result.ok) {
				deleteError = result.error;
				deleteArmed = false;
				return;
			}
			// onClose closes the panel; the caller (ReviewConsole) refreshes the
			// grid, whose cell for this entry now reads missing.
			onClose();
		} finally {
			deleting = false;
		}
	}
</script>

<section class="card entry-panel" data-testid="entry-panel">
	<header class="entry-head">
		<div class="head-text">
			<div class="eyebrow">{student?.name ?? 'Student'}</div>
			<h2>{title}</h2>
		</div>
		<button type="button" class="btn secondary tight" onclick={onClose}>Close</button>
	</header>

	<p class="meta">
		<span class="state {cellDisplay(cell)}">{cellLabel(cellDisplay(cell))}</span>
		{#if reviewed !== null}
			<!-- WORD AND MARK, never a colour on its own: this is the one status
			     on the panel that has no glyph cell in the grid to lean on. -->
			<span class="state review" class:done={reviewed} data-testid="review-state">
				{reviewed ? '✓ Reviewed' : '· Not reviewed'}
			</span>
		{/if}
		<span>{stampLabel(entry.upload_timestamp)}</span>
		<span>{photoCountLabel(pageCount)}</span>
		{#if entry.folder_name}
			<!-- Where the STUDENT filed it (0088). Context only: filing is their
			     own organizing scheme and carries no meaning for review. -->
			<span class="filed" data-testid="review-folder">Filed under {entry.folder_name}</span>
		{/if}
		{#if cell.entry_count > 1}
			<span class="also">{cell.entry_count} entries; showing the latest</span>
		{/if}
	</p>

	{#if entry.status === 'flagged' && (entry.flag_reason || entry.instructor_comment)}
		<div class="callout">
			{#if entry.flag_reason}<strong>{flagReasonLabel(entry.flag_reason)}.</strong>{/if}
			{#if entry.instructor_comment}<span>{entry.instructor_comment}</span>{/if}
		</div>
	{/if}

	{#if pageCount}
		<div class="pages">
			<NotebookPhotos
				photos={entry.photos}
				label={title}
				lazy={false}
				layout="strip"
				bind:viewerIndex
			/>
			<p class="hint">
				Click a page, or press <kbd>Enter</kbd>, to read it full screen.
			</p>
		</div>
	{:else if !noteCount}
		<p class="empty">This entry has no photos and no written notes.</p>
	{/if}

	{#if notesBlock}
		<section class="notes-block" data-testid="review-notes">
			<button
				type="button"
				class="disclosure"
				aria-expanded={notesOpen}
				aria-controls="review-notes-body"
				onclick={() => (notesOpen = !notesOpen)}
			>
				<span class="caret" aria-hidden="true">{notesOpen ? '▾' : '▸'}</span>
				Written notes ({noteCount}){#if removedNoteCount}<span class="removed-count"
						>, {removedNoteCount} removed</span
					>{/if}
			</button>
			<div id="review-notes-body" hidden={!notesOpen}>
				<!-- The student's own words, rendered by the SAME component their
				     feed uses. Read-only: `canEdit` is never set here, and 0078's
				     notebook_edit_note refuses anyone but the note's owner. -->
				<EntryNotes
					notes={entry.notes}
					compact
					onStaffDelete={onDeleteNote}
					onStaffRestore={onRestoreNote}
					subjectName={student?.name}
				/>
			</div>
		</section>
	{/if}

	<div class="verdicts">
		{#if onAccept && reviewed === false}
			<button
				type="button"
				class="btn"
				data-testid="entry-accept"
				onclick={accept}
				disabled={busy}
			>
				{busy ? 'Working...' : 'Accept'}<kbd>A</kbd>
			</button>
		{:else if onUnaccept && reviewed === true}
			<button
				type="button"
				class="btn secondary"
				data-testid="entry-unaccept"
				onclick={unaccept}
				disabled={busy}
			>
				{busy ? 'Working...' : 'Mark unreviewed'}
			</button>
		{/if}
		<button
			type="button"
			class="btn secondary"
			data-testid="entry-flag-toggle"
			aria-expanded={flagOpen}
			aria-controls="entry-flag-form"
			onclick={() => (flagOpen = !flagOpen)}
		>
			Flag<kbd>F</kbd>
		</button>
		{#if entry.status !== 'compliant'}
			<button type="button" class="btn secondary" onclick={resolve} disabled={busy}>
				Clear flag
			</button>
		{/if}
	</div>

	{#if errorMsg}<p class="msg error" role="alert">{errorMsg}</p>{/if}
	{#if notice}<p class="msg ok">{notice}</p>{/if}

	<div class="review-form" id="entry-flag-form" hidden={!flagOpen}>
		<div class="form-row">
			<label class="field">
				<span>Flag reason</span>
				<select bind:value={reason} bind:this={reasonEl}>
					{#each FLAG_REASONS as r (r)}
						<option value={r}>{flagReasonLabel(r)}</option>
					{/each}
				</select>
			</label>
			<label class="field grow">
				<span>Comment (optional)</span>
				<input type="text" maxlength="2000" placeholder="What needs fixing?" bind:value={comment} />
			</label>
		</div>
		<div class="form-actions">
			<button type="button" class="btn" onclick={flag} disabled={busy}>
				{busy ? 'Working...' : 'Flag this entry'}
			</button>
		</div>
		<p class="note">
			Flagging asks the student to add another photo; their resubmission comes back here as
			"awaiting review".
		</p>
	</div>

	<!-- EXCUSING SITS WITH THE VERDICTS AND ABOVE THE DANGER ZONE. It is
	     bookkeeping about ATTENDANCE rather than a judgement on the work, so it
	     is not a fourth verdict; it is reversible by the same call that set it,
	     so it is not a danger-zone action either. It renders on an entry that
	     EXISTS because that pair is real and not a contradiction: a student
	     excused from a check-in who filed one anyway has filed it, which is
	     exactly what `checkInStatus` already decides (an entry beats an
	     excusal), and somebody looking at this panel may still need to record
	     or withdraw the excusal behind it. -->
	{@render excusal?.()}

	<!-- MOVING sits between the verdicts and the delete, which is where it
	     belongs on both sides: it is more consequential than a flag and far less
	     than a deletion, and it is the thing to reach for INSTEAD of deleting an
	     entry that is merely in the wrong place. Rendered by the console rather
	     than built here, so it can be handed the check-in and section lists this
	     panel does not load; absent entirely for a non-admin. -->
	{@render adminMove?.()}

	{#if onDelete}
		<div class="danger-zone" data-testid="entry-danger-zone">
			<button
				type="button"
				class="disclosure danger-toggle"
				aria-expanded={dangerOpen}
				aria-controls="entry-danger-body"
				onclick={() => (dangerOpen = !dangerOpen)}
			>
				<span class="caret" aria-hidden="true">{dangerOpen ? '▾' : '▸'}</span>
				Delete this entry
			</button>
			<div id="entry-danger-body" hidden={!dangerOpen}>
				<p class="note">
					Removes {student?.name ?? 'this student'}'s entry from the grid. The photos and Drive
					files are not affected, but there is no way to bring the entry back from here.
				</p>
				{#if deleteArmed}
					<p class="msg confirm" data-testid="entry-delete-confirm">
						Delete {student?.name ?? 'this student'}'s "{title}"? This cannot be undone here.
					</p>
				{/if}
				<div class="form-actions">
					<button
						type="button"
						class="btn danger"
						disabled={deleting}
						data-testid="entry-delete"
						onclick={deleteEntry}
					>
						{deleting ? 'Deleting...' : deleteArmed ? 'Confirm delete' : 'Delete entry'}
					</button>
					{#if deleteArmed}
						<button
							type="button"
							class="btn secondary"
							disabled={deleting}
							onclick={() => (deleteArmed = false)}
						>
							Cancel
						</button>
					{/if}
				</div>
				{#if deleteError}<p class="msg error" role="alert">{deleteError}</p>{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.entry-panel {
		display: grid;
		gap: var(--space-3);
		align-content: start;
		border-color: var(--nb-hairline-strong);
	}
	.entry-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.head-text {
		min-width: 0;
	}
	.entry-head h2 {
		margin: var(--space-1) 0 0;
		font-size: 1.1rem;
	}
	.btn.tight {
		flex: 0 0 auto;
		align-self: flex-start;
	}
	.meta {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
		margin: 0;
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}
	/* Panel status chips (NOT the grid's locked glyph cells): same hue
	   families, each deepened onto ink via color-mix so the small text reads
	   on the light card. */
	.state {
		padding: var(--space-1) var(--space-2);
		border: 1px solid currentColor;
		border-radius: var(--radius-control);
		font-weight: 600;
	}
	.state.on_time {
		color: color-mix(in srgb, var(--green) 55%, #14260f);
	}
	.state.late {
		color: var(--nb-warn);
	}
	.state.flagged {
		color: var(--nb-error);
	}
	.state.pending_review {
		color: color-mix(in srgb, var(--cyan) 55%, #0d2620);
	}
	.state.excused,
	.state.missing {
		color: var(--text-3);
	}
	/* The acknowledgement chip. Quiet until it is done: "not reviewed" is the
	   ordinary state of most of a class and must not read as a problem, which
	   is what borrowing the flag's crimson would have made it. */
	/* --text-2, not --text-3: this chip carries a STATE somebody acts on, and
	   the room's tertiary ink measures 3.66:1 on the light plate (the
	   pre-existing --nb-ink-faint figure). Real copy takes the muted ink. */
	.state.review {
		color: var(--text-2);
	}
	.state.review.done {
		color: var(--nb-ok);
	}
	.also {
		color: var(--nb-accent-ink);
	}
	/* Deliberately quiet: the student's filing is context, never a review
	   signal, so it must not read as one. */
	.filed {
		color: var(--text-3);
		font-style: italic;
	}
	.callout {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-left: 2px solid var(--nb-accent);
		background: var(--nb-accent-wash);
		border-radius: 0 var(--radius-control) var(--radius-control) 0;
		font-size: 0.88rem;
	}
	.callout strong {
		color: var(--nb-accent-ink);
	}
	.pages {
		display: grid;
		gap: var(--space-2);
	}
	.hint {
		margin: 0;
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.empty {
		color: var(--text-2);
		font-size: 0.9rem;
	}

	/* A REAL BUTTON with aria-expanded, never a div with a click listener:
	   that shape is mouse-only, invisible to assistive tech, and double-toggles
	   against any control added later. */
	.disclosure {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) 0;
		background: none;
		border: none;
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.disclosure:focus-visible {
		outline: 2px solid var(--nb-accent);
		outline-offset: 2px;
	}
	.caret {
		color: var(--text-3);
		font-size: 0.8rem;
	}

	.verdicts {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}
	/* The key that does the same thing, ON the control that does it -- the
	   legend in the console header says it once, and this says it where the
	   hand already is. A tooltip would be neither discoverable nor reachable
	   from a phone. */
	.verdicts kbd {
		margin-left: var(--space-2);
		padding: 0.05em 0.35em;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		opacity: 0.75;
	}
	.hint kbd {
		padding: 0.05em 0.3em;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.review-form {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.review-form[hidden] {
		display: none;
	}
	#review-notes-body[hidden],
	#entry-danger-body[hidden] {
		display: none;
	}
	.form-row {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.field {
		display: grid;
		gap: var(--space-1);
	}
	.field.grow {
		flex: 1 1 12rem;
	}
	.field span {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.field select,
	.field input {
		width: 100%;
		min-width: 0;
		padding: var(--space-2);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.95rem;
	}
	.field select:focus,
	.field input:focus {
		outline: none;
		border-color: var(--nb-accent);
	}
	.form-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.msg {
		margin: 0;
		font-size: 0.88rem;
	}
	.msg.error {
		color: var(--nb-error);
	}
	.msg.ok {
		color: var(--nb-ok);
	}
	.msg.confirm {
		color: var(--nb-error);
		font-weight: 600;
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: 0.8rem;
	}

	/* VISUALLY SEPARATED from the verdicts, and now behind a disclosure as
	   well: "flag this" and "delete this student's work outright" are never one
	   click apart, and the destructive one is not even on screen until it is
	   asked for. */
	/* Part of the disclosure label, so a removed note is discoverable without
	   opening the block -- the whole point of gating it on either count. */
	.removed-count {
		color: var(--text-3);
	}
	.danger-zone {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid color-mix(in srgb, var(--nb-error) 35%, var(--hairline));
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--nb-error) 4%, transparent);
	}
	.danger-toggle {
		color: var(--nb-error);
		font-size: 0.85rem;
		padding: 0;
	}
	.btn.danger {
		background: var(--surface-1);
		border-color: var(--nb-error);
		color: var(--nb-error);
	}
	.btn.danger:hover:not(:disabled) {
		background: var(--nb-error);
		border-color: var(--nb-error);
		color: var(--surface-1);
		box-shadow: none;
		text-shadow: none;
	}
</style>
