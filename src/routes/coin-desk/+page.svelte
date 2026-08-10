<script lang="ts">
	import CoinDeskTool from '$lib/coin-desk/CoinDeskTool.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<CoinDeskTool
	categories={data.categories}
	supabase={data.supabase}
	configured={data.configured}
	sections={data.sections}
	sectionsConfigured={data.sectionsConfigured}
	roleDefinitions={data.roleDefinitions}
	rolesConfigured={data.rolesConfigured}
	contractsConfigured={data.contractsConfigured}
/>
