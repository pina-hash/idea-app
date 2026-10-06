<script lang="ts">
	import ArmoryConnect from '$lib/armory/ArmoryConnect.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Connect a computer // Armory</title></svelte:head>

<ArmoryFrame title="Connect a computer" crumbs={[{ href: '/armory', label: 'Armory' }]}>
	{#if !data.email}
		<ArmorySignIn
			reason="Sign in with your school Google account to connect this computer to Armory. You come straight back here."
			onSignIn={() => armorySignIn(data.supabase)}
		/>
	{:else}
		<ArmoryConnect request={data.request} problem={data.problem} email={data.email} />
	{/if}
</ArmoryFrame>
