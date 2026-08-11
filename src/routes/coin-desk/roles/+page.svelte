<script lang="ts">
	import RolesManager from '$lib/coin-desk/RolesManager.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Roles // Coin Desk</title>
</svelte:head>

<RolesManager
	supabase={data.supabase}
	roleDefinitions={data.roleDefinitions}
	sections={data.sections}
	configured={data.rolesConfigured}
/>
