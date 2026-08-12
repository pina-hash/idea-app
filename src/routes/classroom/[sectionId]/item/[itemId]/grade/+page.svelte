<script lang="ts">
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import { createTeacherEngineTransports } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One stable client for the session (the item page's convention).
	// svelte-ignore state_referenced_locally
	const transports = createTeacherEngineTransports(data.supabase);
</script>

<GradingConsole
	section={data.section}
	item={data.item}
	spec={data.spec}
	rubric={data.rubric}
	{transports}
/>
