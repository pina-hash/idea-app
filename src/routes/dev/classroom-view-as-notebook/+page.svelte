<script lang="ts">
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ImpersonationBanner from '$lib/classroom/ImpersonationBanner.svelte';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import NotebookNoAccountNotice from '$lib/notebook/NotebookNoAccountNotice.svelte';
	import type { NotebookEntry, NotebookSession } from '$lib/notebook';

	/**
	 * Dev harness for /classroom/view-as/[studentEmail]/notebook, mounting the
	 * SAME THREE COMPONENTS the real route tree nests, in the same order:
	 * `+layout.svelte`'s `.cr-root` + ClassroomShell (`minimal`), the view-as
	 * `+layout.svelte`'s ImpersonationBanner, and the page itself -- either
	 * NotebookView (masthead suppressed) or NotebookNoAccountNotice, exactly as
	 * `src/routes/classroom/view-as/[studentEmail]/notebook/+page.svelte`
	 * chooses between them. No auth, no Supabase.
	 *
	 * This is the one place `.nb-root` mounts inside `.cr-root` -- no other
	 * harness reproduces it (see docs/HISTORY.md, 6376ad4), which is how the
	 * page went unverified with two mastheads and a hand-rolled copy of the
	 * no-account notice.
	 */

	type StudentId = 'has-account' | 'no-account';

	interface Student {
		email: string;
		display_name: string;
		user_id: string | null;
		section_label: string | null;
	}

	const STUDENTS: Record<StudentId, Student> = {
		'has-account': {
			email: 'ana.reyes@boscotech.net',
			display_name: 'Ana Reyes',
			user_id: 'u-ana',
			section_label: 'ENG1H · Period 2'
		},
		'no-account': {
			email: 'noor.malik@boscotech.net',
			display_name: 'Noor Malik',
			user_id: null,
			section_label: null
		}
	};

	let studentId = $state<StudentId>('has-account');
	const student = $derived(STUDENTS[studentId]);

	const sessions: NotebookSession[] = [
		{ id: 'ses-1', section_id: 'sec-1', unit_number: 2, session_date: '2026-02-10', session_label: 'Bearing teardown' }
	];

	const entries: NotebookEntry[] = [
		{
			id: 'ana-e1',
			session_id: 'ses-1',
			section_id: 'sec-1',
			folder_id: null,
			pinned_at: null,
			custom_label: null,
			upload_timestamp: '2026-02-10T14:02:00Z',
			submitted_at: '2026-02-10T14:02:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: sessions[0],
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
		}
	];

	const activity = entries.map((e) => ({ id: e.id, last_activity_at: e.upload_timestamp }));
	const base = $derived(`/classroom/view-as/${encodeURIComponent(student.email)}`);
</script>

<div class="dev-toolbar">
	<strong>Dev harness</strong>
	<span>/classroom/view-as/[studentEmail]/notebook</span>
	<div class="picker">
		<span>Student:</span>
		<button
			type="button"
			class:active={studentId === 'has-account'}
			onclick={() => (studentId = 'has-account')}
			data-testid="pick-has-account">Ana (has signed in)</button
		>
		<button
			type="button"
			class:active={studentId === 'no-account'}
			onclick={() => (studentId = 'no-account')}
			data-testid="pick-no-account">Noor (never signed in)</button
		>
	</div>
</div>

<!-- Everything below this line mounts what the real route tree nests, top to
     bottom: /classroom/+layout.svelte, /classroom/view-as/[studentEmail]/+layout.svelte,
     /classroom/view-as/[studentEmail]/notebook/+page.svelte. -->

<div class="cr-root">
	<ClassroomShell minimal backHref="/classroom/view-as" backLabel="Pick a student">
		<ImpersonationBanner
			email={student.email}
			displayName={student.display_name}
			exitHref="/classroom/view-as"
		/>

		{#if student.user_id === null}
			<NotebookNoAccountNotice displayName={student.display_name} email={student.email} />
		{:else}
			<NotebookView
				{entries}
				{sessions}
				folders={[]}
				{activity}
				sectionLabel={student.section_label}
				canReview={false}
				uploadReady={false}
				readOnly
				homeHref={base}
				masthead={false}
			/>
		{/if}
	</ClassroomShell>
</div>

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
		color: var(--white);
	}
	.picker {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.picker button {
		padding: 0.3rem 0.6rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		cursor: pointer;
		font: inherit;
	}
	.picker button.active {
		border-color: var(--gold);
		color: var(--white);
	}
</style>
