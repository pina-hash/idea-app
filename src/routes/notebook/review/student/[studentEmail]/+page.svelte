<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import NotebookDeletedZone from '$lib/notebook/NotebookDeletedZone.svelte';
	import NotebookNoAccountNotice from '$lib/notebook/NotebookNoAccountNotice.svelte';
	import StudentReviewBackStrip from '$lib/notebook/StudentReviewBackStrip.svelte';
	import type { EntryActionResult } from '$lib/notebook';
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
	async function restoreEntry(entryId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_staff_restore_entry', {
			p_entry_id: entryId
		});
		if (error) return { ok: false, error: error.message?.trim() || 'Could not restore that entry.' };
		await invalidateAll();
		return { ok: true };
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
<StudentReviewBackStrip
	displayName={data.student.display_name}
	email={data.student.email}
	sectionId={data.fromSectionId}
/>

{#if data.student.user_id === null}
	<NotebookNoAccountNotice displayName={data.student.display_name} email={data.student.email} />
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
	`studentUserId` and `viewerId` are what let each row say WHO removed it. The
	list is mixed -- the payload carries no `deleted_by` filter, deliberately --
	so without them the section could only make one claim over both kinds, and
	the one it used to make named the student for staff removals too.
-->
<NotebookDeletedZone
	entries={data.deletedEntries}
	studentName={data.student.display_name ?? data.student.email}
	studentUserId={data.student.user_id}
	viewerId={data.viewerId}
	{restoreEntry}
/>
