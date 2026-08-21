<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import {
		createClassroomTransports,
		createEngineTransports,
		createReferenceTransports,
		createRevisionTransports,
		createCheckInTransports,
		createTeacherEngineTransports,
		deckTransports,
		fetchLinkPreviewClient
	} from '$lib/classroom/transports';
	import { checkInsForItem } from '$lib/classroom/class-check-ins';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	// svelte-ignore state_referenced_locally
	const engineTransports = createEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const teacherTransports = createTeacherEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const referenceTransports = createReferenceTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const revisionTransports = createRevisionTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const checkInTransports = createCheckInTransports(data.supabase);

	/**
	 * THE CHECK-INS THAT HANG OFF THIS ITEM (0120), out of the class's own list.
	 *
	 * `data.checkIns` is the LAYOUT's -- page data merges over layout data, and
	 * this route is a child of the class layout -- so the item page adds no
	 * second query for something the class already loaded, and the two surfaces
	 * cannot disagree about a student's status.
	 */
	const itemCheckIns = $derived(checkInsForItem(data.checkIns ?? [], data.item.id));
</script>

<ItemDetail
	section={data.section}
	item={data.item}
	sections={data.sections}
	canManage={data.canManage}
	attachmentsEnabled={data.attachmentsEnabled}
	{transports}
	fetchPreview={fetchLinkPreviewClient}
	engine={data.engine}
	{engineTransports}
	spec={data.spec}
	rubric={data.rubric}
	teacherTransports={data.canManage ? teacherTransports : null}
	referenceSpec={data.referenceSpec}
	referenceTransports={data.canManage ? referenceTransports : null}
	deck={data.deck}
	deckTransports={data.canManage ? deckTransports : null}
	revisionTransports={data.canManage ? revisionTransports : null}
	checkIns={itemCheckIns}
	checkInTransports={data.canManage && data.checkInLinksReady ? checkInTransports : null}
	gradeHref={data.canManage ? `/classroom/${data.section.id}/item/${data.item.id}/grade` : null}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto(`/classroom/${data.section.id}`)}
/>
