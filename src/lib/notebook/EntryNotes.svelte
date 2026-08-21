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
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { untrack } from 'svelte';

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
		compact = false,
		ondirty
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
		/**
		 * AN OPEN EDITOR WITH UNSAVED EDITS IS WORK, and this is how the page
		 * that owns the navigation guard finds out about it.
		 *
		 * NotebookView's guard tested the composer only (staged photos, the
		 * title, the note draft), so a student who opened an existing note,
		 * retyped a paragraph and clicked another entry lost it with nothing
		 * said. The note editor is two components down from that guard, so it
		 * reports UP rather than the guard reaching down -- the card is a
		 * presentation component and this is intent, which is the direction
		 * everything else here travels too.
		 */
		ondirty?: (dirty: boolean) => void;
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
	const changed = $derived(draft !== null && baseline !== null && JSON.stringify(draft) !== baseline);

	/**
	 * THE LABEL REPORTS THE ACKNOWLEDGEMENT. It used to be driven by a `busy`
	 * flag set before the call and cleared after it, which says a request is
	 * in flight and says nothing at all about whether the revision landed --
	 * the editor simply closed, and a failure showed a message with no state
	 * behind it and no way to try again but retyping.
	 *
	 * `autosave: false` is deliberate and is not a smaller version of the
	 * classroom's autosave. A note write INSERTS a revision (0078), so a
	 * debounce here would mint one every 800ms and fill a thread with versions
	 * nobody asked for. The machine still moves to `dirty` on the first
	 * keystroke -- which is what the navigation guard reads -- it just never
	 * schedules anything of its own.
	 */
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'That note was not saved.',
		async save() {
			const noteId = editingId;
			if (!noteId || !onSave || !draft || !changed) return { ok: true } as const;
			const result = await onSave(noteId, draft);
			if (!result.ok) return { ok: false, retryable: true, message: result.error } as const;
			// ACKNOWLEDGED, and only now: the editor closes on the server's
			// answer, never on the dispatch. The draft is left in place until
			// this line, so a failed write keeps every word of it on screen.
			editingId = null;
			draft = null;
			baseline = null;
			return { ok: true } as const;
		}
	});

	/**
	 * THE SIGNAL IS WITHDRAWN ON TEARDOWN, and that is not tidiness.
	 *
	 * A successful note save reloads the feed, which remounts this card -- so
	 * the instance that reported `dirty` is destroyed and a fresh one, with no
	 * open editor, takes its place. Without this cleanup the page's Set keeps
	 * that entry id forever and the guard asks about a note that was saved
	 * minutes ago, which is exactly the kind of warning people learn to click
	 * through. Found in the browser: the note saved, the editor closed, and the
	 * next navigation still asked.
	 */
	$effect(() => {
		const off = save.attach();
		return () => {
			off();
			ondirty?.(false);
		};
	});

	// `untrack` around both calls: they READ the phase they may then write, so a
	// tracked call re-runs this effect on every transition and turns `saved`
	// straight back into `dirty`.
	$effect(() => {
		const isChanged = changed;
		untrack(() => {
			if (isChanged) save.markDirty();
			// `saved` and `failed` are reports of a WRITE and are left standing;
			// only an unsaved marker with nothing behind it is cleared here.
			// (`startEdit` and `cancelEdit` reset explicitly.)
			else if (save.phase === 'dirty') save.reset();
		});
	});

	/**
	 * THE SIGNAL TRACKS THE MACHINE, NOT THE DRAFT, and that distinction is the
	 * whole bug it fixes.
	 *
	 * Reporting from the effect above meant reading `save.dirty` inside its
	 * `untrack`, so the only thing that could re-run it was `changed`. A
	 * successful save clears the draft (making `changed` false) BEFORE the
	 * acknowledgement lands, so the last thing the page was told was `dirty`
	 * while the phase was still `writing` -- and the `writing` to `saved`
	 * transition, the one that actually releases the guard, re-ran nothing.
	 * Found in the browser: the note saved, the editor closed, and the next
	 * navigation still asked about it.
	 */
	$effect(() => {
		const isDirty = save.dirty;
		untrack(() => ondirty?.(isDirty));
	});

	const busy = $derived(save.phase === 'writing');

	function startEdit(noteId: string) {
		editingId = noteId;
		draft = null;
		baseline = null;
		save.reset();
	}

	function cancelEdit() {
		editingId = null;
		draft = null;
		baseline = null;
		save.reset();
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
						<div class="note-actions">
							<button
								type="button"
								class="btn"
								disabled={busy || !changed}
								onclick={() => void save.saveNow()}
							>
								Save changes
							</button>
							<button type="button" class="btn secondary" disabled={busy} onclick={cancelEdit}>
								Cancel
							</button>
							<!-- The same indicator, in the same words, as the other three
							     surfaces. It replaces both the old `busy ? 'Saving...'`
							     button label and the bare error line: those said what had
							     been dispatched, this says what landed and when. -->
							<SaveIndicator state={save} />
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
		gap: var(--space-5);
	}
	.notes.compact {
		gap: var(--space-4);
	}
	.note {
		border-left: 2px solid var(--nb-hairline-strong);
		padding-left: var(--space-4);
	}
	.note-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-1);
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
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
		gap: var(--space-2);
		margin-top: var(--space-2);
		flex-wrap: wrap;
	}
	.note-edit-btn {
		background: none;
		border: none;
		padding: 0;
		color: var(--text-3);
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
		margin: var(--space-2) 0 0;
		color: var(--nb-error);
		font-size: 0.84rem;
	}
	.history {
		margin-top: var(--space-2);
	}
	.history summary {
		font-size: 0.74rem;
		color: var(--text-3);
		cursor: pointer;
	}
	.history summary:hover {
		color: var(--nb-accent-ink);
	}
	.revisions {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
		display: grid;
		gap: var(--space-4);
		border-left: 1px dashed var(--nb-hairline-strong);
		padding-left: var(--space-3);
	}
	/* Superseded text is history, so it sits back from what the note says now. */
	.revisions :global(.note-body) {
		color: var(--text-2);
		font-size: 0.9rem;
	}

	/* --- owner delete + restore (0119) --------------------------------------- */
	.note-delete-btn {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0 var(--space-2);
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
		padding: 0 var(--space-2);
		background: none;
		border: none;
		color: var(--text-3);
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
		margin: var(--space-2) 0 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		color: var(--nb-error);
		font-weight: 600;
		font-size: 0.84rem;
	}

	/* --- staff delete (0119): the entry delete's own danger-zone treatment,
	   scaled to one note thread rather than a whole card. --- */
	.note-danger-zone {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid color-mix(in srgb, var(--nb-error) 35%, var(--hairline));
		border-radius: var(--radius-control);
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
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.note-danger-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0 var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--nb-error);
		border-radius: var(--radius-control);
		color: var(--nb-error);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.note-danger-btn:hover:not(:disabled) {
		background: var(--nb-error);
		color: var(--surface-1);
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
		margin-top: var(--space-4);
	}
	.removed-notes summary {
		cursor: pointer;
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--text-2);
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.removed-notes summary:hover {
		color: var(--nb-accent-ink);
	}
	.removed-notes ul {
		list-style: none;
		margin: var(--space-1) 0 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.removed-notes li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.removed-note-head {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.removed-note-summary {
		font-size: 0.84rem;
		color: var(--text-1);
	}
	.removed-when {
		font-size: 0.72rem;
		color: var(--text-3);
	}
	.restore-note-btn {
		min-height: 2.75rem;
		flex: 0 0 auto;
	}
	.note-refusal {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-3);
		font-style: italic;
	}
</style>
