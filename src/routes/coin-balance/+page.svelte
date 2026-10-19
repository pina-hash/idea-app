<script lang="ts">
	import { invalidate } from '$app/navigation';
	import CoinPageView from '$lib/coin-balance/CoinPageView.svelte';
	import { createCoinPageTransports } from '$lib/coin-balance/transports';
	import { armorySignIn } from '$lib/armory/sign-in';
	import CoinBalanceMarket from '$lib/coin-market/CoinBalanceMarket.svelte';
	import { createTransferTransports } from '$lib/coin-market/transports';
	import { createHallPassTransports } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Every action rides the caller's own browser client, so every call is the
	   student's own session and nothing here can act for anybody else. Only a
	   ready page is handed any: a signed-out or updating page does nothing.
	   The uid names the upload folder; the address is the one coin_export is
	   asked about, and the function refuses any other. */
	const transports = $derived(
		data.state === 'ready' && data.supabase
			? createCoinPageTransports(data.supabase, { userId: data.userId, email: data.email })
			: {}
	);
	// Ledger 0402: transfers and hall pass time, on the same client.
	const transfers = $derived(data.state === 'ready' && data.supabase ? createTransferTransports(data.supabase) : null);
	const hallPass = $derived(data.state === 'ready' && data.supabase ? createHallPassTransports(data.supabase) : null);
</script>

<CoinPageView
	state={data.state}
	page={data.page}
	extras={data.extras}
	{transports}
	now={data.now}
	onsignin={data.supabase ? () => armorySignIn(data.supabase) : null}
	onchanged={() => invalidate('coin:page')}
>
	{#snippet market()}
		{#if data.state === 'ready'}
			<CoinBalanceMarket
				portfolio={data.market?.portfolio ?? null}
				minuteClasses={data.market?.minuteClasses ?? null}
				{transfers}
				minutesQuote={hallPass?.minutesQuote ?? null}
				buyMinutes={hallPass?.buyMinutes ?? null}
				inEconomy={data.page?.in_economy === true}
				ondone={() => invalidate('coin:page')}
			/>
		{/if}
	{/snippet}
</CoinPageView>
