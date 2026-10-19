<script lang="ts">
	import { invalidate } from '$app/navigation';
	import StocksPage from '$lib/coin-stocks/StocksPage.svelte';
	import { createStockTransports } from '$lib/coin-stocks/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const transports = $derived(data.state === 'ready' && data.supabase ? createStockTransports(data.supabase) : null);
</script>

<StocksPage state={data.state} board={data.board} {transports} onchanged={() => invalidate('coin:stocks')} />
