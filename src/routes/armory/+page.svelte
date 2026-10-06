<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryProjects from '$lib/armory/ArmoryProjects.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const create = $derived(
		page.data.isAdmin && data.supabase
			? async (name: string, season: number) => {
					const { data: id, error } = await data.supabase.rpc('armory_create_project', {
						p_name: name,
						p_season: season,
						p_operation: crypto.randomUUID()
					});
					if (error || typeof id !== 'string') {
						return {
							ok: false as const,
							message: /already exists/i.test(error?.message ?? '')
								? 'A project with that name already exists.'
								: /Windows folder/i.test(error?.message ?? '')
									? 'That name cannot be a Windows folder name. Leave out \\ / : * ? " < > | and a trailing dot.'
									: 'The project could not be created. Try again in a minute.'
						};
					}
					return { ok: true as const, id };
				}
			: null
	);
</script>

<svelte:head><title>Armory // IDEA</title></svelte:head>

<ArmoryFrame title="IDEA Armory" lead="Team and class CAD files, saved as you work, with every version kept.">
	{#if !data.email}
		<ArmorySignIn reason="Sign in to see your Armory projects." onSignIn={() => armorySignIn(data.supabase)} />
	{:else if data.notReady}
		<ArmoryNotice title="Armory is not switched on yet." testid="armory-not-ready">
			Mr. Pina is still setting it up. Nothing you do here is lost; check back soon.
		</ArmoryNotice>
	{:else}
		<ArmoryProjects projects={data.projects} {create} onCreated={(id) => goto(`/armory/${id}`)} />
	{/if}
</ArmoryFrame>
