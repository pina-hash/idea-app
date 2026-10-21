<script lang="ts">
	import { invalidate } from '$app/navigation';
	import StocksPage from '$lib/coin-stocks/StocksPage.svelte';
	import { createStockTransports } from '$lib/coin-stocks/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const transports = $derived(data.state === 'ready' && data.supabase ? createStockTransports(data.supabase) : null);

	// Prices update about every minute; so does the page, while it is in view.
	$effect(() => {
		const t = setInterval(() => {
			if (document.visibilityState === 'visible') invalidate('coin:stocks');
		}, 60_000);
		return () => clearInterval(t);
	});
</script>

<StocksPage state={data.state} board={data.board} {transports} coinDesk={data.coinDesk} onchanged={() => invalidate('coin:stocks')} />
