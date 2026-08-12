<script lang="ts">
	import StudentPreview from '$lib/coin-desk/StudentPreview.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<StudentPreview {data} />
