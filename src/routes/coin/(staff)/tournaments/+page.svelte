<script lang="ts">
	import { untrack } from 'svelte';
	import TournamentTransfer from '$lib/coin-desk/TournamentTransfer.svelte';
	import { createTournamentTransports } from '$lib/coin-desk/tournament-transfer';
	import type { PageData } from './$types';

	/**
	 * THE TOURNAMENT TRANSFER (IDEA Coin V2, 2.9), a full coin admin's area. The
	 * transports are built once on the session's browser client; the component
	 * is the one the dev harness mounts.
	 */
	let { data }: { data: PageData } = $props();
	const transports = createTournamentTransports(untrack(() => data.supabase));
</script>

<svelte:head>
	<title>Tournaments · IDEA Coins</title>
</svelte:head>

<TournamentTransfer {transports} />
