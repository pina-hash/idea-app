<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import {
		classroomFeedbackSubmit,
		createClassroomTransports,
		createEngineTransports,
		createReferenceTransports,
		createTeacherEngineTransports,
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
	// svelte-ignore state_referenced_locally
	const engineTransports = createEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const teacherTransports = createTeacherEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const referenceTransports = createReferenceTransports(data.supabase);
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
	engine={data.engine}
	{engineTransports}
	spec={data.spec}
	rubric={data.rubric}
	teacherTransports={data.canManage ? teacherTransports : null}
	referenceSpec={data.referenceSpec}
	referenceTransports={data.canManage ? referenceTransports : null}
	gradeHref={data.canManage ? `/classroom/${data.section.id}/item/${data.item.id}/grade` : null}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto(`/classroom/${data.section.id}`)}
/>
