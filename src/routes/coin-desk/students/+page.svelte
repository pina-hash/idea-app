<script lang="ts">
	import { untrack } from 'svelte';
	import SectionManager from '$lib/coin-desk/SectionManager.svelte';
	import BalanceAdminPanel from '$lib/coin-desk/BalanceAdminPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// SectionManager's `sections` prop is $bindable (it refetches after every
	// mutation and writes the list back). Nothing else on this route reads it,
	// so this local is simply where those writes land -- the old cross-component
	// coupling into the bulk-log picker is gone with the route split.
	// untrack: taking the load's value as the STARTING point is the whole
	// intent here; SectionManager owns it from that moment on.
	let sections = $state(untrack(() => data.sections));
</script>

<svelte:head>
	<title>Students // Coin Desk</title>
</svelte:head>

<SectionManager supabase={data.supabase} bind:sections configured={data.sectionsConfigured} />

<BalanceAdminPanel supabase={data.supabase} />
