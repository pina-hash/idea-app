<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import AssignmentDetail from '$lib/classroom/AssignmentDetail.svelte';
	import { createClassroomTransports } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
</script>

<AssignmentDetail
	section={data.section}
	assignment={data.assignment}
	canManage={data.canManage}
	attachmentsEnabled={data.attachmentsEnabled}
	{transports}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto(`/classroom/${data.section.id}`)}
/>
