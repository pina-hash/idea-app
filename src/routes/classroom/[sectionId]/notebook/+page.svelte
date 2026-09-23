<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import { createNotebookTransports } from '$lib/notebook/transports';
	import {
		createReviewConsoleTransports,
		reviewConsoleTransports
	} from '$lib/notebook/review-transports';
	import { sectionTitle } from '$lib/classroom/classroom';
	import { notebookHomeHref, notebookReviewHref } from '$lib/classroom/nav';
	import type { PageData } from './$types';

	/**
	 * A CLASS'S NOTEBOOK TAB, as the classroom renders it. The load decided
	 * which surface this is from the server's own `canManage`; this file only
	 * builds that surface's transports and mounts the ONE component each role
	 * has always had -- `NotebookView` for a student, `ReviewConsole` for a
	 * manager -- so the harnesses and the other routes mount the identical
	 * thing.
	 *
	 * BOTH ARE THE BODY OF THE CLASSROOM'S APPLICATION FRAME. `nav.ts` gives this
	 * place the `console` measure, so `.cr-root` is the viewport above 1024px and
	 * the chrome -- masthead, switcher, crumbs, tabs -- measures itself; the
	 * notebook takes whatever is left, and each pane owns its own scroll.
	 */
	let { data }: { data: PageData } = $props();

	// The client is one stable instance for the session; built once.
	// svelte-ignore state_referenced_locally
	const writes = createNotebookTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const review = createReviewConsoleTransports(data.supabase);
</script>

<svelte:head>
	<title>Notebook · {sectionTitle(data.section)} // IDEA Classroom</title>
</svelte:head>

{#if data.notebookRole === 'manager'}
	{@const bundle = reviewConsoleTransports(review, {
		isChair: data.isChair,
		docCheckReady: data.docCheckReady
	})}
	<ReviewConsole
		sections={data.reviewSections}
		isChair={data.isChair}
		configured={data.reviewConfigured}
		initialSectionId={data.section.id}
		lockedSectionId={data.section.id}
		initialMode={data.initialMode}
		reviewHref={notebookReviewHref(data.section.id)}
		transports={bundle.transports}
		docCheck={bundle.docCheck}
		excusals={bundle.excusals}
		entryMove={bundle.entryMove}
		adminLog={bundle.adminLog}
		staffNote={bundle.staffNote}
		itemLink={bundle.itemLink}
		viewerId={data.viewerId}
	/>
{:else}
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
		scopeSectionId={data.section.id}
		scopeLabel={sectionTitle(data.section)}
		allClassesHref={notebookHomeHref(data.section.id)}
		{...writes}
		onChanged={() => invalidateAll()}
	/>
{/if}
