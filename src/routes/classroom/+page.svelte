<script lang="ts">
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import WeekStrip from '$lib/calendar/WeekStrip.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#snippet week()}
	<!-- This week across every class (ledger 0439); it loads itself. -->
	<WeekStrip supabase={data.supabase ?? null} />
{/snippet}

<MyClasses
	ready={data.ready}
	isStaff={data.isStaff}
	sections={data.navSections ?? []}
	todo={data.todo}
	themes={data.navThemes ?? {}}
	{week}
/>
