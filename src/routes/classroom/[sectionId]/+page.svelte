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
</script>

<ClassPage
	section={data.section}
	items={data.items}
	sections={data.sections}
	canManage={data.canManage}
	attachmentsEnabled={data.attachmentsEnabled}
	{transports}
	{submitFeedback}
	fetchPreview={fetchLinkPreviewClient}
	onchanged={() => invalidateAll()}
/>
