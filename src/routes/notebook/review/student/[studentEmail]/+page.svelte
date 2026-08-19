<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import { deletedEntryTitle } from '$lib/notebook';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Restoring one of this student's deleted entries (0117,
	 * notebook_staff_restore_entry). Direct to the RPC -- the same shape the
	 * folder writes in /notebook/+page.svelte use, since there is no server
	 * work of its own between here and the call.
	 *
	 * NO OWNERSHIP CHECK HERE, ON PURPOSE: unlike the student's own
	 * "Recently deleted" list, a manager may attempt to restore ANY of this
	 * student's deleted entries regardless of who removed it -- the RPC's own
	 * `classroom_manages_section(...) or notebook_manages_student(...)` gate is
	 * the real boundary, not a flag this page would have to keep in sync with it.
	 */
	let restoringId = $state<string | null>(null);
	let restoreError = $state<string | null>(null);

	async function restoreOne(entryId: string) {
		if (restoringId) return;
		restoringId = entryId;
		restoreError = null;
		const { error } = await data.supabase.rpc('notebook_staff_restore_entry', {
			p_entry_id: entryId
		});
		restoringId = null;
		if (error) {
			restoreError = error.message?.trim() || 'Could not restore that entry.';
			return;
		}
		await invalidateAll();
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

<!--
	NO TRANSPORTS AT ALL, which is the mechanism rather than the statement:
	every write prop on NotebookView is optional and an omitted one removes the
	control it drives -- the "Add an entry" form, the folder manager, bulk move,
	pinning, and each card's own add-photos / add-note / re-file controls. There
	is nothing here to call, and 0106 ships no write RPC beside the read.

	The migration flags are all TRUE because the payload only exists at all when
	0106 applied on top of them: the RPC selects folders, notes, pinned_at and
	the activity view directly, so a project missing any of those fails the load
	rather than degrading into a half-view that would misreport what the student
	has written. `uploadReady` is false since no upload is offered.

	`canReview` is FALSE deliberately. The "Section review" link would loop back
	into a console that flags and grades, from a surface whose whole point is
	reading; the way back is the banner's own link to the grid this arrived from.
-->
<div class="back-strip">
	<a class="back" href="/notebook/review">&larr; Section review</a>
	<p class="who">
		Reading <strong>{data.student.display_name ?? data.student.email}</strong>'s notebook. This is
		their whole notebook, including entries they filed outside your class. You cannot change
		anything here.
	</p>
</div>

{#if data.student.user_id === null}
	<div class="nb-noaccount">
		<p>
			<strong>{data.student.display_name ?? data.student.email}</strong> is on the roster but has
			never signed in, so there is no notebook to show yet. Their check-ins are waiting for them.
		</p>
	</div>
{/if}

<NotebookView
	entries={data.entries}
	sessions={data.sessions}
	folders={data.folders}
	activity={data.activity}
	sectionLabel={data.sectionLabel}
	canReview={false}
	uploadReady={false}
	readOnly
	homeHref="/notebook/review"
/>

<!--
	VISUALLY SEPARATED from the notebook above it, the same way EntryReview
	separates its own delete control into a distinct bordered card with its own
	heading (0116) -- so "read this student's work" and "put back something they
	removed" are never one scroll away from looking like the same list. Restore
	is offered for EVERY deleted entry here, whoever removed it; the RPC's own
	gate decides what actually succeeds.
-->
{#if data.deletedEntries.length > 0}
	<section class="deleted-zone" data-testid="staff-deleted-zone">
		<h2>Deleted</h2>
		<p class="note">
			Entries {data.student.display_name ?? data.student.email} removed from this notebook.
			Restoring one puts it back exactly where it was.
		</p>
		<ul class="deleted-entries">
			{#each data.deletedEntries as entry (entry.id)}
				<li>
					<div class="deleted-main">
						<span class="deleted-title">{deletedEntryTitle(entry)}</span>
						<span class="deleted-meta">Deleted {when(entry.deleted_at)}</span>
					</div>
					<button
						type="button"
						class="btn secondary restore-btn"
						disabled={restoringId === entry.id}
						data-testid="staff-restore-entry"
						onclick={() => restoreOne(entry.id)}
					>
						{restoringId === entry.id ? 'Restoring...' : 'Restore'}
					</button>
				</li>
			{/each}
		</ul>
		{#if restoreError}
			<p class="msg error" role="alert">{restoreError}</p>
		{/if}
	</section>
{/if}

<style>
	.back-strip {
		max-width: var(--measure-split);
		margin: 1rem auto 0;
		padding-inline: var(--cr-gutter, 1rem);
		box-sizing: border-box;
		display: grid;
		gap: 0.35rem;
	}
	.back {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--gold);
	}
	.who {
		margin: 0;
		font-size: 0.85rem;
		color: var(--dim);
	}
	.who strong {
		color: var(--white);
	}
	.nb-noaccount {
		max-width: var(--measure-split);
		margin: 1rem auto 0;
		box-sizing: border-box;
		padding: 0.7rem var(--cr-gutter, 1rem);
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg2);
		font-size: 0.9rem;
		color: var(--dim);
	}
	.nb-noaccount strong {
		color: var(--white);
	}

	/* Visually separated from the notebook above (the EntryReview danger-zone
	   pattern): its own bordered card, its own heading. */
	.deleted-zone {
		max-width: var(--measure-split);
		margin: 1.4rem auto 2rem;
		box-sizing: border-box;
		padding: 1rem var(--cr-gutter, 1rem);
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg2);
		display: grid;
		gap: 0.7rem;
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
		gap: 0.5rem;
	}
	.deleted-entries li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--bg0);
	}
	.deleted-main {
		display: grid;
		gap: 0.15rem;
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
