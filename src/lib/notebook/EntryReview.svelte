<script lang="ts">
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import EntryNotes from '$lib/notebook/EntryNotes.svelte';
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
	 * One entry, opened from a grid cell: its photos, and the flag control.
	 *
	 * Photos are rendered by the SAME NotebookPhotos the student's own feed
	 * uses (proxy route, reserved height, per-photo retry, Drive escape
	 * hatch), so what an instructor sees is what the student sees. `lazy` is
	 * off here -- this panel mounts on demand and is expected to paint at
	 * once, unlike a long scrolling feed.
	 *
	 * FLAG and RESOLVE are the two halves of the same loop and both ship:
	 * 0069 describes `notebook_resolve_entry` as what "closes the review loop"
	 * after a student resubmits, and an instructor who can flag with no way to
	 * accept the fix is a trap. Both RPCs take the same tier (section
	 * instructor or site admin) and enforce it themselves.
	 */
	let {
		entry,
		cell,
		student,
		session,
		onFlag,
		onResolve,
		onDelete,
		onClose
	}: {
		entry: ReviewEntry;
		cell: GridCell;
		student: GridStudent | undefined;
		session: GridSession | undefined;
		onFlag: (
			entryId: string,
			reason: NotebookFlagReason,
			comment: string | null
		) => Promise<ReviewResult>;
		onResolve: (entryId: string, comment: string | null) => Promise<ReviewResult>;
		/**
		 * An instructor removing this entry (0116, notebook_staff_delete_entry).
		 * OMITTED for a non-manager -- ReviewConsole only ever hands this in when
		 * its own transports carry one, which the RPC's own
		 * classroom_manages_section check is the real boundary for regardless.
		 */
		onDelete?: (entryId: string) => Promise<ReviewResult>;
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

	// A new entry resets the form, so a comment typed against one student's
	// page can never be submitted against another's.
	$effect(() => {
		void entry.id;
		reason = 'not_dated';
		comment = '';
		errorMsg = null;
		notice = null;
		deleteArmed = false;
		deleteError = null;
	});

	// entryTitle() is the same five-fallback derivation the student's own card
	// uses (session label -> custom_label -> photo filename -> first note's
	// opening words -> "Untitled entry"), trimmed and truthiness-tested rather
	// than nullish-tested. The inline version this replaced showed the literal
	// word "Entry" for anything past session/custom_label, and a blank title
	// for an empty-string custom_label. ReviewEntry carries only `session_id`,
	// not an embedded session object, so the shape entryTitle needs is built
	// here from the `session` prop already resolved by the caller -- no query
	// change, entryTitle's own parameter type is narrowed to just what it reads.
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

	async function flag() {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onFlag(entry.id, reason, comment.trim() || null);
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		notice = 'Flagged. The student sees the reason on their own notebook.';
	}

	async function resolve() {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onResolve(entry.id, comment.trim() || null);
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		notice = 'Accepted. This entry now counts as recorded.';
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
		const result = await onDelete(entry.id);
		deleting = false;
		if (!result.ok) {
			deleteError = result.error;
			deleteArmed = false;
			return;
		}
		// onClose closes the panel; the caller (ReviewConsole) refreshes the
		// grid, whose cell for this entry now reads missing.
		onClose();
	}
</script>

<section class="card entry-panel">
	<header class="entry-head">
		<div>
			<div class="eyebrow">{student?.name ?? 'Student'}</div>
			<h2>{title}</h2>
			<p class="meta">
				<span class="state {cellDisplay(cell)}">{cellLabel(cellDisplay(cell))}</span>
				<span>{stampLabel(entry.upload_timestamp)}</span>
				<!-- Logical pages: an original + its corrected variant count once. -->
				<span>{photoCountLabel(photoPages(entry.photos).length)}</span>
				{#if entry.folder_name}
					<!-- Where the STUDENT filed it (0088). Context only: filing is
					     their own organizing scheme and carries no meaning for
					     review, but knowing an entry sits in "Gearbox build"
					     often says what the page is of. -->
					<span class="filed" data-testid="review-folder">Filed under {entry.folder_name}</span>
				{/if}
				{#if cell.entry_count > 1}
					<span class="also">{cell.entry_count} entries for this check-in; showing the latest</span>
				{/if}
			</p>
		</div>
		<button type="button" class="btn secondary" onclick={onClose}>Close</button>
	</header>

	{#if entry.status === 'flagged' && (entry.flag_reason || entry.instructor_comment)}
		<div class="callout">
			{#if entry.flag_reason}<strong>{flagReasonLabel(entry.flag_reason)}.</strong>{/if}
			{#if entry.instructor_comment}<span>{entry.instructor_comment}</span>{/if}
		</div>
	{/if}

	{#if entry.photos.length}
		<NotebookPhotos photos={entry.photos} label={title} lazy={false} />
	{:else if !entry.notes?.length}
		<p class="empty">This entry has no photos and no written notes.</p>
	{/if}

	{#if entry.notes?.length}
		<!-- The student's own words, rendered by the SAME component their feed
		     uses. Read-only: `canEdit` is never set here, and 0078's
		     notebook_edit_note refuses anyone but the note's owner regardless. -->
		<section class="notes-block" data-testid="review-notes">
			<h3>Written notes</h3>
			<EntryNotes notes={entry.notes} compact />
		</section>
	{/if}

	<div class="review-form">
		<h3>Review</h3>
		<div class="form-row">
			<label class="field">
				<span>Flag reason</span>
				<select bind:value={reason}>
					{#each FLAG_REASONS as r (r)}
						<option value={r}>{flagReasonLabel(r)}</option>
					{/each}
				</select>
			</label>
			<label class="field grow">
				<span>Comment (optional)</span>
				<input
					type="text"
					maxlength="2000"
					placeholder="What needs fixing?"
					bind:value={comment}
				/>
			</label>
		</div>
		<div class="form-actions">
			<button type="button" class="btn" onclick={flag} disabled={busy}>
				{busy ? 'Working...' : 'Flag this entry'}
			</button>
			{#if entry.status !== 'compliant'}
				<button type="button" class="btn secondary" onclick={resolve} disabled={busy}>
					Accept it
				</button>
			{/if}
		</div>
		{#if errorMsg}<p class="msg error" role="alert">{errorMsg}</p>{/if}
		{#if notice}<p class="msg ok">{notice}</p>{/if}
		<p class="note">
			Flagging asks the student to add another photo; their resubmission comes back here as
			"awaiting review".
		</p>
	</div>

	{#if onDelete}
		<div class="danger-zone" data-testid="entry-danger-zone">
			<h3>Delete this entry</h3>
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
	{/if}
</section>

<style>
	.entry-panel {
		display: grid;
		gap: 0.9rem;
		border-color: var(--nb-hairline-strong);
	}
	.entry-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.entry-head h2 {
		margin: 0.1rem 0 0;
	}
	.meta {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
		align-items: center;
		margin: 0.35rem 0 0;
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	/* Panel status chips (NOT the grid's locked glyph cells): same hue
	   families, each deepened onto ink via color-mix so the small text reads
	   on the light card. */
	.state {
		padding: 0.1rem 0.4rem;
		border: 1px solid currentColor;
		border-radius: 3px;
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
		color: var(--nb-ink-faint);
	}
	.also {
		color: var(--nb-accent-ink);
	}
	/* Deliberately quiet: the student's filing is context, never a review
	   signal, so it must not read as one. */
	.filed {
		color: var(--nb-ink-faint);
		font-style: italic;
	}
	.callout {
		display: grid;
		gap: 0.2rem;
		padding: 0.6rem 0.8rem;
		border-left: 2px solid var(--nb-accent);
		background: var(--nb-accent-wash);
		border-radius: 0 var(--nb-radius-control) var(--nb-radius-control) 0;
		font-size: 0.88rem;
	}
	.callout strong {
		color: var(--nb-accent-ink);
	}
	.empty {
		color: var(--nb-ink-soft);
		font-size: 0.9rem;
	}
	.notes-block h3 {
		margin: 0 0 0.6rem;
		font-size: 0.95rem;
	}
	.review-form {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
	}
	.review-form h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.form-row {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.field {
		display: grid;
		gap: 0.25rem;
	}
	.field.grow {
		flex: 1 1 16rem;
	}
	.field span {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--nb-ink-faint);
	}
	.field select,
	.field input {
		width: 100%;
		padding: 0.45rem 0.55rem;
		background: var(--nb-surface);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--nb-radius-control);
		color: var(--nb-ink);
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
		gap: 0.6rem;
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
		color: var(--nb-ink-soft);
		font-size: 0.82rem;
	}

	/* VISUALLY SEPARATED from the flag/resolve form (a distinct card, a red
	   heading), so "flag this" and "delete this student's work outright" are
	   never one click apart on the same control cluster. */
	.danger-zone {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem;
		border: 1px solid color-mix(in srgb, var(--nb-error) 35%, var(--nb-hairline));
		border-radius: var(--nb-radius-control);
		background: color-mix(in srgb, var(--nb-error) 4%, transparent);
	}
	.danger-zone h3 {
		margin: 0;
		font-size: 0.9rem;
		color: var(--nb-error);
	}
	.btn.danger {
		background: var(--nb-surface);
		border-color: var(--nb-error);
		color: var(--nb-error);
	}
	.btn.danger:hover:not(:disabled) {
		background: var(--nb-error);
		border-color: var(--nb-error);
		color: var(--nb-surface);
		box-shadow: none;
		text-shadow: none;
	}
</style>
