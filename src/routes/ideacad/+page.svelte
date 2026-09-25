<!--
  THE IDEACAD FRONT DOOR. The launch page is the default; the legacy chooser
  (`IdeaCadApp.svelte`, untouched) stays reachable at `/ideacad?legacy=1`.
  Opening a document mounts `SolidWorkspace` over the launch page in a fixed
  frame, exactly the shape `IdeaCadApp`'s `directOpen` uses: the transports
  come from ONE `createSolidTransports(data.supabase)`, and the launch page
  stays mounted (hidden) underneath so its folder, view and search survive the
  round trip and are refreshed when the workspace hands back.

  THE MODELER'S PREFERENCES follow the student to any computer: they live in
  their own profile row under `preferences.ideacad.solid`, written by a
  whole-blob spread-merge that keeps every other namespace. The store is built
  once, lazily with the workspace (its module brings the viewport's settings,
  which the launch page must not load), from the preferences the page load
  already has.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import IdeaCadApp from '$lib/ideacad/app/IdeaCadApp.svelte';
	import LaunchPage from '$lib/ideacad/solid/launch/LaunchPage.svelte';
	import { createSolidTransports } from '$lib/ideacad/solid/transport';
	import type { LaunchApi } from '$lib/ideacad/solid/launch/api';
	import type { SolidDocument } from '$lib/ideacad/solid/types';
	import type { PreferenceStore } from '$lib/ideacad/solid/preferences';
	let { data } = $props();
	const legacy = $derived(page.url.searchParams.get('legacy') === '1');
	const direct = untrack(() => createSolidTransports(data.supabase));
	const launchApi: LaunchApi = { ...direct, create: (title) => direct.transport.create(title) };
	/* THE LIVE LAYER (feedback R34): every open workspace pings the others after a save and polls the database as its floor.
	   One transport for the page; each workspace opens and closes its own channel through it. The address is only so the
	   reader's own edits from another window read "you". */
	const live = untrack(() => direct.live((data.claims as { email?: string } | null)?.email ?? null));
	let Workspace = $state<typeof import('$lib/ideacad/solid/SolidWorkspace.svelte').default | null>(null);
	let solid: SolidDocument | null = $state.raw(null), opening = $state(''), openRefusal = $state('');
	let launch: { refresh(notice?: string): Promise<void> } | undefined = $state();
	let preferences: PreferenceStore | undefined;
	async function preferenceStore(): Promise<PreferenceStore> {
		if (preferences) return preferences;
		const { ProfilePreferenceStore, solidPreferencesFrom } = await import('$lib/ideacad/solid/preferences');
		const supabase = data.supabase, userId = data.userId;
		preferences = new ProfilePreferenceStore(solidPreferencesFrom(data.userProfile?.preferences), {
			read: async () => { const { data: row, error } = await supabase.from('profiles').select('preferences').eq('id', userId).single(); if (error) throw error; return row?.preferences ?? {}; },
			write: async (next) => { const { error } = await supabase.from('profiles').update({ preferences: next }).eq('id', userId); if (error) throw error; }
		});
		return preferences;
	}
	let solidPreferences: PreferenceStore | undefined = $state();
	async function open(id: string) {
		if (opening) return;
		opening = id; openRefusal = '';
		try { Workspace ??= (await import('$lib/ideacad/solid/SolidWorkspace.svelte')).default; solidPreferences = await preferenceStore(); solid = await direct.transport.open(id); }
		catch (err) { openRefusal = err instanceof Error ? err.message : String(err); }
		finally { opening = ''; }
	}
</script>

<svelte:head><title>IdeaCAD</title><meta name="description" content="Full-screen browser CAD workspace." /></svelte:head>
{#if legacy}
	<IdeaCadApp supabase={data.supabase} userId={data.userId} documents={data.documents} sources={data.sources} initialLayout={data.initialLayout} directDocuments={data.directDocuments} directError={data.directError} />
{:else}
	{#if solid && Workspace}
		<div class="direct-frame">{#key solid.id}<Workspace document={solid} transport={direct.transport} advisoryTransport={direct.advisoryTransport} preferences={solidPreferences} {live} onback={() => { solid = null; void launch?.refresh(); }} />{/key}</div>
	{/if}
	<main class="launch-main" hidden={solid !== null && Workspace !== null}>
		<LaunchPage bind:this={launch} api={launchApi} rows={data.directDocuments} folders={data.directFolders} sources={data.sources} storageMessage={data.directFoldersError} refusal={openRefusal || data.directError} {opening} onopen={(id) => void open(id)} />
	</main>
{/if}

<style>
	.direct-frame { position: fixed; inset: 0; z-index: 50; }
	.launch-main { min-height: 100vh; background: #0e1114; }
	.launch-main[hidden] { display: none; }
</style>
