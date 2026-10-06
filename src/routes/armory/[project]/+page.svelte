<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryProjectView from '$lib/armory/ArmoryProjectView.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { watchArmoryProject, type LiveMode } from '$lib/armory/live';
	import type { ArmoryRole } from '$lib/armory/view';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let live = $state<LiveMode>('off');

	const view = $derived(data.view);

	async function rpc(name: string, args: Record<string, unknown>) {
		const { data: answer, error } = await data.supabase.rpc(name, { ...args, p_operation: crypto.randomUUID() });
		if (error) return { ok: false as const, message: error.message };
		await invalidate('armory:project');
		return answer === false ? { ok: false as const, message: 'nothing changed' } : { ok: true as const };
	}

	onMount(() => {
		const v = untrack(() => data.view);
		if (!v || !data.supabase) return;
		return watchArmoryProject(
			data.supabase,
			v.project.id,
			() => data.view?.cursor ?? 0,
			() => void invalidate('armory:project'),
			(mode) => (live = mode)
		);
	});
</script>

<svelte:head><title>{view ? `${view.project.name} // Armory` : 'Armory // IDEA'}</title></svelte:head>

{#if !data.email}
	<ArmoryFrame title="IDEA Armory" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmorySignIn reason="Sign in to see this project." onSignIn={() => armorySignIn(data.supabase)} />
	</ArmoryFrame>
{:else if !view}
	<ArmoryFrame title="IDEA Armory" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmoryNotice title="Armory is not switched on yet." testid="armory-not-ready">
			Mr. Pina is still setting it up. Check back soon.
		</ArmoryNotice>
	</ArmoryFrame>
{:else}
	<ArmoryFrame
		title={view.project.name}
		crumbs={[{ href: '/armory', label: 'Armory' }]}
		lead={`Season ${view.project.season}. The files below are the ones in C:\\IDEA\\Armory\\${view.project.name} on every connected computer.`}
	>
		{#if !view.storageReady}
			<ArmoryNotice title="File storage is not switched on yet." testid="armory-storage-off">
				Computers can connect and you can see who is editing what, but saved files will not upload until
				Mr. Pina finishes setting up storage. Your work stays on your computer until then.
			</ArmoryNotice>
		{/if}
		<ArmoryProjectView
			project={view.project}
			files={view.files}
			members={view.members}
			sideCounts={view.sideCounts}
			deviceSeen={view.deviceSeen}
			now={view.now}
			myEmail={data.email}
			{live}
			addMember={(email: string, role: ArmoryRole) => rpc('armory_add_member', { p_project: view.project.id, p_email: email, p_role: role })}
			removeMember={(email: string) => rpc('armory_remove_member', { p_project: view.project.id, p_email: email })}
		/>
	</ArmoryFrame>
{/if}
