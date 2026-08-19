<script lang="ts">
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import { deletedEntryTitle } from '$lib/notebook';
	import type { NotebookDeletedEntry, NotebookEntry, NotebookSession } from '$lib/notebook';
	import type { NotebookFolder } from '$lib/notebook-folders';

	/**
	 * Dev harness for /notebook/review/student/[studentEmail] (0106/0117):
	 * one instructor teaching one student they may reach every fact about,
	 * mounting the REAL NotebookView (read-only, no transports -- exactly what
	 * the shipped route hands it) plus the SAME hand-rolled Deleted section the
	 * route renders below it, over an in-memory fixture. No auth, no Supabase.
	 *
	 * Mirrors the real +page.server.ts / +page.svelte SHAPE rather than
	 * flattening it: a `student` record, `deletedEntries` kept SEPARATE from
	 * `entries` (0117's rule -- NotebookView's own `entries` prop must stay
	 * live-only), and a fake `notebook_staff_restore_entry` RPC call logged
	 * verbatim so "restoring fires the right entry id" is demonstrable rather
	 * than assumed.
	 *
	 * Two students:
	 *  - "ana"  -- live entries (one with a removed photo, to prove the
	 *              read-only page never offers to restore a PHOTO -- that
	 *              control needs a transport this page never hands down), one
	 *              entry she deleted herself, and one a staff account deleted.
	 *              Both deleted entries render identically here: the RPC's own
	 *              gate is what actually decides who may restore what, not a
	 *              flag this page keeps in sync with it.
	 *  - "ben"  -- live entries only. The Deleted section must be ABSENT, not
	 *              empty.
	 */

	type StudentId = 'ana' | 'ben';

	interface Student {
		id: StudentId;
		email: string;
		display_name: string;
		user_id: string | null;
		section_label: string | null;
	}

	const STUDENTS: Record<StudentId, Student> = {
		ana: {
			id: 'ana',
			email: 'ana.reyes@boscotech.net',
			display_name: 'Ana Reyes',
			user_id: 'u-ana',
			section_label: 'ENG1H · Period 2'
		},
		ben: {
			id: 'ben',
			email: 'ben.okafor@boscotech.net',
			display_name: 'Ben Okafor',
			user_id: 'u-ben',
			section_label: 'ENG1H · Period 2'
		}
	};

	const SESSION: Pick<NotebookSession, 'session_label' | 'unit_number' | 'session_date'> = {
		session_label: 'Bearing teardown',
		unit_number: 2,
		session_date: '2026-02-10'
	};

	function makeEntries(id: StudentId): NotebookEntry[] {
		if (id === 'ben') {
			return [
				{
					id: 'ben-e1',
					session_id: 'ses-1',
					section_id: 'sec-1',
					folder_id: null,
					pinned_at: null,
					custom_label: null,
					upload_timestamp: '2026-02-10T15:04:00Z',
					status: 'compliant',
					flag_reason: null,
					instructor_comment: null,
					session: SESSION,
					photos: [
						{
							id: 'ben-p1',
							drive_file_id: 'drive-ben-1',
							variant: 'original',
							sequence_order: 1,
							original_filename: 'bearing.jpg',
							removed_at: null
						}
					],
					notes: []
				}
			];
		}
		return [
			{
				id: 'ana-e1',
				session_id: 'ses-1',
				section_id: 'sec-1',
				folder_id: null,
				pinned_at: null,
				custom_label: null,
				upload_timestamp: '2026-02-10T14:02:00Z',
				status: 'compliant',
				flag_reason: null,
				instructor_comment: null,
				session: SESSION,
				photos: [
					{
						id: 'ana-p1',
						drive_file_id: 'drive-ana-1',
						variant: 'original',
						sequence_order: 1,
						original_filename: 'gearbox.jpg',
						removed_at: null
					}
				],
				notes: []
			},
			{
				id: 'ana-e2',
				session_id: null,
				section_id: null,
				folder_id: null,
				pinned_at: null,
				custom_label: 'Shaft stackup calcs',
				upload_timestamp: '2026-02-12T18:30:00Z',
				status: 'compliant',
				flag_reason: null,
				instructor_comment: null,
				session: null,
				// One live photo, one removed -- livePhotos() must show only the
				// first; NotebookEntryCard must offer no restore-photo control at
				// all here, since this page hands NotebookView no restorePhoto.
				photos: [
					{
						id: 'ana-p2-live',
						drive_file_id: 'drive-ana-2a',
						variant: 'original',
						sequence_order: 1,
						original_filename: 'stackup-final.jpg',
						removed_at: null
					},
					{
						id: 'ana-p2-removed',
						drive_file_id: 'drive-ana-2b',
						variant: 'original',
						sequence_order: 2,
						original_filename: 'stackup-blurry.jpg',
						removed_at: '2026-02-13T09:00:00Z'
					}
				],
				notes: []
			}
		];
	}

	function makeDeletedEntries(id: StudentId): NotebookDeletedEntry[] {
		if (id === 'ben') return [];
		return [
			// She removed this one herself.
			{
				id: 'ana-e3-self-deleted',
				custom_label: 'Old sketch, wrong units',
				session: null,
				upload_timestamp: '2026-02-05T13:00:00Z',
				deleted_at: '2026-02-06T09:15:00Z'
			},
			// A staff account removed this one (notebook_staff_delete_entry).
			{
				id: 'ana-e4-staff-deleted',
				custom_label: null,
				session: {
					session_label: 'Welcome & lab safety',
					unit_number: 1,
					session_date: '2026-02-01'
				},
				upload_timestamp: '2026-02-01T15:20:00Z',
				deleted_at: '2026-02-03T10:00:00Z'
			}
		];
	}

	let studentId = $state<StudentId>('ana');
	const student = $derived(STUDENTS[studentId]);

	let entries = $state<NotebookEntry[]>(makeEntries('ana'));
	let deletedEntries = $state<NotebookDeletedEntry[]>(makeDeletedEntries('ana'));
	let log = $state<string[]>([]);

	function selectStudent(id: StudentId) {
		studentId = id;
		entries = makeEntries(id);
		deletedEntries = makeDeletedEntries(id);
		restoreError = null;
		log = [];
	}

	const folders: NotebookFolder[] = [];
	const sessions: NotebookSession[] = [
		{ id: 'ses-1', section_id: 'sec-1', unit_number: 2, session_date: '2026-02-10', session_label: 'Bearing teardown' }
	];
	const activity = $derived(
		entries.map((e) => ({ id: e.id, last_activity_at: e.upload_timestamp }))
	);

	/**
	 * The fake `notebook_staff_restore_entry` RPC, matching the real page's
	 * `data.supabase.rpc('notebook_staff_restore_entry', { p_entry_id })` call
	 * shape and arguments exactly -- every call is logged verbatim so "calling
	 * it fires the right entry id" is checkable in the console/log panel, not
	 * assumed.
	 */
	let restoringId = $state<string | null>(null);
	let restoreError = $state<string | null>(null);

	async function restoreOne(entryId: string) {
		if (restoringId) return;
		restoringId = entryId;
		restoreError = null;
		log = [
			...log,
			`rpc notebook_staff_restore_entry { p_entry_id: '${entryId}' }`
		];
		await new Promise((r) => setTimeout(r, 120));
		const found = deletedEntries.find((e) => e.id === entryId);
		restoringId = null;
		if (!found) {
			restoreError = 'Could not restore that entry.';
			return;
		}
		deletedEntries = deletedEntries.filter((e) => e.id !== entryId);
		entries = [
			...entries,
			{
				id: found.id,
				session_id: null,
				section_id: null,
				folder_id: null,
				pinned_at: null,
				custom_label: found.custom_label,
				upload_timestamp: found.upload_timestamp,
				status: 'compliant',
				flag_reason: null,
				instructor_comment: null,
				session: found.session,
				photos: [],
				notes: []
			}
		];
		log = [...log, `restored ${entryId} -> back in the live list`];
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

<div class="dev-toolbar">
	<strong>Dev harness</strong>
	<span>/notebook/review/student/[studentEmail]</span>
	<div class="picker">
		<span>Student:</span>
		<button
			type="button"
			class:active={studentId === 'ana'}
			onclick={() => selectStudent('ana')}
			data-testid="pick-ana">Ana (mixed)</button
		>
		<button
			type="button"
			class:active={studentId === 'ben'}
			onclick={() => selectStudent('ben')}
			data-testid="pick-ben">Ben (no deletions)</button
		>
	</div>
	{#if log.length}
		<pre class="log" data-testid="rpc-log">{log.join('\n')}</pre>
	{/if}
</div>

<!-- Everything below this line mirrors the real
     src/routes/notebook/review/student/[studentEmail]/+page.svelte verbatim. -->

<div class="back-strip">
	<a class="back" href="/notebook/review">&larr; Section review</a>
	<p class="who">
		Reading <strong>{student.display_name ?? student.email}</strong>'s notebook. This is their whole
		notebook, including entries they filed outside your class. You cannot change anything here.
	</p>
</div>

{#if student.user_id === null}
	<div class="nb-noaccount">
		<p>
			<strong>{student.display_name ?? student.email}</strong> is on the roster but has never signed
			in, so there is no notebook to show yet. Their check-ins are waiting for them.
		</p>
	</div>
{/if}

<NotebookView
	{entries}
	{sessions}
	{folders}
	{activity}
	sectionLabel={student.section_label}
	canReview={false}
	uploadReady={false}
	readOnly
	homeHref="/notebook/review"
/>

{#if deletedEntries.length > 0}
	<section class="deleted-zone" data-testid="staff-deleted-zone">
		<h2>Deleted</h2>
		<p class="note">
			Entries {student.display_name ?? student.email} removed from this notebook. Restoring one puts
			it back exactly where it was.
		</p>
		<ul class="deleted-entries">
			{#each deletedEntries as entry (entry.id)}
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
	.dev-toolbar {
		max-width: var(--measure-split);
		margin: 0.75rem auto 0;
		padding: 0.6rem var(--cr-gutter, 1rem);
		box-sizing: border-box;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		background: var(--bg2);
		border: 1px dashed var(--gold);
		border-radius: 6px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--dim);
	}
	.dev-toolbar strong {
		color: var(--gold);
	}
	.picker {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.picker button {
		min-height: 2rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--bg0);
		color: var(--white);
		font-family: inherit;
		font-size: 0.76rem;
		cursor: pointer;
	}
	.picker button.active {
		border-color: var(--gold);
		color: var(--gold);
	}
	.log {
		flex-basis: 100%;
		margin: 0;
		padding: 0.5rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		white-space: pre-wrap;
		word-break: break-all;
	}

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
