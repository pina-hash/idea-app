<script lang="ts">
	import { untrack } from 'svelte';
	import DigestView from '$lib/coin-desk/DigestView.svelte';
	import EconomyHealth from '$lib/coin-market/EconomyHealth.svelte';
	import { createDigestTransports, type PushTransport } from '$lib/coin-desk/digest';
	import { enablePush, hasLocalSubscription, pushAvailability } from '$lib/tournaments/push-client';
	import type { PageData } from './$types';

	/**
	 * THE DIGEST (IDEA Coin V2, 2.13). The Friday notification needs this
	 * browser to hold a push subscription, and that is the tournament feature's
	 * own client helper (`$lib/tournaments/push-client`: the push service
	 * worker, the public VAPID key and `push_subscribe`), reused here rather
	 * than written a second time.
	 */
	let { data }: { data: PageData } = $props();
	const supabase = untrack(() => data.supabase);
	const push: PushTransport = {
		availability: pushAvailability,
		hasSubscription: hasLocalSubscription,
		enable: () => enablePush(supabase)
	};
	const transports = createDigestTransports(supabase, push);

	/** Ledger 0402: the economy's health (0281), best effort. */
	async function loadHealth(): Promise<unknown> {
		try {
			const { data: raw, error } = await supabase.rpc('coin_economy_health', { p_days: 7 });
			return error ? null : raw;
		} catch {
			return null;
		}
	}
</script>

<svelte:head>
	<title>Digest // IDEA Coin Desk</title>
</svelte:head>

<EconomyHealth load={loadHealth} />
<DigestView {transports} />
