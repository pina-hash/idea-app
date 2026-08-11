<script lang="ts">
	import ClassPage from '$lib/classroom/ClassPage.svelte';
	import { fetchLinkPreviewClient } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/classroom/view-as/${encodeURIComponent(data.studentEmail)}`);
</script>

<!--
	canManage=false and NO transports: the management controls do not render, and
	there is nothing wired up for them to call if they did -- including
	markViewed, so looking at a class as a student never writes a view row in
	their name. `viewAs` rides into the attachment URLs so the proxy answers as
	this student would be answered rather than as the admin driving the page.
-->
<ClassPage
	section={data.section}
	items={data.items}
	canManage={false}
	transports={null}
	submitFeedback={null}
	fetchPreview={fetchLinkPreviewClient}
	basePath={base}
	viewAs={data.studentEmail}
/>
