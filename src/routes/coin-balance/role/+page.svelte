<script lang="ts">
	import { invalidate } from '$app/navigation';
	import CoinRolePortal from '$lib/coin-balance/CoinRolePortal.svelte';
	import { createRoleTransports } from '$lib/coin-balance/transports';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* The caller's own browser client, so a photo lands in their own folder and
	   every call is their own session. Only a ready page gets any. */
	const transports = $derived(
		data.state === 'ready' && data.supabase ? createRoleTransports(data.supabase, data.userId || null) : {}
	);
</script>

<CoinRolePortal
	state={data.state}
	roles={data.roles}
	{transports}
	onsignin={data.supabase ? () => armorySignIn(data.supabase) : null}
	onchanged={() => invalidate('coin:role')}
	coinDesk={data.coinDesk}
/>
