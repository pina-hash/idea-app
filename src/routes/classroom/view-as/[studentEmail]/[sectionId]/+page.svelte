<script lang="ts">
	import ClassPage from '$lib/classroom/ClassPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/classroom/view-as/${encodeURIComponent(data.studentEmail)}`);
</script>

<!--
	canManage=false and NO transports: the edit/delete controls do not render,
	and there is nothing wired up for them to call if they did. `viewAs` rides
	into the attachment URLs so the proxy answers as this student would be
	answered rather than as the admin driving the page.
-->
<ClassPage
	section={data.section}
	posts={data.posts}
	assignments={data.assignments}
	canManage={false}
	transports={null}
	basePath={base}
	viewAs={data.studentEmail}
/>
