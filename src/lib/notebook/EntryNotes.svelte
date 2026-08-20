<script lang="ts">
	import NoteContent from '$lib/notebook/NoteContent.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import {
		deletedNoteThreads,
		docSummary,
		noteThreads,
		type NotebookNoteRow,
		type TiptapNode
	} from '$lib/notebook-notes';
	import type { EntryActionResult, NoteSaveResult } from '$lib/notebook';

	/**
	 * Every written note on one entry, in the order they were written, with the
	 * revision history each one carries.
	 *
	 * ORDER IS BY FIRST REVISION (noteThreads), so editing a note keeps its
	 * place instead of jumping it to the end -- an entry added to over weeks
	 * still reads as one chronological record rather than a list reshuffled by
	 * whichever note was touched last.
	 *
	 * EDITING IS A PROP, AND IT MIRRORS THE RPC. `canEdit` is false for a
	 * session-linked entry, so no edit control renders on those notes at all --
	 * but that is the SECOND statement of the rule, not the rule: 0078's
	 * notebook_edit_note refuses the same case outright, so hiding the button
	 * is a courtesy and the database is the boundary.
	 *
	 * AN EDITED NOTE SAYS SO AND SHOWS ITS WORKING. Because a revision is a row
	 * rather than an overwrite, every earlier version genuinely still exists;
	 * the disclosure below renders them, it does not summarise them.
	 *
	 * DELETE, RESTORE AND STAFF DELETE (0119) FOLLOW THE SAME canEdit MIRROR.
	 * `onDelete`/`onRestore` are owner-only, offered on exactly the notes
	 * `canEdit` already governs; `onStaffDelete` is the instructor's own,
	 * offered instead of an edit control (EntryReview never sets `canEdit`).
	 * The two never coexist on one call site, so a thread never has to choose
	 * between them.
	 *
	 * THE DELETED-NOTES DISCLOSURE IS OWNER-ONLY, gated on `canEdit` the same
	 * way the controls above are: it is `notes`' mirror view
	 * (`deletedNoteThreads`), read from the SAME prop rather than a second one,
	 * so it can never disagree with what `noteThreads` just dropped. A
	 * staff-deleted thread there shows the RPC's own refusal text in place of a
	 * control -- `viewerId` is what tells the two apart, and its absence fails
	 * CLOSED (every deleted thread reads as staff-deleted, never a false
	 * Restore that the RPC would refuse anyway).
	 */
	let {
		notes,
		canEdit = false,
		onSave,
		onDelete,
		onRestore,
		onStaffDelete,
		subjectName,
		viewerId,
		compact = false
	}: {
		notes: NotebookNoteRow[];
		/** False on a session-linked entry: no edit control is rendered. */
		canEdit?: boolean;
		/** Required when canEdit; resolves once the revision has landed. */
		onSave?: (noteId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		/** Owner-only (0119, notebook_delete_note). Mirrors `canEdit`. */
		onDelete?: (noteId: string) => Promise<EntryActionResult>;
		/**
		 * Owner-only (0119, notebook_restore_note). Drives the Restore control in
		 * the deleted-notes disclosure -- offered only on a thread THIS viewer
		 * deleted; a staff-deleted one shows the RPC's refusal text instead, since
		 * the RPC would refuse the call anyway.
		 */
		onRestore?: (noteId: string) => Promise<EntryActionResult>;
		/**
		 * Staff-only (0119, notebook_staff_delete_note). Rendered in the
		 * danger-zone treatment EntryReview's own entry delete already uses.
		 * NEVER handed in alongside `canEdit` -- EntryReview's own read-only
		 * `EntryNotes` call is the only caller.
		 */
		onStaffDelete?: (noteId: string) => Promise<EntryActionResult>;
		/** The student's name, for the staff-delete confirm text. */
		subjectName?: string;
		/** The signed-in caller's own id, for telling a self-deleted thread from a staff-deleted one. */
		viewerId?: string;
		/** The instructor panel wants a tighter block than the student feed. */
		compact?: boolean;
	} = $props();

	const threads = $derived(noteThreads(notes));
	/** Owner-only: see the disclosure below. */
	const deletedThreads = $derived(deletedNoteThreads(notes));

	let editingId = $state<string | null>(null);
	let draft = $state<TiptapNode | null>(null);
	/**
	 * What the note said when the editor opened, as the editor itself
	 * serialized it. Saving an UNCHANGED note would mint a revision identical
	 * to the one it replaced -- the note would then read "Edited", with an
	 * earlier version that says exactly the same thing, which is noise in the
	 * one place an instructor goes to see what actually changed.
	 */
	let baseline = $state<string | null>(null);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);

	const changed = $derived(draft !== null && baseline !== null && JSON.stringify(draft) !== baseline);

	function startEdit(noteId: string) {
		editingId = noteId;
		draft = null;
		baseline = null;
		errorMsg = null;
	}

	function cancelEdit() {
		editingId = null;
		draft = null;
		baseline = null;
		errorMsg = null;
	}

	async function save(noteId: string) {
		if (busy || !onSave || !draft || !changed) return;
		busy = true;
		errorMsg = null;
		const result = await onSave(noteId, draft);
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		editingId = null;
		draft = null;
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}

	// ---- owner delete (0119) -------------------------------------------------
	// Arm/confirm, the FolderManager convention: click once to arm, click the
	// same control again to confirm. One armed id at a time, since two threads
	// mid-confirm at once is more to track than it is worth.

	let deleteArmedId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let deleteErrId = $state<string | null>(null);
	let deleteErr = $state<string | null>(null);

	function armDelete(noteId: string) {
		deleteArmedId = noteId;
		deleteErrId = null;
	}

	async function confirmDelete(noteId: string) {
		if (!onDelete || deletingId) return;
		deletingId = noteId;
		deleteErrId = null;
		const result = await onDelete(noteId);
		deletingId = null;
		deleteArmedId = null;
		if (!result.ok) {
			deleteErrId = noteId;
			deleteErr = result.error;
		}
	}

	// ---- owner restore, from the deleted-notes disclosure (0119) -------------
	// No confirm: putting a note back is not destructive.

	let restoringId = $state<string | null>(null);
	let restoreErr = $state<string | null>(null);

	async function restoreOne(noteId: string) {
		if (!onRestore || restoringId) return;
		restoringId = noteId;
		restoreErr = null;
		const result = await onRestore(noteId);
		restoringId = null;
		if (!result.ok) restoreErr = result.error;
	}

	// ---- staff delete (0119), the danger-zone treatment ----------------------

	let staffArmedId = $state<string | null>(null);
	let staffDeletingId = $state<string | null>(null);
	let staffErrId = $state<string | null>(null);
	let staffErr = $state<string | null>(null);

	function armStaffDelete(noteId: string) {
		staffArmedId = noteId;
		staffErrId = null;
	}

	async function confirmStaffDelete(noteId: string) {
		if (!onStaffDelete || staffDeletingId) return;
		staffDeletingId = noteId;
		staffErrId = null;
		const result = await onStaffDelete(noteId);
		staffDeletingId = null;
		staffArmedId = null;
		if (!result.ok) {
			staffErrId = noteId;
			staffErr = result.error;
		}
	}
