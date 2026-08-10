<script lang="ts">
	import ContractsView from '$lib/contracts/ContractsView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ContractsView
	supabase={data.supabase}
	configured={data.configured}
	email={data.email}
	initialContracts={data.contracts}
	initialMyClaimIds={data.myClaimIds}
/>
