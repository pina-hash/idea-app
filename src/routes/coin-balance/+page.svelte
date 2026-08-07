<script lang="ts">
	import CoinBalanceView from '$lib/coin-balance/CoinBalanceView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<CoinBalanceView
	configured={data.configured}
	email={data.email}
	displayName={data.displayName}
	balance={data.balance}
	transactions={data.transactions}
	wageTier={data.wageTier}
	eatingPass={data.eatingPass}
/>
