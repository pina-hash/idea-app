<script lang="ts">
	import { page } from '$app/state';
	import CalendarPage from '$lib/calendar/CalendarPage.svelte';
	import { createCalendarTransports } from '$lib/calendar/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const transports = $derived(
		data.supabase && data.claims?.sub ? createCalendarTransports(data.supabase, data.claims.sub) : null
	);
</script>

<svelte:head>
	<title>Calendar · IDEA</title>
</svelte:head>

{#key data.calendar.month}
	<CalendarPage
		feed={data.calendar.feed}
		month={data.calendar.month}
		today={data.calendar.today}
		school={data.calendar.school}
		robotics={data.calendar.robotics}
		{transports}
		origin={page.url.origin}
	/>
{/key}
