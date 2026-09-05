<script lang="ts">
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import {
		createBulkGradingTransports,
		createTeacherEngineTransports
	} from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One stable client for the session (the item page's convention).
	// svelte-ignore state_referenced_locally
	const transports = createTeacherEngineTransports(data.supabase);
	// THE BULK CAPABILITY IS ONE PROP. Handing it in is what turns the console
	// into the cross-class, many-student surface; the per-section route hands in
	// nothing and gets the console it has always had.
	// svelte-ignore state_referenced_locally
	const bulk = createBulkGradingTransports(data.supabase);
</script>

<GradingConsole
	section={data.section}
	item={data.item}
	spec={data.spec}
	rubric={data.rubric}
	{transports}
	{bulk}
/>
