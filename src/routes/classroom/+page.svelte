<script lang="ts">
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<MyClasses ready={data.ready} isStaff={data.isStaff} sections={data.sections} />
