<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ClassPage from '$lib/classroom/ClassPage.svelte';
	import {
		classroomFeedbackSubmit,
		createClassroomTransports,
		fetchLinkPreviewClient
	} from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The same transports the console uses. Handing them in is what turns the
	// on-card controls on; every one of them is re-authorized by the RPC it
	// calls, so this is plumbing, never a boundary.
	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);

	/**
	 * The notebook door for whoever is looking. A manager of this section gets
	 * the review console already scoped to it -- `notebook_get_section_grid`
	 * asks `classroom_manages_section`, the same question `canManage` is, so
	 * the link can never offer a grid the database would refuse. Everyone else
	 * reading this page is an actively enrolled student, and theirs is their
	 * own notebook.
	 */
	const notebookHref = $derived(
		data.canManage ? `/notebook/review?section=${data.section.id}` : '/notebook'
	);
</script>

<ClassPage
	section={data.section}
	items={data.items}
	sections={data.sections}
	canManage={data.canManage}
	attachmentsEnabled={data.attachmentsEnabled}
	{transports}
	{submitFeedback}
	{notebookHref}
	fetchPreview={fetchLinkPreviewClient}
	onchanged={() => invalidateAll()}
/>
