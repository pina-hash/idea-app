<script lang="ts">
	import AssignmentDetail from '$lib/classroom/AssignmentDetail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<AssignmentDetail section={data.section} assignment={data.assignment} canManage={data.canManage} />
