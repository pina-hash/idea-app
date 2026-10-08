<script lang="ts">
	import ArmoryFileView from '$lib/armory/ArmoryFileView.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const view = $derived(data.view);
</script>

<svelte:head><title>{view ? `${view.file.name} // Armory` : 'Armory // IDEA'}</title></svelte:head>

{#if !data.email}
	<ArmoryFrame title="IDEA Armory" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmorySignIn reason="Sign in to see this file." onSignIn={() => armorySignIn(data.supabase)} />
	</ArmoryFrame>
{:else if !view}
	<ArmoryFrame title="IDEA Armory" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmoryNotice title="Armory is not switched on yet." testid="armory-not-ready" />
	</ArmoryFrame>
{:else}
	<ArmoryFrame
		title={view.file.name}
		crumbs={[
			{ href: '/armory', label: 'Armory' },
			{ href: `/armory/${view.project.id}?view=files`, label: view.project.name }
		]}
	>
		<ArmoryFileView
			file={view.file}
			history={view.history}
			now={view.now}
			deviceSeen={view.deviceSeen}
			checkouts={view.checkouts}
			downloadHref={view.storageReady
				? (versionId: string) => `/armory/${view.project.id}/file/${view.file.id}/version/${versionId}`
				: null}
		/>
	</ArmoryFrame>
{/if}
