<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ArmoryCotsLibrary from '$lib/armory/ArmoryCotsLibrary.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryPartSubsystems from '$lib/armory/ArmoryPartSubsystems.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { partsErrorWords, type CotsAnswer } from '$lib/armory/part-numbers';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const library = $derived(data.library);
	const curator = $derived(library?.can_curate === true);

	async function call(name: string, args: Record<string, unknown>): Promise<CotsAnswer> {
		const { error } = await data.supabase.rpc(name, { ...args, p_operation: crypto.randomUUID() });
		if (error) return { ok: false, message: partsErrorWords(error) };
		await invalidate('armory:cots');
		return { ok: true };
	}

	const add = $derived(
		curator
			? (i: { vendor: string; vendorPart: string; description: string; link: string }) =>
					call('armory_cots_add', {
						p_vendor: i.vendor,
						p_vendor_part: i.vendorPart,
						p_description: i.description,
						p_link: i.link || null,
						p_file: null
					})
			: null
	);
	const correct = $derived(
		curator
			? (id: string, i: { description: string; link: string }) =>
					call('armory_cots_correct', { p_id: id, p_description: i.description, p_link: i.link, p_file: null })
			: null
	);
	const retire = $derived(curator ? (id: string, retired: boolean) => call('armory_cots_retire', { p_id: id, p_retired: retired }) : null);
	const saveCode = $derived(
		curator ? (code: string, name: string) => call('armory_part_subsystem_save', { p_code: code, p_name: name }) : null
	);
	const retireCode = $derived(
		curator ? (code: string, retired: boolean) => call('armory_part_subsystem_retire', { p_code: code, p_retired: retired }) : null
	);
</script>

<svelte:head><title>COTS library // Armory</title></svelte:head>

<ArmoryFrame
	title="COTS library"
	crumbs={[{ href: '/armory', label: 'Armory' }]}
	lead="The bought parts every Armory project uses, named by vendor and the vendor's own number."
>
	{#if !data.email}
		<ArmorySignIn reason="Sign in to see the COTS library." onSignIn={() => armorySignIn(data.supabase)} />
	{:else if data.notReady}
		<ArmoryNotice title="The COTS library is not switched on yet." testid="armory-cots-not-ready">
			Mr. Pina is still setting it up. Check back soon.
		</ArmoryNotice>
	{:else if data.onNoProject || !library}
		<ArmoryNotice title="The COTS library is for Armory projects." testid="armory-cots-no-project">
			Once you are on an Armory project, the library shows here. Ask your mentor to add you.
		</ArmoryNotice>
	{:else}
		<ArmoryCotsLibrary {library} {add} {correct} {retire} />
		{#if data.subsystems.length > 0}
			<ArmoryPartSubsystems subsystems={data.subsystems} save={saveCode} retire={retireCode} />
		{/if}
	{/if}
</ArmoryFrame>
