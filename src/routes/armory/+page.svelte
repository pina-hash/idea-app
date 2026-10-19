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
	import { ARMORY_DEFAULT_RELEASE, releaseErrorWords } from '$lib/armory/solidworks-version';
	import { trackInFlight } from '$lib/shell/deploy-safety';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// C1 (0232): a project is created with a name and nothing else. The season
	// argument is sent as null, which 0232 accepts on the unchanged signature.
	//
	// THE SOLIDWORKS VERSION (ledger 0404, 0273) IS NAMED ONLY WHEN IT IS NOT
	// THE DEFAULT. The four-argument form exists only once 0273 is applied, so a
	// project on 2025 goes through the deployed three-argument form, which works
	// on every database, and only a 2026 project names `p_release` (CLAUDE.md,
	// DEPLOY ORDERING: name the new parameter only when the feature is used). A
	// database without 0273 answers PGRST202, said in words with the way round.
	const create = $derived(
		page.data.isAdmin && data.supabase
			? async (name: string, release: number) => {
					const args: Record<string, unknown> = { p_name: name, p_season: null, p_operation: crypto.randomUUID() };
					if (release !== ARMORY_DEFAULT_RELEASE) args.p_release = release;
					const { data: id, error } = await data.supabase.rpc('armory_create_project', args);
					if (error || typeof id !== 'string') {
						const message = !error
							? 'The project could not be created. Try again in a minute.'
							: error.code === 'PGRST202' || /SolidWorks version/i.test(error.message)
								? releaseErrorWords(error.message, error.code)
								: projectErrorWords(error.message);
						return { ok: false as const, message };
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

<svelte:head><title>Armory · IDEA</title></svelte:head>

<ArmoryFrame title="IDEA Armory" lead="Your team's CAD files on every computer, checked out and checked in, with every version kept.">
	{#snippet actions()}
		{#if data.email && !data.notReady}
			<!-- Ledger 0405: the bought parts every project names. -->
			<a class="btn secondary ar-btn" href="/armory/cots" data-testid="armory-cots-link">COTS library</a>
		{/if}
	{/snippet}
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
