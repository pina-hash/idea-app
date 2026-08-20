<script lang="ts">
	import { deletedEntryTitle, type EntryActionResult, type NotebookDeletedEntry } from '$lib/notebook';

	/**
	 * The staff Deleted section on a student's notebook (0117, ONE
	 * IMPLEMENTATION for /notebook/review/student/[studentEmail] and its dev
	 * harness -- both used to hand-roll a copy of this markup, which is exactly
	 * the drift a shared component exists to end).
	 *
	 * VISUALLY SEPARATED from the notebook above it, the same way EntryReview
	 * separates its own delete control into its own bordered card with its own
	 * heading (0116): "read this student's work" and "put back something they
	 * removed" must never be one scroll away from looking like the same list.
	 *
	 * ABSENT ENTIRELY WHEN THERE IS NOTHING DELETED -- not an empty section --
	 * so the caller never has to guard the length itself; a second `{#if}` at
	 * the call site would be the same check written twice.
	 *
	 * UNCONDITIONAL LISTING: every deleted entry renders identically here,
	 * student-deleted and staff-deleted alike, with no client-side flag telling
	 * them apart. `notebook_staff_restore_entry`'s own
	 * `classroom_manages_section(...) or notebook_manages_student(...)` gate is
	 * the real boundary, not something this component would have to keep in
	 * sync with it.
	 *
	 * NO CONFIRM ON RESTORE, deliberately: the student's own "Recently deleted"
	 * restore in NotebookView carries none either, because putting an entry
	 * back is reversible.
	 *
	 * PRESENCE OF `restoreEntry` DECIDES WHETHER THE CONTROL RENDERS -- the
	 * transport-presence doctrine this whole subsystem already runs on
	 * (NotebookView's own `restoreEntry` / `restorePhoto`,
	 * NotebookEntryCard's `onRestorePhoto`): an omitted transport removes the
	 * button, it is never merely disabled. The real route always has one to
	 * give; this component does not assume that.
	 */

	let {
		entries,
		studentName,
		restoreEntry
	}: {
		entries: NotebookDeletedEntry[];
		studentName: string;
		restoreEntry?: (entryId: string) => Promise<EntryActionResult>;
	} = $props();

	let restoringId = $state<string | null>(null);
	let restoreError = $state<string | null>(null);

	async function restoreOne(entryId: string) {
		if (!restoreEntry || restoringId) return;
		restoringId = entryId;
		restoreError = null;
		const result = await restoreEntry(entryId);
		restoringId = null;
		if (!result.ok) restoreError = result.error;
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

{#if entries.length > 0}
	<section class="deleted-zone" data-testid="staff-deleted-zone">
		<h2>Deleted</h2>
		<p class="note">
			Entries {studentName} removed from this notebook. Restoring one puts it back exactly where
			it was.
		</p>
		<ul class="deleted-entries">
			{#each entries as entry (entry.id)}
				<li>
					<div class="deleted-main">
						<span class="deleted-title">{deletedEntryTitle(entry)}</span>
						<span class="deleted-meta">Deleted {when(entry.deleted_at)}</span>
					</div>
					{#if restoreEntry}
						<button
							type="button"
							class="btn secondary restore-btn"
							disabled={restoringId === entry.id}
							data-testid="staff-restore-entry"
							onclick={() => restoreOne(entry.id)}
						>
							{restoringId === entry.id ? 'Restoring...' : 'Restore'}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if restoreError}
			<p class="msg error" role="alert">{restoreError}</p>
		{/if}
	</section>
{/if}

<style>
	.deleted-zone {
		max-width: var(--measure-split);
		margin: var(--space-5) auto var(--space-6);
		box-sizing: border-box;
		padding: 1rem var(--cr-gutter, 1rem);
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		background: var(--bg2);
		display: grid;
		gap: var(--space-3);
	}
	.deleted-zone h2 {
		margin: 0;
		font-size: 1rem;
		color: var(--gold);
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--dim);
	}
	.deleted-entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.deleted-entries li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		background: var(--bg0);
	}
	.deleted-main {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.deleted-title {
		font-weight: 600;
		font-size: 0.92rem;
		color: var(--white);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.deleted-meta {
		font-size: 0.74rem;
		color: var(--dim);
	}
	.restore-btn {
		min-height: 2.75rem;
		flex: 0 0 auto;
	}
	.msg.error {
		margin: 0;
		font-size: 0.82rem;
		color: var(--amber);
	}
</style>
