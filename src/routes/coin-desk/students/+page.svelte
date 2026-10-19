<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import StudentView from '$lib/coin-desk/StudentView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Payday, the digest and the queue link here with `?student=<email>`; the
	// view opens that student once, on mount. Read from the URL here, never in
	// the load, so the load does not re-run on it.
	const initialEmail = untrack(() => page.url.searchParams.get('student') ?? '');
</script>

<svelte:head>
	<title>Students · Coin Desk</title>
</svelte:head>

<StudentView
	supabase={data.supabase}
	scope={data.coinStaff.scope}
	classes={data.coinStaff.sections}
	categories={data.categories}
	categoryKinds={data.categoryKinds}
	{initialEmail}
/>
