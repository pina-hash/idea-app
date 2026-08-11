<script lang="ts">
	import ContractsManager from '$lib/coin-desk/ContractsManager.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Contracts // Coin Desk</title>
</svelte:head>

<ContractsManager
	supabase={data.supabase}
	sections={data.sections}
	configured={data.contractsConfigured}
/>
