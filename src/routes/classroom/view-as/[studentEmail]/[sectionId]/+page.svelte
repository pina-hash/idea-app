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

	NO checkIns EITHER, deliberately. This page's whole payload comes from
	`classroom_view_as_section`, which returns items only -- and a check-in
	STATUS is per student, so showing one here would mean either reading the
	admin's own notebook rows under the student's name (wrong) or a new
	view-as RPC (real scope, and 0099's own rule is that view-as reads are one
	admin-gated function, never an assembled query). The notebook link still
	points into the impersonated notebook, which is where that state lives.
-->
<ClassPage
	section={data.section}
	items={data.items}
	canManage={false}
	transports={null}
	submitFeedback={null}
	fetchPreview={fetchLinkPreviewClient}
	basePath={base}
	notebookHref={`${base}/notebook`}
	viewAs={data.studentEmail}
/>
