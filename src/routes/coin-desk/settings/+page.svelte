<script lang="ts">
	import SettingsPanel from '$lib/coin-desk/SettingsPanel.svelte';
	import type { PageData } from './$types';

	/**
	 * Settings (IDEA Coin V2, 0240): prices, autopay, no-pay weeks, hall pass
	 * thresholds, which classes are in the economy, and the fine buttons, all
	 * edited live. Admin-gated once by the group's +layout.server.ts; every RPC
	 * the panel calls is admin-only in the database as well.
	 */
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Settings // Coin Desk</title>
</svelte:head>

<SettingsPanel supabase={data.supabase} />
