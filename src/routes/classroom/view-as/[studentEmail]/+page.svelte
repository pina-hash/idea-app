<script lang="ts">
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// No transports, no isStaff: this is the student's own view of their own
	// classes, and there is deliberately nothing here that writes.
	const base = $derived(`/classroom/view-as/${encodeURIComponent(data.studentEmail)}`);
</script>

<MyClasses
	ready={data.ready}
	sections={data.sections}
	basePath={base}
	homeHref="/classroom/view-as"
/>
