<script lang="ts">
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import NotebookNoAccountNotice from '$lib/notebook/NotebookNoAccountNotice.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The way up is the PICKER now, not this student's own landing page. That
	 * page listed their classes so an admin could open one as them, and both
	 * class-level previews are gone; the URL survives only as a redirect back
	 * here, so pointing "Home" at it would be a link to the page you are on.
	 */
	const HOME = '/classroom/view-as';
</script>

<!--
	NO TRANSPORTS AT ALL. Every write prop on NotebookView is optional and an
	omitted one removes its control from the markup -- the "Add an entry" form,
	the folder manager, bulk move, pinning, and each card's own add-photos /
	add-note / re-file controls. There is nothing here to call, and 0099 ships
	no notebook view_as write RPC for it to call anyway.

	The migration flags are all TRUE because the payload only exists at all when
	0099 applied cleanly on top of them: the RPC selects folders, notes,
	pinned_at and the activity view directly, so a project missing any of those
	fails the load rather than degrading into a half-view that would misreport
	what the student sees. `uploadReady` is false since no upload is offered.
-->
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
	homeHref={HOME}
	masthead={false}
/>
