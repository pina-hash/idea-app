<script lang="ts">
	import AssignmentDetail from '$lib/classroom/AssignmentDetail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/classroom/view-as/${encodeURIComponent(data.studentEmail)}`);
</script>

<!-- Read-only: no transports, so no editor and no delete control exists here. -->
<AssignmentDetail
	section={data.section}
	assignment={data.assignment}
	canManage={false}
	transports={null}
	basePath={base}
	viewAs={data.studentEmail}
/>
