<script lang="ts">
	import { untrack } from 'svelte';
	import MarketDesk from '$lib/coin-market/MarketDesk.svelte';
	import { createMarketDeskTransports } from '$lib/coin-market/desk';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const transports = untrack(() => createMarketDeskTransports(data.supabase, data.full === true));
</script>

<svelte:head>
	<title>Market · IDEA Coin Desk</title>
</svelte:head>

<MarketDesk {transports} />
