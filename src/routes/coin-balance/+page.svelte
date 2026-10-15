<script lang="ts">
	import { invalidate } from '$app/navigation';
	import CoinPageView from '$lib/coin-balance/CoinPageView.svelte';
	import { createCoinPageTransports } from '$lib/coin-balance/transports';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* The purchases ride the caller's own browser client, so every call is the
	   student's own session and nothing here can act for anybody else. Only a
	   ready page is handed any: a signed-out or updating page buys nothing. */
	const transports = $derived(
		data.state === 'ready' && data.supabase ? createCoinPageTransports(data.supabase) : {}
	);
</script>

<CoinPageView
	state={data.state}
	page={data.page}
	{transports}
	now={data.now}
	onsignin={data.supabase ? () => armorySignIn(data.supabase) : null}
	onchanged={() => invalidate('coin:page')}
/>
