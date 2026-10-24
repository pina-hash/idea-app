<script lang="ts">
	import { untrack } from 'svelte';
	import QueueView from '$lib/coin-desk/QueueView.svelte';
	import { createQueueTransports } from '$lib/coin-desk/queue';
	import type { PageData } from './$types';

	/**
	 * THE QUEUE (IDEA Coin V2, 2.2). The page builds the transports on the
	 * session's own browser client, once, and mounts the same component the dev
	 * harness mounts. Every call re-checks the caller's coin tier in the
	 * database; a section coin staff member sees only their own students.
	 */
	let { data }: { data: PageData } = $props();
	const transports = createQueueTransports(untrack(() => data.supabase));
</script>

<svelte:head>
	<title>Queue · IDEA Coins</title>
</svelte:head>

<QueueView {transports} />
