<script lang="ts">
	import ClassPage from '$lib/classroom/ClassPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ClassPage
	section={data.section}
	posts={data.posts}
	assignments={data.assignments}
	canManage={data.canManage}
/>
