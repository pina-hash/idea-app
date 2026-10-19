<script lang="ts">
	import { invalidate } from '$app/navigation';
	import MarketPage from '$lib/coin-market/MarketPage.svelte';
	import { createMarketTransports, createTransferTransports } from '$lib/coin-market/transports';
	import { uploadCoinPhoto } from '$lib/coin-balance/uploads';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Every action rides the caller's own browser client: the student's own
	   session, so nothing here can act for anybody else. Only a ready page is
	   handed any; a signed-out or updating page does nothing. */
	const transports = $derived(
		data.state === 'ready' && data.supabase
			? createMarketTransports(data.supabase, (file) => uploadCoinPhoto(data.supabase!, data.userId, file))
			: {}
	);
	const transfers = $derived(data.state === 'ready' && data.supabase ? createTransferTransports(data.supabase) : null);
</script>

<MarketPage
	state={data.state}
	board={data.board}
	tiles={data.tiles}
	feed={data.feed}
	{transports}
	{transfers}
	onsignin={data.supabase ? () => armorySignIn(data.supabase) : null}
	onchanged={() => invalidate('coin:market')}
/>
