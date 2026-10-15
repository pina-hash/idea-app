<script lang="ts">
	import DebtList from '$lib/coin-desk/DebtList.svelte';
	import type { PageData } from './$types';

	/**
	 * Students in debt (IDEA Coin V2, 0240's coin_debt_list), deepest first,
	 * each linking to that student on the Students area. Admin-gated once by
	 * the group's +layout.server.ts.
	 */
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Debt // Coin Desk</title>
</svelte:head>

<DebtList supabase={data.supabase} />
