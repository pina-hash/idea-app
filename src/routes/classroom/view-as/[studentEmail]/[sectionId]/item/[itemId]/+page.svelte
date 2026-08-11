<script lang="ts">
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import { fetchLinkPreviewClient } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/classroom/view-as/${encodeURIComponent(data.studentEmail)}`);
</script>

<!-- Read-only: no transports, so no editor, no delete control, and no view
     row written in the student's name. -->
<ItemDetail
	section={data.section}
	item={data.item}
	canManage={false}
	transports={null}
	submitFeedback={null}
	fetchPreview={fetchLinkPreviewClient}
	basePath={base}
	viewAs={data.studentEmail}
/>
