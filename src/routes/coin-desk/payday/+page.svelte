<script lang="ts">
	import { untrack } from 'svelte';
	import PaydayView from '$lib/coin-desk/PaydayView.svelte';
	import { createPaydayTransports } from '$lib/coin-desk/payday';
	import type { PageData } from './$types';

	/**
	 * PAYDAY (IDEA Coin V2, 2.4). The transports are built once on the session's
	 * browser client; the component is the one the dev harness mounts.
	 */
	let { data }: { data: PageData } = $props();
	const transports = createPaydayTransports(untrack(() => data.supabase));
</script>

<svelte:head>
	<title>Payday // IDEA Coin Desk</title>
</svelte:head>

<PaydayView {transports} />
