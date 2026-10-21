<script lang="ts">
	import StockDetailPage from '$lib/coin-stocks/StockDetailPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<StockDetailPage state={data.state} detail={data.detail} coinDesk={data.coinDesk} />
