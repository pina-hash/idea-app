<script lang="ts">
	import ArmoryDownload from '$lib/armory/ArmoryDownload.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Get the Windows app // Armory</title></svelte:head>

<ArmoryFrame
	title="Get the Armory app"
	crumbs={[{ href: '/armory', label: 'Armory' }]}
	lead="Armory runs on Windows, beside SolidWorks. Install it once on each computer you use."
>
	{#if !data.email}
		<ArmorySignIn reason="Sign in to download the Armory app." onSignIn={() => armorySignIn(data.supabase)} />
	{:else}
		<ArmoryDownload release={data.release} />
	{/if}
</ArmoryFrame>
