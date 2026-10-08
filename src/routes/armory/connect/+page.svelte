<script lang="ts">
	import ArmoryConnect from '$lib/armory/ArmoryConnect.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { signOutEverywhere } from '$lib/profile';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const name = $derived(data.userProfile?.display_name?.trim() || data.userProfile?.full_name?.trim() || null);

	/** Sign this browser out, then straight into Google's account picker, back to this same connect address. */
	async function useAnotherAccount() {
		if (!data.supabase) return;
		await signOutEverywhere(data.supabase);
		await armorySignIn(data.supabase);
	}
</script>

<svelte:head><title>Connect a computer // Armory</title></svelte:head>

<ArmoryFrame title="Connect a computer" crumbs={[{ href: '/armory', label: 'Armory' }]}>
	{#if !data.email}
		<ArmorySignIn
			reason="Sign in with your school Google account to connect this computer to Armory. You come straight back here."
			onSignIn={() => armorySignIn(data.supabase)}
		/>
	{:else}
		<ArmoryConnect request={data.request} problem={data.problem} email={data.email} {name} onSwitch={useAnotherAccount} />
	{/if}
</ArmoryFrame>
