<script lang="ts">
	import NoteContent from '$lib/notebook/NoteContent.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import { noteThreads, type NotebookNoteRow, type TiptapNode } from '$lib/notebook-notes';
	import type { NoteSaveResult } from '$lib/notebook';

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
	 */
	let {
		notes,
		canEdit = false,
		onSave,
		compact = false
	}: {
		notes: NotebookNoteRow[];
		/** False on a session-linked entry: no edit control is rendered. */
		canEdit?: boolean;
		/** Required when canEdit; resolves once the revision has landed. */
		onSave?: (noteId: string, doc: TiptapNode) => Promise<NoteSaveResult>;
		/** The instructor panel wants a tighter block than the student feed. */
		compact?: boolean;
	} = $props();

	const threads = $derived(noteThreads(notes));

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
					{#if canEdit && onSave}
						<div class="note-actions">
							<button
								type="button"
								class="note-edit-btn"
								data-testid="note-edit"
								onclick={() => startEdit(thread.noteId)}
							>
								Edit
							</button>
						</div>
					{/if}
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
</style>
