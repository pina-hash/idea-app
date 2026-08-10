<script lang="ts">
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import { flagReasonLabel, photoCountLabel, photoPages, type NotebookFlagReason } from '$lib/notebook';
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
		onClose: () => void;
	} = $props();

	let reason = $state<NotebookFlagReason>('not_dated');
	let comment = $state('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let notice = $state<string | null>(null);

	// A new entry resets the form, so a comment typed against one student's
	// page can never be submitted against another's.
	$effect(() => {
		void entry.id;
		reason = 'not_dated';
		comment = '';
		errorMsg = null;
		notice = null;
	});

	const title = $derived(
		session?.session_label ?? entry.custom_label ?? 'Entry'
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
	{:else}
		<p class="empty">This entry is a written note with no photos.</p>
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
</section>

<style>
	.entry-panel {
		display: grid;
		gap: 0.9rem;
		border-color: var(--line-strong);
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		color: var(--dim);
	}
	.state {
		padding: 0.1rem 0.4rem;
		border: 1px solid currentColor;
		border-radius: 3px;
	}
	.state.on_time {
		color: var(--green);
	}
	.state.late {
		color: var(--amber);
	}
	.state.flagged {
		color: var(--crimson);
	}
	.state.pending_review {
		color: var(--cyan);
	}
	.state.excused,
	.state.missing {
		color: var(--ice);
	}
	.also {
		color: var(--gold);
	}
	.callout {
		display: grid;
		gap: 0.2rem;
		padding: 0.6rem 0.7rem;
		border-left: 2px solid var(--amber);
		background: var(--bg2);
		font-size: 0.88rem;
	}
	.callout strong {
		color: var(--amber);
	}
	.empty {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.review-form {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--bg2);
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.field select,
	.field input {
		width: 100%;
		padding: 0.45rem 0.55rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 3px;
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.95rem;
	}
	.field select:focus,
	.field input:focus {
		outline: none;
		border-color: var(--line-strong);
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
		color: var(--crimson);
	}
	.msg.ok {
		color: var(--green);
	}
	.note {
		margin: 0;
		color: var(--dim);
		font-size: 0.82rem;
	}
</style>
