<script lang="ts">
	import ClassView from '$lib/classroom/ClassView.svelte';
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

	UNITS DO RENDER, and they arrive the only way they may: inside the view-as
	RPC's own payload (0113), behind the guard that already covers the items. An
	admin-side units query from this page would be the ADMIN'S OWN read rendered
	under a student's name -- the objection above, which is why this was one
	ungrouped list until the payload could carry them. An older backend omits the
	key and it falls back to that same list: degraded, never wrong.

	NO work, still, for exactly that reason -- per-student standing has no
	admin-gated read to come from.
-->
<ClassView
	section={data.section}
	items={data.items}
	units={data.units}
	canManage={false}
	transports={null}
	submitFeedback={null}
	fetchPreview={fetchLinkPreviewClient}
	basePath={base}
	notebookHref={`${base}/notebook`}
	viewAs={data.studentEmail}
/>
