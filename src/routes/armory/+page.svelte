<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArmoryDevices from '$lib/armory/ArmoryDevices.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryHowItWorks from '$lib/armory/ArmoryHowItWorks.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryProjects from '$lib/armory/ArmoryProjects.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { projectErrorWords } from '$lib/armory/view';
	import { trackInFlight } from '$lib/shell/deploy-safety';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// C1 (0232): a project is created with a name and nothing else. The season
	// argument is sent as null, which 0232 accepts on the unchanged signature.
	const create = $derived(
		page.data.isAdmin && data.supabase
			? async (name: string) => {
					const { data: id, error } = await data.supabase.rpc('armory_create_project', {
						p_name: name,
						p_season: null,
						p_operation: crypto.randomUUID()
					});
					if (error || typeof id !== 'string') {
						return { ok: false as const, message: error ? projectErrorWords(error.message) : 'The project could not be created. Try again in a minute.' };
					}
					return { ok: true as const, id };
				}
			: null
	);

	/*
	 * STORAGE CLEANUP (0233, site admins): the same sweep the purge runs, for
	 * whatever a purge left. Offered only while the count says files wait; the
	 * route answers a bodyless 404 to anybody else.
	 */
	const sweep = $derived(
		page.data.isAdmin && data.orphans !== null
			? async () => {
					try {
						const response = await trackInFlight(fetch('/api/armory/sweep', { method: 'POST' }), 'armory storage cleanup');
						const body = (await response.json().catch(() => null)) as
							| { ok: true; swept: number; left: number | null; problem: string | null }
							| null;
						if (!response.ok || !body?.ok) return { ok: false as const, message: 'The cleanup did not run. Try again in a minute.' };
						return body;
					} catch {
						return { ok: false as const, message: 'The cleanup did not run. Check the connection and try again.' };
					}
				}
			: null
	);

	const deleted = $derived(
		page.state.armoryDeleted ? { name: page.state.armoryDeleted, storageProblem: page.state.armoryStorageProblem ?? null } : null
	);
</script>

<svelte:head><title>Armory // IDEA</title></svelte:head>

<ArmoryFrame title="IDEA Armory" lead="Your team's CAD files on every computer, checked out and checked in, with every version kept.">
	{#if !data.email}
		<ArmorySignIn reason="Sign in to see your Armory projects." onSignIn={() => armorySignIn(data.supabase)} />
		<ArmoryHowItWorks />
	{:else if data.notReady}
		<ArmoryNotice title="Armory is not switched on yet." testid="armory-not-ready">
			Mr. Pina is still setting it up. Nothing you do here is lost; check back soon.
		</ArmoryNotice>
	{:else}
		<ArmoryProjects
			projects={data.projects}
			devices={data.devices}
			now={data.now}
			{create}
			onCreated={(id) => goto(`/armory/${id}`)}
			orphans={data.orphans}
			{sweep}
			{deleted}
		/>
		<div class="ar-two">
			<ArmoryDevices devices={data.devices} now={data.now} />
			<ArmoryHowItWorks folded={data.devices.length > 0} />
		</div>
	{/if}
</ArmoryFrame>
