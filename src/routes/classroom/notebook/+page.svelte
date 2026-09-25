<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import { createNotebookTransports } from '$lib/notebook/transports';
	import { notebookReviewHref } from '$lib/classroom/nav';
	import {
		quickNoteHidden,
		quickNoteProfileIo,
		setQuickNoteHidden
	} from '$lib/notebook/quick-note-state.svelte';
	import type { PageData } from './$types';

	/**
	 * THE WHOLE NOTEBOOK, inside the classroom. The screen is `NotebookView`,
	 * the same component a class's own Notebook tab mounts, so the dev harness
	 * mounts the identical thing; this file only builds the transports.
	 *
	 * `classes` is what makes a free entry belong to a class here: the composer
	 * offers them, defaulting to the class the student came from.
	 */
	let { data }: { data: PageData } = $props();

	// The client is one stable instance for the session; built once.
	// svelte-ignore state_referenced_locally
	const writes = createNotebookTransports(data.supabase);

	/**
	 * THE INBOX (ledger 0298). `?view=inbox` is where the header's quick note
	 * sends "Open notebook", and the Inbox carries the switch that brings the
	 * Note button back for somebody who hid it -- the same shared state the
	 * header reads, so the button reappears the moment it is ticked.
	 */
	const initialView = $derived(page.url.searchParams.get('view') === 'inbox' ? 'inbox' : 'feed');
	const quickNoteShown = $derived(!quickNoteHidden(data.viewerId, page.data.userProfile?.preferences));
	function setQuickNoteShown(shown: boolean) {
		void setQuickNoteHidden(data.viewerId, !shown, quickNoteProfileIo(data.supabase, data.viewerId));
	}
</script>

<svelte:head>
	<title>My notebook // IDEA Classroom</title>
</svelte:head>

<NotebookView
	entries={data.entries}
	sessions={data.sessions}
	folders={data.folders}
	sectionLabel={data.sectionLabel}
	canReview={data.canReview}
	configured={data.configured}
	photosReady={data.photosReady}
	notesReady={data.notesReady}
	foldersReady={data.foldersReady}
	pinsReady={data.pinsReady}
	sessionsReady={data.sessionsReady}
	draftsReady={data.draftsReady}
	initialCheckIn={data.initialCheckIn}
	activity={data.activity}
	deletionReady={data.deletionReady}
	deletedEntries={data.deletedEntries}
	uploadReady={data.uploadReady}
	historyReady={data.historyReady}
	coalescingReady={data.coalescingReady}
	viewerId={data.viewerId}
	ownsPage
	classes={data.classes}
	defaultSectionId={data.defaultSectionId}
	reviewHref={notebookReviewHref()}
	{...writes}
	onChanged={() => invalidateAll()}
	{initialView}
	{quickNoteShown}
	onQuickNoteShown={setQuickNoteShown}
/>
