<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import {
		classroomFeedbackSubmit,
		createClassroomTransports,
		fetchLinkPreviewClient
	} from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);
</script>

<ItemDetail
	section={data.section}
	item={data.item}
	sections={data.sections}
	canManage={data.canManage}
	attachmentsEnabled={data.attachmentsEnabled}
	{transports}
	{submitFeedback}
	fetchPreview={fetchLinkPreviewClient}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto(`/classroom/${data.section.id}`)}
/>
