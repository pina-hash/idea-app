<script lang="ts">
	import { untrack } from 'svelte';
	import CategoriesManager from '$lib/coin-desk/CategoriesManager.svelte';
	import PayoutManager from '$lib/coin-desk/PayoutManager.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// CategoriesManager's `categories` prop is $bindable (it refetches after
	// every create/retire and writes the list back). Nothing else on this route
	// reads it -- the Log area loads its own copy on its own route.
	// untrack: taking the load's value as the STARTING point is the whole
	// intent here; CategoriesManager owns it from that moment on.
	let categories = $state(untrack(() => data.categories));
</script>

<svelte:head>
	<title>Economy // Coin Desk</title>
</svelte:head>

<CategoriesManager supabase={data.supabase} bind:categories configured={data.configured} />

<PayoutManager supabase={data.supabase} configured={data.configured} />