</script>

{#if threads.length}
	<ol class="notes" class:compact data-testid="entry-notes">
		{#each threads as thread (thread.noteId)}
			<li class="note" data-testid="entry-note">
				<div class="note-meta">
					<span class="stamp">{when(thread.createdAt)}</span>
					{#if thread.editedAt}
						<span class="dot" aria-hidden="true">·</span>
						<span class="edited" data-testid="note-edited">Edited {when(thread.editedAt)}</span>
					{/if}
				</div>

				{#if editingId === thread.noteId}
					<div class="note-edit">
						<NoteEditor
							value={thread.current.content}
							onchange={(doc) => (draft = doc)}
							onready={(doc) => (baseline = JSON.stringify(doc))}
							disabled={busy}
							autofocus
							label="Edit note"
						/>
						{#if errorMsg}
							<p class="note-error" role="alert">{errorMsg}</p>
						{/if}
						<div class="note-actions">
							<button
								type="button"
								class="btn"
								disabled={busy || !changed}
								onclick={() => save(thread.noteId)}
							>
								{busy ? 'Saving...' : 'Save changes'}
							</button>
							<button type="button" class="btn secondary" disabled={busy} onclick={cancelEdit}>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<NoteContent doc={thread.current.content} />
					{#if (canEdit && onSave) || (canEdit && onDelete)}
						<div class="note-actions">
							{#if canEdit && onSave}
								<button
									type="button"
									class="note-edit-btn"
									data-testid="note-edit"
									onclick={() => startEdit(thread.noteId)}
								>
									Edit
								</button>
							{/if}
							{#if canEdit && onDelete}
								<button
									type="button"
									class="note-delete-btn"
									disabled={deletingId === thread.noteId}
									data-testid="note-delete"
									onclick={() =>
										deleteArmedId === thread.noteId
											? confirmDelete(thread.noteId)
											: armDelete(thread.noteId)}
								>
									{deletingId === thread.noteId
										? 'Deleting...'
										: deleteArmedId === thread.noteId
											? 'Confirm delete'
											: 'Delete'}
								</button>
							{/if}
						</div>
						{#if deleteArmedId === thread.noteId}
							<p class="note-confirm" data-testid="note-delete-confirm">
								Delete "{docSummary(thread.current.content, 50)}"? This can't be undone here.
								<button type="button" class="note-cancel-btn" onclick={() => (deleteArmedId = null)}>
									Cancel
								</button>
							</p>
						{/if}
						{#if deleteErrId === thread.noteId && deleteErr}
							<p class="note-error" role="alert">{deleteErr}</p>
						{/if}
					{/if}
				{/if}

				{#if onStaffDelete}
					<!-- The danger-zone treatment EntryReview's own entry delete
					     already uses (bordered card, red heading, two-button
					     arm/confirm), scaled to one note thread. Never rendered
					     alongside canEdit -- see the prop doc above. -->
					<div class="note-danger-zone" data-testid="note-staff-danger-zone">
						{#if staffArmedId === thread.noteId}
							<p class="note-danger-confirm" data-testid="note-staff-delete-confirm">
								Delete {subjectName ?? 'this student'}'s note? This can't be undone here.
							</p>
						{/if}
						<div class="note-danger-actions">
							<button
								type="button"
								class="note-danger-btn"
								disabled={staffDeletingId === thread.noteId}
								data-testid="note-staff-delete"
								onclick={() =>
									staffArmedId === thread.noteId
										? confirmStaffDelete(thread.noteId)
										: armStaffDelete(thread.noteId)}
							>
								{staffDeletingId === thread.noteId
									? 'Deleting...'
									: staffArmedId === thread.noteId
										? 'Confirm delete'
										: 'Delete this note'}
							</button>
							{#if staffArmedId === thread.noteId}
								<button
									type="button"
									class="note-cancel-btn"
									disabled={staffDeletingId === thread.noteId}
									onclick={() => (staffArmedId = null)}
								>
									Cancel
								</button>
							{/if}
						</div>
						{#if staffErrId === thread.noteId && staffErr}
							<p class="msg error" role="alert">{staffErr}</p>
						{/if}
					</div>
				{/if}

				{#if thread.history.length}
					<!-- Not an "edited" tag over a hidden overwrite: these are the
					     real earlier rows, still exactly as they were written. -->
					<details class="history" data-testid="note-history">
						<summary>
							{thread.history.length === 1
								? '1 earlier version'
								: `${thread.history.length} earlier versions`}
						</summary>
						<ol class="revisions">
							{#each thread.history as revision (revision.id)}
								<li>
									<div class="note-meta">
										<span class="rev">Version {revision.revision}</span>
										<span class="dot" aria-hidden="true">·</span>
										<span class="stamp">{when(revision.created_at)}</span>
									</div>
									<NoteContent doc={revision.content} />
								</li>
							{/each}
						</ol>
					</details>
				{/if}
			</li>
		{/each}
	</ol>
{/if}

{#if canEdit && deletedThreads.length}
	<!-- Closed by default: a note the student removed is not the first thing
	     they came back to see, the same rule the removed-photos disclosure
	     follows. Owner-only -- EntryReview never sets canEdit, and staff
	     restore is not offered on this surface. -->
	<details class="removed-notes" data-testid="removed-notes">
		<summary>
			{deletedThreads.length === 1 ? '1 removed note' : `${deletedThreads.length} removed notes`}
		</summary>
		<ul>
			{#each deletedThreads as thread (thread.noteId)}
				<li>
					<div class="removed-note-head">
						<span class="removed-note-summary">{docSummary(thread.current.content, 60)}</span>
						<span class="removed-when">Removed {when(thread.deletedAt ?? '')}</span>
					</div>
					{#if onRestore && thread.deletedBy === viewerId}
						<button
							type="button"
							class="btn secondary restore-note-btn"
							disabled={restoringId === thread.noteId}
							data-testid="restore-note"
							onclick={() => restoreOne(thread.noteId)}
						>
							{restoringId === thread.noteId ? 'Restoring...' : 'Restore'}
						</button>
					{:else}
						<p class="note-refusal" data-testid="note-restore-refusal">
							Your instructor removed that note, so you cannot restore it yourself. Ask them to
							restore it for you.
						</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if restoreErr}
			<p class="note-error" role="alert">{restoreErr}</p>
		{/if}
	</details>
{/if}

<style>
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1.3rem;
	}
	.notes.compact {
		gap: 0.9rem;
	}
	.note {
		border-left: 2px solid var(--nb-hairline-strong);
		padding-left: 0.9rem;
	}
	.note-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 0.35rem;
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.dot {
		color: var(--nb-hairline-strong);
	}
	.edited {
		color: var(--nb-accent-ink);
	}
	.rev {
		font-weight: 600;
	}
	.note-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}
	.note-edit-btn {
		background: none;
		border: none;
		padding: 0;
		color: var(--nb-ink-faint);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.note-edit-btn:hover {
		color: var(--nb-accent-ink);
	}
	.note-error {
		margin: 0.5rem 0 0;
		color: var(--nb-error);
		font-size: 0.84rem;
	}
	.history {
		margin-top: 0.6rem;
	}
	.history summary {
		font-size: 0.74rem;
		color: var(--nb-ink-faint);
		cursor: pointer;
	}
	.history summary:hover {
		color: var(--nb-accent-ink);
	}
	.revisions {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.9rem;
		border-left: 1px dashed var(--nb-hairline-strong);
		padding-left: 0.8rem;
	}
	/* Superseded text is history, so it sits back from what the note says now. */
	.revisions :global(.note-body) {
		color: var(--nb-ink-soft);
		font-size: 0.9rem;
	}

	/* --- owner delete + restore (0119) --------------------------------------- */
	.note-delete-btn {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0 0.4rem;
		background: none;
		border: none;
		color: var(--nb-error);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.note-delete-btn:hover:not(:disabled) {
		text-decoration: underline;
	}
	.note-delete-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.note-cancel-btn {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0 0.4rem;
		background: none;
		border: none;
		color: var(--nb-ink-faint);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.note-cancel-btn:hover:not(:disabled) {
		color: var(--nb-accent-ink);
	}
	.note-cancel-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.note-confirm {
		margin: 0.4rem 0 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		color: var(--nb-error);
		font-weight: 600;
		font-size: 0.84rem;
	}

	/* --- staff delete (0119): the entry delete's own danger-zone treatment,
	   scaled to one note thread rather than a whole card. --- */
	.note-danger-zone {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.7rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid color-mix(in srgb, var(--nb-error) 35%, var(--nb-hairline));
		border-radius: var(--nb-radius-control);
		background: color-mix(in srgb, var(--nb-error) 4%, transparent);
	}
	.note-danger-confirm {
		margin: 0;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--nb-error);
	}
	.note-danger-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.note-danger-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0 0.7rem;
		background: var(--nb-surface);
		border: 1px solid var(--nb-error);
		border-radius: var(--nb-radius-control);
		color: var(--nb-error);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.note-danger-btn:hover:not(:disabled) {
		background: var(--nb-error);
		color: var(--nb-surface);
	}
	.note-danger-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.msg.error {
		margin: 0;
		font-size: 0.82rem;
		color: var(--nb-error);
	}

	/* --- deleted-notes disclosure (0119): closed by default, the same rule
	   the removed-photos one follows. --- */
	.removed-notes {
		margin-top: 1rem;
	}
	.removed-notes summary {
		cursor: pointer;
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--nb-ink-soft);
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.removed-notes summary:hover {
		color: var(--nb-accent-ink);
	}
	.removed-notes ul {
		list-style: none;
		margin: 0.3rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.removed-notes li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
	}
	.removed-note-head {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.removed-note-summary {
		font-size: 0.84rem;
		color: var(--nb-ink);
	}
	.removed-when {
		font-size: 0.72rem;
		color: var(--nb-ink-faint);
	}
	.restore-note-btn {
		min-height: 2.75rem;
		flex: 0 0 auto;
	}
	.note-refusal {
		margin: 0;
		font-size: 0.78rem;
		color: var(--nb-ink-faint);
		font-style: italic;
	}
</style>
